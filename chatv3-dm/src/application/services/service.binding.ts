import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import { IdbChatv3Binding, IdbChatv3Member } from '../../infrastructure/db/drizzle.schema.index.js'
import { zBindingAddInput, zBindingListInput, zBindingRemoveInput } from '../../domain/models/operations.js'
import { Chatv3Error, notFound } from '../errors.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos } from '../factories/repository-factory.js'

export class Chatv3BindingService {
  private readonly repos: Chatv3Repos

  constructor(db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  async add(input: z.infer<typeof zBindingAddInput>, actor: IdbChatv3Member): Promise<IdbChatv3Binding> {
    if (actor.channelId !== input.channelId) {
      throw new Chatv3Error('forbidden', 'actor is not a member of this channel')
    }
    return this.repos.binding.insert({
      tenantId: actor.tenantId,
      channelId: input.channelId,
      roomId: input.roomId,
      bindingType: input.bindingType,
      refId: input.refId,
      uri: input.uri,
      title: input.title,
      note: input.note,
      createdBy: actor.handle,
    })
  }

  async list(input: z.infer<typeof zBindingListInput>, actor: IdbChatv3Member): Promise<IdbChatv3Binding[]> {
    if (actor.channelId !== input.channelId) {
      throw new Chatv3Error('forbidden', 'actor is not a member of this channel')
    }
    return this.repos.binding.listByChannel({ channelId: input.channelId, roomId: input.roomId })
  }

  async remove(input: z.infer<typeof zBindingRemoveInput>, actor: IdbChatv3Member): Promise<{ removed: true }> {
    const binding = await this.repos.binding.byId(input.bindingId)
    if (!binding) throw notFound('binding')
    if (binding.channelId !== actor.channelId) {
      throw new Chatv3Error('forbidden', 'binding belongs to another channel')
    }
    await this.repos.binding.deleteById(input.bindingId)
    return { removed: true }
  }
}
