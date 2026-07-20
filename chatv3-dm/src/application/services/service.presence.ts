import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import { IdbChatv3Member, IdbChatv3Presence } from '../../infrastructure/db/drizzle.schema.index.js'
import { zPresenceListInput, zPresenceSetInput } from '../../domain/models/operations.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos } from '../factories/repository-factory.js'
import { getRoomForMember } from './helpers.js'

export type Chatv3PresenceView = {
  memberId: string
  state: string
  note: string | null
  updatedAt: Date
  /** rows past expiresAt read as offline — nothing is deleted on disconnect */
  expired: boolean
}

export class Chatv3PresenceService {
  private readonly repos: Chatv3Repos

  constructor(private readonly db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  async set(input: z.infer<typeof zPresenceSetInput>, actor: IdbChatv3Member): Promise<IdbChatv3Presence> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    return this.repos.presence.upsert({
      tenantId: room.tenantId,
      roomId: room.id,
      memberId: actor.id,
      state: input.state,
      note: input.note ?? null,
      expiresAt: new Date(Date.now() + input.ttlSec * 1000),
    })
  }

  async list(input: z.infer<typeof zPresenceListInput>, actor: IdbChatv3Member): Promise<Chatv3PresenceView[]> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    const now = Date.now()
    const rows = await this.repos.presence.listForRoom(room.id)
    return rows.map((row) => ({
      memberId: row.memberId,
      state: row.expiresAt.getTime() < now ? 'offline' : row.state,
      note: row.note,
      updatedAt: row.updatedAt,
      expired: row.expiresAt.getTime() < now,
    }))
  }
}
