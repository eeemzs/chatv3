import { and, eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3AccessKeyTable, IdbChatv3AccessKey } from '../../../db/drizzle.schema.index.js'
import { Chatv3AccessKeyRepoPort } from '../../../../application/ports/repository-ports.js'

export class AccessKeyDrizzleRepo implements Chatv3AccessKeyRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3AccessKey>): Promise<IdbChatv3AccessKey> {
    const rows = await this.db
      .insert(chatv3AccessKeyTable)
      .values(values as typeof chatv3AccessKeyTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byTenantKeyId(tenantId: string, keyId: string): Promise<IdbChatv3AccessKey | null> {
    const rows = await this.db
      .select()
      .from(chatv3AccessKeyTable)
      .where(and(eq(chatv3AccessKeyTable.tenantId, tenantId), eq(chatv3AccessKeyTable.keyId, keyId)))
      .limit(1)
    return rows[0] ?? null
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.db.update(chatv3AccessKeyTable).set({ lastUsedAt: at }).where(eq(chatv3AccessKeyTable.id, id))
  }

  async revokeActiveForChannel(channelId: string, at: Date): Promise<number> {
    const rows = await this.db
      .update(chatv3AccessKeyTable)
      .set({ status: 'revoked', revokedAt: at })
      .where(and(eq(chatv3AccessKeyTable.channelId, channelId), eq(chatv3AccessKeyTable.status, 'active')))
      .returning({ id: chatv3AccessKeyTable.id })
    return rows.length
  }
}
