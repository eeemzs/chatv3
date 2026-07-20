import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import { IdbChatv3Webhook } from '../../infrastructure/db/drizzle.schema.index.js'
import {
  zWebhookCreateInput,
  zWebhookListInput,
  zWebhookRemoveInput,
} from '../../domain/models/operations.js'
import { notFound } from '../errors.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos } from '../factories/repository-factory.js'
import {
  adminActorLabel,
  assertAdminChannelAccess,
  Chatv3AdminActor,
  getChannelOrThrow,
  requireAdminAuthority,
} from './helpers.js'

/** signingSecret is write-only after creation — list responses redact it. */
export type Chatv3WebhookView = Omit<IdbChatv3Webhook, 'signingSecret'>

function redact(webhook: IdbChatv3Webhook): Chatv3WebhookView {
  const { signingSecret: _ignored, ...rest } = webhook
  return rest
}

export class Chatv3WebhookService {
  private readonly repos: Chatv3Repos

  constructor(private readonly db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  async create(input: z.infer<typeof zWebhookCreateInput>, actor: Chatv3AdminActor): Promise<Chatv3WebhookView> {
    requireAdminAuthority(actor)
    assertAdminChannelAccess(actor, input.channelId)
    const channel = await getChannelOrThrow(this.db, input.channelId)
    const webhook = await this.repos.webhook.insert({
      tenantId: channel.tenantId,
      channelId: input.channelId,
      url: input.url,
      signingSecret: input.signingSecret,
      events: input.events,
      label: input.label,
      createdBy: adminActorLabel(actor),
    })
    return redact(webhook)
  }

  async list(input: z.infer<typeof zWebhookListInput>, actor: Chatv3AdminActor): Promise<Chatv3WebhookView[]> {
    requireAdminAuthority(actor)
    assertAdminChannelAccess(actor, input.channelId)
    const rows = await this.repos.webhook.listByChannel(input.channelId)
    return rows.map(redact)
  }

  async remove(input: z.infer<typeof zWebhookRemoveInput>, actor: Chatv3AdminActor): Promise<{ removed: true }> {
    requireAdminAuthority(actor)
    const webhook = await this.repos.webhook.byId(input.webhookId)
    if (!webhook) throw notFound('webhook')
    assertAdminChannelAccess(actor, webhook.channelId)
    await this.repos.webhook.deleteById(input.webhookId)
    return { removed: true }
  }
}
