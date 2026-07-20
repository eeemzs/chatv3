#!/usr/bin/env node
// Structural counterpart of hexagen `manifest:emit`: derived artifacts are
// regenerated from the kit catalog (single source) — never hand-edited.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const kitRoot = path.resolve(here, '..')
const outDir = path.join(kitRoot, 'dist', 'manifests')

const { buildChatv3DomainCapabilityManifest, buildChatv3HostRoutes, CHATV3_OPERATIONS } = await import(
  pathToFileURL(path.join(kitRoot, 'dist', 'index.js')).href
)

const dcm = buildChatv3DomainCapabilityManifest()
const routes = buildChatv3HostRoutes()
const agentManifest = {
  domain: 'chatv3',
  version: dcm.domain.version,
  tools: CHATV3_OPERATIONS.map((op) => ({
    toolId: op.operationId,
    title: op.title,
    sideEffect: op.sideEffect,
    auth: op.auth,
    rest: `${op.method} ${op.pattern}`,
  })),
}

mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, 'dcm-manifest.json'), JSON.stringify(dcm, null, 2))
writeFileSync(path.join(outDir, 'host-routes.json'), JSON.stringify(routes, null, 2))
writeFileSync(path.join(outDir, 'agent-manifest.json'), JSON.stringify(agentManifest, null, 2))
console.log(`chatv3 manifests written to ${outDir}: dcm=${dcm.capabilities.operations.length} ops, routes=${routes.length}, tools=${agentManifest.tools.length}`)
