import { KeyValueStore } from './index.js'

/**
 * Browser KeyValue store over IndexedDB. Values go through structured clone,
 * so CryptoKey handles persist as handles (non-extractable stays
 * non-extractable; raw bytes never touch JS strings).
 */
export type IndexedDbKeyValueStoreOptions = {
  dbName: string
  storeName?: string
}

export class IndexedDbKeyValueStore implements KeyValueStore {
  private readonly dbName: string
  private readonly storeName: string

  constructor(options: IndexedDbKeyValueStoreOptions) {
    this.dbName = options.dbName
    this.storeName = options.storeName ?? 'kv'
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(this.storeName)) {
          req.result.createObjectStore(this.storeName)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.open()
    try {
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly')
        const req = tx.objectStore(this.storeName).get(key)
        req.onsuccess = () => resolve((req.result as T) ?? null)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  }

  async put(key: string, value: unknown): Promise<void> {
    const db = await this.open()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite')
        tx.objectStore(this.storeName).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }

  async delete(key: string): Promise<void> {
    const db = await this.open()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite')
        tx.objectStore(this.storeName).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }
}
