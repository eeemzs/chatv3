/**
 * v0 split-secret client crypto (binding consensus): everything here runs on
 * the CLIENT over WebCrypto (browser and Node >= 20 share globalThis.crypto).
 * The server only ever receives: sha256(accessSecret) as a verifier, the
 * KEK-wrapped epoch key blob, and AES-GCM ciphertexts. wrapSecret NEVER
 * appears in any request — deriveKek is the only consumer.
 *
 * Suite: HKDF-SHA256 (KEK derivation) + AES-256-GCM (wrap + message
 * encryption). GCM carries its auth tag inside the ciphertext, so the wire
 * envelope's authTag field stays null in v0.
 */
export const V0_CIPHER_SUITE = 'v0-shared-epoch'
// Salt uses keyId (not channelId): the creator knows keyId BEFORE the channel
// exists, so the epoch key can be wrapped in the single composite create call;
// the joiner gets keyId from the invite. keyId is unique per access key, which
// is all the salt needs. (The salt is not a secret — it only domain-separates
// the HKDF per epoch.)
export const V0_KDF_META = {
  kdf: 'hkdf-sha256',
  saltSpec: 'tenantId|spaceId|keyId|epoch',
  info: 'chatv3-v0-epoch-wrap',
  wrapAlg: 'aes-256-gcm',
} as const

const subtle = globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toB64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomB64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  globalThis.crypto.getRandomValues(bytes)
  return toB64Url(bytes)
}

export const generateAccessSecret = (): string => randomB64Url(24)
export const generateWrapSecret = (): string => randomB64Url(32)
export const generateKeyId = (): string => `cvk_${randomB64Url(9)}`

export async function sha256Hex(value: string): Promise<string> {
  const digest = await subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type EpochSaltParts = {
  tenantId: string
  spaceId: string
  keyId: string
  epoch: number
}

/** KEK = HKDF-SHA256(wrapSecret, salt=tenantId|spaceId|keyId|epoch, info) */
export async function deriveKek(wrapSecret: string, parts: EpochSaltParts): Promise<CryptoKey> {
  const ikm = await subtle.importKey('raw', encoder.encode(wrapSecret), 'HKDF', false, ['deriveKey'])
  const salt = encoder.encode(`${parts.tenantId}|${parts.spaceId}|${parts.keyId}|${parts.epoch}`)
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(V0_KDF_META.info) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

export async function generateEpochKey(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function importEpochKey(rawEpochKey: string): Promise<CryptoKey> {
  return subtle.importKey(
    'raw',
    fromB64Url(rawEpochKey) as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** wrappedKeyBlob = b64url(iv || wrapped) — the server stores it, cannot open it */
export async function wrapEpochKey(kek: CryptoKey, epochKey: CryptoKey): Promise<string> {
  const iv = new Uint8Array(12)
  globalThis.crypto.getRandomValues(iv)
  const wrapped = new Uint8Array(await subtle.wrapKey('raw', epochKey, kek, { name: 'AES-GCM', iv }))
  const blob = new Uint8Array(iv.length + wrapped.length)
  blob.set(iv, 0)
  blob.set(wrapped, iv.length)
  return toB64Url(blob)
}

export async function unwrapEpochKey(kek: CryptoKey, wrappedKeyBlob: string): Promise<CryptoKey> {
  const blob = fromB64Url(wrappedKeyBlob)
  const iv = blob.slice(0, 12)
  const wrapped = blob.slice(12)
  return subtle.unwrapKey(
    'raw',
    wrapped as BufferSource,
    kek,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export type EncryptedEnvelope = {
  protocolVersion: number
  cipherSuite: string
  epoch: number
  ciphertext: string
  nonce: string
}

export async function encryptText(epochKey: CryptoKey, epoch: number, plaintext: string): Promise<EncryptedEnvelope> {
  const nonce = new Uint8Array(12)
  globalThis.crypto.getRandomValues(nonce)
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, epochKey, encoder.encode(plaintext))
  )
  return {
    protocolVersion: 1,
    cipherSuite: V0_CIPHER_SUITE,
    epoch,
    ciphertext: toB64Url(ciphertext),
    nonce: toB64Url(nonce),
  }
}

export async function decryptText(
  epochKey: CryptoKey,
  envelope: Pick<EncryptedEnvelope, 'ciphertext' | 'nonce'>
): Promise<string> {
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64Url(envelope.nonce) as BufferSource },
    epochKey,
    fromB64Url(envelope.ciphertext) as BufferSource
  )
  return decoder.decode(plaintext)
}
