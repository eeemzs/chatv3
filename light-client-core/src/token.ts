/**
 * Credential/token provider — generic by contract (F3.0 review note: nothing
 * member- or domain-specific in the naming). Core never persists credentials
 * itself; persistent providers wrap a storage adapter and keep a sync cache.
 */
export type TokenProvider = {
  get(): string | null
  set(token: string | null): void
  clear(): void
}

export class MemoryTokenProvider implements TokenProvider {
  private token: string | null = null

  constructor(initial?: string | null) {
    this.token = initial ?? null
  }

  get(): string | null {
    return this.token
  }

  set(token: string | null): void {
    this.token = token
  }

  clear(): void {
    this.token = null
  }
}
