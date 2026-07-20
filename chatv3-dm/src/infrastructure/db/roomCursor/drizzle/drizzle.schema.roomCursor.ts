import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3MemberTable } from '../../member/drizzle/drizzle.schema.member.js'
import { chatv3RoomTable } from '../../room/drizzle/drizzle.schema.room.js'

/**
 * RoomCursor: per member×room cursors. "Who read message N" derives from
 * lastReadSeq >= N — no per-message read flags. Three forward-only cursors:
 * deliveredSeq (transport-level), lastReadSeq (seen), ackSeq (explicit
 * directive acknowledgement — agent workflows treat read and ACK separately).
 */
export const chatv3RoomCursorTable = pgTable(
  'chatv3-room-cursors',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    roomId: uuid()
      .notNull()
      .references(() => chatv3RoomTable.id, { onDelete: 'cascade' }),
    memberId: uuid()
      .notNull()
      .references(() => chatv3MemberTable.id, { onDelete: 'cascade' }),
    lastReadSeq: integer().notNull().default(0),
    deliveredSeq: integer().notNull().default(0),
    ackSeq: integer().notNull().default(0),
    lastReadAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chatv3_room_cursor_room_member_unique').on(t.roomId, t.memberId),
    index('chatv3_room_cursor_idx_member').on(t.tenantId, t.memberId),
  ]
)

export type IdbChatv3RoomCursor = InferSelectModel<typeof chatv3RoomCursorTable>
