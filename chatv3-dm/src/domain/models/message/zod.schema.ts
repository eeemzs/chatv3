import { z } from 'zod'

/**
 * Entity schema — mirrors chatv3-messages row shape. Content is ALWAYS the
 * opaque crypto payload; there is no text field by binding consensus.
 */
export const messageZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  roomId: z.string().uuid(),
  seq: z.number().int(),
  senderMemberId: z.string().uuid(),
  senderDeviceId: z.string().uuid().nullable(),
  kind: z.string(),
  protocolVersion: z.number().int(),
  cipherSuite: z.string(),
  epoch: z.number().int(),
  ciphertext: z.string(),
  nonce: z.string(),
  aad: z.string().nullable(),
  authTag: z.string().nullable(),
  mentions: z.array(z.string()),
  replyToSeq: z.number().int().nullable(),
  idempotencyKey: z.string().nullable(),
  createdAt: z.date(),
})

export type BmMessage = z.infer<typeof messageZodSchema>
