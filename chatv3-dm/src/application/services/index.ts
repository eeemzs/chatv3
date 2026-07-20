import { Chatv3Db } from '../../infrastructure/db/client.js'
import { Chatv3BindingService } from './service.binding.js'
import { Chatv3ChannelService } from './service.channel.js'
import { Chatv3CursorService } from './service.cursor.js'
import { Chatv3DeviceService } from './service.device.js'
import { Chatv3MessageService } from './service.message.js'
import { Chatv3RoomService } from './service.room.js'
import { Chatv3PresenceService } from './service.presence.js'
import { Chatv3RecoveryService } from './service.recovery.js'
import { Chatv3SpaceService } from './service.space.js'
import { Chatv3WebhookService } from './service.webhook.js'

export * from './helpers.js'
export * from './service.binding.js'
export * from './service.channel.js'
export * from './service.cursor.js'
export * from './service.device.js'
export * from './service.message.js'
export * from './service.room.js'
export * from './service.presence.js'
export * from './service.recovery.js'
export * from './service.space.js'
export * from './service.webhook.js'

export type Chatv3Services = {
  space: Chatv3SpaceService
  channel: Chatv3ChannelService
  room: Chatv3RoomService
  message: Chatv3MessageService
  cursor: Chatv3CursorService
  device: Chatv3DeviceService
  binding: Chatv3BindingService
  presence: Chatv3PresenceService
  recovery: Chatv3RecoveryService
  webhook: Chatv3WebhookService
}

export function createChatv3Services(db: Chatv3Db): Chatv3Services {
  return {
    space: new Chatv3SpaceService(db),
    channel: new Chatv3ChannelService(db),
    room: new Chatv3RoomService(db),
    message: new Chatv3MessageService(db),
    cursor: new Chatv3CursorService(db),
    device: new Chatv3DeviceService(db),
    binding: new Chatv3BindingService(db),
    presence: new Chatv3PresenceService(db),
    recovery: new Chatv3RecoveryService(db),
    webhook: new Chatv3WebhookService(db),
  }
}
