import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import {
  IdbChatv3Member,
  IdbChatv3Room,
  IdbChatv3RoomEpoch,
} from '../../infrastructure/db/drizzle.schema.index.js'
import {
  zRoomArchiveInput,
  zRoomCreateInput,
  zRoomDeleteInput,
  zRoomEpochListInput,
  zRoomListInput,
} from '../../domain/models/operations.js'
import { Chatv3Error, notFound } from '../errors.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos, withChatv3Tx } from '../factories/repository-factory.js'
import { adminActorLabel, assertActive, Chatv3AdminActor, getRoomForAdmin, getRoomForMember } from './helpers.js'
import { mapUniqueViolation } from './service.space.js'
import { randomEpochKeyB64Url, wrapServerManagedEpochKey } from '../util.crypto.js'

export class Chatv3RoomService {
  private readonly repos: Chatv3Repos

  constructor(private readonly db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  /**
   * Any active member can open a session/task room. The creating client
   * publishes the room's first epoch in the same call so the room is never
   * writable without crypto material.
   */
  async create(
    input: z.infer<typeof zRoomCreateInput>,
    actor: IdbChatv3Member
  ): Promise<{ room: IdbChatv3Room; epoch: IdbChatv3RoomEpoch; serverEpochKey?: string }> {
    if (actor.channelId !== input.channelId) {
      throw new Chatv3Error('forbidden', 'actor is not a member of this channel')
    }
    const channel = await this.repos.channel.byId(input.channelId)
    if (!channel) throw notFound('channel')
    assertActive(channel.status, 'channel')
    const epochNumber = channel.encryptionMode === 'server-encrypted' ? 1 : input.epoch?.epoch
    if (!epochNumber) {
      throw new Chatv3Error('invalid_input', 'epoch is required for e2e rooms')
    }
    return withChatv3Tx(this.db, async (r) => {
      const room = await r.room.insert({
        tenantId: actor.tenantId,
        channelId: input.channelId,
        slug: input.slug,
        title: input.title,
        kind: input.kind,
        purpose: input.purpose,
        guidanceMarkdown: input.guidanceMarkdown,
        currentEpoch: epochNumber,
        createdBy: actor.handle,
      })
      let serverEpochKey: string | undefined
      const epochInput =
        channel.encryptionMode === 'server-encrypted'
          ? (() => {
              serverEpochKey = randomEpochKeyB64Url()
              const wrapped = wrapServerManagedEpochKey({
                tenantId: actor.tenantId,
                spaceId: channel.spaceId,
                channelId: channel.id,
                roomId: room.id,
                epoch: epochNumber,
                rawEpochKey: serverEpochKey,
              })
              return {
                epoch: epochNumber,
                cipherSuite: 'v1-server-managed',
                wrappedKeyBlob: wrapped.wrappedKeyBlob,
                kdfMeta: wrapped.kdfMeta,
              }
            })()
          : input.epoch!
      const epoch = await r.roomEpoch.insert({
        tenantId: actor.tenantId,
        roomId: room.id,
        epoch: epochInput.epoch,
        cipherSuite: epochInput.cipherSuite,
        wrappedKeyBlob: epochInput.wrappedKeyBlob,
        kdfMeta: epochInput.kdfMeta,
        createdBy: actor.handle,
      })
      return { room, epoch, ...(serverEpochKey ? { serverEpochKey } : {}) }
    }).catch((error: unknown) => {
      throw mapUniqueViolation(error, 'room slug already exists in channel')
    })
  }

  async list(input: z.infer<typeof zRoomListInput>, actor: IdbChatv3Member): Promise<IdbChatv3Room[]> {
    if (actor.channelId !== input.channelId) {
      throw new Chatv3Error('forbidden', 'actor is not a member of this channel')
    }
    return this.repos.room.listByChannel({
      channelId: input.channelId,
      status: input.status,
      limit: input.limit,
    })
  }

  async archive(input: z.infer<typeof zRoomArchiveInput>, actor: Chatv3AdminActor): Promise<IdbChatv3Room> {
    const room = await getRoomForAdmin(this.db, input.roomId, actor)
    assertActive(room.status, 'room')
    const archived = await this.repos.room.archive(room.id, adminActorLabel(actor))
    return archived!
  }

  /** Hard delete (admin only); the auto `general` room cannot be deleted. */
  async delete(input: z.infer<typeof zRoomDeleteInput>, actor: Chatv3AdminActor): Promise<{ deleted: true }> {
    const room = await getRoomForAdmin(this.db, input.roomId, actor)
    if (room.kind === 'general') throw new Chatv3Error('forbidden', 'general room cannot be deleted')
    if (room.slug !== input.confirmSlug) {
      throw new Chatv3Error('invalid_input', 'confirmSlug does not match room slug')
    }
    await this.repos.room.deleteById(room.id)
    return { deleted: true }
  }

  /** Clients need historical wrapped blobs to decrypt older epochs locally. */
  async epochs(input: z.infer<typeof zRoomEpochListInput>, actor: IdbChatv3Member): Promise<IdbChatv3RoomEpoch[]> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    const rows = await this.repos.roomEpoch.listByRoom(room.id)
    if (!rows.length) throw notFound('room epochs')
    return rows
  }
}
