import { z } from 'zod'
import { Chatv3Db } from '../../infrastructure/db/client.js'
import { IdbChatv3Space } from '../../infrastructure/db/drizzle.schema.index.js'
import {
  zSpaceArchiveInput,
  zSpaceCreateInput,
  zSpaceGetInput,
  zSpaceListInput,
} from '../../domain/models/operations.js'
import { Chatv3Error, forbidden, notFound } from '../errors.js'
import { Chatv3Repos } from '../ports/repository-ports.js'
import { createChatv3Repos } from '../factories/repository-factory.js'
import { Chatv3AdminActor, adminActorLabel, isScopedAdminAuthority, requireAdminAuthority } from './helpers.js'

const SPACE_ADMIN_PERMISSIONS = ['chatv3.space.manage'] as const

export class Chatv3SpaceService {
  private readonly repos: Chatv3Repos

  constructor(db: Chatv3Db) {
    this.repos = createChatv3Repos(db)
  }

  async create(input: z.infer<typeof zSpaceCreateInput>): Promise<IdbChatv3Space> {
    return this.repos.space
      .insert({
        tenantId: input.tenantId,
        slug: input.slug,
        title: input.title,
        description: input.description,
        externalRefs: input.externalRefs,
        createdBy: input.createdBy,
      })
      .catch((error: unknown) => {
        throw mapUniqueViolation(error, 'space slug already exists in tenant')
      })
  }

  async get(input: z.infer<typeof zSpaceGetInput>): Promise<IdbChatv3Space> {
    if (!input.spaceId && !input.slug) throw new Chatv3Error('invalid_input', 'spaceId or slug required')
    const space = input.spaceId
      ? await this.repos.space.byId(input.spaceId)
      : await this.repos.space.byTenantSlug(input.tenantId, input.slug!)
    if (!space) throw notFound('space')
    return space
  }

  async list(input: z.infer<typeof zSpaceListInput>, actor: Chatv3AdminActor): Promise<IdbChatv3Space[]> {
    requireScopedSpaceAdmin(actor)
    return this.repos.space.list({ tenantId: input.tenantId, status: input.status, limit: input.limit })
  }

  async archive(input: z.infer<typeof zSpaceArchiveInput>, actor: Chatv3AdminActor): Promise<IdbChatv3Space> {
    requireScopedSpaceAdmin(actor)
    const space = await this.repos.space.archive(input.spaceId, input.updatedBy ?? adminActorLabel(actor))
    if (!space) throw notFound('space')
    return space
  }

  /**
   * Resolve-or-create by (tenantId, slug) — idempotent client bootstrap.
   * A create race resolves to the winner instead of surfacing the conflict.
   *
   * Returns ONLY a minimal reference (id/tenantId/slug/status), never the full
   * row (review issue 00ff9da6): this op is on the unauthenticated public
   * surface, and the slug is guessable, so returning title/description/
   * externalRefs/audit metadata would turn ensure into an enumeration oracle
   * leaking another space's contents. The client bootstrap only needs the id.
   */
  async ensure(input: z.infer<typeof zSpaceCreateInput>): Promise<Chatv3SpaceRef> {
    const existing = await this.repos.space.byTenantSlug(input.tenantId, input.slug)
    if (existing) return toSpaceRef(existing)
    try {
      return toSpaceRef(await this.create(input))
    } catch (error) {
      if (error instanceof Chatv3Error && error.code === 'conflict') {
        const winner = await this.repos.space.byTenantSlug(input.tenantId, input.slug)
        if (winner) return toSpaceRef(winner)
      }
      throw error
    }
  }

  /** Single-space deployments: resolve-or-create the default space. */
  async ensureDefault(tenantId: string): Promise<Chatv3SpaceRef> {
    return this.ensure({ tenantId, slug: 'default', title: 'Default Space', externalRefs: [] })
  }
}

/** Non-sensitive space reference returned on the public ensure surface. */
export type Chatv3SpaceRef = { id: string; tenantId: string; slug: string; status: string }

function toSpaceRef(space: IdbChatv3Space): Chatv3SpaceRef {
  return { id: space.id, tenantId: space.tenantId, slug: space.slug, status: space.status }
}

export function mapUniqueViolation(error: unknown, message: string): unknown {
  // drizzle wraps the driver error (DrizzleQueryError); the pg error code
  // rides on `cause` — checking only the top level turned every slug
  // collision into a 500 instead of a 409.
  const code =
    (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code
  if (code === '23505') return new Chatv3Error('conflict', message)
  return error
}

function requireScopedSpaceAdmin(actor: Chatv3AdminActor): void {
  requireAdminAuthority(actor, SPACE_ADMIN_PERMISSIONS)
  if (!isScopedAdminAuthority(actor)) {
    throw forbidden('authv2 scoped admin required for space metadata management')
  }
}
