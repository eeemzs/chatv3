import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './drizzle.schema.index.js'

export type Chatv3Schema = typeof schema
export type Chatv3Db = NodePgDatabase<Chatv3Schema>
/** drizzle transaction handle — repos accept either form */
export type Chatv3Tx = Parameters<Parameters<Chatv3Db['transaction']>[0]>[0]
export type Chatv3Executor = Chatv3Db | Chatv3Tx

export type Chatv3DbHandle = {
  db: Chatv3Db
  pool: pg.Pool
  close: () => Promise<void>
}

/**
 * The only DB entry-point of the domain. The host passes a plain Postgres
 * URL (e.g. AOPS_PG_URL when hosted inside aops-server, or any standalone
 * Postgres for independent deployments).
 */
export function createChatv3Db(pgUrl: string, options?: { max?: number }): Chatv3DbHandle {
  const pool = new pg.Pool({ connectionString: pgUrl, max: options?.max ?? 8 })
  const db = drizzle(pool, { schema })
  return {
    db,
    pool,
    close: () => pool.end(),
  }
}
