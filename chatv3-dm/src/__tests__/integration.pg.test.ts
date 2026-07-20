import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyChatv3PgSchema } from '@aopslab/domain-pg-bootstrap-chatv3'
import { createChatv3Db, Chatv3DbHandle } from '../infrastructure/db/client.js'
import { createChatv3Services, Chatv3Services } from '../application/services/index.js'
import { authenticateMemberToken } from '../application/services/helpers.js'
import { sha256Hex, randomSecretB64Url } from '../application/util.crypto.js'
import { Chatv3Error } from '../application/errors.js'
import { chatv3SpaceTable } from '../infrastructure/db/drizzle.schema.index.js'
import { eq } from 'drizzle-orm'

const PG_URL = process.env.CHATV3_TEST_PG_URL ?? process.env.AOPS_PG_URL

const tenantId = `t-test-${randomSecretB64Url(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`

const envelope = (epoch: number, idempotencyKey?: string) => ({
  roomId: '',
  kind: 'message' as const,
  envelope: {
    protocolVersion: 1,
    cipherSuite: 'v0-shared-epoch' as const,
    epoch,
    ciphertext: 'b3BhcXVlLWNpcGhlcnRleHQ',
    nonce: 'bm9uY2UtMTIzNDU2Nzg5MDEy',
  },
  mentions: [],
  idempotencyKey,
})

describe.skipIf(!PG_URL)('chatv3 pg integration (gated by CHATV3_TEST_PG_URL/AOPS_PG_URL)', () => {
  let handle: Chatv3DbHandle
  let services: Chatv3Services
  let spaceId = ''

  beforeAll(async () => {
    // owned pg-bootstrap pipeline — the same path chatv3-host-plugin setup uses
    await applyChatv3PgSchema({ repoUrl: PG_URL! })
    handle = createChatv3Db(PG_URL!)
    services = createChatv3Services(handle.db)
  })

  afterAll(async () => {
    if (spaceId) await handle.db.delete(chatv3SpaceTable).where(eq(chatv3SpaceTable.id, spaceId))
    await handle.close()
  })

  it('runs the full create -> join -> send -> read -> delete flow', async () => {
    const space = await services.space.create({
      tenantId,
      slug: 'itest-space',
      title: 'Integration Space',
      externalRefs: [{ refType: 'projectman.board', refId: 'demo-board' }],
    })
    spaceId = space.id

    // creator client generated these locally; the server sees derived values only
    const accessSecret = randomSecretB64Url(24)
    const created = await services.channel.create({
      tenantId,
      spaceId: space.id,
      slug: 'proj-x',
      title: 'Proj X',
      guidanceMarkdown: 'Channel guidance: use chat for wake and PM for truth.',
      generalRoomGuidanceMarkdown: 'General room guidance: read recent directives and ACK.',
      accessKey: { keyId: `cvk_${randomSecretB64Url(8)}`, verifierHash: sha256Hex(accessSecret) },
      epoch: {
        epoch: 1,
        cipherSuite: 'v0-shared-epoch',
        wrappedKeyBlob: 'd3JhcHBlZC1lcG9jaC1rZXk',
        kdfMeta: {
          kdf: 'hkdf-sha256',
          saltSpec: 'tenantId+spaceId+channelId+epoch',
          info: 'chatv3-v0-epoch-wrap',
          wrapAlg: 'xchacha20poly1305',
        },
      },
      creator: { handle: 'claude', actorKind: 'agent' },
    })
    expect(created.generalRoom.kind).toBe('general')
    expect(created.channel.guidanceMarkdown).toBe('Channel guidance: use chat for wake and PM for truth.')
    expect(created.generalRoom.guidanceMarkdown).toBe('General room guidance: read recent directives and ACK.')
    expect(created.creator.roleKey).toBe('owner')
    expect(created.memberToken).toMatch(/^cv3m_/)

    // wrong secret must not pass
    await expect(
      services.channel.join({
        tenantId,
        channelId: created.channel.id,
        keyId: created.accessKey.keyId,
        accessSecret: 'wrong-secret-wrong-secret',
        handle: 'codex',
        actorKind: 'agent',
      })
    ).rejects.toMatchObject({ code: 'unauthorized' })

    const joined = await services.channel.join({
      tenantId,
      channelId: created.channel.id,
      keyId: created.accessKey.keyId,
      accessSecret,
      handle: 'codex',
      actorKind: 'agent',
    })
    expect(joined.rooms.map((r) => r.slug)).toContain('general')
    expect(joined.rooms.find((r) => r.slug === 'general')?.guidanceMarkdown).toBe('General room guidance: read recent directives and ACK.')
    expect(joined.epochs[0]?.wrappedKeyBlob).toBe('d3JhcHBlZC1lcG9jaC1rZXk')

    const claude = await authenticateMemberToken(handle.db, created.memberToken)
    const codex = await authenticateMemberToken(handle.db, joined.memberToken)

    // session room + messaging with seq allocation and idempotent replay
    const { room } = await services.room.create(
      {
        channelId: created.channel.id,
        slug: 'sprint-1',
        title: 'Sprint 1',
        kind: 'session',
        guidanceMarkdown: 'Sprint room guidance: keep discussion scoped to sprint 1.',
        epoch: { epoch: 1, cipherSuite: 'v0-shared-epoch', wrappedKeyBlob: 'd3JhcHBlZC0y', kdfMeta: {
          kdf: 'hkdf-sha256', saltSpec: 'tenantId+spaceId+channelId+epoch', info: 'chatv3-v0-epoch-wrap', wrapAlg: 'xchacha20poly1305',
        } },
      },
      claude
    )
    expect(room.guidanceMarkdown).toBe('Sprint room guidance: keep discussion scoped to sprint 1.')

    const m1 = await services.message.send({ ...envelope(1, 'idem-1'), roomId: room.id }, claude)
    const m2 = await services.message.send({ ...envelope(1), roomId: room.id }, codex)
    const replay = await services.message.send({ ...envelope(1, 'idem-1'), roomId: room.id }, claude)
    expect(m1.message.seq).toBe(1)
    expect(m2.message.seq).toBe(2)
    expect(replay.replayed).toBe(true)
    expect(replay.message.id).toBe(m1.message.id)

    // wrong epoch is rejected before any write
    await expect(services.message.send({ ...envelope(9), roomId: room.id }, claude)).rejects.toMatchObject({
      code: 'epoch_mismatch',
    })

    const afterZero = await services.message.list({ roomId: room.id, afterSeq: 0, limit: 100 }, codex)
    expect(afterZero.map((m) => m.seq)).toEqual([1, 2])

    // read cursors -> receipts derivation
    await services.cursor.markRead({ roomId: room.id, lastReadSeq: 2 }, codex)
    await services.cursor.markRead({ roomId: room.id, lastReadSeq: 1 }, claude)
    const receipts = await services.cursor.receipts({ roomId: room.id }, claude)
    const byHandle = Object.fromEntries(receipts.map((r) => [r.handle, r.lastReadSeq]))
    expect(byHandle['codex']).toBe(2)
    expect(byHandle['claude']).toBe(1)

    // cursor never regresses
    await services.cursor.markRead({ roomId: room.id, lastReadSeq: 0 }, codex)
    const receipts2 = await services.cursor.receipts({ roomId: room.id }, claude)
    expect(receipts2.find((r) => r.handle === 'codex')?.lastReadSeq).toBe(2)

    // authz: plain member cannot archive the channel, owner can
    await expect(
      services.channel.archive({ tenantId, channelId: created.channel.id }, codex)
    ).rejects.toMatchObject({ code: 'forbidden' })
    const archivedChannel = await services.channel.archive({ tenantId, channelId: created.channel.id }, claude)
    expect(archivedChannel.status).toBe('archived')
    expect(archivedChannel.archivedAt).toBeInstanceOf(Date)
    const restoredChannel = await services.channel.unarchive({ tenantId, channelId: created.channel.id }, claude)
    expect(restoredChannel.status).toBe('active')
    expect(restoredChannel.archivedAt).toBeNull()

    // bindings: loose refs only
    const binding = await services.binding.add(
      { channelId: created.channel.id, bindingType: 'repo.url', uri: '/tmp/repo', title: 'repo' },
      codex
    )
    expect(binding.uri).toBe('/tmp/repo')

    // hard delete with confirm guard; cascades clean everything
    await expect(
      services.channel.delete({ tenantId, channelId: created.channel.id, confirmSlug: 'wrong' }, claude)
    ).rejects.toMatchObject({ code: 'invalid_input' })
    const deleted = await services.channel.delete(
      { tenantId, channelId: created.channel.id, confirmSlug: 'proj-x' },
      claude
    )
    expect(deleted.deleted).toBe(true)

    await expect(authenticateMemberToken(handle.db, created.memberToken)).rejects.toBeInstanceOf(Chatv3Error)
  })

  it('F4: authv2 principal binds ownerUserId + member.userId; anonymous stays NULL', async () => {
    const space = await services.space.create({ tenantId, slug: 'f4-space', title: 'F4 Space' })
    const mkEpoch = () => ({
      epoch: 1,
      cipherSuite: 'v0-shared-epoch' as const,
      wrappedKeyBlob: 'd3JhcHBlZC1rZXk',
      kdfMeta: {
        kdf: 'hkdf-sha256',
        saltSpec: 'tenantId+spaceId+channelId+epoch',
        info: 'chatv3-v0-epoch-wrap',
        wrapAlg: 'xchacha20poly1305',
      },
    })
    try {
      // authenticated create -> channel.ownerUserId + creator member.userId bound
      const authedSecret = randomSecretB64Url(24)
      const authed = await services.channel.create(
        {
          tenantId,
          spaceId: space.id,
          slug: 'f4-authed',
          title: 'F4 Authed',
          accessKey: { keyId: `cvk_${randomSecretB64Url(8)}`, verifierHash: sha256Hex(authedSecret) },
          epoch: mkEpoch(),
          creator: { handle: 'owner-claude', actorKind: 'agent' },
        },
        'user-owner-123'
      )
      expect(authed.channel.ownerUserId).toBe('user-owner-123')
      expect(authed.creator.userId).toBe('user-owner-123')

      // authenticated join -> joining member.userId bound
      const joined = await services.channel.join(
        {
          tenantId,
          channelId: authed.channel.id,
          keyId: authed.accessKey.keyId,
          accessSecret: authedSecret,
          handle: 'joiner-codex',
          actorKind: 'agent',
        },
        'user-joiner-456'
      )
      expect(joined.member.userId).toBe('user-joiner-456')

      // anonymous create (no principal) -> both identity columns NULL (no regression)
      const anonSecret = randomSecretB64Url(24)
      const anon = await services.channel.create({
        tenantId,
        spaceId: space.id,
        slug: 'f4-anon',
        title: 'F4 Anon',
        accessKey: { keyId: `cvk_${randomSecretB64Url(8)}`, verifierHash: sha256Hex(anonSecret) },
        epoch: mkEpoch(),
        creator: { handle: 'anon-user', actorKind: 'agent' },
      })
      expect(anon.channel.ownerUserId).toBeNull()
      expect(anon.creator.userId).toBeNull()
    } finally {
      await handle.db.delete(chatv3SpaceTable).where(eq(chatv3SpaceTable.id, space.id))
    }
  })
})
