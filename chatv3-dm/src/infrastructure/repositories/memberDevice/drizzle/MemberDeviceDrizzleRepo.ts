import { eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3MemberDeviceTable, IdbChatv3MemberDevice } from '../../../db/drizzle.schema.index.js'
import { Chatv3MemberDeviceRepoPort } from '../../../../application/ports/repository-ports.js'

export class MemberDeviceDrizzleRepo implements Chatv3MemberDeviceRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3MemberDevice>): Promise<IdbChatv3MemberDevice> {
    const rows = await this.db
      .insert(chatv3MemberDeviceTable)
      .values(values as typeof chatv3MemberDeviceTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async byId(id: string): Promise<IdbChatv3MemberDevice | null> {
    const rows = await this.db
      .select()
      .from(chatv3MemberDeviceTable)
      .where(eq(chatv3MemberDeviceTable.id, id))
      .limit(1)
    return rows[0] ?? null
  }
}
