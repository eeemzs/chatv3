import { eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3PresenceTable, IdbChatv3Presence } from '../../../db/drizzle.schema.index.js'
import { Chatv3PresenceRepoPort } from '../../../../application/ports/repository-ports.js'

export class PresenceDrizzleRepo implements Chatv3PresenceRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async upsert(values: {
    tenantId: string
    roomId: string
    memberId: string
    state: string
    note?: string | null
    expiresAt: Date
  }): Promise<IdbChatv3Presence> {
    const now = new Date()
    const rows = await this.db
      .insert(chatv3PresenceTable)
      .values({
        tenantId: values.tenantId,
        roomId: values.roomId,
        memberId: values.memberId,
        state: values.state,
        note: values.note ?? null,
        expiresAt: values.expiresAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [chatv3PresenceTable.roomId, chatv3PresenceTable.memberId],
        set: {
          state: values.state,
          note: values.note ?? null,
          expiresAt: values.expiresAt,
          updatedAt: now,
        },
      })
      .returning()
    return rows[0]!
  }

  async listForRoom(roomId: string): Promise<IdbChatv3Presence[]> {
    return this.db.select().from(chatv3PresenceTable).where(eq(chatv3PresenceTable.roomId, roomId))
  }
}
