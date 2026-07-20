import { and, eq, sql } from 'drizzle-orm'
import { Chatv3Executor } from '../../../db/client.js'
import {
  chatv3MemberTable,
  chatv3RoomCursorTable,
  IdbChatv3RoomCursor,
} from '../../../db/drizzle.schema.index.js'
import {
  Chatv3CursorField,
  Chatv3ReceiptRow,
  Chatv3RoomCursorRepoPort,
} from '../../../../application/ports/repository-ports.js'

const CURSOR_COLUMNS = {
  lastReadSeq: chatv3RoomCursorTable.lastReadSeq,
  deliveredSeq: chatv3RoomCursorTable.deliveredSeq,
  ackSeq: chatv3RoomCursorTable.ackSeq,
} as const

export class RoomCursorDrizzleRepo implements Chatv3RoomCursorRepoPort {
  constructor(private readonly db: Chatv3Executor) {}

  async advance(values: {
    tenantId: string
    roomId: string
    memberId: string
    field: Chatv3CursorField
    seq: number
    at: Date
  }): Promise<IdbChatv3RoomCursor> {
    const column = CURSOR_COLUMNS[values.field]
    const rows = await this.db
      .insert(chatv3RoomCursorTable)
      .values({
        tenantId: values.tenantId,
        roomId: values.roomId,
        memberId: values.memberId,
        [values.field]: values.seq,
        lastReadAt: values.field === 'lastReadSeq' ? values.at : null,
        updatedAt: values.at,
      })
      .onConflictDoUpdate({
        target: [chatv3RoomCursorTable.roomId, chatv3RoomCursorTable.memberId],
        set: {
          [values.field]: sql`GREATEST(${column}, ${values.seq})`,
          ...(values.field === 'lastReadSeq' ? { lastReadAt: values.at } : {}),
          updatedAt: values.at,
        },
      })
      .returning()
    return rows[0]!
  }

  async receiptsForRoom(roomId: string, channelId: string): Promise<Chatv3ReceiptRow[]> {
    return this.db
      .select({
        memberId: chatv3MemberTable.id,
        handle: chatv3MemberTable.handle,
        roleKey: chatv3MemberTable.roleKey,
        actorKind: chatv3MemberTable.actorKind,
        lastReadSeq: chatv3RoomCursorTable.lastReadSeq,
        deliveredSeq: chatv3RoomCursorTable.deliveredSeq,
        ackSeq: chatv3RoomCursorTable.ackSeq,
        lastReadAt: chatv3RoomCursorTable.lastReadAt,
      })
      .from(chatv3MemberTable)
      .leftJoin(
        chatv3RoomCursorTable,
        and(eq(chatv3RoomCursorTable.memberId, chatv3MemberTable.id), eq(chatv3RoomCursorTable.roomId, roomId))
      )
      .where(and(eq(chatv3MemberTable.channelId, channelId), eq(chatv3MemberTable.status, 'active')))
  }
}
