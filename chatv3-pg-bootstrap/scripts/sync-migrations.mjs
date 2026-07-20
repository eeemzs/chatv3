#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const domainRoot = path.resolve(packageRoot, '..')
const sourceDir = path.join(domainRoot, 'drizzle-out', 'chatv3')
const targetDir = path.join(packageRoot, 'drizzle-out', 'chatv3')
const journalRelativePath = path.join('meta', '_journal.json')

function fail(code, detail) {
  throw new Error(`${code}:${detail}`)
}

function validateClosure(root, label) {
  const journalPath = path.join(root, journalRelativePath)
  if (!fs.existsSync(journalPath)) fail(`chatv3_pg_bootstrap_${label}_journal_missing`, journalPath)

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    fail(`chatv3_pg_bootstrap_${label}_journal_empty`, journalPath)
  }

  const expectedSql = []
  for (const [position, entry] of journal.entries.entries()) {
    if (!Number.isSafeInteger(entry?.idx) || entry.idx !== position) {
      fail(`chatv3_pg_bootstrap_${label}_journal_idx_invalid`, String(entry?.idx))
    }
    if (typeof entry?.tag !== 'string' || !/^\d{4}_[a-zA-Z0-9_-]+$/.test(entry.tag)) {
      fail(`chatv3_pg_bootstrap_${label}_journal_tag_invalid`, String(entry?.tag))
    }
    const sqlName = `${entry.tag}.sql`
    const sqlPath = path.join(root, sqlName)
    if (!fs.existsSync(sqlPath)) fail(`chatv3_pg_bootstrap_${label}_sql_missing`, sqlPath)
    if (fs.readFileSync(sqlPath, 'utf8').trim().length === 0) {
      fail(`chatv3_pg_bootstrap_${label}_sql_empty`, sqlPath)
    }
    expectedSql.push(sqlName)
  }

  const actualSql = fs.readdirSync(root).filter((name) => name.endsWith('.sql')).sort()
  expectedSql.sort()
  if (actualSql.length !== expectedSql.length || !actualSql.every((name, index) => name === expectedSql[index])) {
    fail(
      `chatv3_pg_bootstrap_${label}_sql_closure_mismatch`,
      `expected=${expectedSql.join(',')}:actual=${actualSql.join(',')}`,
    )
  }
  return { journalPath, migrationCount: expectedSql.length }
}

const source = validateClosure(sourceDir, 'source')
fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(path.dirname(targetDir), { recursive: true })
fs.cpSync(sourceDir, targetDir, { recursive: true })
const target = validateClosure(targetDir, 'target')

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    sourceDir,
    targetDir,
    migrationCount: target.migrationCount,
    sourceJournal: source.journalPath,
    targetJournal: target.journalPath,
  })}\n`,
)
