import { Chatv3Executor } from '../../../db/client.js'
import { chatv3DeviceKeyPackageTable, IdbChatv3DeviceKeyPackage } from '../../../db/drizzle.schema.index.js'
import { Chatv3DeviceKeyPackageRepoPort } from '../../../../application/ports/repository-ports.js'

export class DeviceKeyPackageDrizzleRepo implements Chatv3DeviceKeyPackageRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async insert(values: Partial<IdbChatv3DeviceKeyPackage>): Promise<IdbChatv3DeviceKeyPackage> {
    const rows = await this.db
      .insert(chatv3DeviceKeyPackageTable)
      .values(values as typeof chatv3DeviceKeyPackageTable.$inferInsert)
      .returning()
    return rows[0]!
  }
}
