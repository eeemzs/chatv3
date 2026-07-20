import { z } from 'zod'

/** Entity schema — mirrors chatv3-access-keys row shape. Only the verifier hash is ever stored. */
export const accessKeyZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  channelId: z.string().uuid(),
  keyId: z.string(),
  verifierHash: z.string(),
  label: z.string().nullable(),
  roleKey: z.string(),
  status: z.string(),
  epoch: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  revokedAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
})

export type BmAccessKey = z.infer<typeof accessKeyZodSchema>
