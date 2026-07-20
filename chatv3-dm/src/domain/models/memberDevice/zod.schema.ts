import { z } from 'zod'

/** Entity schema — mirrors chatv3-member-devices row shape (public key material only). */
export const memberDeviceZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  memberId: z.string().uuid(),
  deviceLabel: z.string().nullable(),
  identityPublicKey: z.string(),
  signingPublicKey: z.string().nullable(),
  status: z.string(),
  createdAt: z.date(),
  lastSeenAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
})

export type BmMemberDevice = z.infer<typeof memberDeviceZodSchema>
