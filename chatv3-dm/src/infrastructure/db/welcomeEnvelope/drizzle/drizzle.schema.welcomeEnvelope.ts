import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatv3MemberDeviceTable } from '../../memberDevice/drizzle/drizzle.schema.memberDevice.js'
import { chatv3RoomTable } from '../../room/drizzle/drizzle.schema.room.js'

/**
 * WelcomeEnvelope: per-device encrypted key delivery for an epoch (the MLS
 * welcome path). Unused by the v0 suite (which delivers via wrappedKeyBlob +
 * wrapSecret), but part of the F1 contract so the MLS suite lands without a
 * schema break.
 */
export const chatv3WelcomeEnvelopeTable = pgTable(
  'chatv3-welcome-envelopes',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull().default('default'),
    roomId: uuid()
      .notNull()
      .references(() => chatv3RoomTable.id, { onDelete: 'cascade' }),
    epoch: integer().notNull(),
    targetDeviceId: uuid()
      .notNull()
      .references(() => chatv3MemberDeviceTable.id, { onDelete: 'cascade' }),
    envelopeBlob: text().notNull(),
    status: text().notNull().default('pending'),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('chatv3_welcome_envelope_idx_target_status').on(t.targetDeviceId, t.status),
    index('chatv3_welcome_envelope_idx_room_epoch').on(t.roomId, t.epoch),
  ]
)

export type IdbChatv3WelcomeEnvelope = InferSelectModel<typeof chatv3WelcomeEnvelopeTable>
