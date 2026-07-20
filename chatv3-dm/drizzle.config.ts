import { defineConfig } from 'drizzle-kit'

// ChatV3 carries its own migration set at the domain root (same layout as
// projectman: domains/chatv3/drizzle-out/chatv3). Applying them is owned by
// @aopslab/domain-pg-bootstrap-chatv3, wired in chatv3-host-plugin setup.
export default defineConfig({
  dialect: 'postgresql',
  schema: './dist/infrastructure/db/drizzle.schema.index.js',
  out: '../drizzle-out/chatv3',
  tablesFilter: ['chatv3-*'],
})
