import { applyChatv3PgSchema } from '@aopslab/domain-pg-bootstrap-chatv3'
import { Chatv3Error, getChatv3ServerKeyConfig, getRoomOrThrow } from '@aopslab/domain-dm-chatv3'
import {
  buildChatv3HostRoutes,
  Chatv3Kit,
  createChatv3Kit,
  getChatv3OperationById,
} from '@aopslab/domain-kit-chatv3'
import { chatv3RateKey, Chatv3RateLimiter, resolveChatv3RateLimits } from './rate-limit.js'
import { Chatv3EventBus, Chatv3RoomEvent, createChatv3SseResponse, Chatv3SseRequest } from './sse.js'
import { dispatchChatv3Webhooks } from './webhooks.js'
import { DomainPlugin, DomainRequest, DomainRouteManifestEntry } from './types.js'

export type Chatv3PluginOptions = {
  pgUrl?: string
}

export type Chatv3Runtime = {
  kit: Chatv3Kit
  bus: Chatv3EventBus
  limiter: Chatv3RateLimiter
}

const RUNTIME_KEY = '__chatv3_runtime__'

/**
 * Runtime is parked on globalThis so the host's SSE route (a separate module
 * in the SvelteKit graph) shares the same bus/db instance as the plugin.
 */
export function getChatv3Runtime(): Chatv3Runtime | null {
  return (globalThis as Record<string, unknown>)[RUNTIME_KEY] as Chatv3Runtime | null
}

function setChatv3Runtime(runtime: Chatv3Runtime): void {
  ;(globalThis as Record<string, unknown>)[RUNTIME_KEY] = runtime
}

// Same opt-out as the other server kits (see aops-server src/kits/*):
// AOPS_DB_BOOTSTRAP_MODE=explicit disables automatic schema apply.
function shouldAutoBootstrapStorage(): boolean {
  return String(process.env.AOPS_DB_BOOTSTRAP_MODE ?? '').trim().toLowerCase() !== 'explicit'
}

const STATUS_BY_CODE: Record<string, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  revoked: 403,
  archived: 409,
  epoch_mismatch: 409,
  rate_limit: 429,
  runtime: 500,
}

type DomainResponseEnvelope = { status: number; data: Record<string, unknown> }

// host-core dispatch uses a {status, data} return verbatim (isDomainResponse),
// so the HTTP status is carried here — never thrown across the boundary.
function toFailureEnvelope(operation: string, error: unknown): DomainResponseEnvelope {
  if (error instanceof Chatv3Error) {
    return {
      status: STATUS_BY_CODE[error.code] ?? 500,
      data: {
        ok: false,
        domain: 'chatv3',
        operation,
        error: error.code,
        errorCode: error.code,
        message: error.message,
      },
    }
  }
  return {
    status: 500,
    data: {
      ok: false,
      domain: 'chatv3',
      operation,
      error: 'runtime',
      errorCode: 'runtime',
      message: 'Runtime operation failed. Check server logs for details.',
    },
  }
}

export function createChatv3Plugin(options: Chatv3PluginOptions = {}): DomainPlugin {
  let runtime: Chatv3Runtime | null = null

  const ensureRuntime = (): Chatv3Runtime => {
    if (runtime) return runtime
    const existing = getChatv3Runtime()
    if (existing) {
      runtime = existing
      return existing
    }
    const pgUrl = options.pgUrl ?? process.env.CHATV3_PG_URL ?? process.env.AOPS_PG_URL
    if (!pgUrl) throw new Error('chatv3: CHATV3_PG_URL or AOPS_PG_URL is required')
    const next: Chatv3Runtime = {
      kit: createChatv3Kit({ pgUrl }),
      bus: new Chatv3EventBus(),
      limiter: new Chatv3RateLimiter(resolveChatv3RateLimits()),
    }
    runtime = next
    setChatv3Runtime(next)
    return next
  }

  const routes: DomainRouteManifestEntry[] = [
    ...buildChatv3HostRoutes(),
    {
      id: 'chatv3-room-stream',
      method: 'GET',
      pattern: '/v1/rooms/:roomId/stream',
      operation: 'chatv3.room.stream',
      summary: 'SSE stream (served by a dedicated host route, not the generic dispatcher).',
    },
  ]

  return {
    contract: 'v1',
    domain: 'chatv3',
    version: '0.1.0',
    capabilities: ['space', 'channel', 'room', 'message', 'cursor', 'device', 'binding', 'recovery'],
    manifest: {
      domain: 'chatv3',
      version: '0.1.0',
      routes,
      meta: {
        standalone: true,
        crypto: 'server-blind split-secret v0; MLS-ready contract',
      },
    },

    setup: async () => {
      const pgUrl = options.pgUrl ?? process.env.CHATV3_PG_URL ?? process.env.AOPS_PG_URL
      if (!pgUrl) throw new Error('chatv3: CHATV3_PG_URL or AOPS_PG_URL is required')
      if (shouldAutoBootstrapStorage()) {
        await applyChatv3PgSchema({ repoUrl: pgUrl })
      }
      getChatv3ServerKeyConfig()
      ensureRuntime()
    },

    health: async () => {
      try {
        const rt = ensureRuntime()
        await rt.kit.ping()
        return { ok: true, details: { domain: 'chatv3' } }
      } catch (error) {
        return { ok: false, details: { message: error instanceof Error ? error.message : 'unknown' } }
      }
    },

    execute: async ({ request, match }) => {
      const operation = match.route.operation
      if (operation === 'chatv3.room.stream') {
        return toFailureEnvelope(operation, new Chatv3Error('invalid_input', 'stream is served at the host SSE route'))
      }
      try {
        const rt = ensureRuntime()
        // rate-limit bucket is chosen by the operation's auth level, not by
        // header presence (issue 57c13ccb). Unknown ops fall back to per-IP.
        const authLevel = getChatv3OperationById(operation)?.auth ?? 'open'
        const { key, kind } = chatv3RateKey(request.headers, authLevel, request.context?.principal ?? null)
        if (!rt.limiter.hit(key, kind)) {
          return toFailureEnvelope(
            operation,
            new Chatv3Error('rate_limit', 'rate limit exceeded; slow down and retry')
          )
        }
        const data = await rt.kit.executeByOperationId(operation, {
          headers: request.headers,
          body: request.body,
          query: request.query,
          params: match.params,
          // Optional authenticated identity (F4); null for anonymous/standalone.
          principal: request.context?.principal ?? null,
        })
        if (operation === 'chatv3.message.send') {
          await publishRoomEvent(rt, 'message', data)
        } else if (operation === 'chatv3.presence.set') {
          await publishRoomEvent(rt, 'presence', data)
        }
        return { status: 200, data: { ok: true, domain: 'chatv3', operation, data } }
      } catch (error) {
        return toFailureEnvelope(operation, error)
      }
    },
  }
}

async function publishRoomEvent(
  runtime: Chatv3Runtime,
  type: 'message' | 'presence',
  data: unknown
): Promise<void> {
  try {
    let event: Chatv3RoomEvent | null = null
    if (type === 'message') {
      const message = (
        data as { message?: { roomId?: string; seq?: number; kind?: string; senderMemberId?: string } }
      )?.message
      if (!message?.roomId) return
      const room = await getRoomOrThrow(runtime.kit.db, message.roomId)
      event = {
        type,
        channelId: room.channelId,
        roomId: room.id,
        seq: message.seq,
        kind: message.kind,
        senderMemberId: message.senderMemberId,
        at: new Date().toISOString(),
      }
    } else {
      const presence = data as { roomId?: string; memberId?: string; state?: string }
      if (!presence?.roomId) return
      const room = await getRoomOrThrow(runtime.kit.db, presence.roomId)
      event = {
        type,
        channelId: room.channelId,
        roomId: room.id,
        senderMemberId: presence.memberId,
        state: presence.state,
        at: new Date().toISOString(),
      }
    }
    runtime.bus.publish(event)
    // agent-wake: fire-and-forget; the write itself is already committed
    void dispatchChatv3Webhooks(runtime.kit, event)
  } catch {
    // SSE/webhook fanout is best-effort; the write itself is already committed
  }
}

/** Host SSE entry: the dedicated route calls this with the shared runtime. */
export async function handleChatv3SseRequest(request: Chatv3SseRequest): Promise<Response> {
  const runtime = getChatv3Runtime()
  if (!runtime) {
    return new Response(
      JSON.stringify({ ok: false, error: 'runtime', message: 'chatv3 runtime not initialized (plugin setup pending)' }),
      { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } }
    )
  }
  return createChatv3SseResponse({ db: runtime.kit.db, bus: runtime.bus }, request)
}
