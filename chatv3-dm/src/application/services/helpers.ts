import { Chatv3Db } from '../../infrastructure/db/client.js'
import {
  IdbChatv3Channel,
  IdbChatv3Member,
  IdbChatv3Room,
} from '../../infrastructure/db/drizzle.schema.index.js'
import { Chatv3Error, forbidden, notFound, unauthorized } from '../errors.js'
import { hashesEqual, parseMemberToken } from '../util.crypto.js'
import { createChatv3Repos } from '../factories/repository-factory.js'

/**
 * v1 authorization policy (kept deliberately small):
 * - any active channel member: read, send, create rooms, cursors
 * - owner|operator roleKey: channel archive/delete, room archive/delete, member admin
 * - verified host principals with ChatV3 scoped admin permission: metadata/lifecycle admin
 * Authentication is the personal member token; access keys only ever join.
 */
export const ADMIN_ROLE_KEYS = ['owner', 'operator'] as const
export const CHATV3_ADMIN_MANAGE_PERMISSIONS = ['chatv3.channel.manage', 'chatv3.space.manage'] as const

export type Chatv3ScopedAdminPermission = (typeof CHATV3_ADMIN_MANAGE_PERMISSIONS)[number]

export type Chatv3ScopedAdminAuthority = {
  kind: 'scoped-admin'
  principalUserId: string
  permissions: readonly string[]
}

export type Chatv3AdminActor = IdbChatv3Member | Chatv3ScopedAdminAuthority

export async function authenticateMemberToken(db: Chatv3Db, token: string): Promise<IdbChatv3Member> {
  const parsed = parseMemberToken(token)
  if (!parsed) throw unauthorized('invalid member token format')
  const member = await createChatv3Repos(db).member.byId(parsed.memberId)
  if (!member) throw unauthorized('unknown member token')
  if (!hashesEqual(parsed.secretHash, member.tokenHash)) throw unauthorized('member token mismatch')
  if (member.status !== 'active') throw unauthorized('membership is not active')
  return member
}

export async function getChannelOrThrow(db: Chatv3Db, channelId: string): Promise<IdbChatv3Channel> {
  const channel = await createChatv3Repos(db).channel.byId(channelId)
  if (!channel) throw notFound('channel')
  return channel
}

export async function getRoomOrThrow(db: Chatv3Db, roomId: string): Promise<IdbChatv3Room> {
  const room = await createChatv3Repos(db).room.byId(roomId)
  if (!room) throw notFound('room')
  return room
}

/** Room access = active membership in the room's channel. */
export async function getRoomForMember(
  db: Chatv3Db,
  roomId: string,
  member: IdbChatv3Member
): Promise<IdbChatv3Room> {
  const room = await getRoomOrThrow(db, roomId)
  if (room.channelId !== member.channelId) throw forbidden('member does not belong to this room channel')
  return room
}

export async function getRoomForAdmin(
  db: Chatv3Db,
  roomId: string,
  actor: Chatv3AdminActor
): Promise<IdbChatv3Room> {
  const repos = createChatv3Repos(db)
  const room = await getRoomOrThrow(db, roomId)
  const channel = await repos.channel.byId(room.channelId)
  if (!channel) throw notFound('channel')
  requireChannelOwnerOrAdminAuthority(actor, channel)
  return room
}

export function requireAdminRole(member: IdbChatv3Member): void {
  if (!ADMIN_ROLE_KEYS.includes(member.roleKey as (typeof ADMIN_ROLE_KEYS)[number])) {
    throw forbidden('owner or operator role required')
  }
}

export function isScopedAdminAuthority(actor: Chatv3AdminActor): actor is Chatv3ScopedAdminAuthority {
  return (actor as Chatv3ScopedAdminAuthority).kind === 'scoped-admin'
}

export function hasScopedAdminPermission(
  permissions: readonly string[],
  required: readonly string[] = CHATV3_ADMIN_MANAGE_PERMISSIONS
): boolean {
  return permissions.includes('*') || permissions.includes('chatv3.*') || required.some((p) => permissions.includes(p))
}

export function requireAdminAuthority(
  actor: Chatv3AdminActor,
  required: readonly string[] = CHATV3_ADMIN_MANAGE_PERMISSIONS
): void {
  if (!isScopedAdminAuthority(actor)) {
    requireAdminRole(actor)
    return
  }
  if (!hasScopedAdminPermission(actor.permissions, required)) {
    throw forbidden(`one of ${required.join(', ')} permission required`)
  }
}

export function hasChannelOwnerOrAdminAuthority(actor: Chatv3AdminActor, channel: IdbChatv3Channel): boolean {
  if (!isScopedAdminAuthority(actor)) {
    return actor.channelId === channel.id && ADMIN_ROLE_KEYS.includes(actor.roleKey as (typeof ADMIN_ROLE_KEYS)[number])
  }
  if (hasScopedAdminPermission(actor.permissions, CHATV3_ADMIN_MANAGE_PERMISSIONS)) return true
  return !!channel.ownerUserId && channel.ownerUserId === actor.principalUserId
}

export function requireChannelOwnerOrAdminAuthority(actor: Chatv3AdminActor, channel: IdbChatv3Channel): void {
  if (!hasChannelOwnerOrAdminAuthority(actor, channel)) {
    throw forbidden('channel owner, owner/operator member, or ChatV3 scoped admin permission required')
  }
}

export function assertAdminChannelAccess(actor: Chatv3AdminActor, channelId: string): void {
  if (!isScopedAdminAuthority(actor) && actor.channelId !== channelId) {
    throw forbidden('actor is not a member of this channel')
  }
}

export function adminActorLabel(actor: Chatv3AdminActor): string {
  return isScopedAdminAuthority(actor) ? `authv2:${actor.principalUserId}` : actor.handle
}

export function assertActive(status: string, what: string): void {
  if (status !== 'active') throw new Chatv3Error('archived', `${what} is not active`)
}
