import { z } from 'zod'
import {
  Chatv3AdminActor,
  Chatv3Services,
  Chatv3ScopedAdminAuthority,
  IdbChatv3Member,
  isScopedAdminAuthority,
  zAckInput,
  zBindingAddInput,
  zBindingListInput,
  zBindingRemoveInput,
  zChannelArchiveInput,
  zChannelCreateInput,
  zChannelDeleteInput,
  zChannelEpochKeysInput,
  zChannelGetInput,
  zChannelJoinInput,
  zChannelListInput,
  zChannelListMineInput,
  zChannelPurgeBeforeInput,
  zChannelRotateInput,
  zChannelUnarchiveInput,
  zDeviceRegisterInput,
  zKeyPackagePublishInput,
  zMarkDeliveredInput,
  zMarkReadInput,
  zMemberKeyPackageGetInput,
  zMemberKeyPackagePutInput,
  zMemberListInput,
  zMemberRecoveryGetInput,
  zMemberTokenRemintInput,
  zMemberUpdateInput,
  zMessageListInput,
  zMessageSendInput,
  zPresenceListInput,
  zPresenceSetInput,
  zReceiptsInput,
  zRoomArchiveInput,
  zRoomCreateInput,
  zRoomDeleteInput,
  zRoomEpochListInput,
  zRoomListInput,
  zSpaceArchiveInput,
  zSpaceCreateInput,
  zSpaceGetInput,
  zSpaceListInput,
  zUserKeyGetInput,
  zUserKeyRegisterInput,
  zWebhookCreateInput,
  zWebhookListInput,
  zWebhookRemoveInput,
} from '@aopslab/domain-dm-chatv3'

export type Chatv3HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * open  : no chatv3 credential (join/create surfaces; deployment may add its
 *         own outer gate — see f1b-abuse for rate limiting)
 * principal: verified host principal only; no ChatV3 member token is required
 *         because the service gates by principal.userId.
 * member: personal member token (Authorization: Bearer cv3m_...)
 * admin : member token + owner|operator roleKey, or verified host principal with
 *         a ChatV3 scoped admin permission for metadata/lifecycle operations.
 */
export type Chatv3AuthLevel = 'open' | 'principal' | 'member' | 'admin'
export type Chatv3OperationActor = IdbChatv3Member | Chatv3ScopedAdminAuthority | null

export type Chatv3OperationSpec = {
  operationId: string
  title: string
  summary: string
  method: Chatv3HttpMethod
  /** dispatcher-relative pattern, e.g. /v1/channels/:channelId/join */
  pattern: string
  auth: Chatv3AuthLevel
  sideEffect: 'read' | 'write' | 'destructive'
  input: z.ZodType
  /** maps route params / query strings into input fields before zod parse */
  numericKeys?: string[]
  /** admin op may fall back to principal-only authority; the service still decides scope. */
  principalFallback?: boolean
  handler: (
    services: Chatv3Services,
    input: never,
    actor: Chatv3OperationActor,
    principalUserId?: string | null
  ) => Promise<unknown>
}

const op = <S extends z.ZodType>(spec: {
  operationId: string
  title: string
  summary: string
  method: Chatv3HttpMethod
  pattern: string
  auth: Chatv3AuthLevel
  sideEffect: 'read' | 'write' | 'destructive'
  input: S
  numericKeys?: string[]
  principalFallback?: boolean
  handler: (
    services: Chatv3Services,
    input: z.output<S>,
    actor: Chatv3OperationActor,
    principalUserId?: string | null
  ) => Promise<unknown>
}): Chatv3OperationSpec => spec as unknown as Chatv3OperationSpec

const requireMemberActor = (actor: Chatv3OperationActor): IdbChatv3Member => {
  if (!actor || isScopedAdminAuthority(actor)) throw new Error('member actor missing for member-auth operation')
  return actor
}

const requireAdminActor = (actor: Chatv3OperationActor): Chatv3AdminActor => {
  if (!actor) throw new Error('actor missing for admin-auth operation')
  return actor
}

export const CHATV3_OPERATIONS: Chatv3OperationSpec[] = [
  // ---------------------------------------------------------------- space --
  op({
    operationId: 'chatv3.space.create',
    title: 'Create space',
    summary: 'Create a standalone owner boundary (the ChatV3 counterpart of a project).',
    method: 'POST',
    pattern: '/v1/spaces',
    auth: 'open',
    sideEffect: 'write',
    input: zSpaceCreateInput,
    handler: (s, input) => s.space.create(input),
  }),
  op({
    operationId: 'chatv3.space.ensure',
    title: 'Ensure space',
    summary: 'Resolve-or-create a space by (tenantId, slug) — idempotent client bootstrap.',
    method: 'POST',
    pattern: '/v1/spaces/ensure',
    auth: 'open',
    sideEffect: 'write',
    input: zSpaceCreateInput,
    handler: (s, input) => s.space.ensure(input),
  }),
  op({
    operationId: 'chatv3.space.get',
    title: 'Get space',
    summary: 'Fetch one space by id (read-only metadata; no channel/content listing).',
    method: 'GET',
    pattern: '/v1/spaces/:spaceId',
    auth: 'open',
    sideEffect: 'read',
    input: zSpaceGetInput,
    handler: (s, input) => s.space.get(input),
  }),
  op({
    operationId: 'chatv3.space.list',
    title: 'List spaces',
    summary: 'List space metadata for admin management; content and channel membership remain separate.',
    method: 'GET',
    pattern: '/v1/spaces',
    auth: 'admin',
    sideEffect: 'read',
    input: zSpaceListInput,
    numericKeys: ['limit'],
    handler: (s, input, actor) => s.space.list(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.space.archive',
    title: 'Archive space',
    summary: 'Archive a space metadata record (scoped admin only; does not decrypt or expose channel content).',
    method: 'POST',
    pattern: '/v1/spaces/:spaceId/archive',
    auth: 'admin',
    sideEffect: 'write',
    input: zSpaceArchiveInput,
    handler: (s, input, actor) => s.space.archive(input, requireAdminActor(actor)),
  }),

  // -------------------------------------------------------------- channel --
  op({
    operationId: 'chatv3.channel.create',
    title: 'Create channel',
    summary:
      'Composite creator call: channel + auto general room + first epoch + access-key verifier + owner membership. Client submits derived/wrapped crypto material only.',
    method: 'POST',
    pattern: '/v1/channels',
    auth: 'open',
    sideEffect: 'write',
    input: zChannelCreateInput,
    handler: (s, input, _actor, principalUserId) => s.channel.create(input, principalUserId),
  }),
  op({
    operationId: 'chatv3.channel.join',
    title: 'Join channel',
    summary:
      'Join with the accessSecret half of an invite; returns membership, personal member token (once) and wrapped epoch blobs. wrapSecret never appears in this call.',
    method: 'POST',
    pattern: '/v1/channels/:channelId/join',
    auth: 'open',
    sideEffect: 'write',
    input: zChannelJoinInput,
    handler: (s, input, _actor, principalUserId) => s.channel.join(input, principalUserId),
  }),
  op({
    operationId: 'chatv3.channel.epoch-keys',
    title: 'Get server-managed epoch keys',
    summary:
      'Return readable raw room epoch keys for an active member of a server-encrypted channel; E2E channels are forbidden.',
    method: 'GET',
    pattern: '/v1/channels/:channelId/epoch-keys',
    auth: 'member',
    sideEffect: 'read',
    input: zChannelEpochKeysInput,
    handler: (s, input, actor) => s.channel.epochKeys(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.channel.list-mine',
    title: 'List my channels',
    summary: 'List channels owned by or joined by the verified authv2 principal.',
    method: 'GET',
    pattern: '/v1/channels/mine',
    auth: 'principal',
    sideEffect: 'read',
    input: zChannelListMineInput,
    numericKeys: ['limit'],
    handler: (s, input, _actor, principalUserId) => s.channel.listMine(input, principalUserId),
  }),
  op({
    operationId: 'chatv3.channel.get',
    title: 'Get channel',
    summary: 'Fetch one channel by id.',
    method: 'GET',
    pattern: '/v1/channels/:channelId',
    auth: 'member',
    sideEffect: 'read',
    input: zChannelGetInput,
    handler: (s, input) => s.channel.get(input),
  }),
  op({
    operationId: 'chatv3.channel.list',
    title: 'List channels',
    summary: 'List channels of a tenant/space.',
    method: 'GET',
    pattern: '/v1/channels',
    auth: 'open',
    sideEffect: 'read',
    input: zChannelListInput,
    numericKeys: ['limit'],
    handler: (s, input) => s.channel.list(input),
  }),
  op({
    operationId: 'chatv3.channel.purge-before',
    title: 'Purge channels before date',
    summary: 'Preview or apply admin cleanup for channels created before a cutoff date; dryRun defaults true.',
    method: 'POST',
    pattern: '/v1/channels/purge-before',
    auth: 'admin',
    sideEffect: 'destructive',
    input: zChannelPurgeBeforeInput,
    handler: (s, input, actor) => s.channel.purgeBefore(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.channel.archive',
    title: 'Archive channel',
    summary: 'Archive a channel (owner/operator only).',
    method: 'POST',
    pattern: '/v1/channels/:channelId/archive',
    auth: 'admin',
    sideEffect: 'write',
    input: zChannelArchiveInput,
    handler: (s, input, actor) => s.channel.archive(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.channel.unarchive',
    title: 'Unarchive channel',
    summary: 'Restore an archived channel to the active list (owner/operator only).',
    method: 'POST',
    pattern: '/v1/channels/:channelId/unarchive',
    auth: 'admin',
    sideEffect: 'write',
    input: zChannelUnarchiveInput,
    handler: (s, input, actor) => s.channel.unarchive(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.channel.delete',
    title: 'Delete channel',
    summary: 'Hard-delete a channel after confirmSlug guard; cascades all content (owner/operator only).',
    method: 'DELETE',
    pattern: '/v1/channels/:channelId',
    auth: 'admin',
    sideEffect: 'destructive',
    input: zChannelDeleteInput,
    principalFallback: true,
    handler: (s, input, actor) => s.channel.delete(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.member.list',
    title: 'List members',
    summary: 'List channel members.',
    method: 'GET',
    pattern: '/v1/channels/:channelId/members',
    auth: 'member',
    sideEffect: 'read',
    input: zMemberListInput,
    numericKeys: ['limit'],
    handler: (s, input, actor) => s.channel.listMembers(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.member.update',
    title: 'Update member',
    summary: 'Update role/status/displayName of a member. Owner/operator can update any member; a member can remove only itself.',
    method: 'PATCH',
    pattern: '/v1/members/:memberId',
    auth: 'member',
    sideEffect: 'write',
    input: zMemberUpdateInput,
    handler: (s, input, actor) => s.channel.updateMember(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.member.token.remint',
    title: 'Re-mint my member token',
    summary:
      'Verified principal re-mints its active member token for a server-encrypted channel; the principal must already be bound to active membership.',
    method: 'POST',
    pattern: '/v1/channels/:channelId/members/me/token',
    auth: 'principal',
    sideEffect: 'write',
    input: zMemberTokenRemintInput,
    handler: (s, input, _actor, principalUserId) => s.channel.remintMemberToken(input, principalUserId),
  }),

  // ------------------------------------------------------------- recovery --
  op({
    operationId: 'chatv3.user-key.register',
    title: 'Register user key backup',
    summary:
      'Register or update the verified principal user-key backup. Same public key rewrites backup in-place; public-key rotation bumps keyVersion and marks old member packages stale.',
    method: 'POST',
    pattern: '/v1/users/me/key-backup',
    auth: 'principal',
    sideEffect: 'write',
    input: zUserKeyRegisterInput,
    handler: (s, input, _actor, principalUserId) => s.recovery.registerUserKey(input, principalUserId),
  }),
  op({
    operationId: 'chatv3.user-key.get',
    title: 'Get user key backup',
    summary: 'Fetch the verified principal user-key backup metadata and opaque encrypted private-key backup.',
    method: 'GET',
    pattern: '/v1/users/me/key-backup',
    auth: 'principal',
    sideEffect: 'read',
    input: zUserKeyGetInput,
    handler: (s, input, _actor, principalUserId) => s.recovery.getUserKey(input, principalUserId),
  }),
  op({
    operationId: 'chatv3.member.key-package.put',
    title: 'Put member key package',
    summary:
      'Store an opaque wrap-secret package sealed to a member public key. The member, channel owner, or scoped admin may package for that member.',
    method: 'PUT',
    pattern: '/v1/channels/:channelId/members/:memberId/key-package',
    auth: 'principal',
    sideEffect: 'write',
    input: zMemberKeyPackagePutInput,
    handler: (s, input, actor, principalUserId) =>
      s.recovery.putMemberKeyPackage(input, actor as Chatv3ScopedAdminAuthority | null, principalUserId),
  }),
  op({
    operationId: 'chatv3.member.key-package.get',
    title: 'Get member key package',
    summary: 'Fetch a member key package if the verified principal is the member, channel owner, or scoped admin.',
    method: 'GET',
    pattern: '/v1/channels/:channelId/members/:memberId/key-package',
    auth: 'principal',
    sideEffect: 'read',
    input: zMemberKeyPackageGetInput,
    handler: (s, input, actor, principalUserId) =>
      s.recovery.getMemberKeyPackage(input, actor as Chatv3ScopedAdminAuthority | null, principalUserId),
  }),
  op({
    operationId: 'chatv3.member.recovery.get',
    title: 'Get member recovery state',
    summary:
      'Resolve account-bound recovery state and re-mint a member token only when the verified principal is already bound to channel membership.',
    method: 'GET',
    pattern: '/v1/channels/:channelId/recovery',
    auth: 'principal',
    sideEffect: 'write',
    input: zMemberRecoveryGetInput,
    handler: (s, input, _actor, principalUserId) => s.recovery.getMemberRecovery(input, principalUserId),
  }),

  // ----------------------------------------------------------------- room --
  op({
    operationId: 'chatv3.room.create',
    title: 'Create room',
    summary: 'Open a session/task room; the creating client publishes the first epoch in the same call.',
    method: 'POST',
    pattern: '/v1/channels/:channelId/rooms',
    auth: 'member',
    sideEffect: 'write',
    input: zRoomCreateInput,
    handler: (s, input, actor) => s.room.create(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.room.list',
    title: 'List rooms',
    summary: 'List rooms of a channel.',
    method: 'GET',
    pattern: '/v1/channels/:channelId/rooms',
    auth: 'member',
    sideEffect: 'read',
    input: zRoomListInput,
    numericKeys: ['limit'],
    handler: (s, input, actor) => s.room.list(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.room.archive',
    title: 'Archive room',
    summary: 'Archive a room.',
    method: 'POST',
    pattern: '/v1/rooms/:roomId/archive',
    auth: 'admin',
    sideEffect: 'write',
    input: zRoomArchiveInput,
    handler: (s, input, actor) => s.room.archive(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.room.delete',
    title: 'Delete room',
    summary: 'Hard-delete a room after confirmSlug guard (owner/operator only; general room protected).',
    method: 'DELETE',
    pattern: '/v1/rooms/:roomId',
    auth: 'admin',
    sideEffect: 'destructive',
    input: zRoomDeleteInput,
    principalFallback: true,
    handler: (s, input, actor) => s.room.delete(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.room.epochs',
    title: 'List room epochs',
    summary: 'List wrapped epoch blobs of a room so clients can unwrap history locally.',
    method: 'GET',
    pattern: '/v1/rooms/:roomId/epochs',
    auth: 'member',
    sideEffect: 'read',
    input: zRoomEpochListInput,
    handler: (s, input, actor) => s.room.epochs(input, requireMemberActor(actor)),
  }),

  // -------------------------------------------------------------- message --
  op({
    operationId: 'chatv3.message.send',
    title: 'Send message',
    summary: 'Append an opaque encrypted envelope to a room (seq allocation + idempotent replay).',
    method: 'POST',
    pattern: '/v1/rooms/:roomId/messages',
    auth: 'member',
    sideEffect: 'write',
    input: zMessageSendInput,
    handler: (s, input, actor) => s.message.send(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.message.list',
    title: 'List messages',
    summary: 'Cursor-paginated message list (afterSeq).',
    method: 'GET',
    pattern: '/v1/rooms/:roomId/messages',
    auth: 'member',
    sideEffect: 'read',
    input: zMessageListInput,
    numericKeys: ['afterSeq', 'limit'],
    handler: (s, input, actor) => s.message.list(input, requireMemberActor(actor)),
  }),

  // --------------------------------------------------------------- cursor --
  op({
    operationId: 'chatv3.cursor.mark-read',
    title: 'Mark read',
    summary: 'Advance the member read cursor (never regresses).',
    method: 'POST',
    pattern: '/v1/rooms/:roomId/read',
    auth: 'member',
    sideEffect: 'write',
    input: zMarkReadInput,
    numericKeys: ['lastReadSeq'],
    handler: (s, input, actor) => s.cursor.markRead(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.room.receipts',
    title: 'Room receipts',
    summary: 'Per-member cursors (read/delivered/ack); who-read derives from lastReadSeq >= seq.',
    method: 'GET',
    pattern: '/v1/rooms/:roomId/receipts',
    auth: 'member',
    sideEffect: 'read',
    input: zReceiptsInput,
    handler: (s, input, actor) => s.cursor.receipts(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.cursor.delivered',
    title: 'Mark delivered',
    summary: 'Advance the transport-level delivery cursor (never regresses).',
    method: 'POST',
    pattern: '/v1/rooms/:roomId/delivered',
    auth: 'member',
    sideEffect: 'write',
    input: zMarkDeliveredInput,
    numericKeys: ['deliveredSeq'],
    handler: (s, input, actor) => s.cursor.markDelivered(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.cursor.ack',
    title: 'Acknowledge directives',
    summary: 'Advance the explicit directive-ACK cursor — separate from read by design.',
    method: 'POST',
    pattern: '/v1/rooms/:roomId/ack',
    auth: 'member',
    sideEffect: 'write',
    input: zAckInput,
    numericKeys: ['ackSeq'],
    handler: (s, input, actor) => s.cursor.ack(input, requireMemberActor(actor)),
  }),

  // ------------------------------------------------------------- presence --
  op({
    operationId: 'chatv3.presence.set',
    title: 'Set presence',
    summary: 'Heartbeat-style working-state upsert (active/idle/working/reviewing/blocked/offline).',
    method: 'POST',
    pattern: '/v1/rooms/:roomId/presence',
    auth: 'member',
    sideEffect: 'write',
    input: zPresenceSetInput,
    numericKeys: ['ttlSec'],
    handler: (s, input, actor) => s.presence.set(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.presence.list',
    title: 'List presence',
    summary: 'Room presence; rows past their heartbeat TTL read as offline.',
    method: 'GET',
    pattern: '/v1/rooms/:roomId/presence',
    auth: 'member',
    sideEffect: 'read',
    input: zPresenceListInput,
    handler: (s, input, actor) => s.presence.list(input, requireMemberActor(actor)),
  }),

  // -------------------------------------------------------------- webhook --
  op({
    operationId: 'chatv3.webhook.create',
    title: 'Create webhook',
    summary: 'Register a generic agent-wake callback (HMAC-signed, metadata-only payloads).',
    method: 'POST',
    pattern: '/v1/channels/:channelId/webhooks',
    auth: 'admin',
    sideEffect: 'write',
    input: zWebhookCreateInput,
    handler: (s, input, actor) => s.webhook.create(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.webhook.list',
    title: 'List webhooks',
    summary: 'List channel webhooks (signing secrets redacted).',
    method: 'GET',
    pattern: '/v1/channels/:channelId/webhooks',
    auth: 'admin',
    sideEffect: 'read',
    input: zWebhookListInput,
    handler: (s, input, actor) => s.webhook.list(input, requireAdminActor(actor)),
  }),
  op({
    operationId: 'chatv3.webhook.remove',
    title: 'Remove webhook',
    summary: 'Remove a channel webhook.',
    method: 'DELETE',
    pattern: '/v1/webhooks/:webhookId',
    auth: 'admin',
    sideEffect: 'write',
    input: zWebhookRemoveInput,
    handler: (s, input, actor) => s.webhook.remove(input, requireAdminActor(actor)),
  }),

  // --------------------------------------------------------------- rotate --
  op({
    operationId: 'chatv3.channel.rotate',
    title: 'Rotate channel keys',
    summary:
      'Revoke all active access keys, install the new client-generated verifier and bump every listed room to its next wrapped epoch (one tx).',
    method: 'POST',
    pattern: '/v1/channels/:channelId/rotate',
    auth: 'admin',
    sideEffect: 'write',
    input: zChannelRotateInput,
    handler: (s, input, actor) => s.channel.rotate(input, requireAdminActor(actor)),
  }),

  // --------------------------------------------------------------- device --
  op({
    operationId: 'chatv3.device.register',
    title: 'Register device',
    summary: 'Register a device identity (public keys only).',
    method: 'POST',
    pattern: '/v1/devices',
    auth: 'member',
    sideEffect: 'write',
    input: zDeviceRegisterInput,
    handler: (s, input, actor) => s.device.register(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.device.publish-key-package',
    title: 'Publish key package',
    summary: 'Publish an opaque pre-key package blob for a device (MLS-ready path).',
    method: 'POST',
    pattern: '/v1/devices/:deviceId/key-packages',
    auth: 'member',
    sideEffect: 'write',
    input: zKeyPackagePublishInput,
    handler: (s, input, actor) => s.device.publishKeyPackage(input, requireMemberActor(actor)),
  }),

  // -------------------------------------------------------------- binding --
  op({
    operationId: 'chatv3.binding.add',
    title: 'Add binding',
    summary: 'Attach a loose external reference (id/slug/URI) to a channel or room.',
    method: 'POST',
    pattern: '/v1/channels/:channelId/bindings',
    auth: 'member',
    sideEffect: 'write',
    input: zBindingAddInput,
    handler: (s, input, actor) => s.binding.add(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.binding.list',
    title: 'List bindings',
    summary: 'List loose references of a channel (optionally per room).',
    method: 'GET',
    pattern: '/v1/channels/:channelId/bindings',
    auth: 'member',
    sideEffect: 'read',
    input: zBindingListInput,
    handler: (s, input, actor) => s.binding.list(input, requireMemberActor(actor)),
  }),
  op({
    operationId: 'chatv3.binding.remove',
    title: 'Remove binding',
    summary: 'Remove a loose reference.',
    method: 'DELETE',
    pattern: '/v1/bindings/:bindingId',
    auth: 'member',
    sideEffect: 'write',
    input: zBindingRemoveInput,
    handler: (s, input, actor) => s.binding.remove(input, requireMemberActor(actor)),
  }),
]

export function getChatv3OperationById(operationId: string): Chatv3OperationSpec | null {
  return CHATV3_OPERATIONS.find((o) => o.operationId === operationId) ?? null
}
