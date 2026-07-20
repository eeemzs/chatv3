import { z } from 'zod'

/** Entity schema — mirrors chatv3-user-key-backups row shape. */
export const userKeyBackupZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  userId: z.string(),
  keyVersion: z.number().int(),
  publicKeyAlgorithm: z.string(),
  publicKeyFormat: z.string(),
  publicKey: z.string(),
  backupPackageVersion: z.number().int(),
  kekSource: z.string(),
  kdfName: z.string(),
  kdfVersion: z.number().int(),
  kdfSalt: z.string(),
  kdfMemoryKiB: z.number().int().nullable(),
  kdfIterations: z.number().int(),
  kdfParallelism: z.number().int(),
  wrapAlg: z.string(),
  nonce: z.string(),
  ciphertext: z.string(),
  aad: z.string().nullable(),
  authTag: z.string().nullable(),
  threatModelLabel: z.string(),
  status: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type BmUserKeyBackup = z.infer<typeof userKeyBackupZodSchema>
