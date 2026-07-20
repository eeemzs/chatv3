import { z } from 'zod'
import {
  ACTOR_KINDS,
  MEMBER_ROLE_KEYS,
  MESSAGE_KINDS,
  PRESENCE_STATES,
  ROOM_KINDS,
  zExternalRef,
  zHandle,
  zListLimit,
  zSlug,
  zTenantId,
  zTitle,
  zUuid,
} from './common.js'
import {
  zCryptoEnvelope,
  zDevicePublish,
  zEpochPublish,
  zChannelEncryptionMode,
  zKeyPackagePublish,
  zMemberKeyPackageEnvelope,
  zRecoveryState,
  zRecoveryPublicKey,
  zUserPrivateKeyBackup,
} from './crypto.js'

/**
 * Single source of truth for every ChatV3 operation contract. chatv3-kit
 * projects these into the operation catalog, REST routes and the capability
 * manifest — nothing is hand-written twice (binding style condition).
 */

// ---------------------------------------------------------------- space ----
export const zSpaceCreateInput = z.object({
  tenantId: zTenantId,
  slug: zSlug,
  title: zTitle,
  description: z.string().max(4000).optional(),
  externalRefs: z.array(zExternalRef).max(50).default([]),
  createdBy: zHandle.optional(),
})

export const zSpaceGetInput = z.object({
  tenantId: zTenantId,
  spaceId: zUuid.optional(),
  slug: zSlug.optional(),
})

export const zSpaceListInput = z.object({
  tenantId: zTenantId,
  status: z.enum(['active', 'archived']).optional(),
  limit: zListLimit,
})

export const zSpaceArchiveInput = z.object({
  tenantId: zTenantId,
  spaceId: zUuid,
  updatedBy: zHandle.optional(),
})

// -------------------------------------------------------------- channel ----
/**
 * Channel creation is a composite, single client call: the creator client
 * generates accessSecret + wrapSecret + epoch key locally and submits only
 * derived/wrapped material (verifierHash, wrappedKeyBlob). The server mints
 * the creator's personal member token and returns it exactly once.
 */
export const zChannelCreateInput = z.object({
  tenantId: zTenantId,
  spaceId: zUuid,
  slug: zSlug,
  title: zTitle,
  purpose: z.string().max(4000).optional(),
  guidanceMarkdown: z.string().max(16000).optional(),
  generalRoomGuidanceMarkdown: z.string().max(16000).optional(),
  encryptionMode: zChannelEncryptionMode.default('e2e'),
  accessKey: z.object({
    keyId: z.string().min(8).max(80),
    verifierHash: z.string().min(16).max(200),
    label: z.string().max(200).optional(),
  }),
  epoch: zEpochPublish.optional(),
  creator: z.object({
    handle: zHandle,
    displayName: z.string().max(200).optional(),
    actorKind: z.enum(ACTOR_KINDS).default('agent'),
    device: zDevicePublish.optional(),
  }),
})

export const zChannelGetInput = z.object({
  tenantId: zTenantId,
  channelId: zUuid,
})

export const zChannelListInput = z.object({
  tenantId: zTenantId,
  spaceId: zUuid.optional(),
  status: z.enum(['active', 'archived']).optional(),
  limit: zListLimit,
})

export const zChannelListMineInput = z.object({
  tenantId: zTenantId,
  spaceId: zUuid.optional(),
  status: z.enum(['active', 'archived']).optional(),
  limit: zListLimit,
})

export const zChannelEpochKeysInput = z.object({
  tenantId: zTenantId,
  channelId: zUuid,
})

export const zChannelPurgeBeforeInput = z.object({
  tenantId: zTenantId,
  beforeDate: z.string().datetime(),
  dryRun: z.boolean().default(true),
  /** Required when dryRun=false; keeps destructive cleanup behind a second gate. */
  confirm: z.boolean().default(false),
})

export const zChannelArchiveInput = z.object({
  tenantId: zTenantId,
  channelId: zUuid,
  updatedBy: zHandle.optional(),
})

export const zChannelUnarchiveInput = z.object({
  tenantId: zTenantId,
  channelId: zUuid,
  updatedBy: zHandle.optional(),
})

export const zChannelDeleteInput = z.object({
  tenantId: zTenantId,
  channelId: zUuid,
  /** must equal the channel slug — cheap server-side fat-finger guard */
  confirmSlug: zSlug,
})

// ----------------------------------------------------------------- join ----
export const zChannelJoinInput = z.object({
  tenantId: zTenantId,
  channelId: zUuid,
  keyId: z.string().min(8).max(80),
  accessSecret: z.string().min(16).max(400),
  handle: zHandle,
  displayName: z.string().max(200).optional(),
  actorKind: z.enum(ACTOR_KINDS).default('agent'),
  device: zDevicePublish.optional(),
})

// ----------------------------------------------------------------- room ----
export const zRoomCreateInput = z.object({
  channelId: zUuid,
  slug: zSlug,
  title: zTitle,
  kind: z.enum(ROOM_KINDS).default('session'),
  purpose: z.string().max(4000).optional(),
  guidanceMarkdown: z.string().max(16000).optional(),
  epoch: zEpochPublish.optional(),
})

export const zRoomListInput = z.object({
  channelId: zUuid,
  status: z.enum(['active', 'archived']).optional(),
  limit: zListLimit,
})

export const zRoomArchiveInput = z.object({
  roomId: zUuid,
})

export const zRoomDeleteInput = z.object({
  roomId: zUuid,
  confirmSlug: zSlug,
})

export const zRoomEpochListInput = z.object({
  roomId: zUuid,
})

// --------------------------------------------------------------- member ----
export const zMemberListInput = z.object({
  channelId: zUuid,
  status: z.enum(['active', 'removed']).optional(),
  limit: zListLimit,
})

export const zMemberUpdateInput = z.object({
  memberId: zUuid,
  displayName: z.string().max(200).optional(),
  roleKey: z.enum(MEMBER_ROLE_KEYS).optional(),
  status: z.enum(['active', 'removed']).optional(),
})

export const zMemberTokenRemintInput = z.object({
  tenantId: zTenantId,
  channelId: zUuid,
})

// -------------------------------------------------------------- message ----
export const zMessageSendInput = z.object({
  roomId: zUuid,
  kind: z.enum(MESSAGE_KINDS).default('message'),
  envelope: zCryptoEnvelope,
  mentions: z.array(zUuid).max(50).default([]),
  replyToSeq: z.number().int().min(1).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
})

export const zMessageListInput = z.object({
  roomId: zUuid,
  afterSeq: z.number().int().min(0).default(0),
  limit: zListLimit,
})

// --------------------------------------------------------------- cursor ----
export const zMarkReadInput = z.object({
  roomId: zUuid,
  lastReadSeq: z.number().int().min(0),
})

export const zMarkDeliveredInput = z.object({
  roomId: zUuid,
  deliveredSeq: z.number().int().min(0),
})

/** explicit directive acknowledgement — separate from read (agent workflows) */
export const zAckInput = z.object({
  roomId: zUuid,
  ackSeq: z.number().int().min(0),
})

export const zReceiptsInput = z.object({
  roomId: zUuid,
})

// ------------------------------------------------------------- presence ----
export const zPresenceSetInput = z.object({
  roomId: zUuid,
  state: z.enum(PRESENCE_STATES).default('active'),
  note: z.string().max(400).optional(),
  /** heartbeat ttl; stale rows read as offline */
  ttlSec: z.number().int().min(10).max(3600).default(90),
})

export const zPresenceListInput = z.object({
  roomId: zUuid,
})

// -------------------------------------------------------------- webhook ----
export const zWebhookCreateInput = z.object({
  channelId: zUuid,
  url: z.string().url().max(2000),
  /** HMAC-SHA256 signing secret; generated client-side, stored server-side */
  signingSecret: z.string().min(16).max(400),
  events: z.array(z.enum(['message', 'presence', 'system'])).max(10).default([]),
  label: z.string().max(200).optional(),
})

export const zWebhookListInput = z.object({
  channelId: zUuid,
})

export const zWebhookRemoveInput = z.object({
  webhookId: zUuid,
})

// --------------------------------------------------------------- rotate ----
/**
 * Key rotation: client generates a fresh accessSecret + wrapSecret + epoch
 * keys for every active room and submits derived material only. One tx:
 * old access keys revoked, new verifier inserted, per-room epochs bumped.
 */
export const zChannelRotateInput = z.object({
  channelId: zUuid,
  accessKey: z.object({
    keyId: z.string().min(8).max(80),
    verifierHash: z.string().min(16).max(200),
    label: z.string().max(200).optional(),
  }),
  epochs: z
    .array(
      z.object({
        roomId: zUuid,
        epoch: zEpochPublish,
      })
    )
    .min(1)
    .max(200),
})

// ------------------------------------------------------------- recovery ----
/**
 * Account-bound user-key backup. Re-registering the same public key rewrites
 * only the encrypted backup in the same keyVersion (password/PIN change).
 * Registering a different public key is a server-controlled key rotation:
 * keyVersion increments by one and existing member key packages are marked
 * stale with staleReason=user-key-rotated.
 */
export const zUserKeyRegisterInput = z
  .object({
    tenantId: zTenantId,
    /** Initial version hint only; after first registration the server controls bumps. */
    keyVersion: z.number().int().min(1).max(1000000).default(1),
    publicKey: zRecoveryPublicKey,
    privateKeyBackup: zUserPrivateKeyBackup,
  })
  .strict()

export const zUserKeyGetInput = z
  .object({
    tenantId: zTenantId,
  })
  .strict()

/**
 * Per-channel package sealed to a member's registered public key. Owner-assisted
 * packaging is safe because the server stores an opaque ECDH ciphertext; the
 * helper never receives the recipient private key or plaintext wrap secret.
 */
export const zMemberKeyPackagePutInput = z
  .object({
    tenantId: zTenantId,
    channelId: zUuid,
    memberId: zUuid,
    recipientUserKeyId: zUuid,
    recipientKeyVersion: z.number().int().min(1).max(1000000),
    envelope: zMemberKeyPackageEnvelope,
  })
  .strict()

export const zMemberKeyPackageGetInput = z
  .object({
    tenantId: zTenantId,
    channelId: zUuid,
    memberId: zUuid,
  })
  .strict()

export const zMemberRecoveryGetInput = z
  .object({
    tenantId: zTenantId,
    channelId: zUuid,
    /**
     * Default false keeps the GET recovery read side-effect free for ordinary
     * status polling. Set true only when a client has no valid local member
     * token and explicitly wants membership token recovery; token recovery
     * still does not unlock encrypted content.
     */
    mintToken: z
      .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
      .default(false),
  })
  .strict()

export const zMemberRecoveryResult = z
  .object({
    recoveryState: zRecoveryState,
  })
  .passthrough()

// --------------------------------------------------------------- device ----
export const zDeviceRegisterInput = z.object({
  device: zDevicePublish,
})

export const zKeyPackagePublishInput = zKeyPackagePublish

// -------------------------------------------------------------- binding ----
export const zBindingAddInput = z.object({
  channelId: zUuid,
  roomId: zUuid.optional(),
  bindingType: z.string().min(1).max(120),
  refId: z.string().max(400).optional(),
  uri: z.string().max(2000).optional(),
  title: z.string().max(400).optional(),
  note: z.string().max(2000).optional(),
})

export const zBindingListInput = z.object({
  channelId: zUuid,
  roomId: zUuid.optional(),
})

export const zBindingRemoveInput = z.object({
  bindingId: zUuid,
})

export type Chatv3SpaceCreateInput = z.infer<typeof zSpaceCreateInput>
export type Chatv3ChannelCreateInput = z.infer<typeof zChannelCreateInput>
export type Chatv3ChannelJoinInput = z.infer<typeof zChannelJoinInput>
export type Chatv3RoomCreateInput = z.infer<typeof zRoomCreateInput>
export type Chatv3MessageSendInput = z.infer<typeof zMessageSendInput>
export type Chatv3UserKeyRegisterInput = z.infer<typeof zUserKeyRegisterInput>
export type Chatv3MemberKeyPackagePutInput = z.infer<typeof zMemberKeyPackagePutInput>
