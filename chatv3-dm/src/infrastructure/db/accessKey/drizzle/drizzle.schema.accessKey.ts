import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3ChannelTable } from '../../channel/drizzle/drizzle.schema.channel.js'

/**
 * AccessKey: server-side verifier for the accessSecret half of an invite.
 * The invite fragment is `<keyId>.<accessSecret>.<wrapSecret>`; the server
 * stores only hash(accessSecret) and NEVER sees wrapSecret in any payload.
 * An access key authorizes join only — it can never decrypt content.
 */
export const chatv3AccessKeyTable = pgTable(
  'chatv3-access-keys',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    channelId: uuid()
      .notNull()
      .references(() => chatv3ChannelTable.id, { onDelete: 'cascade' }),
    keyId: text().notNull(),
    verifierHash: text().notNull(),
    label: text(),
    roleKey: text().notNull().default('member'),
    status: text().notNull().default('active'),
    epoch: integer().notNull().default(1),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('chatv3_access_key_tenant_key_id_unique').on(t.tenantId, t.keyId),
    index('chatv3_access_key_idx_channel_status').on(t.tenantId, t.channelId, t.status),
  ]
)

export type IdbChatv3AccessKey = InferSelectModel<typeof chatv3AccessKeyTable>
