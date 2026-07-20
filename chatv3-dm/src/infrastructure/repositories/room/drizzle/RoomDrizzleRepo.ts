import { and, desc, eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3RoomTable, IdbChatv3Room } from '../../../db/drizzle.schema.index.js'
import { Chatv3RoomRepoPort } from '../../../../application/ports/repository-ports.js'

export class RoomDrizzleRepo implements Chatv3RoomRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3Room>): Promise<IdbChatv3Room> {
    const rows = await this.db
      .insert(chatv3RoomTable)
      .values(values as typeof chatv3RoomTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3Room | null> {
    const rows = await this.db.select().from(chatv3RoomTable).where(eq(chatv3RoomTable.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByChannel(filter: { channelId: string; status?: string; limit?: number }): Promise<IdbChatv3Room[]> {
    const conditions = [eq(chatv3RoomTable.channelId, filter.channelId)]
    if (filter.status) conditions.push(eq(chatv3RoomTable.status, filter.status))
    return this.db
      .select()
      .from(chatv3RoomTable)
      .where(and(...conditions))
      .orderBy(desc(chatv3RoomTable.lastMessageAt))
      .limit(filter.limit ?? 500)
  }

  async archive(id: string, updatedBy?: string): Promise<IdbChatv3Room | null> {
    const rows = await this.db
      .update(chatv3RoomTable)
      .set({ status: 'archived', archivedAt: new Date(), updatedBy, updatedAt: new Date() })
      .where(eq(chatv3RoomTable.id, id))
      .returning()
    return rows[0] ?? null
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(chatv3RoomTable).where(eq(chatv3RoomTable.id, id))
  }

  async lockLastSeq(id: string): Promise<number> {
    const rows = await this.db
      .select({ lastSeq: chatv3RoomTable.lastSeq })
      .from(chatv3RoomTable)
      .where(eq(chatv3RoomTable.id, id))
      .for('update')
    return rows[0]?.lastSeq ?? 0
  }

  async bumpSeq(id: string, seq: number, at: Date): Promise<void> {
    await this.db
      .update(chatv3RoomTable)
      .set({ lastSeq: seq, lastMessageAt: at, updatedAt: at })
      .where(eq(chatv3RoomTable.id, id))
  }

  async setCurrentEpoch(id: string, epoch: number, at: Date): Promise<void> {
    await this.db
      .update(chatv3RoomTable)
      .set({ currentEpoch: epoch, updatedAt: at })
      .where(eq(chatv3RoomTable.id, id))
  }
}
