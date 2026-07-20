import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../infrastructure/db/drizzle.schema.index.js'
import { spaceZodSchema } from '../domain/models/space/zod.schema.js'
import { channelZodSchema } from '../domain/models/channel/zod.schema.js'
import { roomZodSchema } from '../domain/models/room/zod.schema.js'
import { memberZodSchema } from '../domain/models/member/zod.schema.js'
import { roomCursorZodSchema } from '../domain/models/roomCursor/zod.schema.js'
import { accessKeyZodSchema } from '../domain/models/accessKey/zod.schema.js'
import { roomEpochZodSchema } from '../domain/models/roomEpoch/zod.schema.js'
import { memberDeviceZodSchema } from '../domain/models/memberDevice/zod.schema.js'
import { deviceKeyPackageZodSchema } from '../domain/models/deviceKeyPackage/zod.schema.js'
import { welcomeEnvelopeZodSchema } from '../domain/models/welcomeEnvelope/zod.schema.js'
import { messageZodSchema } from '../domain/models/message/zod.schema.js'
import { bindingZodSchema } from '../domain/models/binding/zod.schema.js'
import { presenceZodSchema } from '../domain/models/presence/zod.schema.js'
import { webhookZodSchema } from '../domain/models/webhook/zod.schema.js'

/**
 * Drift gate (hexagen quality-gate spirit): every domain model schema must
 * cover exactly the columns of its table — a column added in the db layer
 * without a model update (or vice versa) fails here.
 */
const CASES: Array<[string, z.ZodObject, Parameters<typeof getTableColumns>[0]]> = [
  ['space', spaceZodSchema, schema.chatv3SpaceTable],
  ['channel', channelZodSchema, schema.chatv3ChannelTable],
  ['room', roomZodSchema, schema.chatv3RoomTable],
  ['member', memberZodSchema, schema.chatv3MemberTable],
  ['roomCursor', roomCursorZodSchema, schema.chatv3RoomCursorTable],
  ['accessKey', accessKeyZodSchema, schema.chatv3AccessKeyTable],
  ['roomEpoch', roomEpochZodSchema, schema.chatv3RoomEpochTable],
  ['memberDevice', memberDeviceZodSchema, schema.chatv3MemberDeviceTable],
  ['deviceKeyPackage', deviceKeyPackageZodSchema, schema.chatv3DeviceKeyPackageTable],
  ['welcomeEnvelope', welcomeEnvelopeZodSchema, schema.chatv3WelcomeEnvelopeTable],
  ['message', messageZodSchema, schema.chatv3MessageTable],
  ['binding', bindingZodSchema, schema.chatv3BindingTable],
  ['presence', presenceZodSchema, schema.chatv3PresenceTable],
  ['webhook', webhookZodSchema, schema.chatv3WebhookTable],
]

describe('model <-> db column parity', () => {
  for (const [name, model, table] of CASES) {
    it(`${name}: zod keys exactly match table columns`, () => {
      const modelKeys = Object.keys(model.shape).sort()
      const columnKeys = Object.keys(getTableColumns(table)).sort()
      expect(modelKeys).toEqual(columnKeys)
    })
  }
})
