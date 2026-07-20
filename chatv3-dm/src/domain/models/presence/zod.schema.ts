import { z } from 'zod'

/** Entity schema — mirrors chatv3-presence row shape. */
export const presenceZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  roomId: z.string().uuid(),
  memberId: z.string().uuid(),
  state: z.string(),
  note: z.string().nullable(),
  expiresAt: z.date(),
  updatedAt: z.date(),
})

export type BmPresence = z.infer<typeof presenceZodSchema>
