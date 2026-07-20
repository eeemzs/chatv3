import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import { IdbChatv3Member, IdbChatv3RoomCursor } from '../../infrastructure/db/drizzle.schema.index.js'
import {
  zAckInput,
  zMarkDeliveredInput,
  zMarkReadInput,
  zReceiptsInput,
} from '../../domain/models/operations.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos } from '../factories/repository-factory.js'
import { getRoomForMember } from './helpers.js'

export type Chatv3Receipt = {
  memberId: string
  handle: string
  roleKey: string
  actorKind: string
  lastReadSeq: number
  deliveredSeq: number
  ackSeq: number
  lastReadAt: Date | null
}

export class Chatv3CursorService {
  private readonly repos: Chatv3Repos

  constructor(private readonly db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  /** Cursors only move forward (GREATEST) — re-reading never regresses them. */
  async markRead(input: z.infer<typeof zMarkReadInput>, actor: IdbChatv3Member): Promise<IdbChatv3RoomCursor> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    return this.repos.roomCursor.advance({
      tenantId: room.tenantId,
      roomId: room.id,
      memberId: actor.id,
      field: 'lastReadSeq',
      seq: input.lastReadSeq,
      at: new Date(),
    })
  }

  /** Transport-level delivery cursor (client confirms receipt, not reading). */
  async markDelivered(
    input: z.infer<typeof zMarkDeliveredInput>,
    actor: IdbChatv3Member
  ): Promise<IdbChatv3RoomCursor> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    return this.repos.roomCursor.advance({
      tenantId: room.tenantId,
      roomId: room.id,
      memberId: actor.id,
      field: 'deliveredSeq',
      seq: input.deliveredSeq,
      at: new Date(),
    })
  }

  /**
   * Explicit directive acknowledgement — separate from read by design:
   * an operator can see an agent has READ a directive but not yet ACKed it.
   */
  async ack(input: z.infer<typeof zAckInput>, actor: IdbChatv3Member): Promise<IdbChatv3RoomCursor> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    return this.repos.roomCursor.advance({
      tenantId: room.tenantId,
      roomId: room.id,
      memberId: actor.id,
      field: 'ackSeq',
      seq: input.ackSeq,
      at: new Date(),
    })
  }

  /**
   * Receipts: per-member cursors of a room. "Who read message N" = members
   * whose lastReadSeq >= N; blue tick = min over active members >= N.
   * Derived, never stored per-message.
   */
  async receipts(input: z.infer<typeof zReceiptsInput>, actor: IdbChatv3Member): Promise<Chatv3Receipt[]> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    const rows = await this.repos.roomCursor.receiptsForRoom(room.id, room.channelId)
    return rows.map((r) => ({
      memberId: r.memberId,
      handle: r.handle,
      roleKey: r.roleKey,
      actorKind: r.actorKind,
      lastReadSeq: r.lastReadSeq ?? 0,
      deliveredSeq: r.deliveredSeq ?? 0,
      ackSeq: r.ackSeq ?? 0,
      lastReadAt: r.lastReadAt ?? null,
    }))
  }
}
