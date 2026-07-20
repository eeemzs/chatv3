import { and, eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3BindingTable, IdbChatv3Binding } from '../../../db/drizzle.schema.index.js'
import { Chatv3BindingRepoPort } from '../../../../application/ports/repository-ports.js'

export class BindingDrizzleRepo implements Chatv3BindingRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3Binding>): Promise<IdbChatv3Binding> {
    const rows = await this.db
      .insert(chatv3BindingTable)
      .values(values as typeof chatv3BindingTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3Binding | null> {
    const rows = await this.db.select().from(chatv3BindingTable).where(eq(chatv3BindingTable.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByChannel(filter: { channelId: string; roomId?: string }): Promise<IdbChatv3Binding[]> {
    const conditions = [eq(chatv3BindingTable.channelId, filter.channelId)]
    if (filter.roomId) conditions.push(eq(chatv3BindingTable.roomId, filter.roomId))
    return this.db
      .select()
      .from(chatv3BindingTable)
      .where(and(...conditions))
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(chatv3BindingTable).where(eq(chatv3BindingTable.id, id))
  }
}
