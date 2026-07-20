import {
  decryptText,
  deriveKek,
  encryptText,
  EpochSaltParts,
  generateAccessSecret,
  generateEpochKey,
  generateKeyId,
  generateWrapSecret,
  importEpochKey,
  sha256Hex,
  unwrapEpochKey,
  V0_CIPHER_SUITE,
  V0_KDF_META,
  wrapEpochKey,
} from './crypto.js'
import { Chatv3Http, Chatv3HttpOptions } from './http.js'
import { buildInvite, Chatv3Invite, parseInvite } from './invite.js'
import { Chatv3KeyStore, MemoryKeyStore } from './keystore.js'

export type Space = {
  id: string
  tenantId: string
  slug: string
  title: string
  description: string | null
  externalRefs: Array<Record<string, unknown>>
  status: string
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

type SpaceRow = Pick<Space, 'id' | 'tenantId' | 'slug'>
type ChannelRow = { id: string; tenantId: string; spaceId: string; slug: string; title?: string; purpose?: string | null; guidanceMarkdown?: string | null; encryptionMode?: ChannelEncryptionMode }
type RoomRow = { id: string; tenantId?: string; channelId?: string; slug: string; title: string; currentEpoch: number; purpose?: string | null; guidanceMarkdown?: string | null }
type EpochRow = { roomId: string; epoch: number; wrappedKeyBlob: string }
export type ServerEpochKeyRow = { roomId: string; epoch: number; cipherSuite?: string; rawEpochKey: string; keyId?: string }
export type ChannelEpochKeysResult = { channelId: string; encryptionMode: ChannelEncryptionMode; keys: ServerEpochKeyRow[] }
type MessageRow = {
  seq: number
  kind: string
  epoch: number
  ciphertext: string
  nonce: string
  senderMemberId: string
  createdAt: string
}

export type DecryptedMessage = Omit<MessageRow, 'ciphertext' | 'nonce'> & { text: string }

// ── F2a read/lifecycle view types (member identity, presence, receipts, channel/room) ──
// Field shapes mirror the chatv3 handler results post-envelope-unwrap. `tokenHash`
// from member rows is intentionally NOT modelled — the SDK never exposes it.

export type ChannelMember = {
  id: string
  tenantId: string
  channelId: string
  handle: string
  displayName: string | null
  actorKind: string
  roleKey: string
  status: string
  joinedViaKeyId: string | null
  lastSeenAt: string | null
  joinedAt: string
  removedAt: string | null
  updatedAt: string
}

export type PresenceState = 'active' | 'idle' | 'working' | 'reviewing' | 'blocked' | 'offline'

export type PresenceEntry = {
  memberId: string
  state: string
  note: string | null
  updatedAt: string
  expired: boolean
}

export type Receipt = {
  memberId: string
  handle: string
  roleKey: string
  actorKind: string
  lastReadSeq: number
  deliveredSeq: number
  ackSeq: number
  lastReadAt: string | null
}

export type ChatBinding = {
  id: string
  tenantId: string
  channelId: string
  roomId: string | null
  bindingType: string
  refId: string | null
  uri: string | null
  title: string | null
  note: string | null
  createdBy: string | null
  createdAt: string
}

export type Channel = {
  id: string
  tenantId: string
  spaceId: string
  slug: string
  title: string
  purpose: string | null
  guidanceMarkdown: string | null
  encryptionMode: ChannelEncryptionMode
  status: string
  generalRoomId: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type ChannelEncryptionMode = 'e2e' | 'server-encrypted'

export type ChannelMineRow = {
  channel: Channel
  membership: (ChannelMember & { userId?: string | null }) | null
  isOwner: boolean
  canDelete: boolean
  modeStatus: {
    encryptionMode: ChannelEncryptionMode
    epochKeyAccess: 'client-managed' | 'server-managed'
  }
}

export type ChannelPurgeBeforeResult = {
  beforeDate: string
  dryRun: boolean
  applied: boolean
  candidateCount: number
  deletedCount: number
  candidates: Channel[]
}

export type UserKeyBackup = {
  id: string
  tenantId: string
  userId: string
  keyVersion: number
  publicKeyAlgorithm: string
  publicKeyFormat: string
  publicKey: string
  backupPackageVersion: number
  kekSource: string
  kdfName: string
  kdfVersion: number
  kdfSalt: string
  kdfMemoryKiB: number | null
  kdfIterations: number
  kdfParallelism: number
  wrapAlg: string
  nonce: string
  ciphertext: string
  aad: string | null
  authTag: string | null
  threatModelLabel: string
  status: string
  createdAt: string
  updatedAt: string
}

export type UserKeyRegisterInput = {
  tenantId?: string
  keyVersion?: number
  publicKey: {
    algorithm?: 'p256-ecdh' | 'x25519'
    format?: 'spki' | 'raw' | 'jwk'
    publicKey: string
  }
  privateKeyBackup: {
    packageVersion?: number
    kekSource: 'chat-pin' | 'password-kdf'
    kdf: {
      name?: 'argon2id' | 'pbkdf2-sha256'
      version?: number
      salt: string
      memoryKiB?: number
      iterations: number
      parallelism?: number
    }
    wrapAlg?: 'aes-256-gcm'
    nonce: string
    ciphertext: string
    aad?: string
    authTag?: string
    threatModelLabel?: string
  }
}

export type UserKeyRegisterResult = {
  userKey: UserKeyBackup
  rotated: boolean
  staleKeyPackageCount: number
}

export type MemberKeyPackage = {
  id: string
  tenantId: string
  channelId: string
  memberId: string
  recipientUserId: string
  recipientUserKeyId: string
  recipientKeyVersion: number
  packageVersion: number
  packageAlg: string
  ephemeralPublicKeyAlgorithm: string
  ephemeralPublicKeyFormat: string
  ephemeralPublicKey: string
  nonce: string
  ciphertext: string
  aad: string | null
  authTag: string | null
  sourceEpoch: number
  status: string
  staleReason: string | null
  createdAt: string
  updatedAt: string
}

export type MemberRecoveryState =
  | 'recoverable'
  | 'locked-needs-pin'
  | 'locked-needs-invite'
  | 'stale-needs-current-device'

export type MemberRecoveryResult = {
  recoveryState: MemberRecoveryState
  channel: Channel
  member: (ChannelMember & { userId?: string | null }) | null
  userKey: UserKeyBackup | null
  keyPackage: MemberKeyPackage | null
  memberToken: string | null
}

export type Room = {
  id: string
  tenantId: string
  channelId: string
  slug: string
  title: string
  kind: string
  purpose: string | null
  guidanceMarkdown: string | null
  status: string
  lastSeq: number
  lastMessageAt: string | null
  currentEpoch: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type RoomCursor = {
  id: string
  tenantId: string
  roomId: string
  memberId: string
  lastReadSeq: number
  deliveredSeq: number
  ackSeq: number
  lastReadAt: string | null
  updatedAt: string
}

export type Chatv3ClientOptions = Chatv3HttpOptions & {
  keyStore?: Chatv3KeyStore
}

/**
 * High-level ChatV3 client: ties the REST transport, the v0 client crypto and
 * a KeyStore together so callers work in plaintext while the wire stays
 * server-blind. One instance is scoped to one channel after create/join.
 */
export class Chatv3Client {
  readonly http: Chatv3Http
  private readonly keyStore: Chatv3KeyStore
  private readonly serverBaseUrl: string
  private keyIdByChannel = new Map<string, string>()
  /** per-channel memberId→member cache for sender-identity resolution (consensus §9). */
  private memberCacheByChannel = new Map<string, Map<string, ChannelMember>>()

  constructor(options: Chatv3ClientOptions) {
    this.http = new Chatv3Http(options)
    this.keyStore = options.keyStore ?? new MemoryKeyStore()
    this.serverBaseUrl = options.serverBaseUrl.replace(/\/$/, '')
  }

  /**
   * Restore channel-level crypto hints from an invite that the app persisted
   * locally. Room epoch keys still stay per-room; this only rehydrates the
   * channel key id + wrap secret that createRoom needs after a page reload.
   */
  async rememberChannelInvite(invite: string | Chatv3Invite): Promise<Chatv3Invite> {
    const parsed = typeof invite === 'string' ? parseInvite(invite) : invite
    this.keyIdByChannel.set(parsed.channelId, parsed.keyId)
    if (parsed.mode !== 'server-encrypted') {
      await this.keyStore.setWrapSecret(parsed.channelId, parsed.wrapSecret)
    }
    return parsed
  }

  /** Resolve-or-create: safe to call on every app start with a fixed slug. */
  async ensureSpace(slug: string, title: string): Promise<SpaceRow> {
    return this.http.post<SpaceRow>('/spaces/ensure', { slug, title })
  }

  /** Admin metadata read: lists spaces only with AuthV2 scoped-admin authority. */
  async listSpaces(
    opts: { tenantId?: string; status?: 'active' | 'archived'; limit?: number } = {},
  ): Promise<Space[]> {
    const q = new URLSearchParams()
    if (opts.tenantId) q.set('tenantId', opts.tenantId)
    if (opts.status) q.set('status', opts.status)
    if (opts.limit != null) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return this.http.get<Space[]>(`/spaces${qs ? `?${qs}` : ''}`)
  }

  /** Admin metadata write: archive a space; encrypted channel/room content remains unreadable. */
  async archiveSpace(spaceId: string, opts: { tenantId?: string; updatedBy?: string } = {}): Promise<Space> {
    return this.http.post<Space>(`/spaces/${spaceId}/archive`, { ...opts })
  }

  /**
   * Create a channel: generate accessSecret + wrapSecret + epoch key locally,
   * wrap the epoch key with KEK=HKDF(wrapSecret, salt incl. keyId) BEFORE the
   * call (keyId is known upfront, so no chicken-and-egg with channelId), post
   * only derived material, keep the member token. Returns a shareable invite.
   */
  async createChannel(params: {
    space: SpaceRow
    slug: string
    title: string
    handle: string
    encryptionMode?: ChannelEncryptionMode
    purpose?: string
    guidanceMarkdown?: string
    generalRoomGuidanceMarkdown?: string
  }): Promise<{ channel: ChannelRow; generalRoom: RoomRow; invite: string }> {
    const accessSecret = generateAccessSecret()
    const keyId = generateKeyId()
    const epoch = 1
    const encryptionMode = params.encryptionMode ?? 'e2e'

    let wrapSecret: string | undefined
    let epochKey: CryptoKey | undefined
    let epochInput: { epoch: number; cipherSuite: string; wrappedKeyBlob: string; kdfMeta: typeof V0_KDF_META } | undefined
    if (encryptionMode === 'e2e') {
      wrapSecret = generateWrapSecret()
      const saltParts: EpochSaltParts = {
        tenantId: params.space.tenantId,
        spaceId: params.space.id,
        keyId,
        epoch,
      }
      // The fresh key must be extractable for wrapKey, but only a NON-extractable
      // re-import is kept and persisted (issue 8a342df1): unwrap the just-wrapped
      // blob — which also round-trip-proves the exact blob a joiner will receive.
      const wrappableEpochKey = await generateEpochKey()
      const kek = await deriveKek(wrapSecret, saltParts)
      const wrappedKeyBlob = await wrapEpochKey(kek, wrappableEpochKey)
      epochKey = await unwrapEpochKey(kek, wrappedKeyBlob)
      epochInput = { epoch, cipherSuite: V0_CIPHER_SUITE, wrappedKeyBlob, kdfMeta: { ...V0_KDF_META } }
    }

    const created = await this.http.post<{
      channel: ChannelRow
      generalRoom: RoomRow
      memberToken: string
      serverEpochKey?: string
    }>('/channels', {
      tenantId: params.space.tenantId,
      spaceId: params.space.id,
      slug: params.slug,
      title: params.title,
      ...(params.purpose ? { purpose: params.purpose } : {}),
      ...(params.guidanceMarkdown ? { guidanceMarkdown: params.guidanceMarkdown } : {}),
      ...(params.generalRoomGuidanceMarkdown ? { generalRoomGuidanceMarkdown: params.generalRoomGuidanceMarkdown } : {}),
      encryptionMode,
      accessKey: { keyId, verifierHash: await sha256Hex(accessSecret) },
      ...(epochInput ? { epoch: epochInput } : {}),
      creator: { handle: params.handle, actorKind: 'agent' },
    })

    this.http.memberToken = created.memberToken
    this.keyIdByChannel.set(created.channel.id, keyId)
    if (encryptionMode === 'server-encrypted') {
      if (!created.serverEpochKey) throw new Error('server-encrypted channel create did not return serverEpochKey')
      await this.keyStore.setEpochKey(created.generalRoom.id, epoch, await importEpochKey(created.serverEpochKey))
    } else {
      await this.keyStore.setWrapSecret(created.channel.id, wrapSecret!)
      await this.keyStore.setEpochKey(created.generalRoom.id, epoch, epochKey!)
    }

    const invite = encryptionMode === 'server-encrypted'
      ? buildInvite({ mode: 'server-encrypted', serverBaseUrl: this.serverBaseUrl, channelId: created.channel.id, keyId, accessSecret })
      : buildInvite({ mode: 'e2e', serverBaseUrl: this.serverBaseUrl, channelId: created.channel.id, keyId, accessSecret, wrapSecret: wrapSecret! })
    return { channel: created.channel, generalRoom: created.generalRoom, invite }
  }

  private async importServerEpochKeys(keys: ServerEpochKeyRow[]): Promise<void> {
    for (const epoch of keys) {
      await this.keyStore.setEpochKey(epoch.roomId, epoch.epoch, await importEpochKey(epoch.rawEpochKey))
    }
  }

  /** Join from an invite string: verify access, then import e2e or server-managed epoch keys. */
  async joinFromInvite(invite: string | Chatv3Invite, handle: string): Promise<{ rooms: RoomRow[]; epochKeys?: ServerEpochKeyRow[] }> {
    const parsed = typeof invite === 'string' ? parseInvite(invite) : invite
    const joined = await this.http.post<{
      channel: ChannelRow
      rooms: RoomRow[]
      epochs: EpochRow[]
      memberToken: string
    }>(`/channels/${parsed.channelId}/join`, {
      keyId: parsed.keyId,
      accessSecret: parsed.accessSecret,
      handle,
      actorKind: 'agent',
    })
    this.http.memberToken = joined.memberToken
    this.keyIdByChannel.set(joined.channel.id, parsed.keyId)
    const encryptionMode = joined.channel.encryptionMode ?? parsed.mode ?? 'e2e'
    if (parsed.mode === 'server-encrypted' || encryptionMode === 'server-encrypted') {
      const result = await this.epochKeys(joined.channel.id, { tenantId: joined.channel.tenantId })
      await this.importServerEpochKeys(result.keys)
      return { rooms: joined.rooms, epochKeys: result.keys }
    }

    await this.keyStore.setWrapSecret(joined.channel.id, parsed.wrapSecret)
    for (const epoch of joined.epochs) {
      const kek = await deriveKek(parsed.wrapSecret, {
        tenantId: joined.channel.tenantId,
        spaceId: joined.channel.spaceId,
        keyId: parsed.keyId,
        epoch: epoch.epoch,
      })
      const epochKey = await unwrapEpochKey(kek, epoch.wrappedKeyBlob)
      await this.keyStore.setEpochKey(epoch.roomId, epoch.epoch, epochKey)
    }
    return { rooms: joined.rooms }
  }

  async epochKeys(channelId: string, opts: { tenantId?: string } = {}): Promise<ChannelEpochKeysResult> {
    const q = new URLSearchParams()
    if (opts.tenantId) q.set('tenantId', opts.tenantId)
    const qs = q.toString()
    return this.http.get<ChannelEpochKeysResult>(`/channels/${channelId}/epoch-keys${qs ? `?${qs}` : ''}`)
  }

  async remintMemberToken(channelId: string, opts: { tenantId?: string } = {}): Promise<{ member: ChannelMember; memberToken: string }> {
    const result = await this.http.post<{ member: ChannelMember; memberToken: string }>(
      `/channels/${channelId}/members/me/token`,
      { channelId, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    )
    this.http.memberToken = result.memberToken
    return result
  }

  async sendText(room: RoomRow, text: string, kind = 'message'): Promise<{ seq: number }> {
    const epochKey = await this.keyStore.getEpochKey(room.id, room.currentEpoch)
    if (!epochKey) throw new Error(`no epoch key for room ${room.id} epoch ${room.currentEpoch}`)
    const envelope = await encryptText(epochKey, room.currentEpoch, text)
    const res = await this.http.post<{ message: { seq: number } }>(`/rooms/${room.id}/messages`, { kind, envelope })
    return { seq: res.message.seq }
  }

  /** Pull then decrypt on the client — the server never sees plaintext.
   *  `afterSeq` pages forward (pass the last seq received); optional `limit` caps the page. */
  async readText(room: RoomRow, afterSeq = 0, limit?: number): Promise<DecryptedMessage[]> {
    const q = new URLSearchParams({ afterSeq: String(afterSeq) })
    if (limit != null) q.set('limit', String(limit))
    const messages = await this.http.get<MessageRow[]>(`/rooms/${room.id}/messages?${q.toString()}`)
    const out: DecryptedMessage[] = []
    for (const m of messages) {
      const epochKey = await this.keyStore.getEpochKey(room.id, m.epoch)
      const { ciphertext, nonce, ...rest } = m
      out.push({ ...rest, text: epochKey ? await decryptText(epochKey, { ciphertext, nonce }) : '[locked]' })
    }
    return out
  }

  // ── members (+ per-channel cache for sender identity, consensus §9) ──────────────

  /**
   * List channel members and refresh the per-channel cache. The server returns
   * `tokenHash` unprojected; the SDK drops it so it never reaches callers.
   */
  async listMembers(
    channelId: string,
    opts: { status?: 'active' | 'removed'; limit?: number } = {},
  ): Promise<ChannelMember[]> {
    const q = new URLSearchParams()
    if (opts.status) q.set('status', opts.status)
    if (opts.limit != null) q.set('limit', String(opts.limit))
    const qs = q.toString()
    const rows = await this.http.get<(ChannelMember & { tokenHash?: string })[]>(
      `/channels/${channelId}/members${qs ? `?${qs}` : ''}`,
    )
    const members = rows.map(({ tokenHash: _omit, ...m }) => m as ChannelMember)
    this.memberCacheByChannel.set(channelId, new Map(members.map((m) => [m.id, m])))
    return members
  }

  async updateMember(
    memberId: string,
    opts: { displayName?: string | null; roleKey?: string; status?: 'active' | 'removed' },
  ): Promise<ChannelMember> {
    return this.http.request<ChannelMember>('PATCH', `/members/${memberId}`, {
      ...(opts.displayName !== undefined ? { displayName: opts.displayName ?? undefined } : {}),
      ...(opts.roleKey ? { roleKey: opts.roleKey } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    })
  }

  /** Resolve a member from the cache populated by listMembers (sync, no fetch). */
  resolveMember(channelId: string, memberId: string): ChannelMember | undefined {
    return this.memberCacheByChannel.get(channelId)?.get(memberId)
  }

  // ── presence ─────────────────────────────────────────────────────────────────────

  async listPresence(roomId: string): Promise<PresenceEntry[]> {
    return this.http.get<PresenceEntry[]>(`/rooms/${roomId}/presence`)
  }

  async setPresence(
    roomId: string,
    opts: { state?: PresenceState; note?: string; ttlSec?: number } = {},
  ): Promise<PresenceEntry> {
    return this.http.post<PresenceEntry>(`/rooms/${roomId}/presence`, { ...opts })
  }

  // ── receipts + cursors ─────────────────────────────────────────────────────────────

  async getReceipts(roomId: string): Promise<Receipt[]> {
    return this.http.get<Receipt[]>(`/rooms/${roomId}/receipts`)
  }

  // ── loose external refs / bindings ───────────────────────────────────────────────

  async listBindings(channelId: string, opts: { roomId?: string } = {}): Promise<ChatBinding[]> {
    const q = new URLSearchParams()
    if (opts.roomId) q.set('roomId', opts.roomId)
    const qs = q.toString()
    return this.http.get<ChatBinding[]>(`/channels/${channelId}/bindings${qs ? `?${qs}` : ''}`)
  }

  async markRead(roomId: string, lastReadSeq: number): Promise<RoomCursor> {
    return this.http.post<RoomCursor>(`/rooms/${roomId}/read`, { lastReadSeq })
  }

  async markDelivered(roomId: string, deliveredSeq: number): Promise<RoomCursor> {
    return this.http.post<RoomCursor>(`/rooms/${roomId}/delivered`, { deliveredSeq })
  }

  async ackDirective(roomId: string, ackSeq: number): Promise<RoomCursor> {
    return this.http.post<RoomCursor>(`/rooms/${roomId}/ack`, { ackSeq })
  }

  // ── channel / room listing + lifecycle ─────────────────────────────────────────────

  async getChannel(channelId: string): Promise<Channel> {
    return this.http.get<Channel>(`/channels/${channelId}`)
  }

  async createRoom(params: {
    channel: Pick<Channel, 'id' | 'tenantId' | 'spaceId'> & { encryptionMode?: ChannelEncryptionMode }
    slug: string
    title: string
    purpose?: string
    guidanceMarkdown?: string
    kind?: 'session' | 'task'
  }): Promise<Room> {
    if (params.channel.encryptionMode === 'server-encrypted') {
      const created = await this.http.post<{ room: Room; epoch: EpochRow; serverEpochKey?: string }>(`/channels/${params.channel.id}/rooms`, {
        channelId: params.channel.id,
        slug: params.slug,
        title: params.title,
        kind: params.kind ?? 'session',
        ...(params.purpose ? { purpose: params.purpose } : {}),
        ...(params.guidanceMarkdown ? { guidanceMarkdown: params.guidanceMarkdown } : {}),
      })
      if (!created.serverEpochKey) throw new Error('server-encrypted room create did not return serverEpochKey')
      await this.keyStore.setEpochKey(created.room.id, created.room.currentEpoch, await importEpochKey(created.serverEpochKey))
      return created.room
    }

    const keyId = this.keyIdByChannel.get(params.channel.id)
    const wrapSecret = await this.keyStore.getWrapSecret(params.channel.id)
    if (!keyId || !wrapSecret) throw new Error(`no channel crypto material for ${params.channel.id}`)

    const epoch = 1
    const wrappableEpochKey = await generateEpochKey()
    const kek = await deriveKek(wrapSecret, {
      tenantId: params.channel.tenantId,
      spaceId: params.channel.spaceId,
      keyId,
      epoch,
    })
    const wrappedKeyBlob = await wrapEpochKey(kek, wrappableEpochKey)
    const epochKey = await unwrapEpochKey(kek, wrappedKeyBlob)

    const created = await this.http.post<{ room: Room; epoch: EpochRow }>(`/channels/${params.channel.id}/rooms`, {
      channelId: params.channel.id,
      slug: params.slug,
      title: params.title,
      kind: params.kind ?? 'session',
      ...(params.purpose ? { purpose: params.purpose } : {}),
      ...(params.guidanceMarkdown ? { guidanceMarkdown: params.guidanceMarkdown } : {}),
      epoch: { epoch, cipherSuite: V0_CIPHER_SUITE, wrappedKeyBlob, kdfMeta: { ...V0_KDF_META } },
    })
    await this.keyStore.setEpochKey(created.room.id, epoch, epochKey)
    return created.room
  }

  async listChannels(
    opts: { tenantId?: string; spaceId?: string; status?: 'active' | 'archived'; limit?: number } = {},
  ): Promise<Channel[]> {
    const q = new URLSearchParams()
    if (opts.tenantId) q.set('tenantId', opts.tenantId)
    if (opts.spaceId) q.set('spaceId', opts.spaceId)
    if (opts.status) q.set('status', opts.status)
    if (opts.limit != null) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return this.http.get<Channel[]>(`/channels${qs ? `?${qs}` : ''}`)
  }

  async listMyChannels(
    opts: { tenantId?: string; spaceId?: string; status?: 'active' | 'archived'; limit?: number } = {},
  ): Promise<ChannelMineRow[]> {
    const q = new URLSearchParams()
    if (opts.tenantId) q.set('tenantId', opts.tenantId)
    if (opts.spaceId) q.set('spaceId', opts.spaceId)
    if (opts.status) q.set('status', opts.status)
    if (opts.limit != null) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return this.http.get<ChannelMineRow[]>(`/channels/mine${qs ? `?${qs}` : ''}`)
  }

  async purgeChannelsBefore(params: {
    beforeDate: string
    tenantId?: string
    dryRun?: boolean
    confirm?: boolean
  }): Promise<ChannelPurgeBeforeResult> {
    return this.http.post<ChannelPurgeBeforeResult>('/channels/purge-before', {
      beforeDate: params.beforeDate,
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      ...(params.dryRun !== undefined ? { dryRun: params.dryRun } : {}),
      ...(params.confirm !== undefined ? { confirm: params.confirm } : {}),
    })
  }

  async registerUserKey(params: UserKeyRegisterInput): Promise<UserKeyRegisterResult> {
    return this.http.post<UserKeyRegisterResult>('/users/me/key-backup', params)
  }

  async getUserKey(opts: { tenantId?: string } = {}): Promise<UserKeyBackup | null> {
    const q = new URLSearchParams()
    if (opts.tenantId) q.set('tenantId', opts.tenantId)
    const qs = q.toString()
    return this.http.get<UserKeyBackup | null>(`/users/me/key-backup${qs ? `?${qs}` : ''}`)
  }

  async putMemberKeyPackage(params: {
    tenantId?: string
    channelId: string
    memberId: string
    recipientUserKeyId: string
    recipientKeyVersion: number
    envelope: {
      packageVersion?: number
      packageAlg?: 'p256-ecdh+a256gcm' | 'x25519+a256gcm'
      ephemeralPublicKey: {
        algorithm?: 'p256-ecdh' | 'x25519'
        format?: 'spki' | 'raw' | 'jwk'
        publicKey: string
      }
      nonce: string
      ciphertext: string
      aad?: string
      authTag?: string
      sourceEpoch?: number
    }
  }): Promise<MemberKeyPackage> {
    return this.http.request<MemberKeyPackage>('PUT', `/channels/${params.channelId}/members/${params.memberId}/key-package`, {
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      recipientUserKeyId: params.recipientUserKeyId,
      recipientKeyVersion: params.recipientKeyVersion,
      envelope: params.envelope,
    })
  }

  async getMemberKeyPackage(params: {
    tenantId?: string
    channelId: string
    memberId: string
  }): Promise<MemberKeyPackage | null> {
    const q = new URLSearchParams()
    if (params.tenantId) q.set('tenantId', params.tenantId)
    const qs = q.toString()
    return this.http.get<MemberKeyPackage | null>(
      `/channels/${params.channelId}/members/${params.memberId}/key-package${qs ? `?${qs}` : ''}`,
    )
  }

  async getMemberRecovery(params: { tenantId?: string; channelId: string; mintToken?: boolean }): Promise<MemberRecoveryResult> {
    const q = new URLSearchParams()
    if (params.tenantId) q.set('tenantId', params.tenantId)
    if (params.mintToken !== undefined) q.set('mintToken', String(params.mintToken))
    const qs = q.toString()
    return this.http.get<MemberRecoveryResult>(`/channels/${params.channelId}/recovery${qs ? `?${qs}` : ''}`)
  }

  /** Archive a channel (admin: owner/operator role on that channel). */
  async archiveChannel(channelId: string, opts: { tenantId?: string; updatedBy?: string } = {}): Promise<Channel> {
    return this.http.post<Channel>(`/channels/${channelId}/archive`, { ...opts })
  }

  /** Restore an archived channel to active (admin: owner/operator role on that channel). */
  async unarchiveChannel(channelId: string, opts: { tenantId?: string; updatedBy?: string } = {}): Promise<Channel> {
    return this.http.post<Channel>(`/channels/${channelId}/unarchive`, { ...opts })
  }

  /** Hard-delete a channel (admin + confirmSlug must equal the channel slug). */
  async deleteChannel(channelId: string, params: { confirmSlug: string; tenantId?: string }): Promise<{ deleted: true }> {
    return this.http.request<{ deleted: true }>('DELETE', `/channels/${channelId}`, {
      confirmSlug: params.confirmSlug,
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    })
  }

  async listRooms(channelId: string, opts: { status?: 'active' | 'archived'; limit?: number } = {}): Promise<Room[]> {
    const q = new URLSearchParams()
    if (opts.status) q.set('status', opts.status)
    if (opts.limit != null) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return this.http.get<Room[]>(`/channels/${channelId}/rooms${qs ? `?${qs}` : ''}`)
  }

  async archiveRoom(roomId: string): Promise<Room> {
    return this.http.post<Room>(`/rooms/${roomId}/archive`, {})
  }

  /** Hard-delete a room (admin + confirmSlug; the general room cannot be deleted). */
  async deleteRoom(roomId: string, params: { confirmSlug: string }): Promise<{ deleted: true }> {
    return this.http.request<{ deleted: true }>('DELETE', `/rooms/${roomId}`, { confirmSlug: params.confirmSlug })
  }
}
