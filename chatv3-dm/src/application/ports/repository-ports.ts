import {
  IdbChatv3AccessKey,
  IdbChatv3Binding,
  IdbChatv3Channel,
  IdbChatv3DeviceKeyPackage,
  IdbChatv3MemberKeyPackage,
  IdbChatv3Member,
  IdbChatv3MemberDevice,
  IdbChatv3Message,
  IdbChatv3Presence,
  IdbChatv3Room,
  IdbChatv3RoomCursor,
  IdbChatv3RoomEpoch,
  IdbChatv3Space,
  IdbChatv3UserKeyBackup,
  IdbChatv3Webhook,
  IdbChatv3WelcomeEnvelope,
} from '../../infrastructure/db/drizzle.schema.index.js'

/**
 * Repository ports (structural hexagen layer). In this intentionally lean
 * stack the db row IS the domain row — the model/db parity test guards the
 * shapes — so ports speak Idb* types directly instead of going through a
 * mapper pair. Services depend on these interfaces, never on drizzle.
 */

export type Chatv3SpaceRepoPort = {
  insert(values: Partial<IdbChatv3Space>): Promise<IdbChatv3Space>
  byId(id: string): Promise<IdbChatv3Space | null>
  byTenantSlug(tenantId: string, slug: string): Promise<IdbChatv3Space | null>
  list(filter: { tenantId: string; status?: string; limit: number }): Promise<IdbChatv3Space[]>
  archive(id: string, updatedBy?: string): Promise<IdbChatv3Space | null>
  deleteById(id: string): Promise<void>
}

export type Chatv3ChannelRepoPort = {
  insert(values: Partial<IdbChatv3Channel>): Promise<IdbChatv3Channel>
  byId(id: string): Promise<IdbChatv3Channel | null>
  list(filter: { tenantId: string; spaceId?: string; status?: string; limit: number }): Promise<IdbChatv3Channel[]>
  listByOwner(filter: { tenantId: string; ownerUserId: string; spaceId?: string; status?: string; limit: number }): Promise<IdbChatv3Channel[]>
  listBeforeCreated(filter: { tenantId: string; before: Date }): Promise<IdbChatv3Channel[]>
  setGeneralRoom(id: string, generalRoomId: string): Promise<void>
  archive(id: string, updatedBy?: string): Promise<IdbChatv3Channel | null>
  unarchive(id: string, updatedBy?: string): Promise<IdbChatv3Channel | null>
  deleteById(id: string): Promise<void>
}

export type Chatv3RoomRepoPort = {
  insert(values: Partial<IdbChatv3Room>): Promise<IdbChatv3Room>
  byId(id: string): Promise<IdbChatv3Room | null>
  listByChannel(filter: { channelId: string; status?: string; limit?: number }): Promise<IdbChatv3Room[]>
  archive(id: string, updatedBy?: string): Promise<IdbChatv3Room | null>
  deleteById(id: string): Promise<void>
  /** SELECT ... FOR UPDATE on the room row; only valid inside a transaction. */
  lockLastSeq(id: string): Promise<number>
  bumpSeq(id: string, seq: number, at: Date): Promise<void>
  setCurrentEpoch(id: string, epoch: number, at: Date): Promise<void>
}

export type Chatv3MemberRepoPort = {
  insert(values: Partial<IdbChatv3Member> & { id: string }): Promise<IdbChatv3Member>
  byId(id: string): Promise<IdbChatv3Member | null>
  byChannelHandle(channelId: string, handle: string): Promise<IdbChatv3Member | null>
  listByChannel(filter: { channelId: string; status?: string; limit: number }): Promise<IdbChatv3Member[]>
  listByUser(filter: { tenantId: string; userId: string; status?: string; limit: number }): Promise<IdbChatv3Member[]>
  update(id: string, patch: Partial<IdbChatv3Member>): Promise<IdbChatv3Member | null>
}

export type Chatv3ReceiptRow = {
  memberId: string
  handle: string
  roleKey: string
  actorKind: string
  lastReadSeq: number | null
  deliveredSeq: number | null
  ackSeq: number | null
  lastReadAt: Date | null
}

export type Chatv3CursorField = 'lastReadSeq' | 'deliveredSeq' | 'ackSeq'

export type Chatv3RoomCursorRepoPort = {
  /** forward-only upsert: <field> = GREATEST(current, given) */
  advance(values: {
    tenantId: string
    roomId: string
    memberId: string
    field: Chatv3CursorField
    seq: number
    at: Date
  }): Promise<IdbChatv3RoomCursor>
  receiptsForRoom(roomId: string, channelId: string): Promise<Chatv3ReceiptRow[]>
}

export type Chatv3PresenceRepoPort = {
  /** heartbeat upsert per (roomId, memberId) */
  upsert(values: {
    tenantId: string
    roomId: string
    memberId: string
    state: string
    note?: string | null
    expiresAt: Date
  }): Promise<IdbChatv3Presence>
  listForRoom(roomId: string): Promise<IdbChatv3Presence[]>
}

export type Chatv3WebhookRepoPort = {
  insert(values: Partial<IdbChatv3Webhook>): Promise<IdbChatv3Webhook>
  byId(id: string): Promise<IdbChatv3Webhook | null>
  listByChannel(channelId: string): Promise<IdbChatv3Webhook[]>
  listActiveForChannel(channelId: string): Promise<IdbChatv3Webhook[]>
  deleteById(id: string): Promise<void>
  recordDelivery(id: string, ok: boolean, at: Date): Promise<void>
}

export type Chatv3AccessKeyRepoPort = {
  insert(values: Partial<IdbChatv3AccessKey>): Promise<IdbChatv3AccessKey>
  byTenantKeyId(tenantId: string, keyId: string): Promise<IdbChatv3AccessKey | null>
  touchLastUsed(id: string, at: Date): Promise<void>
  /** rotation: every active key of the channel is revoked in one statement */
  revokeActiveForChannel(channelId: string, at: Date): Promise<number>
}

export type Chatv3RoomEpochRepoPort = {
  insert(values: Partial<IdbChatv3RoomEpoch>): Promise<IdbChatv3RoomEpoch>
  listByRoom(roomId: string): Promise<IdbChatv3RoomEpoch[]>
  listByRoomIds(roomIds: string[]): Promise<IdbChatv3RoomEpoch[]>
}

export type Chatv3MemberDeviceRepoPort = {
  insert(values: Partial<IdbChatv3MemberDevice>): Promise<IdbChatv3MemberDevice>
  byId(id: string): Promise<IdbChatv3MemberDevice | null>
}

export type Chatv3DeviceKeyPackageRepoPort = {
  insert(values: Partial<IdbChatv3DeviceKeyPackage>): Promise<IdbChatv3DeviceKeyPackage>
}

export type Chatv3UserKeyBackupRepoPort = {
  insert(values: Partial<IdbChatv3UserKeyBackup>): Promise<IdbChatv3UserKeyBackup>
  byId(id: string): Promise<IdbChatv3UserKeyBackup | null>
  byUser(filter: { tenantId: string; userId: string }): Promise<IdbChatv3UserKeyBackup | null>
  update(id: string, patch: Partial<IdbChatv3UserKeyBackup>): Promise<IdbChatv3UserKeyBackup | null>
}

export type Chatv3MemberKeyPackageRepoPort = {
  upsert(values: Partial<IdbChatv3MemberKeyPackage>): Promise<IdbChatv3MemberKeyPackage>
  byMember(filter: { tenantId: string; channelId: string; memberId: string }): Promise<IdbChatv3MemberKeyPackage | null>
  markChannelStale(filter: { tenantId: string; channelId: string; reason: string; at: Date }): Promise<number>
  markRecipientUserStale(filter: { tenantId: string; recipientUserId: string; reason: string; at: Date }): Promise<number>
}

export type Chatv3WelcomeEnvelopeRepoPort = {
  insert(values: Partial<IdbChatv3WelcomeEnvelope>): Promise<IdbChatv3WelcomeEnvelope>
  listPendingForDevice(targetDeviceId: string): Promise<IdbChatv3WelcomeEnvelope[]>
}

export type Chatv3MessageRepoPort = {
  insert(values: Partial<IdbChatv3Message>): Promise<IdbChatv3Message>
  byRoomIdempotency(roomId: string, idempotencyKey: string): Promise<IdbChatv3Message | null>
  listAfterSeq(filter: { roomId: string; afterSeq: number; limit: number }): Promise<IdbChatv3Message[]>
}

export type Chatv3BindingRepoPort = {
  insert(values: Partial<IdbChatv3Binding>): Promise<IdbChatv3Binding>
  byId(id: string): Promise<IdbChatv3Binding | null>
  listByChannel(filter: { channelId: string; roomId?: string }): Promise<IdbChatv3Binding[]>
  deleteById(id: string): Promise<void>
}

export type Chatv3Repos = {
  space: Chatv3SpaceRepoPort
  channel: Chatv3ChannelRepoPort
  room: Chatv3RoomRepoPort
  member: Chatv3MemberRepoPort
  roomCursor: Chatv3RoomCursorRepoPort
  accessKey: Chatv3AccessKeyRepoPort
  roomEpoch: Chatv3RoomEpochRepoPort
  memberDevice: Chatv3MemberDeviceRepoPort
  deviceKeyPackage: Chatv3DeviceKeyPackageRepoPort
  userKeyBackup: Chatv3UserKeyBackupRepoPort
  memberKeyPackage: Chatv3MemberKeyPackageRepoPort
  welcomeEnvelope: Chatv3WelcomeEnvelopeRepoPort
  message: Chatv3MessageRepoPort
  binding: Chatv3BindingRepoPort
  presence: Chatv3PresenceRepoPort
  webhook: Chatv3WebhookRepoPort
}
