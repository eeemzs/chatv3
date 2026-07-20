import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3MemberTable } from '../../member/drizzle/drizzle.schema.member.js'

/**
 * MemberDevice: per client/agent device identity. Private keys never leave
 * the client keystore; the server stores public material only. Required by
 * the MLS-ready contract even while the v0 suite does not yet use device
 * keys for encryption.
 */
export const chatv3MemberDeviceTable = pgTable(
  'chatv3-member-devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    memberId: uuid()
      .notNull()
      .references(() => chatv3MemberTable.id, { onDelete: 'cascade' }),
    deviceLabel: text(),
    identityPublicKey: text().notNull(),
    signingPublicKey: text(),
    status: text().notNull().default('active'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('chatv3_member_device_idx_member_status').on(t.tenantId, t.memberId, t.status)]
)

export type IdbChatv3MemberDevice = InferSelectModel<typeof chatv3MemberDeviceTable>
