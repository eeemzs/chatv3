import { desc, eq, inArray } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3RoomEpochTable, IdbChatv3RoomEpoch } from '../../../db/drizzle.schema.index.js'
import { Chatv3RoomEpochRepoPort } from '../../../../application/ports/repository-ports.js'

export class RoomEpochDrizzleRepo implements Chatv3RoomEpochRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3RoomEpoch>): Promise<IdbChatv3RoomEpoch> {
    const rows = await this.db
      .insert(chatv3RoomEpochTable)
      .values(values as typeof chatv3RoomEpochTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async listByRoom(roomId: string): Promise<IdbChatv3RoomEpoch[]> {
    return this.db
      .select()
      .from(chatv3RoomEpochTable)
      .where(eq(chatv3RoomEpochTable.roomId, roomId))
      .orderBy(desc(chatv3RoomEpochTable.epoch))
  }

  async listByRoomIds(roomIds: string[]): Promise<IdbChatv3RoomEpoch[]> {
    if (roomIds.length === 0) return []
    return this.db.select().from(chatv3RoomEpochTable).where(inArray(chatv3RoomEpochTable.roomId, roomIds))
  }
}
