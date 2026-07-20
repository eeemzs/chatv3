import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3SpaceTable } from '../../space/drizzle/drizzle.schema.space.js'

/**
 * Channel: long-lived line inside a space. Membership and access keys live at
 * channel level; rooms inherit membership from their channel.
 * generalRoomId intentionally has no FK (rooms reference channels; the cycle
 * is resolved at service level when the auto-created `general` room is born).
 */
export const chatv3ChannelTable = pgTable(
  'chatv3-channels',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    spaceId: uuid()
      .notNull()
      .references(() => chatv3SpaceTable.id, { onDelete: 'cascade' }),
    slug: text().notNull(),
    title: text().notNull(),
    purpose: text(),
    guidanceMarkdown: text(),
    encryptionMode: text().notNull().default('e2e'),
    status: text().notNull().default('active'),
    generalRoomId: uuid(),
    createdBy: text(),
    updatedBy: text(),
    // Optional authv2 ownership (F4). NULL for anonymous-created channels;
    // set to the creating principal.userId when authenticated.
    ownerUserId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('chatv3_channel_tenant_space_slug_unique').on(t.tenantId, t.spaceId, t.slug),
    index('chatv3_channel_idx_tenant_space_status').on(t.tenantId, t.spaceId, t.status),
    index('chatv3_channel_idx_tenant_owner').on(t.tenantId, t.ownerUserId),
  ]
)

export type IdbChatv3Channel = InferSelectModel<typeof chatv3ChannelTable>
