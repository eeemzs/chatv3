import { eq, and } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3UserKeyBackupTable, IdbChatv3UserKeyBackup } from '../../../db/drizzle.schema.index.js'
import { Chatv3UserKeyBackupRepoPort } from '../../../../application/ports/repository-ports.js'

export class UserKeyBackupDrizzleRepo implements Chatv3UserKeyBackupRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3UserKeyBackup>): Promise<IdbChatv3UserKeyBackup> {
    const rows = await this.db
      .insert(chatv3UserKeyBackupTable)
      .values(values as typeof chatv3UserKeyBackupTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3UserKeyBackup | null> {
    const rows = await this.db.select().from(chatv3UserKeyBackupTable).where(eq(chatv3UserKeyBackupTable.id, id)).limit(1)
    return rows[0] ?? null
  }

  async byUser(filter: { tenantId: string; userId: string }): Promise<IdbChatv3UserKeyBackup | null> {
    const rows = await this.db
      .select()
      .from(chatv3UserKeyBackupTable)
      .where(and(eq(chatv3UserKeyBackupTable.tenantId, filter.tenantId), eq(chatv3UserKeyBackupTable.userId, filter.userId)))
      .limit(1)
    return rows[0] ?? null
  }

  async update(id: string, patch: Partial<IdbChatv3UserKeyBackup>): Promise<IdbChatv3UserKeyBackup | null> {
    const rows = await this.db
      .update(chatv3UserKeyBackupTable)
      .set(patch)
      .where(eq(chatv3UserKeyBackupTable.id, id))
      .returning()
    return rows[0] ?? null
  }
}
