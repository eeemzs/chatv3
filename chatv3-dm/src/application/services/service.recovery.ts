import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import {
  IdbChatv3Channel,
  IdbChatv3Member,
  IdbChatv3MemberKeyPackage,
  IdbChatv3UserKeyBackup,
} from '../../infrastructure/db/drizzle.schema.index.js'
import {
  zMemberKeyPackageGetInput,
  zMemberKeyPackagePutInput,
  zMemberRecoveryGetInput,
  zUserKeyGetInput,
  zUserKeyRegisterInput,
} from '../../domain/models/operations.js'
import { zRecoveryPolicy } from '../../domain/models/crypto.js'
import { Chatv3Error, conflict, forbidden, notFound, unauthorized } from '../errors.js'
import { mintMemberToken } from '../util.crypto.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos, withChatv3Tx } from '../factories/repository-factory.js'
import {
  Chatv3ScopedAdminAuthority,
  getChannelOrThrow,
  hasScopedAdminPermission,
} from './helpers.js'

type RecoveryPolicy = z.infer<typeof zRecoveryPolicy>

export type Chatv3UserKeyRegisterResult = {
  userKey: IdbChatv3UserKeyBackup
  rotated: boolean
  staleKeyPackageCount: number
}

export type Chatv3MemberRecoveryResult = {
  recoveryState: 'recoverable' | 'locked-needs-pin' | 'locked-needs-invite' | 'stale-needs-current-device'
  channel: IdbChatv3Channel
  member: Omit<IdbChatv3Member, 'tokenHash'> | null
  userKey: IdbChatv3UserKeyBackup | null
  keyPackage: IdbChatv3MemberKeyPackage | null
  /** Fresh member token is membership recovery only; it does not unlock content. */
  memberToken: string | null
}

function requirePrincipal(principalUserId?: string | null): string {
  if (!principalUserId) throw unauthorized('verified authv2 principal required')
  return principalUserId
}

function recoveryPolicy(env: NodeJS.ProcessEnv = process.env): RecoveryPolicy {
  const raw = String(env.CHATV3_RECOVERY_KEK_POLICY ?? 'pin').trim()
  return zRecoveryPolicy.catch('pin').parse(raw)
}

function assertKekSourceAllowed(policy: RecoveryPolicy, kekSource: string): void {
  const ok =
    policy === 'both' ||
    (policy === 'pin' && kekSource === 'chat-pin') ||
    (policy === 'password' && kekSource === 'password-kdf')
  if (!ok) {
    throw new Chatv3Error('invalid_input', `kekSource ${kekSource} is not allowed by recovery policy ${policy}`)
  }
}

function threatModelLabel(policy: RecoveryPolicy, kekSource: string): string {
  if (kekSource === 'password-kdf') {
    return `policy:${policy};kek:password-kdf;server-blind-opaque-backup`
  }
  return `policy:${policy};kek:chat-pin;server-blind-opaque-backup`
}

function samePublicKey(
  existing: IdbChatv3UserKeyBackup,
  input: z.infer<typeof zUserKeyRegisterInput>['publicKey']
): boolean {
  return (
    existing.publicKeyAlgorithm === input.algorithm &&
    existing.publicKeyFormat === input.format &&
    existing.publicKey === input.publicKey
  )
}

function userKeyValues(
  input: z.infer<typeof zUserKeyRegisterInput>,
  userId: string,
  keyVersion: number,
  policy: RecoveryPolicy,
  now: Date
): Partial<IdbChatv3UserKeyBackup> {
  const backup = input.privateKeyBackup
  return {
    tenantId: input.tenantId,
    userId,
    keyVersion,
    publicKeyAlgorithm: input.publicKey.algorithm,
    publicKeyFormat: input.publicKey.format,
    publicKey: input.publicKey.publicKey,
    backupPackageVersion: backup.packageVersion,
    kekSource: backup.kekSource,
    kdfName: backup.kdf.name,
    kdfVersion: backup.kdf.version,
    kdfSalt: backup.kdf.salt,
    kdfMemoryKiB: backup.kdf.memoryKiB ?? null,
    kdfIterations: backup.kdf.iterations,
    kdfParallelism: backup.kdf.parallelism,
    wrapAlg: backup.wrapAlg,
    nonce: backup.nonce,
    ciphertext: backup.ciphertext,
    aad: backup.aad ?? null,
    authTag: backup.authTag ?? null,
    // Client labels are intentionally ignored; the server derives this from policy.
    threatModelLabel: threatModelLabel(policy, backup.kekSource),
    status: 'active',
    updatedAt: now,
  }
}

function redactMember(member: IdbChatv3Member): Omit<IdbChatv3Member, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...safe } = member
  return safe
}

function canAccessMemberPackage(params: {
  channel: IdbChatv3Channel
  member: IdbChatv3Member
  principalUserId: string
  actor: Chatv3ScopedAdminAuthority | null
}): boolean {
  if (params.member.userId === params.principalUserId) return true
  if (params.channel.ownerUserId === params.principalUserId) return true
  return !!params.actor && hasScopedAdminPermission(params.actor.permissions)
}

export class Chatv3RecoveryService {
  private readonly repos: Chatv3Repos

  constructor(private readonly db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  async registerUserKey(
    input: z.infer<typeof zUserKeyRegisterInput>,
    principalUserId?: string | null
  ): Promise<Chatv3UserKeyRegisterResult> {
    const userId = requirePrincipal(principalUserId)
    const policy = recoveryPolicy()
    assertKekSourceAllowed(policy, input.privateKeyBackup.kekSource)

    return withChatv3Tx(this.db, async (r) => {
      const now = new Date()
      const existing = await r.userKeyBackup.byUser({ tenantId: input.tenantId, userId })
      if (!existing) {
        const userKey = await r.userKeyBackup.insert({
          ...userKeyValues(input, userId, input.keyVersion, policy, now),
          createdAt: now,
        })
        return { userKey, rotated: false, staleKeyPackageCount: 0 }
      }

      const rotated = !samePublicKey(existing, input.publicKey)
      const keyVersion = rotated ? existing.keyVersion + 1 : existing.keyVersion
      const userKey = await r.userKeyBackup.update(existing.id, userKeyValues(input, userId, keyVersion, policy, now))
      if (!userKey) throw notFound('user key backup')
      const staleKeyPackageCount = rotated
        ? await r.memberKeyPackage.markRecipientUserStale({
            tenantId: input.tenantId,
            recipientUserId: userId,
            reason: 'user-key-rotated',
            at: now,
          })
        : 0
      return { userKey, rotated, staleKeyPackageCount }
    })
  }

  async getUserKey(
    input: z.infer<typeof zUserKeyGetInput>,
    principalUserId?: string | null
  ): Promise<IdbChatv3UserKeyBackup | null> {
    const userId = requirePrincipal(principalUserId)
    return this.repos.userKeyBackup.byUser({ tenantId: input.tenantId, userId })
  }

  async putMemberKeyPackage(
    input: z.infer<typeof zMemberKeyPackagePutInput>,
    actor: Chatv3ScopedAdminAuthority | null,
    principalUserId?: string | null
  ): Promise<IdbChatv3MemberKeyPackage> {
    const userId = requirePrincipal(principalUserId)
    const channel = await getChannelOrThrow(this.db, input.channelId)
    if (channel.tenantId !== input.tenantId) throw notFound('channel')
    const member = await this.repos.member.byId(input.memberId)
    if (!member || member.channelId !== channel.id || member.status !== 'active') throw notFound('member')
    if (!member.userId) throw conflict('target member is not bound to an authv2 principal')
    if (!canAccessMemberPackage({ channel, member, principalUserId: userId, actor })) {
      throw forbidden('principal is not the member, channel owner, or ChatV3 scoped admin')
    }

    const userKey = await this.repos.userKeyBackup.byId(input.recipientUserKeyId)
    if (
      !userKey ||
      userKey.tenantId !== input.tenantId ||
      userKey.userId !== member.userId ||
      userKey.keyVersion !== input.recipientKeyVersion ||
      userKey.status !== 'active'
    ) {
      throw new Chatv3Error('invalid_input', 'recipient user key is not the current active key for this member')
    }

    const now = new Date()
    return this.repos.memberKeyPackage.upsert({
      tenantId: input.tenantId,
      channelId: input.channelId,
      memberId: input.memberId,
      recipientUserId: member.userId,
      recipientUserKeyId: userKey.id,
      recipientKeyVersion: userKey.keyVersion,
      packageVersion: input.envelope.packageVersion,
      packageAlg: input.envelope.packageAlg,
      ephemeralPublicKeyAlgorithm: input.envelope.ephemeralPublicKey.algorithm,
      ephemeralPublicKeyFormat: input.envelope.ephemeralPublicKey.format,
      ephemeralPublicKey: input.envelope.ephemeralPublicKey.publicKey,
      nonce: input.envelope.nonce,
      ciphertext: input.envelope.ciphertext,
      aad: input.envelope.aad ?? null,
      authTag: input.envelope.authTag ?? null,
      sourceEpoch: input.envelope.sourceEpoch,
      status: 'usable',
      staleReason: null,
      updatedAt: now,
    })
  }

  async getMemberKeyPackage(
    input: z.infer<typeof zMemberKeyPackageGetInput>,
    actor: Chatv3ScopedAdminAuthority | null,
    principalUserId?: string | null
  ): Promise<IdbChatv3MemberKeyPackage | null> {
    const userId = requirePrincipal(principalUserId)
    const channel = await getChannelOrThrow(this.db, input.channelId)
    if (channel.tenantId !== input.tenantId) throw notFound('channel')
    const member = await this.repos.member.byId(input.memberId)
    if (!member || member.channelId !== channel.id) throw notFound('member')
    if (!canAccessMemberPackage({ channel, member, principalUserId: userId, actor })) {
      throw forbidden('principal is not the member, channel owner, or ChatV3 scoped admin')
    }
    return this.repos.memberKeyPackage.byMember(input)
  }

  async getMemberRecovery(
    input: z.infer<typeof zMemberRecoveryGetInput>,
    principalUserId?: string | null
  ): Promise<Chatv3MemberRecoveryResult> {
    const userId = requirePrincipal(principalUserId)
    const channel = await getChannelOrThrow(this.db, input.channelId)
    if (channel.tenantId !== input.tenantId) throw notFound('channel')
    const userKey = await this.repos.userKeyBackup.byUser({ tenantId: input.tenantId, userId })
    const memberships = await this.repos.member.listByUser({
      tenantId: input.tenantId,
      userId,
      status: 'active',
      limit: 500,
    })
    const member = memberships.find((row) => row.channelId === input.channelId) ?? null
    if (!member) {
      return { recoveryState: 'locked-needs-invite', channel, member: null, userKey, keyPackage: null, memberToken: null }
    }

    const keyPackage = await this.repos.memberKeyPackage.byMember({
      tenantId: input.tenantId,
      channelId: input.channelId,
      memberId: member.id,
    })
    const recoveryState =
      !userKey ? 'locked-needs-invite' : !keyPackage ? 'locked-needs-invite' : keyPackage.status === 'stale'
        ? 'stale-needs-current-device'
        : 'recoverable'

    // Recovery status polling must not invalidate other devices. A fresh
    // member token is minted only on explicit request from a client that has
    // lost its local member token; this still recovers membership only, not
    // encrypted content access.
    const minted = input.mintToken ? mintMemberToken(member.id) : null
    const recoveredMember = minted
      ? await this.repos.member.update(member.id, {
          tokenHash: minted.tokenHash,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
      : member
    if (!recoveredMember) throw notFound('member')

    return {
      recoveryState,
      channel,
      member: redactMember(recoveredMember),
      userKey,
      keyPackage,
      memberToken: minted?.token ?? null,
    }
  }
}
