import { describe, expect, it } from 'vitest'
import { Chatv3Client } from '../client.js'
import { randomB64Url } from '../crypto.js'
import { buildInvite } from '../invite.js'
import { MemoryKeyStore, type Chatv3KeyStore } from '../keystore.js'

// F2a SDK read/lifecycle methods. These assert the wire contract (method + path
// + query + body) and client-side shaping (tokenHash drop, member cache) against
// a mock transport — no live server, server-blind crypto untouched.

type Call = {
  method: string
  path: string
  search: string
  body: unknown
  headers: Record<string, string | null>
}

function harness(
  handler: (call: Call) => unknown,
  options: { memberToken?: string; accessToken?: string; keyStore?: Chatv3KeyStore } = {},
) {
  const calls: Call[] = []
  const fetchImpl = (async (input: unknown, init?: { method?: string; body?: string; headers?: HeadersInit }) => {
    const u = new URL(String(input))
    const h = new Headers(init?.headers)
    const call: Call = {
      method: init?.method ?? 'GET',
      path: u.pathname,
      search: u.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: {
        authorization: h.get('authorization'),
        chatv3MemberToken: h.get('x-chatv3-member-token'),
      },
    }
    calls.push(call)
    const data = handler(call)
    const envelope = { ok: true, domain: 'chatv3', operation: 'test', data }
    return { ok: true, status: 200, text: async () => JSON.stringify(envelope) }
  }) as unknown as typeof fetch
  const client = new Chatv3Client({
    serverBaseUrl: 'http://test',
    memberToken: options.memberToken ?? 'cv3m_test',
    accessToken: options.accessToken,
    keyStore: options.keyStore,
    fetchImpl,
  })
  return { client, calls }
}

const P = '/api/chatv3/v1'

describe('listMembers + cache', () => {
  it('GETs channel members, drops tokenHash, and populates the resolve cache', async () => {
    const { client, calls } = harness(() => [
      { id: 'm1', tenantId: 't', channelId: 'c1', handle: 'claude', displayName: null, actorKind: 'agent', roleKey: 'owner', status: 'active', joinedViaKeyId: null, lastSeenAt: null, joinedAt: 'now', removedAt: null, updatedAt: 'now', tokenHash: 'SECRET' },
    ])
    const members = await client.listMembers('c1')
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${P}/channels/c1/members` })
    expect(members).toHaveLength(1)
    expect(members[0].handle).toBe('claude')
    expect('tokenHash' in members[0]).toBe(false)
    expect(client.resolveMember('c1', 'm1')?.handle).toBe('claude')
    expect(client.resolveMember('c1', 'nope')).toBeUndefined()
  })

  it('passes status + limit as query params', async () => {
    const { client, calls } = harness(() => [])
    await client.listMembers('c1', { status: 'active', limit: 50 })
    expect(calls[0].search).toContain('status=active')
    expect(calls[0].search).toContain('limit=50')
  })

  it('updates a member status via PATCH for self-leave/admin surfaces', async () => {
    const { client, calls } = harness(() => (
      { id: 'm1', tenantId: 't', channelId: 'c1', handle: 'codex', displayName: null, actorKind: 'agent', roleKey: 'member', status: 'removed', joinedViaKeyId: null, lastSeenAt: null, joinedAt: 'now', removedAt: 'now', updatedAt: 'now' }
    ))
    const member = await client.updateMember('m1', { status: 'removed' })
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: `${P}/members/m1`, body: { status: 'removed' } })
    expect(member.status).toBe('removed')
  })
})

describe('presence', () => {
  it('lists presence for a room', async () => {
    const { client, calls } = harness(() => [{ memberId: 'm1', state: 'active', note: null, updatedAt: 'now', expired: false }])
    const p = await client.listPresence('r1')
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${P}/rooms/r1/presence` })
    expect(p[0].state).toBe('active')
  })

  it('sets presence via POST with state/note/ttl body', async () => {
    const { client, calls } = harness(() => ({ memberId: 'm1', state: 'working', note: 'F2a', updatedAt: 'now', expired: false }))
    const presence = await client.setPresence('r1', { state: 'working', note: 'F2a', ttlSec: 120 })
    expect(calls[0]).toMatchObject({ method: 'POST', path: `${P}/rooms/r1/presence`, body: { state: 'working', note: 'F2a', ttlSec: 120 } })
    expect(presence.state).toBe('working')
  })
})

describe('receipts + cursors', () => {
  it('gets receipts', async () => {
    const { client, calls } = harness(() => [{ memberId: 'm1', handle: 'claude', roleKey: 'owner', actorKind: 'agent', lastReadSeq: 5, deliveredSeq: 5, ackSeq: 0, lastReadAt: 'now' }])
    const r = await client.getReceipts('r1')
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${P}/rooms/r1/receipts` })
    expect(r[0].lastReadSeq).toBe(5)
  })

  it('marks read/delivered/ack with the right path + seq field', async () => {
    const { client, calls } = harness(() => ({ id: 'cur', roomId: 'r1' }))
    await client.markRead('r1', 7)
    await client.markDelivered('r1', 6)
    await client.ackDirective('r1', 3)
    expect(calls[0]).toMatchObject({ method: 'POST', path: `${P}/rooms/r1/read`, body: { lastReadSeq: 7 } })
    expect(calls[1]).toMatchObject({ method: 'POST', path: `${P}/rooms/r1/delivered`, body: { deliveredSeq: 6 } })
    expect(calls[2]).toMatchObject({ method: 'POST', path: `${P}/rooms/r1/ack`, body: { ackSeq: 3 } })
  })
})

describe('bindings', () => {
  it('lists loose channel bindings and optional room-scoped bindings', async () => {
    const { client, calls } = harness(() => [
      {
        id: 'b1',
        tenantId: 't',
        channelId: 'c1',
        roomId: 'r1',
        bindingType: 'projectman.review-request',
        refId: 'rr1',
        uri: null,
        title: 'Slice review',
        note: null,
        createdBy: 'm1',
        createdAt: 'now',
      },
    ])
    const all = await client.listBindings('c1')
    const room = await client.listBindings('c1', { roomId: 'r1' })
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${P}/channels/c1/bindings`, search: '' })
    expect(calls[1]).toMatchObject({ method: 'GET', path: `${P}/channels/c1/bindings` })
    expect(calls[1].search).toContain('roomId=r1')
    expect(all[0].bindingType).toBe('projectman.review-request')
    expect(room[0].refId).toBe('rr1')
  })
})

describe('channel / room lifecycle', () => {
  it('lists and archives spaces through the admin metadata surface', async () => {
    const { client, calls } = harness((c) => (c.path.endsWith('/archive') ? { id: 's1', status: 'archived' } : []))
    await client.listSpaces({ tenantId: 'default', status: 'active', limit: 20 })
    const space = await client.archiveSpace('s1', { updatedBy: 'admin' })
    expect(calls[0].path).toBe(`${P}/spaces`)
    expect(calls[0].search).toContain('tenantId=default')
    expect(calls[0].search).toContain('status=active')
    expect(calls[0].search).toContain('limit=20')
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: `${P}/spaces/s1/archive`,
      body: { updatedBy: 'admin' },
    })
    expect(space.status).toBe('archived')
  })

  it('keeps AuthV2 bearer and ChatV3 member token split when both are present', async () => {
    const { client, calls } = harness(() => [], { accessToken: 'jwt-admin', memberToken: 'cv3m_owner' })
    await client.listSpaces({ tenantId: 'default' })
    expect(calls[0].headers.authorization).toBe('Bearer jwt-admin')
    expect(calls[0].headers.chatv3MemberToken).toBe('Bearer cv3m_owner')

    client.http.memberToken = 'cv3m_rotated'
    await client.listRooms('c1')
    expect(calls[1].headers.authorization).toBe('Bearer jwt-admin')
    expect(calls[1].headers.chatv3MemberToken).toBe('Bearer cv3m_rotated')
  })

  it('gets one channel by id', async () => {
    const { client, calls } = harness(() => ({ id: 'c1', slug: 'ops', tenantId: 'default', spaceId: 's1' }))
    const channel = await client.getChannel('c1')
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${P}/channels/c1` })
    expect(channel.slug).toBe('ops')
  })

  it('lists channels with tenant/space/status query', async () => {
    const { client, calls } = harness(() => [])
    await client.listChannels({ tenantId: 'default', spaceId: 's1', status: 'active' })
    expect(calls[0].path).toBe(`${P}/channels`)
    expect(calls[0].search).toContain('tenantId=default')
    expect(calls[0].search).toContain('spaceId=s1')
    expect(calls[0].search).toContain('status=active')
  })

  it('archives/unarchives a channel (POST) and deletes it (DELETE + confirmSlug body)', async () => {
    const { client, calls } = harness((c) => (c.method === 'DELETE' ? { deleted: true } : { id: 'c1', status: 'active' }))
    await client.archiveChannel('c1', { updatedBy: 'claude' })
    await client.unarchiveChannel('c1', { updatedBy: 'codex' })
    const del = await client.deleteChannel('c1', { confirmSlug: 'my-channel' })
    expect(calls[0]).toMatchObject({ method: 'POST', path: `${P}/channels/c1/archive`, body: { updatedBy: 'claude' } })
    expect(calls[1]).toMatchObject({ method: 'POST', path: `${P}/channels/c1/unarchive`, body: { updatedBy: 'codex' } })
    expect(calls[2]).toMatchObject({ method: 'DELETE', path: `${P}/channels/c1`, body: { confirmSlug: 'my-channel' } })
    expect(del.deleted).toBe(true)
  })

  it('creates a room with client-wrapped first epoch material', async () => {
    const { client, calls } = harness((c) => {
      const body = c.body as Record<string, unknown>
      if (c.path === `${P}/channels`) {
        return {
          channel: { id: 'c1', tenantId: 'default', spaceId: 's1', slug: 'ops', guidanceMarkdown: body.guidanceMarkdown },
          generalRoom: { id: 'general1', tenantId: 'default', channelId: 'c1', slug: 'general', title: 'General', currentEpoch: 1, guidanceMarkdown: body.generalRoomGuidanceMarkdown },
          memberToken: 'cv3m_owner',
        }
      }
      return {
        room: { id: 'r2', tenantId: 'default', channelId: 'c1', slug: 'standup', title: 'Standup', currentEpoch: 1, guidanceMarkdown: body.guidanceMarkdown },
        epoch: { roomId: 'r2', epoch: 1, wrappedKeyBlob: 'blob' },
      }
    })
    const { channel } = await client.createChannel({
      space: { id: 's1', tenantId: 'default', slug: 'default' },
      slug: 'ops',
      title: 'Ops',
      handle: 'claude',
      guidanceMarkdown: 'Channel guidance.',
      generalRoomGuidanceMarkdown: 'General guidance.',
    })
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `${P}/channels`,
      body: {
        slug: 'ops',
        title: 'Ops',
        guidanceMarkdown: 'Channel guidance.',
        generalRoomGuidanceMarkdown: 'General guidance.',
      },
    })
    const room = await client.createRoom({ channel, slug: 'standup', title: 'Standup', guidanceMarkdown: 'Standup guidance.' })
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: `${P}/channels/c1/rooms`,
      body: {
        channelId: 'c1',
        slug: 'standup',
        title: 'Standup',
        kind: 'session',
        guidanceMarkdown: 'Standup guidance.',
      },
    })
    expect((calls[1].body as { epoch?: { epoch?: number; cipherSuite?: string; wrappedKeyBlob?: string } }).epoch).toMatchObject({
      epoch: 1,
      cipherSuite: 'v0-shared-epoch',
    })
    expect(typeof (calls[1].body as { epoch: { wrappedKeyBlob: string } }).epoch.wrappedKeyBlob).toBe('string')
    expect(room.id).toBe('r2')
    expect(room.guidanceMarkdown).toBe('Standup guidance.')
  })

  it('creates a server-encrypted channel without client-wrapped epoch material', async () => {
    const rawEpochKey = randomB64Url(32)
    const { client, calls } = harness((c) => {
      if (c.path === `${P}/channels`) {
        return {
          channel: { id: 'c1', tenantId: 'default', spaceId: 's1', slug: 'ops', encryptionMode: 'server-encrypted' },
          generalRoom: { id: 'general1', tenantId: 'default', channelId: 'c1', slug: 'general', title: 'General', currentEpoch: 1 },
          memberToken: 'cv3m_owner',
          serverEpochKey: rawEpochKey,
        }
      }
      return { message: { seq: 1 } }
    })

    const { generalRoom, invite } = await client.createChannel({
      space: { id: 's1', tenantId: 'default', slug: 'default' },
      slug: 'ops',
      title: 'Ops',
      handle: 'claude',
      encryptionMode: 'server-encrypted',
    })
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `${P}/channels`,
      body: {
        slug: 'ops',
        title: 'Ops',
        encryptionMode: 'server-encrypted',
      },
    })
    expect((calls[0].body as { epoch?: unknown }).epoch).toBeUndefined()
    expect(invite).toContain('#srv.')

    await client.sendText(generalRoom, 'hello')
    expect(calls[1]).toMatchObject({ method: 'POST', path: `${P}/rooms/general1/messages` })
    expect(JSON.stringify(calls[1].body)).not.toContain('hello')
  })

  it('joins a server-encrypted invite by fetching server-managed epoch keys', async () => {
    const channelId = '11111111-1111-4111-8111-111111111111'
    const rawEpochKey = randomB64Url(32)
    const room = { id: 'general1', tenantId: 'default', channelId, slug: 'general', title: 'General', currentEpoch: 1 }
    const invite = buildInvite({
      mode: 'server-encrypted',
      serverBaseUrl: 'http://test',
      channelId,
      keyId: 'cvk_server',
      accessSecret: 'access_secret',
    })
    const { client, calls } = harness((c) => {
      if (c.path === `${P}/channels/${channelId}/join`) {
        return {
          channel: { id: channelId, tenantId: 'default', spaceId: 's1', slug: 'ops', encryptionMode: 'server-encrypted' },
          rooms: [room],
          epochs: [],
          memberToken: 'cv3m_member',
        }
      }
      if (c.path === `${P}/channels/${channelId}/epoch-keys`) {
        return {
          channelId,
          encryptionMode: 'server-encrypted',
          keys: [{ roomId: 'general1', epoch: 1, cipherSuite: 'v1-server-managed', rawEpochKey, keyId: 'k1' }],
        }
      }
      return { message: { seq: 2 } }
    })

    const joined = await client.joinFromInvite(invite, 'codex')
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `${P}/channels/${channelId}/join`,
      body: { keyId: 'cvk_server', accessSecret: 'access_secret', handle: 'codex', actorKind: 'agent' },
    })
    expect(calls[1]).toMatchObject({ method: 'GET', path: `${P}/channels/${channelId}/epoch-keys` })
    expect(calls[1].search).toContain('tenantId=default')
    expect(joined.epochKeys?.[0]?.rawEpochKey).toBe(rawEpochKey)

    await client.sendText(joined.rooms[0]!, 'server mode hello')
    expect(calls[2]).toMatchObject({ method: 'POST', path: `${P}/rooms/general1/messages` })
    expect(JSON.stringify(calls[2].body)).not.toContain('server mode hello')
  })

  it('rehydrates channel crypto from a stored invite before creating rooms after restore', async () => {
    const channelId = '11111111-1111-4111-8111-111111111111'
    const handler = (c: Call) => {
      const body = c.body as Record<string, unknown>
      if (c.path === `${P}/channels`) {
        return {
          channel: { id: channelId, tenantId: 'default', spaceId: 's1', slug: 'ops' },
          generalRoom: { id: 'general1', tenantId: 'default', channelId, slug: 'general', title: 'General', currentEpoch: 1 },
          memberToken: 'cv3m_owner',
        }
      }
      return {
        room: { id: 'r2', tenantId: 'default', channelId, slug: body.slug, title: body.title, currentEpoch: 1 },
        epoch: { roomId: 'r2', epoch: 1, wrappedKeyBlob: 'blob' },
      }
    }
    const created = harness(handler)
    const { channel, invite } = await created.client.createChannel({
      space: { id: 's1', tenantId: 'default', slug: 'default' },
      slug: 'ops',
      title: 'Ops',
      handle: 'codex',
    })
    const restored = harness(handler, { memberToken: 'cv3m_owner', keyStore: new MemoryKeyStore() })

    await expect(
      restored.client.createRoom({ channel, slug: 'before-restore', title: 'Before Restore' }),
    ).rejects.toThrow(`no channel crypto material for ${channelId}`)

    const parsed = await restored.client.rememberChannelInvite(invite)
    const room = await restored.client.createRoom({ channel, slug: 'after-restore', title: 'After Restore' })

    expect(parsed.channelId).toBe(channelId)
    expect(restored.calls[0]).toMatchObject({
      method: 'POST',
      path: `${P}/channels/${channelId}/rooms`,
      body: {
        channelId,
        slug: 'after-restore',
        title: 'After Restore',
      },
    })
    expect((restored.calls[0].body as { epoch?: { epoch?: number; cipherSuite?: string; wrappedKeyBlob?: string } }).epoch).toMatchObject({
      epoch: 1,
      cipherSuite: 'v0-shared-epoch',
    })
    expect(room.slug).toBe('after-restore')
  })

  it('lists/archives/deletes rooms', async () => {
    const { client, calls } = harness((c) => (c.method === 'DELETE' ? { deleted: true } : c.path.endsWith('/archive') ? { id: 'r1', status: 'archived' } : []))
    await client.listRooms('c1', { status: 'active' })
    await client.archiveRoom('r1')
    await client.deleteRoom('r1', { confirmSlug: 'general-2' })
    expect(calls[0]).toMatchObject({ method: 'GET', path: `${P}/channels/c1/rooms` })
    expect(calls[1]).toMatchObject({ method: 'POST', path: `${P}/rooms/r1/archive` })
    expect(calls[2]).toMatchObject({ method: 'DELETE', path: `${P}/rooms/r1`, body: { confirmSlug: 'general-2' } })
  })
})

describe('readText pagination (backward compatible)', () => {
  it('keeps afterSeq and adds optional limit to the query', async () => {
    const { client, calls } = harness(() => [
      { seq: 1, kind: 'message', epoch: 1, ciphertext: 'x', nonce: 'y', senderMemberId: 'm1', createdAt: 'now' },
    ])
    const room = { id: 'r1', slug: 'general', title: 'General', currentEpoch: 1 }
    const out = await client.readText(room, 10, 25)
    expect(calls[0].path).toBe(`${P}/rooms/r1/messages`)
    expect(calls[0].search).toContain('afterSeq=10')
    expect(calls[0].search).toContain('limit=25')
    // no epoch key in the default keystore -> locked, but the row still surfaces
    expect(out[0].text).toBe('[locked]')
    expect(out[0].senderMemberId).toBe('m1')
  })
})
