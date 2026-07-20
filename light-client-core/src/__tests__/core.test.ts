import { describe, expect, it } from 'vitest'
import { normalizeBaseUrl, resolveServerBaseFrom } from '../config.js'
import { EnvelopeHttp, EnvelopeHttpError } from '../http.js'
import { MemoryTokenProvider } from '../token.js'
import { appendQueryParam, LegacyQueryTokenStrategy, TicketAuthStrategy } from '../stream/index.js'
import { MemoryKeyValueStore } from '../storage/index.js'

describe('config', () => {
  it('resolves server base by priority: query > global > origin', () => {
    const origin = { origin: 'https://app.example.com' }
    expect(resolveServerBaseFrom({ ...origin, queryParam: 'https://q.example.com/' })).toBe('https://q.example.com')
    expect(resolveServerBaseFrom({ ...origin, globalOverride: 'https://g.example.com/' })).toBe('https://g.example.com')
    expect(resolveServerBaseFrom(origin)).toBe('https://app.example.com')
    expect(normalizeBaseUrl('https://x.example.com/')).toBe('https://x.example.com')
  })
})

const fetchStub = (handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) =>
  (async (url: unknown, init?: unknown) => {
    const { status, body } = handler(String(url), init as RequestInit)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

describe('EnvelopeHttp', () => {
  it('unwraps the double envelope to the inner result and sends Bearer from the provider', async () => {
    let seenAuth: string | null = null
    let seenUrl = ''
    const http = new EnvelopeHttp({
      serverBaseUrl: 'https://s.example.com/',
      apiPrefix: '/api/demo/v1',
      tokenProvider: new MemoryTokenProvider('tok-123'),
      fetchImpl: fetchStub((url, init) => {
        seenUrl = url
        seenAuth = new Headers(init?.headers).get('authorization')
        return { status: 200, body: { ok: true, data: { ok: true, domain: 'demo', operation: 'x', data: [{ id: 1 }] } } }
      }),
    })
    const result = await http.get<Array<{ id: number }>>('/things')
    expect(result).toEqual([{ id: 1 }])
    expect(seenUrl).toBe('https://s.example.com/api/demo/v1/things')
    expect(seenAuth).toBe('Bearer tok-123')
  })

  it('maps plugin failure envelopes to typed errors', async () => {
    const http = new EnvelopeHttp({
      serverBaseUrl: 'https://s.example.com',
      apiPrefix: '/api/demo/v1',
      fetchImpl: fetchStub(() => ({
        status: 403,
        body: { ok: false, data: { ok: false, error: 'forbidden', errorCode: 'forbidden', message: 'nope' } },
      })),
    })
    const err = await http.post('/things', {}).catch((e: EnvelopeHttpError) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as EnvelopeHttpError).status).toBe(403)
    expect((err as EnvelopeHttpError).errorCode).toBe('forbidden')
    expect((err as EnvelopeHttpError).message).toBe('nope')
  })

  it('issue 037c74ae: an explicit data:null result unwraps to null, not the envelope', async () => {
    const http = new EnvelopeHttp({
      serverBaseUrl: 'https://s.example.com',
      apiPrefix: '/v1',
      fetchImpl: fetchStub(() => ({ status: 200, body: { ok: true, domain: 'demo', operation: 'rm', data: null } })),
    })
    expect(await http.del('/things/1')).toBeNull()
  })

  it('unwraps the single plugin envelope shape on the wire (ok+domain+operation+data)', async () => {
    const http = new EnvelopeHttp({
      serverBaseUrl: 'https://s.example.com',
      apiPrefix: '/v1',
      fetchImpl: fetchStub(() => ({ status: 200, body: { ok: true, domain: 'demo', operation: 'g', data: { id: 7 } } })),
    })
    expect(await http.get('/thing')).toEqual({ id: 7 })
  })

  it('merges defaultHeaders into every request; content-type and bearer win', async () => {
    const seen: Record<string, string | null> = {}
    const http = new EnvelopeHttp({
      serverBaseUrl: 'https://s.example.com',
      apiPrefix: '/v1',
      tokenProvider: new MemoryTokenProvider('tok'),
      defaultHeaders: { 'x-project-id': 'proj-1', 'content-type': 'text/plain' },
      fetchImpl: fetchStub((_url, init) => {
        const h = new Headers(init?.headers)
        seen['x-project-id'] = h.get('x-project-id')
        seen['content-type'] = h.get('content-type')
        seen.authorization = h.get('authorization')
        return { status: 200, body: { ok: true, data: {} } }
      }),
    })
    await http.get('/x')
    expect(seen['x-project-id']).toBe('proj-1')
    expect(seen['content-type']).toBe('application/json') // fixed value wins over default
    expect(seen.authorization).toBe('Bearer tok')
  })

  it('omits authorization when the provider is empty', async () => {
    let seenAuth: string | null = 'sentinel'
    const http = new EnvelopeHttp({
      serverBaseUrl: 'https://s.example.com',
      apiPrefix: '/v1',
      fetchImpl: fetchStub((_url, init) => {
        seenAuth = new Headers(init?.headers).get('authorization')
        return { status: 200, body: { ok: true, data: { ok: true, data: null } } }
      }),
    })
    await http.get('/open')
    expect(seenAuth).toBeNull()
  })
})

describe('stream auth strategies (ticket-first contract)', () => {
  it('appendQueryParam handles fresh and existing query strings with encoding', () => {
    expect(appendQueryParam('https://s/x', 'token', 'a b')).toBe('https://s/x?token=a%20b')
    expect(appendQueryParam('https://s/x?y=1', 'token', 't')).toBe('https://s/x?y=1&token=t')
  })

  it('TicketAuthStrategy mints per connect and appends ?ticket=', async () => {
    let mints = 0
    const strategy = new TicketAuthStrategy(async () => `tick-${++mints}`)
    expect(strategy.kind).toBe('ticket')
    expect(await strategy.authorizeUrl('https://s/stream')).toBe('https://s/stream?ticket=tick-1')
    expect(await strategy.authorizeUrl('https://s/stream')).toBe('https://s/stream?ticket=tick-2')
  })

  it('LegacyQueryTokenStrategy is named legacy and requires a token', async () => {
    const tokens = new MemoryTokenProvider()
    const strategy = new LegacyQueryTokenStrategy(tokens)
    expect(strategy.kind).toBe('legacy-query-token')
    await expect(strategy.authorizeUrl('https://s/stream')).rejects.toThrow(/requires a token/)
    tokens.set('cv3m_x')
    expect(await strategy.authorizeUrl('https://s/stream')).toBe('https://s/stream?token=cv3m_x')
  })
})

describe('storage', () => {
  it('memory store round-trips and deletes', async () => {
    const store = new MemoryKeyValueStore()
    expect(await store.get('missing')).toBeNull()
    await store.put('k', { a: 1 })
    expect(await store.get<{ a: number }>('k')).toEqual({ a: 1 })
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })
})
