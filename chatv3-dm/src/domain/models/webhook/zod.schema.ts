import { z } from 'zod'

/** Entity schema — mirrors chatv3-webhooks row shape. signingSecret never leaves the admin surface. */
export const webhookZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  channelId: z.string().uuid(),
  url: z.string(),
  signingSecret: z.string(),
  events: z.array(z.string()),
  label: z.string().nullable(),
  status: z.string(),
  failCount: z.number().int(),
  lastDeliveryAt: z.date().nullable(),
  lastFailureAt: z.date().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type BmWebhook = z.infer<typeof webhookZodSchema>
