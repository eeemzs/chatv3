import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3ChannelTable } from '../../channel/drizzle/drizzle.schema.channel.js'

/**
 * Room: session/task scoped work area. Messages are only ever written to a
 * room; every channel gets an auto-created `general` room (kind=general).
 * currentEpoch tracks the active crypto epoch (0 = no epoch established yet).
 */
export const chatv3RoomTable = pgTable(
  'chatv3-rooms',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    channelId: uuid()
      .notNull()
      .references(() => chatv3ChannelTable.id, { onDelete: 'cascade' }),
    slug: text().notNull(),
    title: text().notNull(),
    kind: text().notNull().default('session'),
    purpose: text(),
    guidanceMarkdown: text(),
    status: text().notNull().default('active'),
    lastSeq: integer().notNull().default(0),
    lastMessageAt: timestamp({ withTimezone: true }),
    currentEpoch: integer().notNull().default(0),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('chatv3_room_tenant_channel_slug_unique').on(t.tenantId, t.channelId, t.slug),
    index('chatv3_room_idx_tenant_channel_status').on(t.tenantId, t.channelId, t.status),
    index('chatv3_room_idx_tenant_last_message').on(t.tenantId, t.lastMessageAt),
  ]
)

export type IdbChatv3Room = InferSelectModel<typeof chatv3RoomTable>
