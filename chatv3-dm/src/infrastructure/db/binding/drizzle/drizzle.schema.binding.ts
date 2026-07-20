import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3ChannelTable } from '../../channel/drizzle/drizzle.schema.channel.js'
import { chatv3RoomTable } from '../../room/drizzle/drizzle.schema.room.js'

/**
 * Binding: loose external reference (id/slug/URI) attached to a channel or a
 * specific room. This is the ONLY integration surface toward AOPS or any
 * other system — plain strings, no foreign keys, no domain imports.
 */
export const chatv3BindingTable = pgTable(
  'chatv3-bindings',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    channelId: uuid()
      .notNull()
      .references(() => chatv3ChannelTable.id, { onDelete: 'cascade' }),
    roomId: uuid().references(() => chatv3RoomTable.id, { onDelete: 'cascade' }),
    bindingType: text().notNull(),
    refId: text(),
    uri: text(),
    title: text(),
    note: text(),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chatv3_binding_idx_channel_type').on(t.tenantId, t.channelId, t.bindingType),
    index('chatv3_binding_idx_room').on(t.roomId),
  ]
)

export type IdbChatv3Binding = InferSelectModel<typeof chatv3BindingTable>
