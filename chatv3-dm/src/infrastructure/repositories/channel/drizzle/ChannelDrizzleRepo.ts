import { and, desc, eq, lt } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3ChannelTable, IdbChatv3Channel } from '../../../db/drizzle.schema.index.js'
import { Chatv3ChannelRepoPort } from '../../../../application/ports/repository-ports.js'

export class ChannelDrizzleRepo implements Chatv3ChannelRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3Channel>): Promise<IdbChatv3Channel> {
    const rows = await this.db
      .insert(chatv3ChannelTable)
      .values(values as typeof chatv3ChannelTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3Channel | null> {
    const rows = await this.db.select().from(chatv3ChannelTable).where(eq(chatv3ChannelTable.id, id)).limit(1)
    return rows[0] ?? null
  }

  async list(filter: {
    tenantId: string
    spaceId?: string
    status?: string
    limit: number
  }): Promise<IdbChatv3Channel[]> {
    const conditions = [eq(chatv3ChannelTable.tenantId, filter.tenantId)]
    if (filter.spaceId) conditions.push(eq(chatv3ChannelTable.spaceId, filter.spaceId))
    if (filter.status) conditions.push(eq(chatv3ChannelTable.status, filter.status))
    return this.db
      .select()
      .from(chatv3ChannelTable)
      .where(and(...conditions))
      .orderBy(desc(chatv3ChannelTable.updatedAt))
      .limit(filter.limit)
  }

  async listByOwner(filter: {
    tenantId: string
    ownerUserId: string
    spaceId?: string
    status?: string
    limit: number
  }): Promise<IdbChatv3Channel[]> {
    const conditions = [
      eq(chatv3ChannelTable.tenantId, filter.tenantId),
      eq(chatv3ChannelTable.ownerUserId, filter.ownerUserId),
    ]
    if (filter.spaceId) conditions.push(eq(chatv3ChannelTable.spaceId, filter.spaceId))
    if (filter.status) conditions.push(eq(chatv3ChannelTable.status, filter.status))
    return this.db
      .select()
      .from(chatv3ChannelTable)
      .where(and(...conditions))
      .orderBy(desc(chatv3ChannelTable.updatedAt))
      .limit(filter.limit)
  }

  async listBeforeCreated(filter: { tenantId: string; before: Date }): Promise<IdbChatv3Channel[]> {
    return this.db
      .select()
      .from(chatv3ChannelTable)
      .where(and(eq(chatv3ChannelTable.tenantId, filter.tenantId), lt(chatv3ChannelTable.createdAt, filter.before)))
      .orderBy(desc(chatv3ChannelTable.createdAt))
  }

  async setGeneralRoom(id: string, generalRoomId: string): Promise<void> {
    await this.db.update(chatv3ChannelTable).set({ generalRoomId }).where(eq(chatv3ChannelTable.id, id))
  }

  async archive(id: string, updatedBy?: string): Promise<IdbChatv3Channel | null> {
    const rows = await this.db
      .update(chatv3ChannelTable)
      .set({ status: 'archived', archivedAt: new Date(), updatedBy, updatedAt: new Date() })
      .where(eq(chatv3ChannelTable.id, id))
      .returning()
    return rows[0] ?? null
  }

  async unarchive(id: string, updatedBy?: string): Promise<IdbChatv3Channel | null> {
    const rows = await this.db
      .update(chatv3ChannelTable)
      .set({ status: 'active', archivedAt: null, updatedBy, updatedAt: new Date() })
      .where(eq(chatv3ChannelTable.id, id))
      .returning()
    return rows[0] ?? null
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(chatv3ChannelTable).where(eq(chatv3ChannelTable.id, id))
  }
}
