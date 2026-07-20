import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { Chatv3Error } from './errors.js'

/**
 * Server-side key material rules (binding consensus):
 * - accessSecret: client-generated; the server stores only sha256 verifiers.
 * - wrapSecret: NEVER reaches the server in any payload; nothing here may
 *   accept or derive from it.
 * - member token: the only server-minted secret; returned exactly once,
 *   stored as a hash.
 */

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function randomSecretB64Url(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function randomEpochKeyB64Url(): string {
  return randomSecretB64Url(32)
}

export function hashesEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex')
  const b = Buffer.from(bHex, 'hex')
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

const MEMBER_TOKEN_PREFIX = 'cv3m'

export type MintedMemberToken = {
  /** full bearer token — hand to the client once, never persist */
  token: string
  /** sha256 hex of the secret part — the only thing the DB stores */
  tokenHash: string
}

export function mintMemberToken(memberId: string): MintedMemberToken {
  const secret = randomSecretB64Url(32)
  return {
    token: `${MEMBER_TOKEN_PREFIX}_${memberId}_${secret}`,
    tokenHash: sha256Hex(secret),
  }
}

export type ParsedMemberToken = { memberId: string; secretHash: string }

// base64url secrets may themselves contain underscores, so the token is
// parsed by shape (prefix + uuid + rest), never by splitting on '_'.
const MEMBER_TOKEN_RE = /^cv3m_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})_(.{16,})$/

export function parseMemberToken(token: string): ParsedMemberToken | null {
  const match = MEMBER_TOKEN_RE.exec(token)
  if (!match) return null
  return { memberId: match[1]!, secretHash: sha256Hex(match[2]!) }
}

export const SERVER_MANAGED_EPOCH_INFO = 'chatv3-v1-server-wrap'
const DEV_SERVER_KEY_SECRET = 'chatv3-local-dev-server-key-secret-do-not-use'
let reportedConfiguredServerKey = false
let warnedDevServerKey = false

export type Chatv3ServerKeyConfig = {
  keyId: string
  secret: string
  devDefault: boolean
}

function isExplicitLocalMode(value: string): boolean {
  return ['1', 'true', 'yes', 'local', 'trusted', 'auth-playground'].includes(value)
}

function isTrustedLocalAuthProvider(value: string): boolean {
  return value === '' || value === 'trusted-local' || value === 'trusted_local' || value === 'trusted'
}

export function getChatv3ServerKeyConfig(env: NodeJS.ProcessEnv = process.env): Chatv3ServerKeyConfig {
  const keyId = String(env.CHATV3_SERVER_KEY_ID ?? 'k1').trim() || 'k1'
  const configuredSecret = String(env.CHATV3_SERVER_KEY_SECRET ?? '').trim()
  if (configuredSecret) {
    if (env === process.env && !reportedConfiguredServerKey) {
      reportedConfiguredServerKey = true
      console.info(`[chatv3] server-managed encryption key configured; keyId=${keyId}`)
    }
    return { keyId, secret: configuredSecret, devDefault: false }
  }

  const nodeEnv = String(env.NODE_ENV ?? '').trim().toLowerCase()
  const localMode = String(env.AOPS_TRUSTED_LOCAL ?? env.CHATV3_TRUSTED_LOCAL ?? env.AUTH_PLAYGROUND ?? '')
    .trim()
    .toLowerCase()
  const authProvider = String(env.AOPS_AUTH_PROVIDER ?? '').trim().toLowerCase()
  const allowDevDefault =
    nodeEnv !== 'production' &&
    (isExplicitLocalMode(localMode) || isTrustedLocalAuthProvider(authProvider))
  if (!allowDevDefault) {
    throw new Chatv3Error('runtime', 'CHATV3_SERVER_KEY_SECRET is required for server-encrypted ChatV3 mode')
  }

  if (env === process.env && !warnedDevServerKey) {
    warnedDevServerKey = true
    console.warn(`[chatv3] using local development server-managed encryption key; keyId=${keyId}`)
  }
  return { keyId, secret: DEV_SERVER_KEY_SECRET, devDefault: true }
}

function deriveServerManagedKek(params: {
  secret: string
  tenantId: string
  spaceId: string
  channelId: string
  roomId: string
  epoch: number
}): Buffer {
  const salt = Buffer.from(
    `${params.tenantId}|${params.spaceId}|${params.channelId}|${params.roomId}|${params.epoch}`,
    'utf8'
  )
  return Buffer.from(hkdfSync('sha256', Buffer.from(params.secret, 'utf8'), salt, Buffer.from(SERVER_MANAGED_EPOCH_INFO), 32))
}

export function wrapServerManagedEpochKey(params: {
  tenantId: string
  spaceId: string
  channelId: string
  roomId: string
  epoch: number
  rawEpochKey: string
  keyConfig?: Chatv3ServerKeyConfig
}): { wrappedKeyBlob: string; kdfMeta: Record<string, unknown>; keyId: string } {
  const keyConfig = params.keyConfig ?? getChatv3ServerKeyConfig()
  const key = deriveServerManagedKek({ ...params, secret: keyConfig.secret })
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(SERVER_MANAGED_EPOCH_INFO, 'utf8'))
  const wrapped = Buffer.concat([
    cipher.update(Buffer.from(params.rawEpochKey, 'base64url')),
    cipher.final(),
    cipher.getAuthTag(),
  ])
  return {
    wrappedKeyBlob: Buffer.concat([iv, wrapped]).toString('base64url'),
    keyId: keyConfig.keyId,
    kdfMeta: {
      kdf: 'hkdf-sha256',
      saltSpec: 'tenantId|spaceId|channelId|roomId|epoch',
      info: SERVER_MANAGED_EPOCH_INFO,
      wrapAlg: 'aes-256-gcm',
      kekSource: 'server-master',
      keyId: keyConfig.keyId,
      keyVersion: 1,
    },
  }
}

export function unwrapServerManagedEpochKey(params: {
  tenantId: string
  spaceId: string
  channelId: string
  roomId: string
  epoch: number
  wrappedKeyBlob: string
  kdfMeta?: Record<string, unknown>
  keyConfig?: Chatv3ServerKeyConfig
}): string {
  const keyConfig = params.keyConfig ?? getChatv3ServerKeyConfig()
  const rowKeyId = typeof params.kdfMeta?.keyId === 'string' ? params.kdfMeta.keyId : keyConfig.keyId
  if (rowKeyId !== keyConfig.keyId) {
    throw new Chatv3Error('runtime', `ChatV3 server key ${rowKeyId} is not active`)
  }
  const blob = Buffer.from(params.wrappedKeyBlob, 'base64url')
  if (blob.length <= 28) throw new Chatv3Error('runtime', 'invalid server-managed epoch blob')
  const iv = blob.subarray(0, 12)
  const payload = blob.subarray(12)
  const tag = payload.subarray(payload.length - 16)
  const ciphertext = payload.subarray(0, payload.length - 16)
  const key = deriveServerManagedKek({ ...params, secret: keyConfig.secret })
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from(SERVER_MANAGED_EPOCH_INFO, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('base64url')
}
