/**
 * Runtime config — domain-neutral (light-client-core contract §in-scope).
 * One static bundle must work served from a host server AND standalone, so
 * the server base resolves at runtime, never at build time.
 */

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '')
}

export type ServerBaseSources = {
  /** value of the `?server=` style query param, if present */
  queryParam?: string | null
  /** value of a global override (e.g. `window.MYAPP_SERVER_BASE`), if set */
  globalOverride?: string | null
  /** the page origin — the fallback */
  origin: string
}

/** Priority: explicit query param → global override → page origin. */
export function resolveServerBaseFrom(sources: ServerBaseSources): string {
  if (sources.queryParam) return normalizeBaseUrl(sources.queryParam)
  if (sources.globalOverride) return normalizeBaseUrl(sources.globalOverride)
  return normalizeBaseUrl(sources.origin)
}

export type ResolveServerBaseOptions = {
  /** query-string key carrying the server base (default 'server') */
  queryKey?: string
  /** window global key carrying the server base override */
  globalKey?: string
}

/**
 * Browser convenience over resolveServerBaseFrom. Throws outside a browser —
 * non-DOM runtimes pass an explicit base instead of resolving one.
 */
export function resolveServerBase(options: ResolveServerBaseOptions = {}): string {
  const win = (globalThis as { window?: Window }).window
  if (!win) throw new Error('resolveServerBase requires a browser window; pass an explicit base instead')
  const queryKey = options.queryKey ?? 'server'
  const globals = win as unknown as Record<string, unknown>
  return resolveServerBaseFrom({
    queryParam: new URLSearchParams(win.location.search).get(queryKey),
    globalOverride: options.globalKey ? ((globals[options.globalKey] as string | undefined) ?? null) : null,
    origin: win.location.origin,
  })
}

/**
 * A bare `globalThis.fetch` reference loses its receiver and throws
 * "Illegal invocation" in browsers when called as a method — bind it once
 * here so every consumer inherits the fix (F2 field lesson).
 */
export function bindFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis)
}
