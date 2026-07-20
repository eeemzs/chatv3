import { z } from 'zod'

/** Entity schema — mirrors chatv3-rooms row shape. */
export const roomZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  channelId: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  kind: z.string(),
  purpose: z.string().nullable(),
  guidanceMarkdown: z.string().nullable(),
  status: z.string(),
  lastSeq: z.number().int(),
  lastMessageAt: z.date().nullable(),
  currentEpoch: z.number().int(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  archivedAt: z.date().nullable(),
})

export type BmRoom = z.infer<typeof roomZodSchema>
