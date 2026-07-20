import { EnvelopeHttp, EnvelopeHttpError, MemoryTokenProvider } from '@aopslab/light-client-core'
import { appendQueryParam } from '@aopslab/light-client-core/stream'

/**
 * ChatV3 REST transport: a thin domain layer over light-client-core's
 * envelope-aware HTTP client. This package owns the chat semantics (public
 * prefix, member tokens, stream paths); the envelope unwrap, fetch binding
 * and credential plumbing live in core.
 */
export type Chatv3HttpError = EnvelopeHttpError

export type Chatv3HttpOptions = {
  serverBaseUrl: string
  /** personal member token (Bearer) once joined */
  memberToken?: string
  /**
   * Optional AuthV2/AOPS bearer for scoped admin metadata operations. When this
   * is set together with a ChatV3 member token, Authorization carries the AuthV2
   * token and the member token moves to x-chatv3-member-token.
   */
  accessToken?: string
  fetchImpl?: typeof fetch
}

export class Chatv3Http extends EnvelopeHttp {
  private readonly memberHeaders: Record<string, string>
  private authv2AccessToken: string | null
  private chatv3MemberToken: string | null

  constructor(options: Chatv3HttpOptions) {
    const memberHeaders: Record<string, string> = {}
    const authToken = options.accessToken ?? options.memberToken ?? null
    if (options.accessToken && options.memberToken) {
      memberHeaders['x-chatv3-member-token'] = `Bearer ${options.memberToken}`
    }
    super({
      serverBaseUrl: options.serverBaseUrl,
      apiPrefix: '/api/chatv3/v1',
      tokenProvider: new MemoryTokenProvider(authToken),
      fetchImpl: options.fetchImpl,
      defaultHeaders: memberHeaders,
    })
    this.memberHeaders = memberHeaders
    this.authv2AccessToken = options.accessToken ?? null
    this.chatv3MemberToken = options.memberToken ?? null
  }

  get memberToken(): string | undefined {
    return this.chatv3MemberToken ?? undefined
  }

  set memberToken(token: string | undefined) {
    this.chatv3MemberToken = token ?? null
    this.syncAuthHeaders()
  }

  get accessToken(): string | undefined {
    return this.authv2AccessToken ?? undefined
  }

  set accessToken(token: string | undefined) {
    this.authv2AccessToken = token ?? null
    this.syncAuthHeaders()
  }

  private syncAuthHeaders(): void {
    if (this.authv2AccessToken) {
      this.tokens.set(this.authv2AccessToken)
      if (this.chatv3MemberToken) {
        this.memberHeaders['x-chatv3-member-token'] = `Bearer ${this.chatv3MemberToken}`
      } else {
        delete this.memberHeaders['x-chatv3-member-token']
      }
      return
    }
    delete this.memberHeaders['x-chatv3-member-token']
    this.tokens.set(this.chatv3MemberToken)
  }

  /**
   * SSE stream URL with the member token as a query param. This is the v0
   * legacy-query-token scheme (EventSource can't set headers) — the
   * ticket-first strategy in core/stream replaces it once the server mints
   * stream tickets (see light-client-core-contract.md).
   */
  streamUrl(roomId: string): string {
    const url = this.url(`/rooms/${roomId}/stream`)
    const token = this.tokens.get()
    return token ? appendQueryParam(url, 'token', token) : url
  }
}
