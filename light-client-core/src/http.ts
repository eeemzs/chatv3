import { bindFetch, normalizeBaseUrl } from './config.js'
import { MemoryTokenProvider, TokenProvider } from './token.js'

/**
 * Envelope-aware HTTP client. The `{ok, domain, operation, data}` shape is
 * the host's generic plugin contract (not a domain invention), so unwrapping
 * it is core's job: outer dispatcher envelope `{ok, data: <plugin envelope>}`
 * → plugin envelope `{ok, errorCode?, message?, data: <result>}` → result.
 * Non-2xx / ok:false become a typed EnvelopeHttpError.
 */
export type EnvelopeHttpError = Error & { status: number; errorCode?: string }

export type EnvelopeHttpOptions = {
  serverBaseUrl: string
  /** the domain's public mount, e.g. '/api/chatv3/v1' — domains own their prefix */
  apiPrefix: string
  tokenProvider?: TokenProvider
  fetchImpl?: typeof fetch
  /**
   * Static headers merged into every request (domain-neutral): a domain that
   * selects context via headers (e.g. x-project-id / x-scope-id for a
   * multi-tenant host) supplies them here. content-type and the bearer
   * Authorization always win over these.
   */
  defaultHeaders?: Record<string, string>
}

function makeError(status: number, code: string | undefined, message: string): EnvelopeHttpError {
  const err = new Error(message) as EnvelopeHttpError
  err.status = status
  err.errorCode = code
  return err
}

export class EnvelopeHttp {
  readonly tokens: TokenProvider
  private readonly base: string
  private readonly prefix: string
  private readonly fetchImpl: typeof fetch
  private readonly defaultHeaders: Record<string, string>

  constructor(options: EnvelopeHttpOptions) {
    this.base = normalizeBaseUrl(options.serverBaseUrl)
    this.prefix = options.apiPrefix
    this.tokens = options.tokenProvider ?? new MemoryTokenProvider()
    this.fetchImpl = options.fetchImpl ?? bindFetch()
    this.defaultHeaders = options.defaultHeaders ?? {}
  }

  /** absolute URL for a path under the domain prefix (no auth attached) */
  url(path: string): string {
    return `${this.base}${this.prefix}${path}`
  }

  private headers(): Record<string, string> {
    // domain-supplied defaults first, then the fixed content-type and bearer
    // (which always take precedence over a same-named default header).
    const headers: Record<string, string> = { ...this.defaultHeaders, 'content-type': 'application/json' }
    const token = this.tokens.get()
    if (token) headers.authorization = `Bearer ${token}`
    return headers
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(this.url(path), {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const payload = text ? JSON.parse(text) : {}

    // Peel envelope layers by KEY PRESENCE, never `??` — an operation that
    // legitimately returns `data: null` must unwrap to null, not to the
    // envelope object (issue 037c74ae). A transport/plugin envelope is an
    // object carrying an `ok` flag; the domain result underneath never does,
    // so we stop at the first non-envelope.
    const isEnvelope = (v: unknown): v is { ok?: unknown; data?: unknown } =>
      typeof v === 'object' && v !== null && 'ok' in v
    let envelope = isEnvelope(payload) ? payload : null
    if (envelope && isEnvelope(envelope.data)) envelope = envelope.data

    if (!response.ok || envelope?.ok === false) {
      const e = envelope as Record<string, unknown> | null
      const errCode = (e?.errorCode ?? e?.error) as string | undefined
      const message = (e?.message as string | undefined) ?? `request failed (${response.status})`
      throw makeError(response.status, errCode, message)
    }
    return (envelope && 'data' in envelope ? envelope.data : payload) as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }
  del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }
}
