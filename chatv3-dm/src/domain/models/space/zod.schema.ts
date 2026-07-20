import { z } from 'zod'
import { zExternalRef } from '../common.js'

/** Entity schema — mirrors chatv3-spaces row shape (structural hexagen layer). */
export const spaceZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  externalRefs: z.array(zExternalRef.passthrough()),
  status: z.string(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type BmSpace = z.infer<typeof spaceZodSchema>
