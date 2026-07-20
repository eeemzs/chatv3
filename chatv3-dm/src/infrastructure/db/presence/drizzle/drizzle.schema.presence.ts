import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3MemberTable } from '../../member/drizzle/drizzle.schema.member.js'
import { chatv3RoomTable } from '../../room/drizzle/drizzle.schema.room.js'

/**
 * Presence: per member×room working state (agent-first: active/idle/working/
 * reviewing/blocked/offline). Heartbeat-style upsert with expiresAt — stale
 * rows read as offline; nothing is deleted on disconnect. The optional note
 * is short plaintext by design (it is operational metadata, not content).
 */
export const chatv3PresenceTable = pgTable(
  'chatv3-presence',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    roomId: uuid()
      .notNull()
      .references(() => chatv3RoomTable.id, { onDelete: 'cascade' }),
    memberId: uuid()
      .notNull()
      .references(() => chatv3MemberTable.id, { onDelete: 'cascade' }),
    state: text().notNull().default('active'),
    note: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chatv3_presence_room_member_unique').on(t.roomId, t.memberId),
    index('chatv3_presence_idx_room_expires').on(t.roomId, t.expiresAt),
  ]
)

export type IdbChatv3Presence = InferSelectModel<typeof chatv3PresenceTable>
