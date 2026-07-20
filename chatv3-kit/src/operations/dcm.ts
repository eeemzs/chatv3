import { z } from 'zod'
import { CHATV3_OPERATIONS } from './catalog.js'

type Chatv3ManifestSideEffect = 'none' | 'db' | 'fs' | 'network' | 'mixed'

function toManifestSideEffect(sideEffect: 'read' | 'write' | 'destructive'): Chatv3ManifestSideEffect {
  return sideEffect === 'read' ? 'none' : 'db'
}

export type Chatv3DomainCapabilityManifest = {
  manifestVersion: string
  domain: {
    id: string
    version: string
    displayName: string
    description: string
  }
  capabilities: {
    operations: Array<{
      operationId: string
      title: string
      sideEffect: Chatv3ManifestSideEffect
      tags: string[]
      inputSchemaRef: string
    }>
  }
  contracts: {
    schemas: Record<string, unknown>
  }
  docs: {
    domain: { summary: string; notes: string[] }
    operations: Record<string, { summary: string }>
  }
}

export type BuildChatv3DcmOptions = {
  domainVersion?: string
  manifestVersion?: string
}

export function buildChatv3DomainCapabilityManifest(
  options: BuildChatv3DcmOptions = {}
): Chatv3DomainCapabilityManifest {
  const schemas: Record<string, unknown> = {}
  const operations: Chatv3DomainCapabilityManifest['capabilities']['operations'] = []
  const operationDocs: Record<string, { summary: string }> = {}

  for (const spec of CHATV3_OPERATIONS) {
    const ref = `${spec.operationId}.input`
    schemas[ref] = z.toJSONSchema(spec.input, { io: 'input' })
    operations.push({
      operationId: spec.operationId,
      title: spec.title,
      sideEffect: toManifestSideEffect(spec.sideEffect),
      tags: [`auth:${spec.auth}`, `rest:${spec.method} ${spec.pattern}`],
      inputSchemaRef: ref,
    })
    operationDocs[spec.operationId] = { summary: spec.summary }
  }

  return {
    manifestVersion: options.manifestVersion ?? '1.0.0',
    domain: {
      id: 'chatv3',
      version: options.domainVersion ?? '0.1.0',
      displayName: 'ChatV3',
      description:
        'Standalone agent-first chat: Space → Channel → Room → Message, REST+SSE, server-blind encrypted content (split-secret v0 suite, MLS-ready contract). No AOPS domain dependencies.',
    },
    capabilities: { operations },
    contracts: { schemas },
    docs: {
      domain: {
        summary: 'ChatV3 standalone chat domain (chatv3-dm/kit/host-plugin family).',
        notes: [
          'Content is always an opaque encrypted payload; the server stores wrapped epoch keys it cannot open.',
          'accessSecret authorizes join only; wrapSecret never reaches the server in any payload.',
          'v0-shared-epoch is a server-blind prototype suite: no PFS/PCS; MLS or an equivalent audited protocol gates any public/sales announcement.',
        ],
      },
      operations: operationDocs,
    },
  }
}
