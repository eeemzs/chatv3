import { z } from 'zod'
import {
  authenticateMemberToken,
  CHATV3_ADMIN_MANAGE_PERMISSIONS,
  Chatv3Db,
  Chatv3Error,
  Chatv3Services,
  Chatv3ScopedAdminAuthority,
  hasScopedAdminPermission,
} from '@aopslab/domain-dm-chatv3'
import { Chatv3OperationActor, Chatv3OperationSpec } from './catalog.js'

export type Chatv3HostPrincipal = {
  userId?: string
  id?: string
  roles?: readonly string[]
  permissions?: readonly unknown[]
  [key: string]: unknown
}

export type Chatv3RouteRequest = {
  headers: Headers
  body: unknown
  query: URLSearchParams
  params: Record<string, string>
  /**
   * Optional authenticated AOPS/authv2 principal (F4). Threaded parallel to the
   * member-token actor — NEVER required. When absent (the standalone product /
   * anonymous join), identity binding stays NULL and every op behaves as before.
   * The kit stays decoupled from host-core, so the shape is structural.
   */
  principal?: Chatv3HostPrincipal | null
}

export type Chatv3ExecutorDeps = {
  db: Chatv3Db
  services: Chatv3Services
}

function normalizeBearerValue(raw: string | null): string | null {
  if (!raw) return null
  const match = /^Bearer\s+(.+)$/i.exec(raw)
  return (match ? match[1] : raw).trim() || null
}

export function extractBearerToken(headers: Headers): string | null {
  // Prefer the dedicated ChatV3 member-token header over Authorization. With the
  // F4 split (authv2 JWT in Authorization, ChatV3 member token in
  // x-chatv3-member-token), a member/admin-gated op must read the member token —
  // NOT the JWT — or it would try to authenticate the JWT as a member token
  // (issue 37e296e7). The standalone client sends no x-chatv3-member-token and
  // keeps using Authorization: Bearer cv3m_… unchanged (fallback below).
  return normalizeBearerValue(headers.get('x-chatv3-member-token')) ?? normalizeBearerValue(headers.get('authorization'))
}

export function extractChatv3MemberToken(headers: Headers): string | null {
  const dedicated = normalizeBearerValue(headers.get('x-chatv3-member-token'))
  if (dedicated) return dedicated

  const authorization = normalizeBearerValue(headers.get('authorization'))
  return authorization?.startsWith('cv3m_') ? authorization : null
}

function buildScopedAdminAuthority(principal: Chatv3HostPrincipal | null | undefined): Chatv3ScopedAdminAuthority {
  const authority = buildPrincipalAuthority(principal)
  if (!hasScopedAdminPermission(authority.permissions, CHATV3_ADMIN_MANAGE_PERMISSIONS)) {
    throw new Chatv3Error('forbidden', `one of ${CHATV3_ADMIN_MANAGE_PERMISSIONS.join(', ')} permission required`)
  }
  return authority
}

function buildPrincipalAuthority(principal: Chatv3HostPrincipal | null | undefined): Chatv3ScopedAdminAuthority {
  const principalUserId = principal?.userId ?? principal?.id ?? null
  if (!principalUserId) {
    throw new Chatv3Error('unauthorized', 'verified authv2 principal required')
  }

  const permissions = Array.isArray(principal?.permissions)
    ? principal.permissions.filter((p): p is string => typeof p === 'string')
    : []

  return {
    kind: 'scoped-admin',
    principalUserId,
    permissions,
  }
}

/**
 * Input assembly order: JSON body < query string < route params. Route params
 * always win so a path can never be redirected by a conflicting body field.
 */
export function buildOperationInput(spec: Chatv3OperationSpec, request: Chatv3RouteRequest): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    Object.assign(merged, request.body as Record<string, unknown>)
  }
  for (const [key, value] of request.query.entries()) merged[key] = value
  Object.assign(merged, request.params)
  for (const key of spec.numericKeys ?? []) {
    const value = merged[key]
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      merged[key] = Number(value)
    }
  }
  return merged
}

export async function executeChatv3Operation(
  deps: Chatv3ExecutorDeps,
  spec: Chatv3OperationSpec,
  request: Chatv3RouteRequest
): Promise<unknown> {
  let actor: Chatv3OperationActor = null
  if (spec.auth === 'member') {
    const token = extractBearerToken(request.headers)
    if (!token) throw new Chatv3Error('unauthorized', 'member token required (Authorization: Bearer cv3m_...)')
    actor = await authenticateMemberToken(deps.db, token)
  } else if (spec.auth === 'principal') {
    actor = buildPrincipalAuthority(request.principal)
  } else if (spec.auth === 'admin') {
    const token = extractChatv3MemberToken(request.headers)
    actor = token
      ? await authenticateMemberToken(deps.db, token)
      : spec.principalFallback
        ? buildPrincipalAuthority(request.principal)
        : buildScopedAdminAuthority(request.principal)
  }

  const raw = buildOperationInput(spec, request)
  const parsed = spec.input.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new Chatv3Error('invalid_input', `invalid input — ${issues}`)
  }

  // Normalize the optional principal to a userId the dm services bind (F4).
  const principalUserId = request.principal?.userId ?? request.principal?.id ?? null
  return (
    spec.handler as (
      s: Chatv3Services,
      input: unknown,
      actor: Chatv3OperationActor,
      principalUserId: string | null
    ) => Promise<unknown>
  )(deps.services, parsed.data, actor, principalUserId)
}

export { z }
