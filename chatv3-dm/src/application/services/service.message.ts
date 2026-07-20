import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import { IdbChatv3Member, IdbChatv3Message } from '../../infrastructure/db/drizzle.schema.index.js'
import { zMessageListInput, zMessageSendInput } from '../../domain/models/operations.js'
import { Chatv3Error } from '../errors.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos, withChatv3Tx } from '../factories/repository-factory.js'
import { assertActive, getRoomForMember } from './helpers.js'

export class Chatv3MessageService {
  private readonly repos: Chatv3Repos

  constructor(private readonly db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  /**
   * Seq allocation happens inside one transaction: the room row is locked
   * (SELECT ... FOR UPDATE), seq = lastSeq + 1, message insert and room
   * counters commit atomically. Idempotency: same (roomId, idempotencyKey)
   * returns the already-stored message instead of writing a duplicate.
   */
  async send(
    input: z.infer<typeof zMessageSendInput>,
    actor: IdbChatv3Member
  ): Promise<{ message: IdbChatv3Message; replayed: boolean }> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    assertActive(room.status, 'room')
    if (input.envelope.epoch !== room.currentEpoch) {
      throw new Chatv3Error(
        'epoch_mismatch',
        `message epoch ${input.envelope.epoch} does not match room epoch ${room.currentEpoch}`
      )
    }

    return withChatv3Tx(this.db, async (r) => {
      if (input.idempotencyKey) {
        const existing = await r.message.byRoomIdempotency(room.id, input.idempotencyKey)
        if (existing) return { message: existing, replayed: true }
      }

      const seq = (await r.room.lockLastSeq(room.id)) + 1
      const now = new Date()

      const message = await r.message.insert({
        tenantId: room.tenantId,
        roomId: room.id,
        seq,
        senderMemberId: actor.id,
        kind: input.kind,
        protocolVersion: input.envelope.protocolVersion,
        cipherSuite: input.envelope.cipherSuite,
        epoch: input.envelope.epoch,
        ciphertext: input.envelope.ciphertext,
        nonce: input.envelope.nonce,
        aad: input.envelope.aad,
        authTag: input.envelope.authTag,
        mentions: input.mentions,
        replyToSeq: input.replyToSeq,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      })

      await r.room.bumpSeq(room.id, seq, now)
      return { message, replayed: false }
    })
  }

  async list(input: z.infer<typeof zMessageListInput>, actor: IdbChatv3Member): Promise<IdbChatv3Message[]> {
    const room = await getRoomForMember(this.db, input.roomId, actor)
    return this.repos.message.listAfterSeq({ roomId: room.id, afterSeq: input.afterSeq, limit: input.limit })
  }
}
