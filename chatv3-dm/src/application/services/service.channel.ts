import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import {
  IdbChatv3AccessKey,
  IdbChatv3Channel,
  IdbChatv3Member,
  IdbChatv3MemberDevice,
  IdbChatv3Room,
  IdbChatv3RoomEpoch,
} from '../../infrastructure/db/drizzle.schema.index.js'
import {
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
  zMemberListInput,
  zMemberTokenRemintInput,
  zMemberUpdateInput,
} from '../../domain/models/operations.js'
import { Chatv3Error, notFound, unauthorized } from '../errors.js'
import {
  hashesEqual,
  mintMemberToken,
  randomEpochKeyB64Url,
  sha256Hex,
  unwrapServerManagedEpochKey,
  wrapServerManagedEpochKey,
} from '../util.crypto.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos, withChatv3Tx } from '../factories/repository-factory.js'
import {
  adminActorLabel,
  assertActive,
  assertAdminChannelAccess,
  Chatv3AdminActor,
  getChannelOrThrow,
  requireAdminAuthority,
  requireAdminRole,
  requireChannelOwnerOrAdminAuthority,
} from './helpers.js'
import { mapUniqueViolation } from './service.space.js'

export type Chatv3ChannelCreateResult = {
  channel: IdbChatv3Channel
  generalRoom: IdbChatv3Room
  epoch: IdbChatv3RoomEpoch
  accessKey: IdbChatv3AccessKey
  creator: IdbChatv3Member
  creatorDevice: IdbChatv3MemberDevice | null
  /** returned exactly once; only its hash is stored */
  memberToken: string
  /** server-encrypted mode only; raw epoch key returned once to the creator */
  serverEpochKey?: string
}

export type Chatv3ChannelJoinResult = {
  channel: IdbChatv3Channel
  member: IdbChatv3Member
  device: IdbChatv3MemberDevice | null
  rooms: IdbChatv3Room[]
  /** wrapped epoch blobs the joining client unwraps locally with wrapSecret */
  epochs: IdbChatv3RoomEpoch[]
  memberToken: string
}

export type Chatv3MemberView = Omit<IdbChatv3Member, 'tokenHash'>

export type Chatv3ChannelMineRow = {
  channel: IdbChatv3Channel
  membership: Chatv3MemberView | null
  isOwner: boolean
  canDelete: boolean
  modeStatus: {
    encryptionMode: IdbChatv3Channel['encryptionMode']
    epochKeyAccess: 'client-managed' | 'server-managed'
  }
}

export type Chatv3ChannelEpochKeyRow = {
  roomId: string
  epoch: number
  cipherSuite: string
  rawEpochKey: string
  keyId: string
}

export type Chatv3ChannelPurgeBeforeResult = {
  beforeDate: string
  dryRun: boolean
  applied: boolean
  candidateCount: number
  deletedCount: number
  candidates: IdbChatv3Channel[]
}

function redactMember(member: IdbChatv3Member): Chatv3MemberView {
  const { tokenHash: _tokenHash, ...safe } = member
  return safe
}

function modeStatus(channel: IdbChatv3Channel): Chatv3ChannelMineRow['modeStatus'] {
  return {
    encryptionMode: channel.encryptionMode,
    epochKeyAccess: channel.encryptionMode === 'server-encrypted' ? 'server-managed' : 'client-managed',
  }
}

export class Chatv3ChannelService {
  private readonly repos: Chatv3Repos

  constructor(private readonly db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  /**
   * Composite creator call: channel + auto `general` room + first epoch +
   * access-key verifier + creator membership (+ optional device), one
   * transaction. All secrets except the member token were generated on the
   * client; the server stores verifier hashes and wrapped blobs only.
   */
  async create(
    input: z.infer<typeof zChannelCreateInput>,
    principalUserId?: string | null
  ): Promise<Chatv3ChannelCreateResult> {
    return withChatv3Tx(this.db, async (r) => {
      const channel = await r.channel.insert({
        tenantId: input.tenantId,
        spaceId: input.spaceId,
        slug: input.slug,
        title: input.title,
        purpose: input.purpose,
        guidanceMarkdown: input.guidanceMarkdown,
        encryptionMode: input.encryptionMode,
        createdBy: input.creator.handle,
        ownerUserId: principalUserId ?? null,
      })

      const epochNumber = input.encryptionMode === 'server-encrypted' ? 1 : input.epoch?.epoch
      if (!epochNumber) {
        throw new Chatv3Error('invalid_input', 'epoch is required for e2e channels')
      }

      const generalRoom = await r.room.insert({
        tenantId: input.tenantId,
        channelId: channel.id,
        slug: 'general',
        title: 'General',
        kind: 'general',
        guidanceMarkdown: input.generalRoomGuidanceMarkdown,
        currentEpoch: epochNumber,
        createdBy: input.creator.handle,
      })

      await r.channel.setGeneralRoom(channel.id, generalRoom.id)

      let serverEpochKey: string | undefined
      const epochInput =
        input.encryptionMode === 'server-encrypted'
          ? (() => {
              serverEpochKey = randomEpochKeyB64Url()
              const wrapped = wrapServerManagedEpochKey({
                tenantId: input.tenantId,
                spaceId: input.spaceId,
                channelId: channel.id,
                roomId: generalRoom.id,
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
        tenantId: input.tenantId,
        roomId: generalRoom.id,
        epoch: epochInput.epoch,
        cipherSuite: epochInput.cipherSuite,
        wrappedKeyBlob: epochInput.wrappedKeyBlob,
        kdfMeta: epochInput.kdfMeta,
        createdBy: input.creator.handle,
      })

      const accessKey = await r.accessKey.insert({
        tenantId: input.tenantId,
        channelId: channel.id,
        keyId: input.accessKey.keyId,
        verifierHash: input.accessKey.verifierHash,
        label: input.accessKey.label,
        epoch: epochNumber,
        createdBy: input.creator.handle,
      })

      const memberId = crypto.randomUUID()
      const minted = mintMemberToken(memberId)
      const creator = await r.member.insert({
        id: memberId,
        tenantId: input.tenantId,
        channelId: channel.id,
        handle: input.creator.handle,
        displayName: input.creator.displayName,
        actorKind: input.creator.actorKind,
        roleKey: 'owner',
        tokenHash: minted.tokenHash,
        joinedViaKeyId: accessKey.id,
        userId: principalUserId ?? null,
      })

      let creatorDevice: IdbChatv3MemberDevice | null = null
      if (input.creator.device) {
        creatorDevice = await r.memberDevice.insert({
          tenantId: input.tenantId,
          memberId: creator.id,
          deviceLabel: input.creator.device.deviceLabel,
          identityPublicKey: input.creator.device.identityPublicKey,
          signingPublicKey: input.creator.device.signingPublicKey,
        })
      }

      return {
        channel,
        generalRoom,
        epoch,
        accessKey,
        creator,
        creatorDevice,
        memberToken: minted.token,
        ...(serverEpochKey ? { serverEpochKey } : {}),
      }
    }).catch((error: unknown) => {
      throw mapUniqueViolation(error, 'channel slug or access keyId already exists')
    })
  }

  /**
   * Join with the accessSecret half of an invite. The server verifies the
   * sha256 verifier, creates/reactivates the membership, mints the personal
   * member token and returns the wrapped epoch blobs; content unwrap happens
   * client-side with wrapSecret, which never appears in this call.
   */
  async join(
    input: z.infer<typeof zChannelJoinInput>,
    principalUserId?: string | null
  ): Promise<Chatv3ChannelJoinResult> {
    const channel = await getChannelOrThrow(this.db, input.channelId)
    assertActive(channel.status, 'channel')

    const accessKey = await this.repos.accessKey.byTenantKeyId(input.tenantId, input.keyId)
    if (!accessKey || accessKey.channelId !== channel.id) throw unauthorized('unknown access key')
    if (accessKey.status !== 'active') throw new Chatv3Error('revoked', 'access key revoked')
    if (!hashesEqual(sha256Hex(input.accessSecret), accessKey.verifierHash)) {
      throw unauthorized('access secret mismatch')
    }

    const existing = await this.repos.member.byChannelHandle(channel.id, input.handle)
    if (existing && existing.status === 'active') {
      throw new Chatv3Error('conflict', 'handle already active in channel; pick another handle')
    }

    const result = await withChatv3Tx(this.db, async (r) => {
      const memberId = crypto.randomUUID()
      const minted = mintMemberToken(memberId)
      const member = existing
        ? await r.member.update(existing.id, {
            status: 'active',
            tokenHash: minted.tokenHash,
            displayName: input.displayName ?? null,
            actorKind: input.actorKind,
            joinedViaKeyId: accessKey.id,
            // Preserve a prior authv2 binding if this re-join is anonymous.
            userId: principalUserId ?? existing.userId ?? null,
            removedAt: null,
            updatedAt: new Date(),
          })
        : await r.member.insert({
            id: memberId,
            tenantId: input.tenantId,
            channelId: channel.id,
            handle: input.handle,
            displayName: input.displayName,
            actorKind: input.actorKind,
            roleKey: accessKey.roleKey,
            tokenHash: minted.tokenHash,
            joinedViaKeyId: accessKey.id,
            userId: principalUserId ?? null,
          })
      if (!member) throw notFound('member')

      let device: IdbChatv3MemberDevice | null = null
      if (input.device) {
        device = await r.memberDevice.insert({
          tenantId: input.tenantId,
          memberId: member.id,
          deviceLabel: input.device.deviceLabel,
          identityPublicKey: input.device.identityPublicKey,
          signingPublicKey: input.device.signingPublicKey,
        })
      }

      await r.accessKey.touchLastUsed(accessKey.id, new Date())
      return { member, device, memberToken: minted.token }
    })

    const rooms = await this.repos.room.listByChannel({ channelId: channel.id, status: 'active' })
    const epochs = await this.repos.roomEpoch.listByRoomIds(rooms.map((room) => room.id))

    return {
      channel,
      member: result.member,
      device: result.device,
      rooms,
      epochs,
      memberToken: result.memberToken,
    }
  }

  async get(input: z.infer<typeof zChannelGetInput>): Promise<IdbChatv3Channel> {
    return getChannelOrThrow(this.db, input.channelId)
  }

  async list(input: z.infer<typeof zChannelListInput>): Promise<IdbChatv3Channel[]> {
    return this.repos.channel.list({
      tenantId: input.tenantId,
      spaceId: input.spaceId,
      status: input.status,
      limit: input.limit,
    })
  }

  async listMine(
    input: z.infer<typeof zChannelListMineInput>,
    principalUserId?: string | null
  ): Promise<Chatv3ChannelMineRow[]> {
    if (!principalUserId) throw unauthorized('verified authv2 principal required')

    const rowsByChannel = new Map<string, Chatv3ChannelMineRow>()
    const owned = await this.repos.channel.listByOwner({
      tenantId: input.tenantId,
      ownerUserId: principalUserId,
      spaceId: input.spaceId,
      status: input.status,
      limit: input.limit,
    })
    for (const channel of owned) {
      rowsByChannel.set(channel.id, {
        channel,
        membership: null,
        isOwner: true,
        canDelete: true,
        modeStatus: modeStatus(channel),
      })
    }

    const memberships = await this.repos.member.listByUser({
      tenantId: input.tenantId,
      userId: principalUserId,
      status: 'active',
      limit: input.limit,
    })
    for (const member of memberships) {
      let channel = rowsByChannel.get(member.channelId)?.channel ?? null
      channel ??= await this.repos.channel.byId(member.channelId)
      if (!channel) continue
      if (channel.tenantId !== input.tenantId) continue
      if (input.spaceId && channel.spaceId !== input.spaceId) continue
      if (input.status && channel.status !== input.status) continue
      const isOwner = channel.ownerUserId === principalUserId
      rowsByChannel.set(channel.id, {
        channel,
        membership: redactMember(member),
        isOwner,
        canDelete: isOwner,
        modeStatus: modeStatus(channel),
      })
    }

    return Array.from(rowsByChannel.values())
      .sort((a, b) => b.channel.updatedAt.getTime() - a.channel.updatedAt.getTime())
      .slice(0, input.limit)
  }

  async epochKeys(
    input: z.infer<typeof zChannelEpochKeysInput>,
    actor: IdbChatv3Member
  ): Promise<{ channelId: string; encryptionMode: string; keys: Chatv3ChannelEpochKeyRow[] }> {
    const channel = await getChannelOrThrow(this.db, input.channelId)
    if (channel.tenantId !== input.tenantId) throw notFound('channel')
    assertActive(channel.status, 'channel')
    if (actor.channelId !== channel.id) throw new Chatv3Error('forbidden', 'actor is not a member of this channel')
    if (actor.status !== 'active') throw unauthorized('membership is not active')
    if (channel.encryptionMode !== 'server-encrypted') {
      throw new Chatv3Error('forbidden', 'server-managed epoch keys are available only for server-encrypted channels')
    }

    const rooms = await this.repos.room.listByChannel({ channelId: channel.id, status: 'active' })
    const roomIds = new Set(rooms.map((room) => room.id))
    const epochs = await this.repos.roomEpoch.listByRoomIds([...roomIds])
    const keys = epochs
      .filter((epoch) => roomIds.has(epoch.roomId))
      .map((epoch) => {
        const rawEpochKey = unwrapServerManagedEpochKey({
          tenantId: channel.tenantId,
          spaceId: channel.spaceId,
          channelId: channel.id,
          roomId: epoch.roomId,
          epoch: epoch.epoch,
          wrappedKeyBlob: epoch.wrappedKeyBlob,
          kdfMeta: epoch.kdfMeta,
        })
        const keyId = typeof epoch.kdfMeta.keyId === 'string' ? epoch.kdfMeta.keyId : 'k1'
        return {
          roomId: epoch.roomId,
          epoch: epoch.epoch,
          cipherSuite: epoch.cipherSuite,
          rawEpochKey,
          keyId,
        }
      })
    return { channelId: channel.id, encryptionMode: channel.encryptionMode, keys }
  }

  async remintMemberToken(
    input: z.infer<typeof zMemberTokenRemintInput>,
    principalUserId?: string | null
  ): Promise<{ member: Chatv3MemberView; memberToken: string }> {
    if (!principalUserId) throw unauthorized('verified authv2 principal required')
    const channel = await getChannelOrThrow(this.db, input.channelId)
    if (channel.tenantId !== input.tenantId) throw notFound('channel')
    assertActive(channel.status, 'channel')
    if (channel.encryptionMode !== 'server-encrypted') {
      throw new Chatv3Error('forbidden', 'member token remint is available only for server-encrypted channels')
    }
    const memberships = await this.repos.member.listByUser({
      tenantId: input.tenantId,
      userId: principalUserId,
      status: 'active',
      limit: 500,
    })
    const member = memberships.find((candidate) => candidate.channelId === channel.id)
    if (!member) throw new Chatv3Error('forbidden', 'active principal-bound membership required')
    const minted = mintMemberToken(member.id)
    const updated = await this.repos.member.update(member.id, {
      tokenHash: minted.tokenHash,
      updatedAt: new Date(),
    })
    if (!updated) throw notFound('member')
    return { member: redactMember(updated), memberToken: minted.token }
  }

  async archive(
    input: z.infer<typeof zChannelArchiveInput>,
    actor: Chatv3AdminActor
  ): Promise<IdbChatv3Channel> {
    requireAdminAuthority(actor)
    assertAdminChannelAccess(actor, input.channelId)
    const channel = await this.repos.channel.archive(input.channelId, adminActorLabel(actor))
    if (!channel) throw notFound('channel')
    return channel
  }

  async unarchive(
    input: z.infer<typeof zChannelUnarchiveInput>,
    actor: Chatv3AdminActor
  ): Promise<IdbChatv3Channel> {
    requireAdminAuthority(actor)
    assertAdminChannelAccess(actor, input.channelId)
    const channel = await this.repos.channel.unarchive(input.channelId, adminActorLabel(actor))
    if (!channel) throw notFound('channel')
    return channel
  }

  /** Hard delete; FK cascades remove rooms/messages/members/keys/epochs. */
  async delete(input: z.infer<typeof zChannelDeleteInput>, actor: Chatv3AdminActor): Promise<{ deleted: true }> {
    const channel = await getChannelOrThrow(this.db, input.channelId)
    if (channel.tenantId !== input.tenantId) throw notFound('channel')
    requireChannelOwnerOrAdminAuthority(actor, channel)
    if (channel.slug !== input.confirmSlug) {
      throw new Chatv3Error('invalid_input', 'confirmSlug does not match channel slug')
    }
    await this.repos.channel.deleteById(channel.id)
    return { deleted: true }
  }

  async purgeBefore(
    input: z.infer<typeof zChannelPurgeBeforeInput>,
    actor: Chatv3AdminActor
  ): Promise<Chatv3ChannelPurgeBeforeResult> {
    requireAdminAuthority(actor)
    const before = new Date(input.beforeDate)
    const candidates = await this.repos.channel.listBeforeCreated({ tenantId: input.tenantId, before })
    if (input.dryRun) {
      return {
        beforeDate: before.toISOString(),
        dryRun: true,
        applied: false,
        candidateCount: candidates.length,
        deletedCount: 0,
        candidates,
      }
    }
    if (!input.confirm) {
      throw new Chatv3Error('invalid_input', 'confirm=true is required when dryRun=false')
    }
    for (const channel of candidates) {
      await this.repos.channel.deleteById(channel.id)
    }
    return {
      beforeDate: before.toISOString(),
      dryRun: false,
      applied: true,
      candidateCount: candidates.length,
      deletedCount: candidates.length,
      candidates,
    }
  }

  /**
   * Key rotation (admin): client generated a fresh accessSecret + wrapSecret
   * and re-wrapped a new epoch key per active room. One tx: all active access
   * keys revoked, the new verifier inserted, every listed room gets its next
   * epoch + currentEpoch bump. Removed members lose access from this epoch on
   * (v0 limit: pre-rotation history they captured stays readable — documented).
   */
  async rotate(
    input: z.infer<typeof zChannelRotateInput>,
    actor: Chatv3AdminActor
  ): Promise<{
    accessKey: IdbChatv3AccessKey
    epochs: IdbChatv3RoomEpoch[]
    revokedKeys: number
    staleKeyPackageCount: number
  }> {
    requireAdminAuthority(actor)
    assertAdminChannelAccess(actor, input.channelId)
    const channel = await getChannelOrThrow(this.db, input.channelId)
    assertActive(channel.status, 'channel')

    // Rotation must re-key EVERY active room of the channel, else a removed
    // member keeps reading any room left on its old epoch (issue ba3ccb2e).
    // The submitted room set must match the active set exactly — no missing,
    // no extras, no duplicates.
    const activeRoomIds = new Set(
      (await this.repos.room.listByChannel({ channelId: channel.id, status: 'active' })).map((r) => r.id)
    )
    const submitted = input.epochs.map((e) => e.roomId)
    const submittedSet = new Set(submitted)
    if (submittedSet.size !== submitted.length) {
      throw new Chatv3Error('invalid_input', 'rotation lists a room more than once')
    }
    for (const roomId of submittedSet) {
      if (!activeRoomIds.has(roomId)) {
        throw new Chatv3Error('invalid_input', `room ${roomId} is not an active room of this channel`)
      }
    }
    for (const roomId of activeRoomIds) {
      if (!submittedSet.has(roomId)) {
        throw new Chatv3Error(
          'invalid_input',
          `rotation must re-key every active room; missing epoch for room ${roomId}`
        )
      }
    }

    return withChatv3Tx(this.db, async (r) => {
      const now = new Date()
      const revokedKeys = await r.accessKey.revokeActiveForChannel(channel.id, now)
      const staleKeyPackageCount = await r.memberKeyPackage.markChannelStale({
        tenantId: channel.tenantId,
        channelId: channel.id,
        reason: 'channel-rotate',
        at: now,
      })
      const accessKey = await r.accessKey.insert({
        tenantId: channel.tenantId,
        channelId: channel.id,
        keyId: input.accessKey.keyId,
        verifierHash: input.accessKey.verifierHash,
        label: input.accessKey.label,
        epoch: input.epochs[0]!.epoch.epoch,
        createdBy: adminActorLabel(actor),
      })
      const epochs: IdbChatv3RoomEpoch[] = []
      for (const entry of input.epochs) {
        epochs.push(
          await r.roomEpoch.insert({
            tenantId: channel.tenantId,
            roomId: entry.roomId,
            epoch: entry.epoch.epoch,
            cipherSuite: entry.epoch.cipherSuite,
            wrappedKeyBlob: entry.epoch.wrappedKeyBlob,
            kdfMeta: entry.epoch.kdfMeta,
            createdBy: adminActorLabel(actor),
          })
        )
        await r.room.setCurrentEpoch(entry.roomId, entry.epoch.epoch, now)
      }
      return { accessKey, epochs, revokedKeys, staleKeyPackageCount }
    }).catch((error: unknown) => {
      throw mapUniqueViolation(error, 'access keyId or room epoch already exists')
    })
  }

  async listMembers(input: z.infer<typeof zMemberListInput>, actor: IdbChatv3Member): Promise<IdbChatv3Member[]> {
    if (actor.channelId !== input.channelId) {
      throw new Chatv3Error('forbidden', 'actor is not a member of this channel')
    }
    return this.repos.member.listByChannel({
      channelId: input.channelId,
      status: input.status,
      limit: input.limit,
    })
  }

  async updateMember(input: z.infer<typeof zMemberUpdateInput>, actor: IdbChatv3Member): Promise<IdbChatv3Member> {
    const target = await this.repos.member.byId(input.memberId)
    if (!target) throw notFound('member')
    if (target.channelId !== actor.channelId) {
      throw new Chatv3Error('forbidden', 'member is in another channel')
    }
    const selfLeave =
      target.id === actor.id &&
      input.status === 'removed' &&
      input.roleKey === undefined &&
      input.displayName === undefined
    if (!selfLeave) {
      requireAdminRole(actor)
    }
    const updated = await this.repos.member.update(input.memberId, {
      displayName: input.displayName ?? target.displayName,
      roleKey: input.roleKey ?? target.roleKey,
      status: input.status ?? target.status,
      removedAt: input.status === 'removed' ? new Date() : target.removedAt,
      updatedAt: new Date(),
    })
    return updated!
  }
}
