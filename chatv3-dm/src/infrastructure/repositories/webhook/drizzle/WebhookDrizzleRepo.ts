import { and, eq, sql } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3WebhookTable, IdbChatv3Webhook } from '../../../db/drizzle.schema.index.js'
import { Chatv3WebhookRepoPort } from '../../../../application/ports/repository-ports.js'

export class WebhookDrizzleRepo implements Chatv3WebhookRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3Webhook>): Promise<IdbChatv3Webhook> {
    const rows = await this.db
      .insert(chatv3WebhookTable)
      .values(values as typeof chatv3WebhookTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3Webhook | null> {
    const rows = await this.db.select().from(chatv3WebhookTable).where(eq(chatv3WebhookTable.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByChannel(channelId: string): Promise<IdbChatv3Webhook[]> {
    return this.db.select().from(chatv3WebhookTable).where(eq(chatv3WebhookTable.channelId, channelId))
  }

  async listActiveForChannel(channelId: string): Promise<IdbChatv3Webhook[]> {
    return this.db
      .select()
      .from(chatv3WebhookTable)
      .where(and(eq(chatv3WebhookTable.channelId, channelId), eq(chatv3WebhookTable.status, 'active')))
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(chatv3WebhookTable).where(eq(chatv3WebhookTable.id, id))
  }

  async recordDelivery(id: string, ok: boolean, at: Date): Promise<void> {
    await this.db
      .update(chatv3WebhookTable)
      .set(
        ok
          ? { lastDeliveryAt: at, failCount: 0, updatedAt: at }
          : { lastFailureAt: at, failCount: sql`${chatv3WebhookTable.failCount} + 1`, updatedAt: at }
      )
      .where(eq(chatv3WebhookTable.id, id))
  }
}
