import { Chatv3Db, Chatv3Executor, Chatv3Tx } from '../../infrastructure/db/client.js'
import { SpaceDrizzleRepo } from '../../infrastructure/repositories/space/drizzle/SpaceDrizzleRepo.js'
import { ChannelDrizzleRepo } from '../../infrastructure/repositories/channel/drizzle/ChannelDrizzleRepo.js'
import { RoomDrizzleRepo } from '../../infrastructure/repositories/room/drizzle/RoomDrizzleRepo.js'
import { MemberDrizzleRepo } from '../../infrastructure/repositories/member/drizzle/MemberDrizzleRepo.js'
import { RoomCursorDrizzleRepo } from '../../infrastructure/repositories/roomCursor/drizzle/RoomCursorDrizzleRepo.js'
import { AccessKeyDrizzleRepo } from '../../infrastructure/repositories/accessKey/drizzle/AccessKeyDrizzleRepo.js'
import { RoomEpochDrizzleRepo } from '../../infrastructure/repositories/roomEpoch/drizzle/RoomEpochDrizzleRepo.js'
import { MemberDeviceDrizzleRepo } from '../../infrastructure/repositories/memberDevice/drizzle/MemberDeviceDrizzleRepo.js'
import { DeviceKeyPackageDrizzleRepo } from '../../infrastructure/repositories/deviceKeyPackage/drizzle/DeviceKeyPackageDrizzleRepo.js'
import { UserKeyBackupDrizzleRepo } from '../../infrastructure/repositories/userKeyBackup/drizzle/UserKeyBackupDrizzleRepo.js'
import { MemberKeyPackageDrizzleRepo } from '../../infrastructure/repositories/memberKeyPackage/drizzle/MemberKeyPackageDrizzleRepo.js'
import { WelcomeEnvelopeDrizzleRepo } from '../../infrastructure/repositories/welcomeEnvelope/drizzle/WelcomeEnvelopeDrizzleRepo.js'
import { MessageDrizzleRepo } from '../../infrastructure/repositories/message/drizzle/MessageDrizzleRepo.js'
import { BindingDrizzleRepo } from '../../infrastructure/repositories/binding/drizzle/BindingDrizzleRepo.js'
import { PresenceDrizzleRepo } from '../../infrastructure/repositories/presence/drizzle/PresenceDrizzleRepo.js'
import { WebhookDrizzleRepo } from '../../infrastructure/repositories/webhook/drizzle/WebhookDrizzleRepo.js'
import { Chatv3Repos } from '../ports/repository-ports.js'

/**
 * Driver-based repository creation policy (structural hexagen factory). The
 * same factory binds repos to the live db OR to a transaction handle — the
 * latter is the lean unit-of-work used by composite flows.
 */
export function createChatv3Repos(executor: Chatv3Executor): Chatv3Repos {
  return {
    space: new SpaceDrizzleRepo(executor),
    channel: new ChannelDrizzleRepo(executor),
    room: new RoomDrizzleRepo(executor),
    member: new MemberDrizzleRepo(executor),
    roomCursor: new RoomCursorDrizzleRepo(executor),
    accessKey: new AccessKeyDrizzleRepo(executor),
    roomEpoch: new RoomEpochDrizzleRepo(executor),
    memberDevice: new MemberDeviceDrizzleRepo(executor),
    deviceKeyPackage: new DeviceKeyPackageDrizzleRepo(executor),
    userKeyBackup: new UserKeyBackupDrizzleRepo(executor),
    memberKeyPackage: new MemberKeyPackageDrizzleRepo(executor),
    welcomeEnvelope: new WelcomeEnvelopeDrizzleRepo(executor),
    message: new MessageDrizzleRepo(executor),
    binding: new BindingDrizzleRepo(executor),
    presence: new PresenceDrizzleRepo(executor),
    webhook: new WebhookDrizzleRepo(executor),
  }
}

/** Transaction boundary: every repo handed to fn is bound to the same tx. */
export async function withChatv3Tx<T>(
  db: Chatv3Db,
  fn: (repos: Chatv3Repos, tx: Chatv3Tx) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => fn(createChatv3Repos(tx), tx))
}
