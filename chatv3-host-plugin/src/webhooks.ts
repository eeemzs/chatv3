import { createHmac } from 'node:crypto'
import { Chatv3Kit } from '@aopslab/domain-kit-chatv3'
import { Chatv3RoomEvent } from './sse.js'

/**
 * Generic agent-wake webhooks (binding consensus: NOT AOPS-specific).
 * Payloads carry the same plaintext operational metadata as SSE events —
 * never ciphertext, secrets or key material — and are HMAC-SHA256 signed.
 * v1 delivery is best-effort fire-and-forget with a fail counter; no retry
 * queue (documented limit).
 */
export const CHATV3_WEBHOOK_SIGNATURE_HEADER = 'x-chatv3-signature'
const DELIVERY_TIMEOUT_MS = 5_000

export function signChatv3WebhookPayload(signingSecret: string, body: string): string {
  return `sha256=${createHmac('sha256', signingSecret).update(body, 'utf8').digest('hex')}`
}

export async function dispatchChatv3Webhooks(kit: Chatv3Kit, event: Chatv3RoomEvent): Promise<void> {
  let hooks
  try {
    hooks = await kit.repos.webhook.listActiveForChannel(event.channelId)
  } catch {
    return
  }
  const body = JSON.stringify({ domain: 'chatv3', event })
  await Promise.all(
    hooks
      .filter((hook) => hook.events.length === 0 || hook.events.includes(event.type))
      .map(async (hook) => {
        const at = new Date()
        try {
          const response = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              [CHATV3_WEBHOOK_SIGNATURE_HEADER]: signChatv3WebhookPayload(hook.signingSecret, body),
            },
            body,
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
          })
          await kit.repos.webhook.recordDelivery(hook.id, response.ok, at)
        } catch {
          await kit.repos.webhook.recordDelivery(hook.id, false, at).catch(() => undefined)
        }
      })
  )
}
