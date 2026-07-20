import { z } from 'zod'

/** Entity schema — mirrors chatv3-welcome-envelopes row shape (MLS welcome path; unused by v0 suite). */
export const welcomeEnvelopeZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  roomId: z.string().uuid(),
  epoch: z.number().int(),
  targetDeviceId: z.string().uuid(),
  envelopeBlob: z.string(),
  status: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  claimedAt: z.date().nullable(),
})

export type BmWelcomeEnvelope = z.infer<typeof welcomeEnvelopeZodSchema>
