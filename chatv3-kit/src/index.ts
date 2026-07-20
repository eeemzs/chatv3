export * from './operations/catalog.js'
export * from './operations/executor.js'
export * from './operations/dcm.js'
export * from './domain-services/unified.js'

import { CHATV3_OPERATIONS } from './operations/catalog.js'

export type Chatv3HostRouteEntry = {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  pattern: string
  operation: string
  summary: string
}

/** REST projection consumed by chatv3-host-plugin's manifest.routes. */
export function buildChatv3HostRoutes(): Chatv3HostRouteEntry[] {
  return CHATV3_OPERATIONS.map((spec) => ({
    id: spec.operationId.replace(/\./g, '-'),
    method: spec.method,
    pattern: spec.pattern,
    operation: spec.operationId,
    summary: spec.summary,
  }))
}
