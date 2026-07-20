import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Chatv3Db, Chatv3Error, Chatv3Services } from '@aopslab/domain-dm-chatv3'
import { executeChatv3Operation, extractBearerToken, extractChatv3MemberToken } from '../operations/executor.js'
import { Chatv3OperationSpec, getChatv3OperationById } from '../operations/catalog.js'

const headers = (entries: Record<string, string>) => {
  const h = new Headers()
  for (const [k, v] of Object.entries(entries)) h.set(k, v)
  return h
}

// F4 header preference (issue 37e296e7): with the split — authv2 JWT in
// Authorization, ChatV3 member token in x-chatv3-member-token — a member/admin
// op must read the member token, never the JWT.
describe('extractBearerToken — F4 member-token header preference', () => {
  it('prefers x-chatv3-member-token over Authorization (JWT must not be taken as the member token)', () => {
    const h = headers({ authorization: 'Bearer jwt.header.signature', 'x-chatv3-member-token': 'cv3m_member' })
    expect(extractBearerToken(h)).toBe('cv3m_member')
  })

  it('falls back to Authorization when no dedicated header (standalone client unchanged)', () => {
    expect(extractBearerToken(headers({ authorization: 'Bearer cv3m_standalone' }))).toBe('cv3m_standalone')
  })

  it('accepts a raw (non-Bearer) x-chatv3-member-token value', () => {
    expect(extractBearerToken(headers({ 'x-chatv3-member-token': 'cv3m_raw' }))).toBe('cv3m_raw')
  })

  it('returns null when neither header is present', () => {
    expect(extractBearerToken(headers({}))).toBeNull()
  })
})

describe('extractChatv3MemberToken — admin authv2 split', () => {
  it('does not treat an authv2 JWT in Authorization as a ChatV3 member token', () => {
    expect(extractChatv3MemberToken(headers({ authorization: 'Bearer jwt.header.signature' }))).toBeNull()
  })

  it('still accepts standalone Authorization when it carries a ChatV3 member token', () => {
    expect(extractChatv3MemberToken(headers({ authorization: 'Bearer cv3m_standalone' }))).toBe('cv3m_standalone')
  })
})

const adminSpec: Chatv3OperationSpec = {
  operationId: 'chatv3.test.admin',
  title: 'Test admin',
  summary: 'Test admin operation.',
  method: 'POST',
  pattern: '/v1/test/admin',
  auth: 'admin',
  sideEffect: 'write',
  input: z.object({}),
  handler: async (_services, _input, actor) => actor,
} as Chatv3OperationSpec

const principalSpec: Chatv3OperationSpec = {
  operationId: 'chatv3.test.principal',
  title: 'Test principal',
  summary: 'Test principal operation.',
  method: 'GET',
  pattern: '/v1/test/principal',
  auth: 'principal',
  sideEffect: 'read',
  input: z.object({}),
  handler: async (_services, _input, actor, principalUserId) => ({ actor, principalUserId }),
} as Chatv3OperationSpec

const ownerAdminSpec: Chatv3OperationSpec = {
  ...adminSpec,
  operationId: 'chatv3.test.owner-admin',
  principalFallback: true,
} as Chatv3OperationSpec

const fakeDeps = {
  db: {} as Chatv3Db,
  services: {} as Chatv3Services,
}

const routeRequest = (overrides: Partial<Parameters<typeof executeChatv3Operation>[2]> = {}) => ({
  headers: headers({}),
  body: {},
  query: new URLSearchParams(),
  params: {},
  ...overrides,
})

describe('executeChatv3Operation — scoped authv2 admin gate', () => {
  it('dispatches admin ops with a verified principal and scoped ChatV3 permission', async () => {
    const actor = await executeChatv3Operation(
      fakeDeps,
      adminSpec,
      routeRequest({
        headers: headers({ authorization: 'Bearer jwt.header.signature' }),
        principal: { userId: 'user-1', permissions: ['chatv3.channel.manage'] },
      })
    )
    expect(actor).toMatchObject({ kind: 'scoped-admin', principalUserId: 'user-1' })
  })

  it('rejects admin ops without a verified principal or member token', async () => {
    await expect(executeChatv3Operation(fakeDeps, adminSpec, routeRequest())).rejects.toMatchObject({
      code: 'unauthorized',
    } satisfies Partial<Chatv3Error>)
  })

  it('rejects admin ops when the principal lacks ChatV3 scoped admin permission', async () => {
    await expect(
      executeChatv3Operation(
        fakeDeps,
        adminSpec,
        routeRequest({ principal: { userId: 'user-1', permissions: ['projectman.admin'] } })
      )
    ).rejects.toMatchObject({ code: 'forbidden' } satisfies Partial<Chatv3Error>)
  })

  it('dispatches principal-gated ops with a verified principal even without scoped admin permission', async () => {
    const result = await executeChatv3Operation(
      fakeDeps,
      principalSpec,
      routeRequest({ principal: { userId: 'user-1', permissions: ['projectman.admin'] } })
    )
    expect(result).toMatchObject({
      actor: { kind: 'scoped-admin', principalUserId: 'user-1', permissions: ['projectman.admin'] },
      principalUserId: 'user-1',
    })
  })

  it('allows principal fallback only when an admin op opts in', async () => {
    const actor = await executeChatv3Operation(
      fakeDeps,
      ownerAdminSpec,
      routeRequest({ principal: { userId: 'user-1', permissions: ['projectman.admin'] } })
    )
    expect(actor).toMatchObject({ kind: 'scoped-admin', principalUserId: 'user-1' })
  })
})

describe('member update auth level', () => {
  it('allows member-token dispatch so a member can self-leave in the dm service', () => {
    expect(getChatv3OperationById('chatv3.member.update')?.auth).toBe('member')
  })
})
