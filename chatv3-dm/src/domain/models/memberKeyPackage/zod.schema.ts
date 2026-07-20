import { z } from 'zod'

/** Entity schema — mirrors chatv3-member-key-packages row shape. */
export const memberKeyPackageZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  channelId: z.string().uuid(),
  memberId: z.string().uuid(),
  recipientUserId: z.string(),
  recipientUserKeyId: z.string().uuid(),
  recipientKeyVersion: z.number().int(),
  packageVersion: z.number().int(),
  packageAlg: z.string(),
  ephemeralPublicKeyAlgorithm: z.string(),
  ephemeralPublicKeyFormat: z.string(),
  ephemeralPublicKey: z.string(),
  nonce: z.string(),
  ciphertext: z.string(),
  aad: z.string().nullable(),
  authTag: z.string().nullable(),
  sourceEpoch: z.number().int(),
  status: z.string(),
  staleReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type BmMemberKeyPackage = z.infer<typeof memberKeyPackageZodSchema>
