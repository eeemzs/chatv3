import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3ChannelTable } from '../../channel/drizzle/drizzle.schema.channel.js'

/**
 * Member: channel-level membership (rooms inherit). The personal member token
 * is never stored — only its hash. Operators are ordinary members with
 * roleKey=operator; actorKind distinguishes humans from agents for UX only,
 * never for authorization.
 */
export const chatv3MemberTable = pgTable(
  'chatv3-members',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    channelId: uuid()
      .notNull()
      .references(() => chatv3ChannelTable.id, { onDelete: 'cascade' }),
    handle: text().notNull(),
    displayName: text(),
    actorKind: text().notNull().default('agent'),
    roleKey: text().notNull().default('member'),
    status: text().notNull().default('active'),
    tokenHash: text().notNull(),
    joinedViaKeyId: uuid(),
    // Optional authv2 identity binding (F4). NULL for anonymous split-secret
    // members (the standalone product); set to principal.userId when an
    // authenticated AOPS principal is present on join/create.
    userId: text(),
    lastSeenAt: timestamp({ withTimezone: true }),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chatv3_member_tenant_channel_handle_unique').on(t.tenantId, t.channelId, t.handle),
    index('chatv3_member_idx_tenant_channel_status').on(t.tenantId, t.channelId, t.status),
    index('chatv3_member_idx_tenant_user').on(t.tenantId, t.userId),
  ]
)

export type IdbChatv3Member = InferSelectModel<typeof chatv3MemberTable>
