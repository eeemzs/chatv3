import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3ChannelTable } from '../../channel/drizzle/drizzle.schema.channel.js'
import { chatv3MemberTable } from '../../member/drizzle/drizzle.schema.member.js'
import { chatv3UserKeyBackupTable } from '../../userKeyBackup/drizzle/drizzle.schema.userKeyBackup.js'

export const chatv3MemberKeyPackageTable = pgTable(
  'chatv3-member-key-packages',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    channelId: uuid()
      .notNull()
      .references(() => chatv3ChannelTable.id, { onDelete: 'cascade' }),
    memberId: uuid()
      .notNull()
      .references(() => chatv3MemberTable.id, { onDelete: 'cascade' }),
    recipientUserId: text().notNull(),
    recipientUserKeyId: uuid()
      .notNull()
      .references(() => chatv3UserKeyBackupTable.id, { onDelete: 'restrict' }),
    recipientKeyVersion: integer().notNull(),
    packageVersion: integer().notNull().default(1),
    packageAlg: text().notNull(),
    ephemeralPublicKeyAlgorithm: text().notNull(),
    ephemeralPublicKeyFormat: text().notNull(),
    ephemeralPublicKey: text().notNull(),
    nonce: text().notNull(),
    ciphertext: text().notNull(),
    aad: text(),
    authTag: text(),
    sourceEpoch: integer().notNull().default(1),
    status: text().notNull().default('usable'),
    staleReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chatv3_member_key_package_tenant_channel_member_unique').on(t.tenantId, t.channelId, t.memberId),
    index('chatv3_member_key_package_idx_recipient').on(t.tenantId, t.recipientUserId, t.status),
    index('chatv3_member_key_package_idx_channel_status').on(t.tenantId, t.channelId, t.status),
  ]
)

export type IdbChatv3MemberKeyPackage = InferSelectModel<typeof chatv3MemberKeyPackageTable>
