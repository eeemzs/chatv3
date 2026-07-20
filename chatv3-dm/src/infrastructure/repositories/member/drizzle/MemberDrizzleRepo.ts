import { and, desc, eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3MemberTable, IdbChatv3Member } from '../../../db/drizzle.schema.index.js'
import { Chatv3MemberRepoPort } from '../../../../application/ports/repository-ports.js'

export class MemberDrizzleRepo implements Chatv3MemberRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3Member> & { id: string }): Promise<IdbChatv3Member> {
    const rows = await this.db
      .insert(chatv3MemberTable)
      .values(values as typeof chatv3MemberTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3Member | null> {
    const rows = await this.db.select().from(chatv3MemberTable).where(eq(chatv3MemberTable.id, id)).limit(1)
    return rows[0] ?? null
  }

  async byChannelHandle(channelId: string, handle: string): Promise<IdbChatv3Member | null> {
    const rows = await this.db
      .select()
      .from(chatv3MemberTable)
      .where(and(eq(chatv3MemberTable.channelId, channelId), eq(chatv3MemberTable.handle, handle)))
      .limit(1)
    return rows[0] ?? null
  }

  async listByChannel(filter: { channelId: string; status?: string; limit: number }): Promise<IdbChatv3Member[]> {
    const conditions = [eq(chatv3MemberTable.channelId, filter.channelId)]
    if (filter.status) conditions.push(eq(chatv3MemberTable.status, filter.status))
    return this.db
      .select()
      .from(chatv3MemberTable)
      .where(and(...conditions))
      .limit(filter.limit)
  }

  async listByUser(filter: { tenantId: string; userId: string; status?: string; limit: number }): Promise<IdbChatv3Member[]> {
    const conditions = [eq(chatv3MemberTable.tenantId, filter.tenantId), eq(chatv3MemberTable.userId, filter.userId)]
    if (filter.status) conditions.push(eq(chatv3MemberTable.status, filter.status))
    return this.db
      .select()
      .from(chatv3MemberTable)
      .where(and(...conditions))
      .orderBy(desc(chatv3MemberTable.updatedAt))
      .limit(filter.limit)
  }

  async update(id: string, patch: Partial<IdbChatv3Member>): Promise<IdbChatv3Member | null> {
    const rows = await this.db
      .update(chatv3MemberTable)
      .set(patch)
      .where(eq(chatv3MemberTable.id, id))
      .returning()
    return rows[0] ?? null
  }
}
