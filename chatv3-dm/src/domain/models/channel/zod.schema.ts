import { z } from 'zod'
import { zChannelEncryptionMode } from '../crypto.js'

/** Entity schema — mirrors chatv3-channels row shape. */
export const channelZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  spaceId: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  purpose: z.string().nullable(),
  guidanceMarkdown: z.string().nullable(),
  encryptionMode: zChannelEncryptionMode,
  status: z.string(),
  generalRoomId: z.string().uuid().nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  ownerUserId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  archivedAt: z.date().nullable(),
})

export type BmChannel = z.infer<typeof channelZodSchema>
