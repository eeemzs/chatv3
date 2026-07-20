import { and, eq } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import { chatv3WelcomeEnvelopeTable, IdbChatv3WelcomeEnvelope } from '../../../db/drizzle.schema.index.js'
import { Chatv3WelcomeEnvelopeRepoPort } from '../../../../application/ports/repository-ports.js'

export class WelcomeEnvelopeDrizzleRepo implements Chatv3WelcomeEnvelopeRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3WelcomeEnvelope>): Promise<IdbChatv3WelcomeEnvelope> {
    const rows = await this.db
      .insert(chatv3WelcomeEnvelopeTable)
      .values(values as typeof chatv3WelcomeEnvelopeTable.$inferInsert)
      .returning()
    return rows[0]!
  }

  async listPendingForDevice(targetDeviceId: string): Promise<IdbChatv3WelcomeEnvelope[]> {
    return this.db
      .select()
      .from(chatv3WelcomeEnvelopeTable)
      .where(
        and(
          eq(chatv3WelcomeEnvelopeTable.targetDeviceId, targetDeviceId),
          eq(chatv3WelcomeEnvelopeTable.status, 'pending')
        )
      )
  }
}
