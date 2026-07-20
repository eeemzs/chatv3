import { authenticateMemberToken, Chatv3Db } from '@aopslab/domain-dm-chatv3'

/**
 * v1 realtime: ONE multiplexed SSE stream per member (binding consensus) over
 * an in-process event bus. Single-process scope is a documented F1a limit —
 * cross-process fanout (pg LISTEN/NOTIFY or similar) is a later slice;
 * clients always have the polling fallback (message.list afterSeq).
 */
export type Chatv3RoomEvent = {
  type: 'message' | 'presence' | 'cursor' | 'room' | 'system'
  channelId: string
  roomId: string
  seq?: number
  kind?: string
  senderMemberId?: string
  /** presence events: the new working state */
  state?: string
  at: string
}

type Subscriber = (event: Chatv3RoomEvent) => void

export class Chatv3EventBus {
  private subscribersByChannel = new Map<string, Set<Subscriber>>()

  subscribe(channelId: string, fn: Subscriber): () => void {
    const set = this.subscribersByChannel.get(channelId) ?? new Set()
    set.add(fn)
    this.subscribersByChannel.set(channelId, set)
    return () => {
      set.delete(fn)
      if (set.size === 0) this.subscribersByChannel.delete(channelId)
    }
  }

  publish(event: Chatv3RoomEvent): void {
    const set = this.subscribersByChannel.get(event.channelId)
    if (!set) return
    for (const fn of [...set]) {
      try {
        fn(event)
      } catch {
        // a broken subscriber must never break the publisher
      }
    }
  }
}

const HEARTBEAT_MS = 25_000

export type Chatv3SseRequest = {
  /** EventSource cannot set headers; token may come via ?token= */
  token: string | null
  signal?: AbortSignal
}

export async function createChatv3SseResponse(
  deps: { db: Chatv3Db; bus: Chatv3EventBus },
  request: Chatv3SseRequest
): Promise<Response> {
  if (!request.token) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized', message: 'member token required' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  let member
  try {
    member = await authenticateMemberToken(deps.db, request.token)
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized', message: 'invalid member token' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (eventName: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      send('chatv3.hello', {
        memberId: member.id,
        channelId: member.channelId,
        handle: member.handle,
        at: new Date().toISOString(),
      })
      unsubscribe = deps.bus.subscribe(member.channelId, (event) => send('chatv3.event', event))
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`))
      }, HEARTBEAT_MS)
      request.signal?.addEventListener('abort', () => {
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
