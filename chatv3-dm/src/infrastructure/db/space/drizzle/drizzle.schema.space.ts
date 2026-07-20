import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

/**
 * Space: standalone owner boundary (the ChatV3-internal counterpart of a
 * "project"). AOPS or any external system binds only through externalRefs —
 * never through foreign keys.
 */
export const chatv3SpaceTable = pgTable(
  'chatv3-spaces',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    slug: text().notNull(),
    title: text().notNull(),
    description: text(),
    externalRefs: jsonb().$type<Array<Record<string, unknown>>>().notNull().default([]),
    status: text().notNull().default('active'),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chatv3_space_tenant_slug_unique').on(t.tenantId, t.slug),
    index('chatv3_space_idx_tenant_status').on(t.tenantId, t.status),
  ]
)

export type IdbChatv3Space = InferSelectModel<typeof chatv3SpaceTable>
