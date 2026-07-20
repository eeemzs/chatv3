import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const chatv3UserKeyBackupTable = pgTable(
  'chatv3-user-key-backups',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    userId: text().notNull(),
    keyVersion: integer().notNull().default(1),
    publicKeyAlgorithm: text().notNull(),
    publicKeyFormat: text().notNull(),
    publicKey: text().notNull(),
    backupPackageVersion: integer().notNull().default(1),
    kekSource: text().notNull(),
    kdfName: text().notNull(),
    kdfVersion: integer().notNull().default(1),
    kdfSalt: text().notNull(),
    kdfMemoryKiB: integer(),
    kdfIterations: integer().notNull(),
    kdfParallelism: integer().notNull().default(1),
    wrapAlg: text().notNull().default('aes-256-gcm'),
    nonce: text().notNull(),
    ciphertext: text().notNull(),
    aad: text(),
    authTag: text(),
    threatModelLabel: text().notNull(),
    status: text().notNull().default('active'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chatv3_user_key_backup_tenant_user_unique').on(t.tenantId, t.userId),
    uniqueIndex('chatv3_user_key_backup_tenant_user_version_unique').on(t.tenantId, t.userId, t.keyVersion),
    index('chatv3_user_key_backup_idx_tenant_status').on(t.tenantId, t.status),
  ]
)

export type IdbChatv3UserKeyBackup = InferSelectModel<typeof chatv3UserKeyBackupTable>
