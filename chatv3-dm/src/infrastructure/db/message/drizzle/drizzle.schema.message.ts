import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3RoomTable } from '../../room/drizzle/drizzle.schema.room.js'

/**
 * Message: content is ALWAYS an opaque encrypted payload — there is no text
 * column by design (binding consensus). Plaintext operational metadata is
 * limited to: seq, sender, timestamps, kind, replyToSeq, mention target ids,
 * idempotencyKey. Mention labels/body live inside the ciphertext.
 */
export const chatv3MessageTable = pgTable(
  'chatv3-messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    roomId: uuid()
      .notNull()
      .references(() => chatv3RoomTable.id, { onDelete: 'cascade' }),
    seq: integer().notNull(),
    senderMemberId: uuid().notNull(),
    senderDeviceId: uuid(),
    kind: text().notNull().default('message'),
    protocolVersion: integer().notNull().default(1),
    cipherSuite: text().notNull(),
    epoch: integer().notNull(),
    ciphertext: text().notNull(),
    nonce: text().notNull(),
    aad: text(),
    authTag: text(),
    mentions: jsonb().$type<string[]>().notNull().default([]),
    replyToSeq: integer(),
    idempotencyKey: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chatv3_message_room_seq_unique').on(t.roomId, t.seq),
    uniqueIndex('chatv3_message_room_idempotency_unique').on(t.roomId, t.idempotencyKey),
    index('chatv3_message_idx_room_created').on(t.roomId, t.createdAt),
    index('chatv3_message_idx_tenant_room_kind').on(t.tenantId, t.roomId, t.kind),
  ]
)

export type IdbChatv3Message = InferSelectModel<typeof chatv3MessageTable>
