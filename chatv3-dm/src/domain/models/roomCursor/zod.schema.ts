import { z } from 'zod'

/** Entity schema — mirrors chatv3-room-cursors row shape. */
export const roomCursorZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  roomId: z.string().uuid(),
  memberId: z.string().uuid(),
  lastReadSeq: z.number().int(),
  deliveredSeq: z.number().int(),
  ackSeq: z.number().int(),
  lastReadAt: z.date().nullable(),
  updatedAt: z.date(),
})

export type BmRoomCursor = z.infer<typeof roomCursorZodSchema>
