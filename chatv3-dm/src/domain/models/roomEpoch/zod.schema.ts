import { z } from 'zod'

/** Entity schema — mirrors chatv3-room-epochs row shape. wrappedKeyBlob is server-unopenable. */
export const roomEpochZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  roomId: z.string().uuid(),
  epoch: z.number().int(),
  cipherSuite: z.string(),
  wrappedKeyBlob: z.string(),
  kdfMeta: z.record(z.string(), z.unknown()),
  status: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  retiredAt: z.date().nullable(),
})

export type BmRoomEpoch = z.infer<typeof roomEpochZodSchema>
