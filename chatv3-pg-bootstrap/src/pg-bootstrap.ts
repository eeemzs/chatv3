import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

// Same owned-bootstrap pattern as @aopslab/domain-pg-bootstrap-projectman:
// the domain carries its drizzle-out SQL set and applies it idempotently via
// a tag journal. ChatV3 is greenfield, so there is no legacy reset path.
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const MIGRATION_TABLE = 'chatv3_schema_migrations'

type Chatv3MigrationJournalEntry = {
  idx: number
  tag: string
}

export type Chatv3PgBootstrapSource =
  | 'package'
  | 'explicit-domain'
  | 'explicit-workspace'
  | 'workspace-domain'

export type Chatv3PgBootstrapPaths = {
  domainRoot: string
  packageRoot: string
  source: Chatv3PgBootstrapSource
  migrationsDir: string
  migrationsDirExists: boolean
  journalPath: string
  journalExists: boolean
}

type BootstrapRootCandidate = {
  root: string
  source: Chatv3PgBootstrapSource
}

function resolvePackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function candidatePaths(candidate: BootstrapRootCandidate) {
  const migrationsDir = path.join(candidate.root, 'drizzle-out', 'chatv3')
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json')
  return {
    ...candidate,
    migrationsDir,
    migrationsDirExists: existsSync(migrationsDir),
    journalPath,
    journalExists: existsSync(journalPath),
  }
}

function resolveChatv3BootstrapRoot(domainRoot?: string): ReturnType<typeof candidatePaths> {
  const packageRoot = resolvePackageRoot()
  const candidates: BootstrapRootCandidate[] = [{ root: packageRoot, source: 'package' }]

  if (domainRoot) {
    const explicitRoot = path.resolve(domainRoot)
    candidates.push(
      { root: explicitRoot, source: 'explicit-domain' },
      { root: path.join(explicitRoot, 'domains', 'chatv3'), source: 'explicit-workspace' },
      { root: path.join(explicitRoot, 'chatv3'), source: 'explicit-workspace' },
    )
  }

  candidates.push({ root: path.resolve(packageRoot, '..'), source: 'workspace-domain' })

  const unique = new Map<string, BootstrapRootCandidate>()
  for (const candidate of candidates) {
    const key = process.platform === 'win32' ? candidate.root.toLowerCase() : candidate.root
    if (!unique.has(key)) unique.set(key, candidate)
  }

  const resolved = [...unique.values()].map(candidatePaths)
  const packaged = resolved[0]
  if (packaged.migrationsDirExists || packaged.journalExists) return packaged
  return resolved.slice(1).find((candidate) => candidate.migrationsDirExists || candidate.journalExists) ?? packaged
}

export function resolveChatv3PgBootstrapPaths(domainRoot?: string): Chatv3PgBootstrapPaths {
  const packageRoot = resolvePackageRoot()
  const resolved = resolveChatv3BootstrapRoot(domainRoot)
  return {
    domainRoot: resolved.root,
    packageRoot,
    source: resolved.source,
    migrationsDir: resolved.migrationsDir,
    migrationsDirExists: resolved.migrationsDirExists,
    journalPath: resolved.journalPath,
    journalExists: resolved.journalExists,
  }
}

function splitMigrationStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function readMigrationJournal(paths: Chatv3PgBootstrapPaths): Chatv3MigrationJournalEntry[] {
  if (!paths.journalExists) {
    throw new Error(`chatv3_pg_bootstrap_journal_missing:${paths.journalPath}`)
  }
  const payload = JSON.parse(readFileSync(paths.journalPath, 'utf8')) as { entries?: unknown[] }
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    throw new Error(`chatv3_pg_bootstrap_journal_empty:${paths.journalPath}`)
  }

  const entries = payload.entries
    .map((rawEntry, position) => {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        throw new Error(`chatv3_pg_bootstrap_journal_entry_invalid:${String(position)}`)
      }
      const entry = rawEntry as { idx?: unknown; tag?: unknown }
      if (!Number.isSafeInteger(entry.idx) || Number(entry.idx) < 0) {
        throw new Error(`chatv3_pg_bootstrap_journal_idx_invalid:${String(entry.idx)}`)
      }
      if (typeof entry.tag !== 'string' || !/^\d{4}_[a-zA-Z0-9_-]+$/.test(entry.tag)) {
        throw new Error(`chatv3_pg_bootstrap_journal_tag_invalid:${String(entry.tag)}`)
      }
      return { idx: Number(entry.idx), tag: entry.tag }
    })
    .sort((left, right) => left.idx - right.idx)

  const indexes = new Set<number>()
  const tags = new Set<string>()
  for (const [position, entry] of entries.entries()) {
    if (indexes.has(entry.idx)) throw new Error(`chatv3_pg_bootstrap_journal_idx_duplicate:${String(entry.idx)}`)
    if (tags.has(entry.tag)) throw new Error(`chatv3_pg_bootstrap_journal_tag_duplicate:${entry.tag}`)
    if (entry.idx !== position) {
      throw new Error(`chatv3_pg_bootstrap_journal_idx_non_contiguous:expected=${String(position)}:actual=${String(entry.idx)}`)
    }
    indexes.add(entry.idx)
    tags.add(entry.tag)
    const sqlPath = resolveMigrationSqlPath(paths, entry.tag)
    if (!existsSync(sqlPath)) throw new Error(`chatv3_pg_bootstrap_migration_missing:${sqlPath}`)
  }
  return entries
}

function resolveMigrationSqlPath(paths: Chatv3PgBootstrapPaths, tag: string): string {
  if (!/^\d{4}_[a-zA-Z0-9_-]+$/.test(tag)) {
    throw new Error(`chatv3_pg_bootstrap_migration_tag_unsafe:${tag}`)
  }
  const sqlPath = path.resolve(paths.migrationsDir, `${tag}.sql`)
  const relative = path.relative(path.resolve(paths.migrationsDir), sqlPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`chatv3_pg_bootstrap_migration_path_escape:${tag}`)
  }
  return sqlPath
}

async function withPgClient<T>(repoUrl: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: repoUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function ensureMigrationTable(client: Client): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.${MIGRATION_TABLE} (
      tag text PRIMARY KEY,
      applied_at timestamp with time zone NOT NULL DEFAULT now()
    )`,
  )
}

async function readAppliedTags(client: Client): Promise<Set<string>> {
  const result = await client.query<{ tag: string }>(`SELECT tag FROM public.${MIGRATION_TABLE}`)
  return new Set(result.rows.map((row) => row.tag))
}

export type ApplyChatv3PgSchemaResult = {
  applied: string[]
  skipped: string[]
}

export async function applyChatv3PgSchema(params: {
  repoUrl: string
  domainRoot?: string
}): Promise<ApplyChatv3PgSchemaResult> {
  const paths = resolveChatv3PgBootstrapPaths(params.domainRoot)
  const journal = readMigrationJournal(paths)

  return withPgClient(params.repoUrl, async (client) => {
    await ensureMigrationTable(client)
    const appliedTags = await readAppliedTags(client)
    const applied: string[] = []
    const skipped: string[] = []

    for (const entry of journal) {
      if (appliedTags.has(entry.tag)) {
        skipped.push(entry.tag)
        continue
      }
      const sqlPath = resolveMigrationSqlPath(paths, entry.tag)
      if (!existsSync(sqlPath)) {
        throw new Error(`chatv3_pg_bootstrap_migration_missing:${sqlPath}`)
      }
      const statements = splitMigrationStatements(readFileSync(sqlPath, 'utf8'))
      if (statements.length === 0) {
        throw new Error(`chatv3_pg_bootstrap_migration_empty:${sqlPath}`)
      }
      try {
        await client.query('BEGIN')
        for (const statement of statements) {
          await client.query(statement)
        }
        await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1)`, [entry.tag])
        await client.query('COMMIT')
        applied.push(entry.tag)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    }

    return { applied, skipped }
  })
}
