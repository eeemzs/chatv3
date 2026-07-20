import { z } from 'zod'

/** Entity schema — mirrors chatv3-bindings row shape (loose external refs only). */
export const bindingZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  channelId: z.string().uuid(),
  roomId: z.string().uuid().nullable(),
  bindingType: z.string(),
  refId: z.string().nullable(),
  uri: z.string().nullable(),
  title: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
})

export type BmBinding = z.infer<typeof bindingZodSchema>
