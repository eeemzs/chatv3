import { z } from 'zod'

export const DEFAULT_TENANT_ID = 'default'

export const zTenantId = z.string().min(1).max(120).default(DEFAULT_TENANT_ID)
export const zUuid = z.string().uuid()
export const zSlug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase kebab-case slug expected')
export const zHandle = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'handle: alnum plus . _ -')
export const zTitle = z.string().min(1).max(200)

export const SPACE_STATUSES = ['active', 'archived'] as const
export const CHANNEL_STATUSES = ['active', 'archived'] as const
export const ROOM_STATUSES = ['active', 'archived'] as const
export const MEMBER_STATUSES = ['active', 'removed'] as const
export const ACCESS_KEY_STATUSES = ['active', 'revoked'] as const
export const ROOM_KINDS = ['general', 'session', 'task', 'topic'] as const
export const ACTOR_KINDS = ['agent', 'human', 'service'] as const
export const MEMBER_ROLE_KEYS = ['owner', 'member', 'operator', 'observer'] as const

/**
 * Agent-first message kinds (binding consensus): machine-readable signal of
 * what a message is for. The encrypted body carries the human/agent prose.
 */
export const MESSAGE_KINDS = [
  'message',
  'status',
  'directive',
  'question',
  'answer',
  'decision',
  'system',
  'handoff',
] as const

/** Agent-first working states (binding consensus md.9). */
export const PRESENCE_STATES = ['active', 'idle', 'working', 'reviewing', 'blocked', 'offline'] as const

export const zExternalRef = z.object({
  refType: z.string().min(1).max(120),
  refId: z.string().min(1).max(400).optional(),
  uri: z.string().min(1).max(2000).optional(),
  label: z.string().max(400).optional(),
})
export type Chatv3ExternalRef = z.infer<typeof zExternalRef>

export const zListLimit = z.number().int().min(1).max(500).default(100)
