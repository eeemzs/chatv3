import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import {
  IdbChatv3DeviceKeyPackage,
  IdbChatv3Member,
  IdbChatv3MemberDevice,
} from '../../infrastructure/db/drizzle.schema.index.js'
import { zDeviceRegisterInput, zKeyPackagePublishInput } from '../../domain/models/operations.js'
import { Chatv3Error, notFound } from '../errors.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos } from '../factories/repository-factory.js'

export class Chatv3DeviceService {
  private readonly repos: Chatv3Repos

  constructor(db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  async register(
    input: z.infer<typeof zDeviceRegisterInput>,
    actor: IdbChatv3Member
  ): Promise<IdbChatv3MemberDevice> {
    return this.repos.memberDevice.insert({
      tenantId: actor.tenantId,
      memberId: actor.id,
      deviceLabel: input.device.deviceLabel,
      identityPublicKey: input.device.identityPublicKey,
      signingPublicKey: input.device.signingPublicKey,
    })
  }

  async publishKeyPackage(
    input: z.infer<typeof zKeyPackagePublishInput>,
    actor: IdbChatv3Member
  ): Promise<IdbChatv3DeviceKeyPackage> {
    const device = await this.repos.memberDevice.byId(input.deviceId)
    if (!device) throw notFound('device')
    if (device.memberId !== actor.id) throw new Chatv3Error('forbidden', 'device belongs to another member')
    return this.repos.deviceKeyPackage.insert({
      tenantId: actor.tenantId,
      deviceId: device.id,
      kind: input.kind,
      packageBlob: input.packageBlob,
    })
  }
}
