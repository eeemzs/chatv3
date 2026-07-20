// Structural copies of the host plugin contract (same approach as the other
// domain host plugins): the host matches these shapes, no @aopslab/host-core
// import is required, which keeps ChatV3 hostable outside AOPS too.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

export type HostPrincipal = {
  id?: string
  userId?: string
  roles?: string[]
  permissions?: string[]
  [key: string]: unknown
}

export type HostRequestContext = {
  tenantId?: string
  locale?: string
  fallbackLocale?: string
  principal?: HostPrincipal | null
  [key: string]: unknown
}

export type DomainRequest = {
  method: HttpMethod
  domain: string
  path: string[]
  query: URLSearchParams
  body: unknown
  headers: Headers
  url: URL
  context: HostRequestContext
}

export type DomainRouteManifestEntry = {
  id: string
  method: HttpMethod
  pattern: string
  operation: string
  summary?: string
  inputJsonSchema?: Record<string, unknown>
  buildInput?: (request: DomainRequest, params: Record<string, string>) => Record<string, unknown>
}

export type DomainPlugin = {
  contract: 'v1'
  domain: string
  version: string
  capabilities?: string[]
  manifest: {
    domain: string
    version: string
    routes: DomainRouteManifestEntry[]
    meta?: Record<string, unknown>
  }
  setup?: () => Promise<void> | void
  health?: () => Promise<{ ok: boolean; details?: Record<string, unknown> }>
  execute: (args: {
    request: DomainRequest
    match: { route: DomainRouteManifestEntry; params: Record<string, string> }
  }) => Promise<unknown>
}
