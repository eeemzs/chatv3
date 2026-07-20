import { and, desc, eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3SpaceTable, IdbChatv3Space } from '../../../db/drizzle.schema.index.js'
import { Chatv3SpaceRepoPort } from '../../../../application/ports/repository-ports.js'

export class SpaceDrizzleRepo implements Chatv3SpaceRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3Space>): Promise<IdbChatv3Space> {
    const rows = await this.db
      .insert(chatv3SpaceTable)
      .values(values as typeof chatv3SpaceTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3Space | null> {
    const rows = await this.db.select().from(chatv3SpaceTable).where(eq(chatv3SpaceTable.id, id)).limit(1)
    return rows[0] ?? null
  }

  async byTenantSlug(tenantId: string, slug: string): Promise<IdbChatv3Space | null> {
    const rows = await this.db
      .select()
      .from(chatv3SpaceTable)
      .where(and(eq(chatv3SpaceTable.tenantId, tenantId), eq(chatv3SpaceTable.slug, slug)))
      .limit(1)
    return rows[0] ?? null
  }

  async list(filter: { tenantId: string; status?: string; limit: number }): Promise<IdbChatv3Space[]> {
    const conditions = [eq(chatv3SpaceTable.tenantId, filter.tenantId)]
    if (filter.status) conditions.push(eq(chatv3SpaceTable.status, filter.status))
    return this.db
      .select()
      .from(chatv3SpaceTable)
      .where(and(...conditions))
      .orderBy(desc(chatv3SpaceTable.updatedAt))
      .limit(filter.limit)
  }

  async archive(id: string, updatedBy?: string): Promise<IdbChatv3Space | null> {
    const rows = await this.db
      .update(chatv3SpaceTable)
      .set({ status: 'archived', updatedBy, updatedAt: new Date() })
      .where(eq(chatv3SpaceTable.id, id))
      .returning()
    return rows[0] ?? null
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(chatv3SpaceTable).where(eq(chatv3SpaceTable.id, id))
  }
}
