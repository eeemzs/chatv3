import { describe, expect, it } from 'vitest'
import { zChannelCreateInput, zMessageSendInput } from '../domain/models/operations.js'
import { zCryptoEnvelope, zEpochPublish } from '../domain/models/crypto.js'
import { chatv3MessageTable } from '../infrastructure/db/drizzle.schema.index.js'
import { getTableColumns } from 'drizzle-orm'
import { Chatv3SpaceService } from '../application/services/service.space.js'

const validEnvelope = {
  cipherSuite: 'v0-shared-epoch',
  epoch: 1,
  ciphertext: 'aGVsbG8tY2lwaGVydGV4dA',
  nonce: 'bm9uY2UtMTIzNDU2Nzg5MDEy',
}

describe('crypto envelope contract', () => {
  it('accepts a valid opaque envelope and applies protocolVersion default', () => {
    const parsed = zCryptoEnvelope.parse(validEnvelope)
    expect(parsed.protocolVersion).toBe(1)
    expect(parsed.cipherSuite).toBe('v0-shared-epoch')
  })

  it('rejects unknown cipher suites and non-base64 payloads', () => {
    expect(() => zCryptoEnvelope.parse({ ...validEnvelope, cipherSuite: 'plaintext' })).toThrow()
    expect(() => zCryptoEnvelope.parse({ ...validEnvelope, ciphertext: 'şifresiz metin!' })).toThrow()
  })

  it('epoch publish fills KDF metadata defaults', () => {
    const parsed = zEpochPublish.parse({
      epoch: 1,
      cipherSuite: 'v0-shared-epoch',
      wrappedKeyBlob: 'd3JhcHBlZC1rZXktYmxvYg',
    })
    expect(parsed.kdfMeta.kdf).toBe('hkdf-sha256')
    expect(parsed.kdfMeta.info).toBe('chatv3-v0-epoch-wrap')
  })

  it('server-managed epoch metadata must carry keyId', () => {
    const parsed = zEpochPublish.parse({
      epoch: 1,
      cipherSuite: 'v1-server-managed',
      wrappedKeyBlob: 'd3JhcHBlZC1rZXktYmxvYg',
      kdfMeta: {
        kdf: 'hkdf-sha256',
        saltSpec: 'tenantId|spaceId|channelId|roomId|epoch',
        info: 'chatv3-v1-server-wrap',
        wrapAlg: 'aes-256-gcm',
        kekSource: 'server-master',
        keyId: 'k-test',
        keyVersion: 1,
      },
    })
    expect(parsed.kdfMeta.keyId).toBe('k-test')
    expect(() =>
      zEpochPublish.parse({
        epoch: 1,
        cipherSuite: 'v1-server-managed',
        wrappedKeyBlob: 'd3JhcHBlZC1rZXktYmxvYg',
        kdfMeta: {
          kdf: 'hkdf-sha256',
          saltSpec: 'tenantId|spaceId|channelId|roomId|epoch',
          info: 'chatv3-v1-server-wrap',
          wrapAlg: 'aes-256-gcm',
          kekSource: 'server-master',
          keyVersion: 1,
        },
      })
    ).toThrow()
  })
})

describe('binding consensus guards', () => {
  it('message schema has NO plaintext text column', () => {
    const columns = Object.keys(getTableColumns(chatv3MessageTable))
    expect(columns).not.toContain('text')
    expect(columns).toEqual(expect.arrayContaining(['ciphertext', 'nonce', 'cipherSuite', 'epoch']))
  })

  it('message send input carries content only inside the envelope', () => {
    const input = zMessageSendInput.parse({
      roomId: 'b6d1f9a2-1111-4222-8333-444455556666',
      envelope: validEnvelope,
    })
    expect(input.kind).toBe('message')
    expect((input as Record<string, unknown>).text).toBeUndefined()
  })

  it('channel create takes verifier hash + wrapped blob, never raw secrets', () => {
    const input = zChannelCreateInput.parse({
      spaceId: 'b6d1f9a2-1111-4222-8333-444455556666',
      slug: 'proj-x',
      title: 'Proj X',
      accessKey: { keyId: 'cvk_12345678', verifierHash: 'a'.repeat(64) },
      epoch: { epoch: 1, cipherSuite: 'v0-shared-epoch', wrappedKeyBlob: 'd3JhcHBlZA' },
      creator: { handle: 'claude' },
    })
    expect(input.tenantId).toBe('default')
    expect(input.creator.actorKind).toBe('agent')
    const flat = JSON.stringify(input)
    expect(flat).not.toContain('accessSecret')
    expect(flat).not.toContain('wrapSecret')
  })
})

describe('space admin metadata guards', () => {
  it('requires AuthV2 scoped space admin for tenant-wide space metadata', async () => {
    const service = Object.create(Chatv3SpaceService.prototype) as Chatv3SpaceService & {
      repos: {
        space: {
          list: () => Promise<unknown[]>
          archive: (_spaceId: string, updatedBy?: string) => Promise<unknown>
        }
      }
    }
    let archiveUpdatedBy: string | undefined
    service.repos = {
      space: {
        list: async () => [],
        archive: async (_spaceId, updatedBy) => {
          archiveUpdatedBy = updatedBy
          return { id: 'b6d1f9a2-1111-4222-8333-444455556666', status: 'archived' }
        },
      },
    }

    const ownerMember = { roleKey: 'owner', handle: 'owner', status: 'active' }
    await expect(service.list({ tenantId: 'default', limit: 100 }, ownerMember as never)).rejects.toMatchObject({
      code: 'forbidden',
    })

    const scopedAdmin = {
      kind: 'scoped-admin',
      principalUserId: 'user-1',
      permissions: ['chatv3.space.manage'],
    }
    await expect(service.list({ tenantId: 'default', limit: 100 }, scopedAdmin as never)).resolves.toEqual([])
    await expect(
      service.archive(
        { tenantId: 'default', spaceId: 'b6d1f9a2-1111-4222-8333-444455556666' },
        scopedAdmin as never,
      ),
    ).resolves.toMatchObject({ status: 'archived' })
    expect(archiveUpdatedBy).toBe('authv2:user-1')
  })
})
