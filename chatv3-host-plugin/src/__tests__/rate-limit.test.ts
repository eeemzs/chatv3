import { describe, expect, it } from 'vitest'
import { Chatv3RateLimiter, chatv3RateKey } from '../rate-limit.js'
import { signChatv3WebhookPayload } from '../webhooks.js'

describe('rate limiter', () => {
  it('allows up to the window limit and rejects beyond it', () => {
    const limiter = new Chatv3RateLimiter({ openPerMinute: 3, memberPerMinute: 5 })
    const now = 1_000_000
    expect(limiter.hit('ip:1.2.3.4', 'open', now)).toBe(true)
    expect(limiter.hit('ip:1.2.3.4', 'open', now + 1)).toBe(true)
    expect(limiter.hit('ip:1.2.3.4', 'open', now + 2)).toBe(true)
    expect(limiter.hit('ip:1.2.3.4', 'open', now + 3)).toBe(false)
    // independent key unaffected
    expect(limiter.hit('ip:5.6.7.8', 'open', now + 4)).toBe(true)
  })

  it('resets after the window', () => {
    const limiter = new Chatv3RateLimiter({ openPerMinute: 1, memberPerMinute: 1 })
    const now = 1_000_000
    expect(limiter.hit('m:abc', 'member', now)).toBe(true)
    expect(limiter.hit('m:abc', 'member', now + 10)).toBe(false)
    expect(limiter.hit('m:abc', 'member', now + 60_001)).toBe(true)
  })

  it('member-auth ops key by token digest; open ops always key by ip', () => {
    const member = chatv3RateKey(new Headers({ authorization: 'Bearer cv3m_x_y' }), 'member')
    expect(member.kind).toBe('member')
    expect(member.key.startsWith('m:')).toBe(true)
    const admin = chatv3RateKey(new Headers({ authorization: 'Bearer cv3m_a_b' }), 'admin')
    expect(admin.kind).toBe('member')
    const open = chatv3RateKey(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }), 'open')
    expect(open).toEqual({ key: 'ip:9.9.9.9', kind: 'open' })
    expect(chatv3RateKey(new Headers(), 'open').key).toBe('ip:local')
  })

  it('issue 57c13ccb: a junk bearer on an OPEN op cannot escape the per-IP bucket', () => {
    // attacker rotates a fake Authorization header on an open create/join
    const a = chatv3RateKey(new Headers({ authorization: 'Bearer junk-1', 'x-forwarded-for': '1.2.3.4' }), 'open')
    const b = chatv3RateKey(new Headers({ authorization: 'Bearer junk-2', 'x-forwarded-for': '1.2.3.4' }), 'open')
    expect(a.kind).toBe('open')
    expect(b.kind).toBe('open')
    // both rotating tokens collapse to the SAME per-IP bucket
    expect(a.key).toBe('ip:1.2.3.4')
    expect(b.key).toBe('ip:1.2.3.4')
  })

  it('a member-auth op with no token is metered per-IP (rejection path cannot flood)', () => {
    const r = chatv3RateKey(new Headers({ 'x-forwarded-for': '5.5.5.5' }), 'member')
    expect(r).toEqual({ key: 'ip:5.5.5.5', kind: 'open' })
  })

  it('principal-auth ops key by principal user id, not the open per-IP bucket', () => {
    const a = chatv3RateKey(new Headers({ 'x-forwarded-for': '5.5.5.5' }), 'principal', { userId: 'user-a' })
    const b = chatv3RateKey(new Headers({ 'x-forwarded-for': '9.9.9.9' }), 'principal', { userId: 'user-a' })
    const c = chatv3RateKey(new Headers({ 'x-forwarded-for': '5.5.5.5' }), 'principal', { userId: 'user-b' })
    expect(a.kind).toBe('member')
    expect(a.key.startsWith('p:')).toBe(true)
    expect(b.key).toBe(a.key)
    expect(c.key).not.toBe(a.key)
  })
})

describe('webhook signature', () => {
  it('produces a stable HMAC-SHA256 signature over the body', () => {
    const sig = signChatv3WebhookPayload('topsecret-topsecret', '{"a":1}')
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(sig).toBe(signChatv3WebhookPayload('topsecret-topsecret', '{"a":1}'))
    expect(sig).not.toBe(signChatv3WebhookPayload('other-secret-other', '{"a":1}'))
  })
})
