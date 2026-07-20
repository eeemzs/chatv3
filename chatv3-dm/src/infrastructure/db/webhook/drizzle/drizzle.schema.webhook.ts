import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3ChannelTable } from '../../channel/drizzle/drizzle.schema.channel.js'

/**
 * Webhook: generic agent-wake callback per channel (NOT AOPS-specific).
 * Payloads carry plaintext operational metadata only (same boundary as SSE
 * events — never ciphertext or keys) and are HMAC-SHA256 signed with the
 * channel-scoped signing secret. v1 delivery is best-effort fire-and-forget
 * with a fail counter; no retry queue (documented limit).
 */
export const chatv3WebhookTable = pgTable(
  'chatv3-webhooks',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    channelId: uuid()
      .notNull()
      .references(() => chatv3ChannelTable.id, { onDelete: 'cascade' }),
    url: text().notNull(),
    /** HMAC signing secret (server-side operational secret, not a content key) */
    signingSecret: text().notNull(),
    /** event type filter; empty = all (message/presence/system) */
    events: jsonb().$type<string[]>().notNull().default([]),
    label: text(),
    status: text().notNull().default('active'),
    failCount: integer().notNull().default(0),
    lastDeliveryAt: timestamp({ withTimezone: true }),
    lastFailureAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chatv3_webhook_idx_channel_status').on(t.tenantId, t.channelId, t.status)]
)

export type IdbChatv3Webhook = InferSelectModel<typeof chatv3WebhookTable>
