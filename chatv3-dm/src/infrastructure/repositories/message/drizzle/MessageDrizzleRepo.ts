import { and, asc, eq, gt } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3MessageTable, IdbChatv3Message } from '../../../db/drizzle.schema.index.js'
import { Chatv3MessageRepoPort } from '../../../../application/ports/repository-ports.js'

export class MessageDrizzleRepo implements Chatv3MessageRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3Message>): Promise<IdbChatv3Message> {
    const rows = await this.db
      .insert(chatv3MessageTable)
      .values(values as typeof chatv3MessageTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byRoomIdempotency(roomId: string, idempotencyKey: string): Promise<IdbChatv3Message | null> {
    const rows = await this.db
      .select()
      .from(chatv3MessageTable)
      .where(and(eq(chatv3MessageTable.roomId, roomId), eq(chatv3MessageTable.idempotencyKey, idempotencyKey)))
      .limit(1)
    return rows[0] ?? null
  }

  async listAfterSeq(filter: { roomId: string; afterSeq: number; limit: number }): Promise<IdbChatv3Message[]> {
    return this.db
      .select()
      .from(chatv3MessageTable)
      .where(and(eq(chatv3MessageTable.roomId, filter.roomId), gt(chatv3MessageTable.seq, filter.afterSeq)))
      .orderBy(asc(chatv3MessageTable.seq))
      .limit(filter.limit)
  }
}
