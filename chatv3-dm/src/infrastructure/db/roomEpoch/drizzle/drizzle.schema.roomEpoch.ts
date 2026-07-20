import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3RoomTable } from '../../room/drizzle/drizzle.schema.room.js'

/**
 * RoomEpoch: one crypto epoch of a room. wrappedKeyBlob is the room epoch key
 * wrapped client-side with KEK = HKDF(wrapSecret, ...). The server cannot
 * unwrap it: it never receives wrapSecret. kdfMeta carries client-published
 * KDF parameters (salt construction, info string, algorithm) so any client
 * holding wrapSecret can re-derive the KEK.
 */
export const chatv3RoomEpochTable = pgTable(
  'chatv3-room-epochs',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    roomId: uuid()
      .notNull()
      .references(() => chatv3RoomTable.id, { onDelete: 'cascade' }),
    epoch: integer().notNull(),
    cipherSuite: text().notNull(),
    wrappedKeyBlob: text().notNull(),
    kdfMeta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: text().notNull().default('active'),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('chatv3_room_epoch_room_epoch_unique').on(t.roomId, t.epoch),
    index('chatv3_room_epoch_idx_room_status').on(t.tenantId, t.roomId, t.status),
  ]
)

export type IdbChatv3RoomEpoch = InferSelectModel<typeof chatv3RoomEpochTable>
