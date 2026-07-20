/**
 * Generic KeyValue storage contract — structured-clone capable and
 * explicitly CryptoKey-capable: persisting a non-extractable CryptoKey
 * handle must round-trip without ever exposing raw bytes (hard requirement
 * from review issue 8a342df1). What a domain stores here (key schemas,
 * prefixes) is the domain's business; core only moves values.
 */
export type KeyValueStore = {
  get<T>(key: string): Promise<T | null>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly values = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T) ?? null
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
  }
}

export * from './idb.js'
