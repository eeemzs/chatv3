import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3MemberDeviceTable } from '../../memberDevice/drizzle/drizzle.schema.memberDevice.js'

/**
 * DeviceKeyPackage: opaque pre-published key material per device (MLS key
 * packages later; kind=v0 placeholder today). The server stores and hands
 * out blobs; it never interprets them.
 */
export const chatv3DeviceKeyPackageTable = pgTable(
  'chatv3-device-key-packages',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    deviceId: uuid()
      .notNull()
      .references(() => chatv3MemberDeviceTable.id, { onDelete: 'cascade' }),
    kind: text().notNull().default('v0'),
    packageBlob: text().notNull(),
    status: text().notNull().default('available'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('chatv3_device_key_package_idx_device_status').on(t.deviceId, t.status)]
)

export type IdbChatv3DeviceKeyPackage = InferSelectModel<typeof chatv3DeviceKeyPackageTable>
