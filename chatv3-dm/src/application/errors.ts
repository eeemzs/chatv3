export type Chatv3ErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'revoked'
  | 'archived'
  | 'epoch_mismatch'
  | 'rate_limit'
  | 'runtime'

/**
 * Single error type for the whole domain. The host plugin maps `code` to an
 * HTTP status; `message` must stay safe to surface (no SQL, no secrets).
 */
export class Chatv3Error extends Error {
  readonly code: Chatv3ErrorCode

  constructor(code: Chatv3ErrorCode, message: string) {
    super(message)
    this.name = 'Chatv3Error'
    this.code = code
  }
}

export function notFound(what: string): Chatv3Error {
  return new Chatv3Error('not_found', `${what} not found`)
}

export function forbidden(message: string): Chatv3Error {
  return new Chatv3Error('forbidden', message)
}

export function unauthorized(message: string): Chatv3Error {
  return new Chatv3Error('unauthorized', message)
}

export function conflict(message: string): Chatv3Error {
  return new Chatv3Error('conflict', message)
}
