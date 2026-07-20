import { and, eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3MemberKeyPackageTable, IdbChatv3MemberKeyPackage } from '../../../db/drizzle.schema.index.js'
import { Chatv3MemberKeyPackageRepoPort } from '../../../../application/ports/repository-ports.js'

export class MemberKeyPackageDrizzleRepo implements Chatv3MemberKeyPackageRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async upsert(values: Partial<IdbChatv3MemberKeyPackage>): Promise<IdbChatv3MemberKeyPackage> {
    const rows = await this.db
      .insert(chatv3MemberKeyPackageTable)
      .values(values as typeof chatv3MemberKeyPackageTable.$inferInsert)
      .onConflictDoUpdate({
        target: [
          chatv3MemberKeyPackageTable.tenantId,
          chatv3MemberKeyPackageTable.channelId,
          chatv3MemberKeyPackageTable.memberId,
        ],
        set: {
          recipientUserId: values.recipientUserId,
          recipientUserKeyId: values.recipientUserKeyId,
          recipientKeyVersion: values.recipientKeyVersion,
          packageVersion: values.packageVersion,
          packageAlg: values.packageAlg,
          ephemeralPublicKeyAlgorithm: values.ephemeralPublicKeyAlgorithm,
          ephemeralPublicKeyFormat: values.ephemeralPublicKeyFormat,
          ephemeralPublicKey: values.ephemeralPublicKey,
          nonce: values.nonce,
          ciphertext: values.ciphertext,
          aad: values.aad ?? null,
          authTag: values.authTag ?? null,
          sourceEpoch: values.sourceEpoch,
          status: values.status,
          staleReason: values.staleReason ?? null,
          updatedAt: values.updatedAt ?? new Date(),
        },
      })
      .returning()
    return rows[0]!
  }

  async byMember(filter: {
    tenantId: string
    channelId: string
    memberId: string
  }): Promise<IdbChatv3MemberKeyPackage | null> {
    const rows = await this.db
      .select()
      .from(chatv3MemberKeyPackageTable)
      .where(
        and(
          eq(chatv3MemberKeyPackageTable.tenantId, filter.tenantId),
          eq(chatv3MemberKeyPackageTable.channelId, filter.channelId),
          eq(chatv3MemberKeyPackageTable.memberId, filter.memberId)
        )
      )
      .limit(1)
    return rows[0] ?? null
  }

  async markChannelStale(filter: { tenantId: string; channelId: string; reason: string; at: Date }): Promise<number> {
    const rows = await this.db
      .update(chatv3MemberKeyPackageTable)
      .set({ status: 'stale', staleReason: filter.reason, updatedAt: filter.at })
      .where(
        and(
          eq(chatv3MemberKeyPackageTable.tenantId, filter.tenantId),
          eq(chatv3MemberKeyPackageTable.channelId, filter.channelId),
          eq(chatv3MemberKeyPackageTable.status, 'usable')
        )
      )
      .returning({ id: chatv3MemberKeyPackageTable.id })
    return rows.length
  }

  async markRecipientUserStale(filter: {
    tenantId: string
    recipientUserId: string
    reason: string
    at: Date
  }): Promise<number> {
    const rows = await this.db
      .update(chatv3MemberKeyPackageTable)
      .set({ status: 'stale', staleReason: filter.reason, updatedAt: filter.at })
      .where(
        and(
          eq(chatv3MemberKeyPackageTable.tenantId, filter.tenantId),
          eq(chatv3MemberKeyPackageTable.recipientUserId, filter.recipientUserId),
          eq(chatv3MemberKeyPackageTable.status, 'usable')
        )
      )
      .returning({ id: chatv3MemberKeyPackageTable.id })
    return rows.length
  }
}
