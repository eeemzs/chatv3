import { z } from 'zod'

/** Entity schema — mirrors chatv3-device-key-packages row shape (opaque blobs). */
export const deviceKeyPackageZodSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  deviceId: z.string().uuid(),
  kind: z.string(),
  packageBlob: z.string(),
  status: z.string(),
  createdAt: z.date(),
  consumedAt: z.date().nullable(),
})

export type BmDeviceKeyPackage = z.infer<typeof deviceKeyPackageZodSchema>
