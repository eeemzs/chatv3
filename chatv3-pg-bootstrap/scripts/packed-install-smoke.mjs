#!/usr/bin/env node

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Client } from 'pg'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
const packageName = packageJson.name

function resolveCatalogWorkspaceRoot() {
  const candidates = [
    process.env.CHATV3_PACK_WORKSPACE_ROOT,
    process.env.AOPS_WORKSPACE_ROOT,
    path.resolve(packageRoot, '..', '..', '..', 'apps', 'aops'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const root = path.resolve(candidate)
    if (fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) return root
  }
  throw new Error('chatv3_pg_bootstrap_pack_catalog_workspace_missing')
}

function parseArgs(argv) {
  const options = {
    keepTemp: false,
    tempRoot: os.tmpdir(),
    repoUrl:
      process.env.CHATV3_TEST_PG_URL ??
      process.env.CHATV3_PG_URL ??
      process.env.AOPS_PG_URL ??
      '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--') continue
    if (token === '--keep-temp') {
      options.keepTemp = true
      continue
    }
    if (token === '--temp-root') {
      const value = argv[index + 1]
      if (!value) throw new Error('chatv3_pg_bootstrap_smoke_missing_temp_root')
      options.tempRoot = path.resolve(value)
      index += 1
      continue
    }
    if (token === '--repo-url') {
      const value = argv[index + 1]
      if (!value) throw new Error('chatv3_pg_bootstrap_smoke_missing_repo_url')
      options.repoUrl = value
      index += 1
      continue
    }
    throw new Error(`chatv3_pg_bootstrap_smoke_unknown_option:${token}`)
  }
  return options
}

function detachedPackageManagerEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    const normalized = key.toLowerCase()
    if (normalized.startsWith('npm_') || normalized.startsWith('pnpm_')) delete env[key]
  }
  return env
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    env: options.env ?? (command === 'pnpm' ? detachedPackageManagerEnv() : process.env),
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: options.shell ?? process.platform === 'win32',
  })
  if (result.error) throw result.error
  if ((result.status ?? 1) !== 0) {
    const detail = options.capture
      ? [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join('\n')
      : ''
    throw new Error(`chatv3_pg_bootstrap_smoke_command_failed:${command}:${args.join(' ')}${detail ? `\n${detail}` : ''}`)
  }
  return result
}

function runPnpm(args, options = {}) {
  const candidates = [
    process.env.CHATV3_PNPM_BIN,
    process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'npm', 'pnpm.cmd')
      : undefined,
    process.platform === 'win32' && process.env.PNPM_HOME
      ? path.join(process.env.PNPM_HOME, 'pnpm.cmd')
      : undefined,
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    return run(candidate, args, {
      ...options,
      env: detachedPackageManagerEnv(),
      shell: process.platform === 'win32',
    })
  }
  return run('pnpm', args, { ...options, env: detachedPackageManagerEnv() })
}

function pathKey(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function readClosure(migrationsDir) {
  const realMigrationsDir = fs.realpathSync(migrationsDir)
  const journalPath = path.join(realMigrationsDir, 'meta', '_journal.json')
  assert.ok(isWithin(realMigrationsDir, journalPath), 'journal path escaped migration root')
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
  assert.ok(Array.isArray(journal.entries) && journal.entries.length > 0, 'migration journal is empty')

  const tags = []
  const expectedSql = []
  const tables = new Set()
  for (const [position, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, position, `journal index is not contiguous at ${position}`)
    assert.match(entry.tag, /^\d{4}_[a-zA-Z0-9_-]+$/)
    assert.ok(!tags.includes(entry.tag), `duplicate migration tag: ${entry.tag}`)
    tags.push(entry.tag)

    const sqlName = `${entry.tag}.sql`
    const sqlPath = path.join(realMigrationsDir, sqlName)
    assert.ok(isWithin(realMigrationsDir, sqlPath), `migration SQL escaped closure: ${sqlName}`)
    assert.ok(fs.existsSync(sqlPath), `migration SQL missing: ${sqlName}`)
    const sql = fs.readFileSync(sqlPath, 'utf8')
    assert.ok(sql.trim().length > 0, `migration SQL is empty: ${sqlName}`)
    expectedSql.push(sqlName)
    for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"/g)) {
      if (match[1].startsWith('chatv3-')) tables.add(match[1])
    }
  }

  const actualSql = fs.readdirSync(realMigrationsDir).filter((name) => name.endsWith('.sql')).sort()
  expectedSql.sort()
  assert.deepEqual(actualSql, expectedSql, 'packed migration SQL set differs from its journal')
  return { tags, tables: [...tables].sort() }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

async function runDisposablePg({ baseUrl, bootstrap, closure }) {
  if (!baseUrl) return { skipped: true, reason: 'missing CHATV3_TEST_PG_URL/CHATV3_PG_URL/AOPS_PG_URL' }

  const databaseName = `chatv3_pack_${randomUUID().replaceAll('-', '')}`
  const repoUrl = databaseUrl(baseUrl, databaseName)
  const admin = new Client({ connectionString: baseUrl })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
  } finally {
    await admin.end()
  }

  try {
    const first = await bootstrap({ repoUrl })
    assert.deepEqual(first.applied, closure.tags)
    assert.deepEqual(first.skipped, [])

    const second = await bootstrap({ repoUrl })
    assert.deepEqual(second.applied, [])
    assert.deepEqual(second.skipped, closure.tags)

    const probe = new Client({ connectionString: repoUrl })
    await probe.connect()
    try {
      const tableRows = await probe.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name LIKE 'chatv3-%'
          ORDER BY table_name`,
      )
      assert.deepEqual(tableRows.rows.map((row) => row.table_name), closure.tables)
      const journalRows = await probe.query('SELECT tag FROM public.chatv3_schema_migrations ORDER BY tag')
      assert.deepEqual(journalRows.rows.map((row) => row.tag), [...closure.tags].sort())
    } finally {
      await probe.end()
    }
    return {
      skipped: false,
      databaseName,
      migrationCount: closure.tags.length,
      tableCount: closure.tables.length,
    }
  } finally {
    const cleanup = new Client({ connectionString: baseUrl })
    await cleanup.connect()
    try {
      await cleanup.query(
        `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()`,
        [databaseName],
      )
      await cleanup.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`)
    } finally {
      await cleanup.end()
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  fs.mkdirSync(options.tempRoot, { recursive: true })
  const runRoot = fs.mkdtempSync(path.join(options.tempRoot, 'chatv3-pg-bootstrap-pack-'))
  const tarballPath = path.join(runRoot, 'chatv3-pg-bootstrap.tgz')
  const installRoot = path.join(runRoot, 'install')
  let outcome = 'failed'

  try {
    fs.mkdirSync(installRoot, { recursive: true })
    const catalogWorkspaceRoot = resolveCatalogWorkspaceRoot()
    runPnpm(
      [`--dir=${catalogWorkspaceRoot}`, `--filter=${packageName}`, 'pack', `--out=${tarballPath}`],
      { cwd: packageRoot },
    )
    writeJson(path.join(installRoot, 'package.json'), {
      name: 'chatv3-pg-bootstrap-packed-smoke',
      private: true,
      type: 'module',
      dependencies: {
        [packageName]: `file:${tarballPath.split(path.sep).join('/')}`,
      },
    })
    writeJson(path.join(installRoot, 'pnpm-workspace.yaml'), { packages: ['.'] })
    runPnpm(['install', '--ignore-scripts', '--no-frozen-lockfile'], { cwd: installRoot })

    const installedRoot = fs.realpathSync(path.join(installRoot, 'node_modules', '@aopslab', 'domain-pg-bootstrap-chatv3'))
    const installed = await import(pathToFileURL(path.join(installedRoot, 'dist', 'index.js')).href)
    const packagePaths = installed.resolveChatv3PgBootstrapPaths()
    assert.equal(packagePaths.source, 'package')
    assert.equal(pathKey(packagePaths.packageRoot), pathKey(installedRoot))
    assert.equal(pathKey(packagePaths.domainRoot), pathKey(installedRoot))
    assert.ok(isWithin(installedRoot, packagePaths.migrationsDir), 'packed migrations are outside installed package')
    const closure = readClosure(packagePaths.migrationsDir)

    const fallbackDomain = path.join(runRoot, 'fallback-domain')
    const fallbackWorkspace = path.join(runRoot, 'fallback-workspace')
    fs.mkdirSync(path.join(fallbackDomain, 'drizzle-out'), { recursive: true })
    fs.cpSync(packagePaths.migrationsDir, path.join(fallbackDomain, 'drizzle-out', 'chatv3'), { recursive: true })
    fs.mkdirSync(path.join(fallbackWorkspace, 'domains', 'chatv3', 'drizzle-out'), { recursive: true })
    fs.cpSync(
      packagePaths.migrationsDir,
      path.join(fallbackWorkspace, 'domains', 'chatv3', 'drizzle-out', 'chatv3'),
      { recursive: true },
    )

    assert.equal(
      installed.resolveChatv3PgBootstrapPaths(fallbackDomain).source,
      'package',
      'package-local closure must win over explicit fallbacks',
    )

    const installedDrizzleOut = path.join(installedRoot, 'drizzle-out')
    const hiddenDrizzleOut = path.join(installedRoot, 'drizzle-out.packed-smoke-hidden')
    fs.renameSync(installedDrizzleOut, hiddenDrizzleOut)
    try {
      const explicitDomainPaths = installed.resolveChatv3PgBootstrapPaths(fallbackDomain)
      assert.equal(explicitDomainPaths.source, 'explicit-domain')
      assert.equal(pathKey(explicitDomainPaths.domainRoot), pathKey(fallbackDomain))
      readClosure(explicitDomainPaths.migrationsDir)

      const explicitWorkspacePaths = installed.resolveChatv3PgBootstrapPaths(fallbackWorkspace)
      assert.equal(explicitWorkspacePaths.source, 'explicit-workspace')
      assert.equal(pathKey(explicitWorkspacePaths.domainRoot), pathKey(path.join(fallbackWorkspace, 'domains', 'chatv3')))
      readClosure(explicitWorkspacePaths.migrationsDir)
    } finally {
      fs.renameSync(hiddenDrizzleOut, installedDrizzleOut)
    }

    const pg = await runDisposablePg({
      baseUrl: options.repoUrl,
      bootstrap: installed.applyChatv3PgSchema,
      closure,
    })
    outcome = 'passed'
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        packageName,
        migrationCount: closure.tags.length,
        tableCount: closure.tables.length,
        packageContained: true,
        explicitDomainFallback: true,
        explicitWorkspaceFallback: true,
        pg,
      }, null, 2)}\n`,
    )
  } finally {
    if (options.keepTemp) {
      process.stderr.write(`[chatv3-pg-bootstrap-packed-smoke] kept ${runRoot} (${outcome})\n`)
    } else {
      fs.rmSync(runRoot, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[chatv3-pg-bootstrap-packed-smoke] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
