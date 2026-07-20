import { describe, expect, it } from 'vitest'
import { CHATV3_OPERATIONS, getChatv3OperationById } from '../operations/catalog.js'
import { buildChatv3DomainCapabilityManifest } from '../operations/dcm.js'
import { buildChatv3HostRoutes } from '../index.js'

/**
 * Drift gate (hexagen rule 10.2): DCM and host-route projection must stay an
 * exact projection of the operation catalog — an op added/removed in one
 * surface but not the other fails here.
 */
describe('catalog -> projection parity', () => {
  it('every operation appears exactly once in the DCM with an input schema', () => {
    const dcm = buildChatv3DomainCapabilityManifest()
    const dcmIds = dcm.capabilities.operations.map((o) => o.operationId).sort()
    const catalogIds = CHATV3_OPERATIONS.map((o) => o.operationId).sort()
    expect(dcmIds).toEqual(catalogIds)
    for (const op of dcm.capabilities.operations) {
      expect(dcm.contracts.schemas[op.inputSchemaRef], op.operationId).toBeDefined()
      expect(dcm.docs.operations[op.operationId]?.summary, op.operationId).toBeTruthy()
    }
  })

  it('every operation projects exactly one REST route (method+pattern unique)', () => {
    const routes = buildChatv3HostRoutes()
    expect(routes.map((r) => r.operation).sort()).toEqual(
      CHATV3_OPERATIONS.map((o) => o.operationId).sort()
    )
    const routeKeys = routes.map((r) => `${r.method} ${r.pattern}`)
    expect(new Set(routeKeys).size).toBe(routeKeys.length)
  })

  it('auth levels are projected into DCM tags', () => {
    const dcm = buildChatv3DomainCapabilityManifest()
    for (const spec of CHATV3_OPERATIONS) {
      const entry = dcm.capabilities.operations.find((o) => o.operationId === spec.operationId)!
      expect(entry.tags).toContain(`auth:${spec.auth}`)
    }
  })

  it('projects catalog lifecycle effects into host manifest side effects', () => {
    const dcm = buildChatv3DomainCapabilityManifest()
    for (const spec of CHATV3_OPERATIONS) {
      const entry = dcm.capabilities.operations.find((o) => o.operationId === spec.operationId)!
      expect(entry.sideEffect).toBe(spec.sideEffect === 'read' ? 'none' : 'db')
    }
  })

  it('declares admin auth for owner/operator lifecycle operations', () => {
    const adminLifecycleOps = [
      'chatv3.space.archive',
      'chatv3.channel.archive',
      'chatv3.channel.unarchive',
      'chatv3.channel.delete',
      'chatv3.channel.rotate',
      'chatv3.room.archive',
      'chatv3.room.delete',
      'chatv3.webhook.create',
      'chatv3.webhook.remove',
    ]
    for (const operationId of adminLifecycleOps) {
      expect(getChatv3OperationById(operationId)?.auth, operationId).toBe('admin')
    }
  })

  it('no open operation mutates existing state (review issue b242372a)', () => {
    // an unauthenticated caller may only create brand-new resources, never
    // write to or destroy an existing one.
    const openWrites = CHATV3_OPERATIONS.filter(
      (o) => o.auth === 'open' && o.sideEffect !== 'read'
    )
    // space.ensure is resolve-or-create: it returns an existing row but never
    // mutates one, so it stays within the create-only rule.
    expect(openWrites.map((o) => o.operationId).sort()).toEqual([
      'chatv3.channel.create',
      'chatv3.channel.join',
      'chatv3.space.create',
      'chatv3.space.ensure',
    ])
    expect(CHATV3_OPERATIONS.some((o) => o.sideEffect === 'destructive' && o.auth === 'open')).toBe(false)
  })

  it('space archive and tenant-wide list are admin-only metadata operations', () => {
    expect(getChatv3OperationById('chatv3.space.archive')?.auth).toBe('admin')
    expect(getChatv3OperationById('chatv3.space.archive')?.sideEffect).toBe('write')
    expect(getChatv3OperationById('chatv3.space.list')?.auth).toBe('admin')
    expect(getChatv3OperationById('chatv3.space.list')?.sideEffect).toBe('read')
  })

  it('server-encrypted channel operations keep their auth and REST contracts', () => {
    const routes = buildChatv3HostRoutes()
    const epochKeys = getChatv3OperationById('chatv3.channel.epoch-keys')!
    const remint = getChatv3OperationById('chatv3.member.token.remint')!

    expect(epochKeys.auth).toBe('member')
    expect(epochKeys.sideEffect).toBe('read')
    expect(epochKeys.method).toBe('GET')
    expect(epochKeys.pattern).toBe('/v1/channels/:channelId/epoch-keys')

    expect(remint.auth).toBe('principal')
    expect(remint.sideEffect).toBe('write')
    expect(remint.method).toBe('POST')
    expect(remint.pattern).toBe('/v1/channels/:channelId/members/me/token')

    expect(routes.find((r) => r.operation === epochKeys.operationId)?.pattern).toBe(
      epochKeys.pattern
    )
    expect(routes.find((r) => r.operation === remint.operationId)?.pattern).toBe(remint.pattern)
  })
})
