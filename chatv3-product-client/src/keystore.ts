/**
 * KeyStore abstraction: where the client keeps wrapSecrets and unwrapped
 * epoch keys. The SDK ships only the contract and an in-memory default —
 * persistent stores (browser IndexedDB, agent file keystore, OS keychain)
 * implement this interface in their own runtime packages.
 */
export type Chatv3KeyStore = {
  setWrapSecret(channelId: string, wrapSecret: string): Promise<void>
  getWrapSecret(channelId: string): Promise<string | null>
  setEpochKey(roomId: string, epoch: number, key: CryptoKey): Promise<void>
  getEpochKey(roomId: string, epoch: number): Promise<CryptoKey | null>
}

export class MemoryKeyStore implements Chatv3KeyStore {
  private wrapSecrets = new Map<string, string>()
  private epochKeys = new Map<string, CryptoKey>()

  async setWrapSecret(channelId: string, wrapSecret: string): Promise<void> {
    this.wrapSecrets.set(channelId, wrapSecret)
  }

  async getWrapSecret(channelId: string): Promise<string | null> {
    return this.wrapSecrets.get(channelId) ?? null
  }

  async setEpochKey(roomId: string, epoch: number, key: CryptoKey): Promise<void> {
    this.epochKeys.set(`${roomId}#${epoch}`, key)
  }

  async getEpochKey(roomId: string, epoch: number): Promise<CryptoKey | null> {
    return this.epochKeys.get(`${roomId}#${epoch}`) ?? null
  }
}
