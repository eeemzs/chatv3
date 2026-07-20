import { TokenProvider } from '../token.js'

/**
 * Stream transport — designed ticket-first (light-client-core contract):
 * the primary credential is a short-lived, single-use ticket minted over an
 * authenticated POST; the v0 query-token scheme is supported but explicitly
 * named legacy so it cannot fossilize into consumers. Core stays
 * domain-neutral: consumers build the stream URL (paths are domain
 * semantics) and pick a strategy; the transport authorizes and connects.
 */

export function appendQueryParam(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

export type StreamAuthStrategy = {
  readonly kind: 'ticket' | 'legacy-query-token'
  authorizeUrl(url: string): Promise<string>
}

/** Primary scheme: mint a short-lived ticket via an authenticated call. */
export class TicketAuthStrategy implements StreamAuthStrategy {
  readonly kind = 'ticket'

  constructor(
    private readonly mintTicket: () => Promise<string>,
    private readonly param = 'ticket'
  ) {}

  async authorizeUrl(url: string): Promise<string> {
    return appendQueryParam(url, this.param, await this.mintTicket())
  }
}

/**
 * v0 compatibility: bearer token in the query string (EventSource cannot
 * send headers). Tokens can land in access logs — documented v0 limit; new
 * deployments should move to TicketAuthStrategy once the server mints
 * tickets.
 */
export class LegacyQueryTokenStrategy implements StreamAuthStrategy {
  readonly kind = 'legacy-query-token'

  constructor(
    private readonly tokens: TokenProvider,
    private readonly param = 'token'
  ) {}

  async authorizeUrl(url: string): Promise<string> {
    const token = this.tokens.get()
    if (!token) throw new Error('legacy stream auth requires a token in the provider')
    return appendQueryParam(url, this.param, token)
  }
}

export type StreamHandle = { close(): void }

export type SseConnectOptions = {
  /** named SSE event to subscribe to; omit for bare `message` events */
  eventName?: string
  onEvent: (event: MessageEvent) => void
  onError?: (event: Event) => void
}

/** EventSource wrapper; the strategy injects the credential into the URL. */
export class SseTransport {
  constructor(private readonly strategy: StreamAuthStrategy) {}

  async connect(url: string, options: SseConnectOptions): Promise<StreamHandle> {
    const authorized = await this.strategy.authorizeUrl(url)
    const source = new EventSource(authorized)
    if (options.eventName) {
      source.addEventListener(options.eventName, options.onEvent)
    } else {
      source.onmessage = options.onEvent
    }
    if (options.onError) source.onerror = options.onError
    return { close: () => source.close() }
  }
}
