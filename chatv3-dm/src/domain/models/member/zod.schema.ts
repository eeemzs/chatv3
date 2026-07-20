import { z } from 'zod'

/** Entity schema — mirrors chatv3-members row shape. tokenHash never leaves the service boundary. */
export const memberZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  channelId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string().nullable(),
  actorKind: z.string(),
  roleKey: z.string(),
  status: z.string(),
  tokenHash: z.string(),
  joinedViaKeyId: z.string().uuid().nullable(),
  userId: z.string().nullable(),
  lastSeenAt: z.date().nullable(),
  joinedAt: z.date(),
  removedAt: z.date().nullable(),
  updatedAt: z.date(),
})

export type BmMember = z.infer<typeof memberZodSchema>
