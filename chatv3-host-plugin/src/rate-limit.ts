import { createHash } from 'node:crypto'

/**
 * F1b abuse control: fixed-window in-memory limiter. Authenticated calls are
 * keyed per member token, anonymous (open) calls per client IP. Single-process
 * scope — same documented limit as the SSE bus; a shared store is a later
 * scaling slice. Window state is pruned lazily.
 */
export type Chatv3RateLimits = {
  openPerMinute: number
  memberPerMinute: number
}

export function resolveChatv3RateLimits(env: NodeJS.ProcessEnv = process.env): Chatv3RateLimits {
  const parse = (raw: string | undefined, fallback: number) => {
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
  }
  return {
    openPerMinute: parse(env.CHATV3_RATE_OPEN_PER_MIN, 30),
    memberPerMinute: parse(env.CHATV3_RATE_MEMBER_PER_MIN, 300),
  }
}

type WindowEntry = { windowStart: number; count: number }

export class Chatv3RateLimiter {
  private readonly entries = new Map<string, WindowEntry>()

  constructor(
    private readonly limits: Chatv3RateLimits,
    private readonly windowMs = 60_000
  ) {}

  /** returns true when the call is allowed */
  hit(key: string, kind: 'open' | 'member', now = Date.now()): boolean {
    const limit = kind === 'open' ? this.limits.openPerMinute : this.limits.memberPerMinute
    const entry = this.entries.get(key)
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.entries.set(key, { windowStart: now, count: 1 })
      if (this.entries.size > 10_000) this.prune(now)
      return true
    }
    entry.count += 1
    return entry.count <= limit
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart >= this.windowMs) this.entries.delete(key)
    }
  }
}

function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip') || 'local'
}

/**
 * Bucket selection is driven by the OPERATION's auth level, never by the mere
 * presence of an Authorization header (issue 57c13ccb): otherwise an attacker
 * could attach a junk/rotating bearer to an open create/join and escape the
 * per-IP bucket into the looser member bucket. auth=open → always per-IP;
 * auth=member/admin → per authenticated-token digest.
 */
export function chatv3RateKey(
  headers: Headers,
  authLevel: 'open' | 'principal' | 'member' | 'admin',
  principal?: { userId?: string | null; id?: string | null } | null
): { key: string; kind: 'open' | 'member' } {
  if (authLevel === 'open') {
    return { key: `ip:${clientIp(headers)}`, kind: 'open' }
  }
  const principalUserId = principal?.userId ?? principal?.id ?? null
  if (principalUserId) {
    return {
      key: `p:${createHash('sha256').update(principalUserId).digest('hex').slice(0, 16)}`,
      kind: 'member',
    }
  }
  const token = headers.get('authorization') ?? headers.get('x-chatv3-member-token')
  if (token) {
    return { key: `m:${createHash('sha256').update(token).digest('hex').slice(0, 16)}`, kind: 'member' }
  }
  // member-auth op with no token: it will be rejected as unauthorized anyway;
  // meter it per-IP so the rejection path itself can't be used to flood.
  return { key: `ip:${clientIp(headers)}`, kind: 'open' }
}
