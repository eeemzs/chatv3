import { z } from 'zod'

/**
 * Crypto contract (binding consensus): the server treats message content as
 * an opaque encrypted payload and stores wrapped epoch keys it cannot open.
 * Field set is MLS-shaped so a future audited suite lands without a schema
 * break. The v0 suite is explicitly a prototype: server-blind, no PFS/PCS.
 */
export const CHANNEL_ENCRYPTION_MODES = ['e2e', 'server-encrypted'] as const
export const CIPHER_SUITES = ['v0-shared-epoch', 'v1-server-managed'] as const
export const SERVER_MANAGED_CIPHER_SUITE = 'v1-server-managed'
export const V0_CIPHER_SUITE = 'v0-shared-epoch'

export const zChannelEncryptionMode = z.enum(CHANNEL_ENCRYPTION_MODES)
export const zCipherSuite = z.enum(CIPHER_SUITES)

export const zB64 = z
  .string()
  .min(1)
  .max(262144)
  .regex(/^[A-Za-z0-9+/_-]+={0,2}$/, 'base64/base64url payload expected')

/** Opaque encrypted message envelope as sent by clients. */
export const zCryptoEnvelope = z.object({
  protocolVersion: z.number().int().min(1).default(1),
  cipherSuite: zCipherSuite,
  epoch: z.number().int().min(1),
  ciphertext: zB64,
  nonce: zB64,
  aad: zB64.optional(),
  authTag: zB64.optional(),
})
export type Chatv3CryptoEnvelope = z.infer<typeof zCryptoEnvelope>

/**
 * Client-published epoch material. wrappedKeyBlob is KEK-wrapped client-side
 * (KEK = HKDF(wrapSecret, ...)); the server never receives wrapSecret in any
 * payload — it stores the blob it cannot open plus the KDF parameters that
 * let other wrapSecret holders re-derive the KEK.
 */
export const zEpochPublish = z
  .object({
    epoch: z.number().int().min(1),
    cipherSuite: zCipherSuite,
    wrappedKeyBlob: zB64,
    kdfMeta: z
      .object({
        kdf: z.string().min(1).max(60).default('hkdf-sha256'),
        saltSpec: z.string().min(1).max(400).default('tenantId|spaceId|channelId|epoch'),
        info: z.string().min(1).max(200).default('chatv3-v0-epoch-wrap'),
        wrapAlg: z.string().min(1).max(60).default('aes-256-gcm'),
      })
      .passthrough()
      .default({
        kdf: 'hkdf-sha256',
        saltSpec: 'tenantId|spaceId|channelId|epoch',
        info: 'chatv3-v0-epoch-wrap',
        wrapAlg: 'aes-256-gcm',
      }),
  })
  .superRefine((value, ctx) => {
    if (value.cipherSuite === SERVER_MANAGED_CIPHER_SUITE && typeof value.kdfMeta.keyId !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kdfMeta', 'keyId'],
        message: 'server-managed epoch metadata requires keyId',
      })
    }
  })
export type Chatv3EpochPublish = z.infer<typeof zEpochPublish>

/** Public device identity material (private keys never reach the server). */
export const zDevicePublish = z.object({
  deviceLabel: z.string().max(200).optional(),
  identityPublicKey: zB64,
  signingPublicKey: zB64.optional(),
})
export type Chatv3DevicePublish = z.infer<typeof zDevicePublish>

export const zKeyPackagePublish = z.object({
  deviceId: z.string().uuid(),
  kind: z.enum(['v0', 'mls-keypackage']).default('v0'),
  packageBlob: zB64,
})
export type Chatv3KeyPackagePublish = z.infer<typeof zKeyPackagePublish>

export const RECOVERY_KEK_SOURCES = ['chat-pin', 'password-kdf'] as const
export const RECOVERY_KDF_NAMES = ['argon2id', 'pbkdf2-sha256'] as const
export const RECOVERY_POLICIES = ['pin', 'password', 'both'] as const
export const RECOVERY_STATES = [
  'recoverable',
  'locked-needs-pin',
  'locked-needs-invite',
  'stale-needs-current-device',
] as const
export const KEY_PACKAGE_STALE_REASONS = ['channel-rotate', 'user-key-rotated'] as const

export const zRecoveryKekSource = z.enum(RECOVERY_KEK_SOURCES)
export const zRecoveryPolicy = z.enum(RECOVERY_POLICIES)
export const zRecoveryState = z.enum(RECOVERY_STATES)
export const zKeyPackageStaleReason = z.enum(KEY_PACKAGE_STALE_REASONS)

export const zRecoveryPublicKey = z
  .object({
    algorithm: z.enum(['p256-ecdh', 'x25519']).default('p256-ecdh'),
    format: z.enum(['spki', 'raw', 'jwk']).default('spki'),
    publicKey: zB64,
  })
  .strict()

export const zRecoveryKdfMeta = z
  .object({
    name: z.enum(RECOVERY_KDF_NAMES).default('argon2id'),
    version: z.number().int().min(1).max(100).default(1),
    salt: zB64,
    memoryKiB: z.number().int().min(8192).max(1048576).optional(),
    iterations: z.number().int().min(1).max(10000000),
    parallelism: z.number().int().min(1).max(32).default(1),
  })
  .strict()

/**
 * Account-bound encrypted user-key backup. The server stores only opaque
 * ciphertext and public key metadata. threatModelLabel is accepted only for
 * client-side diagnostics; the service overwrites it from the deployment
 * recovery policy so clients cannot mislabel a password-kdf deployment.
 */
export const zUserPrivateKeyBackup = z
  .object({
    packageVersion: z.number().int().min(1).max(10).default(1),
    kekSource: zRecoveryKekSource,
    kdf: zRecoveryKdfMeta,
    wrapAlg: z.enum(['aes-256-gcm']).default('aes-256-gcm'),
    nonce: zB64,
    ciphertext: zB64,
    aad: zB64.optional(),
    authTag: zB64.optional(),
    threatModelLabel: z.string().max(300).optional(),
  })
  .strict()

export const zMemberKeyPackageEnvelope = z
  .object({
    packageVersion: z.number().int().min(1).max(10).default(1),
    packageAlg: z.enum(['p256-ecdh+a256gcm', 'x25519+a256gcm']).default('p256-ecdh+a256gcm'),
    ephemeralPublicKey: zRecoveryPublicKey,
    nonce: zB64,
    ciphertext: zB64,
    aad: zB64.optional(),
    authTag: zB64.optional(),
    sourceEpoch: z.number().int().min(1).default(1),
  })
  .strict()

export type Chatv3RecoveryPublicKey = z.infer<typeof zRecoveryPublicKey>
export type Chatv3UserPrivateKeyBackup = z.infer<typeof zUserPrivateKeyBackup>
export type Chatv3MemberKeyPackageEnvelope = z.infer<typeof zMemberKeyPackageEnvelope>
