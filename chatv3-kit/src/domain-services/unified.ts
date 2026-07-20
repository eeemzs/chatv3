import {
  Chatv3Db,
  Chatv3DbHandle,
  Chatv3Repos,
  Chatv3Services,
  createChatv3Db,
  createChatv3Repos,
  createChatv3Services,
} from '@aopslab/domain-dm-chatv3'
import { Chatv3OperationSpec, getChatv3OperationById } from '../operations/catalog.js'
import { Chatv3RouteRequest, executeChatv3Operation } from '../operations/executor.js'
import { Chatv3Error } from '@aopslab/domain-dm-chatv3'

/**
 * Unified kit facade (structural counterpart of the hexagen kit provider):
 * one entry-point that owns the db handle and exposes services, repos and
 * the operation executor. Hosts (aops-server plugin, standalone runtimes,
 * tests) consume ChatV3 through this facade instead of wiring dm internals.
 */
export type CreateChatv3KitOptions = {
  pgUrl: string
  poolMax?: number
}

export type Chatv3Kit = {
  db: Chatv3Db
  services: Chatv3Services
  repos: Chatv3Repos
  /** execute a catalog operation with transport-level request parts */
  execute(spec: Chatv3OperationSpec, request: Chatv3RouteRequest): Promise<unknown>
  executeByOperationId(operationId: string, request: Chatv3RouteRequest): Promise<unknown>
  ping(): Promise<boolean>
  close(): Promise<void>
}

export function createChatv3Kit(options: CreateChatv3KitOptions): Chatv3Kit {
  const handle: Chatv3DbHandle = createChatv3Db(options.pgUrl, { max: options.poolMax })
  const services = createChatv3Services(handle.db)
  const repos = createChatv3Repos(handle.db)

  return {
    db: handle.db,
    services,
    repos,
    execute: (spec, request) => executeChatv3Operation({ db: handle.db, services }, spec, request),
    executeByOperationId: (operationId, request) => {
      const spec = getChatv3OperationById(operationId)
      if (!spec) throw new Chatv3Error('not_found', `operation ${operationId} not found`)
      return executeChatv3Operation({ db: handle.db, services }, spec, request)
    },
    ping: async () => {
      await handle.pool.query('SELECT 1')
      return true
    },
    close: () => handle.close(),
  }
}
