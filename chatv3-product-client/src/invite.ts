/**
 * Invite string: one shareable URL, secrets in the FRAGMENT - fragments never
 * leave the client in HTTP requests, so the server cannot see them in transit.
 * accessSecret authorizes join; e2e wrapSecret unlocks content.
 *
 *   chv3://join/<encoded-server-base>/<channelId>#<keyId>.<accessSecret>.<wrapSecret>
 *   chv3://join/<encoded-server-base>/<channelId>#srv.<keyId>.<accessSecret>
 *
 * keyId is cvk_<b64url> and both secrets are b64url, so '.' is a safe joiner.
 */
type Chatv3InviteBase = {
  serverBaseUrl: string
  channelId: string
  keyId: string
  accessSecret: string
}

export type Chatv3E2eInvite = Chatv3InviteBase & {
  mode?: 'e2e'
  wrapSecret: string
}

export type Chatv3ServerEncryptedInvite = Chatv3InviteBase & {
  mode: 'server-encrypted'
}

export type Chatv3Invite = Chatv3E2eInvite | Chatv3ServerEncryptedInvite

export function buildInvite(invite: Chatv3Invite): string {
  const base = encodeURIComponent(invite.serverBaseUrl)
  if (invite.mode === 'server-encrypted') {
    return `chv3://join/${base}/${invite.channelId}#srv.${invite.keyId}.${invite.accessSecret}`
  }
  return `chv3://join/${base}/${invite.channelId}#${invite.keyId}.${invite.accessSecret}.${invite.wrapSecret}`
}

const E2E_INVITE_RE = /^chv3:\/\/join\/([^/]+)\/([0-9a-fA-F-]{36})#([^.]+)\.([^.]+)\.([^.]+)$/
const SERVER_INVITE_RE = /^chv3:\/\/join\/([^/]+)\/([0-9a-fA-F-]{36})#srv\.([^.]+)\.([^.]+)$/
const KEY_ID_RE = /^cvk_[A-Za-z0-9_-]+$/

export function parseInvite(value: string): Chatv3Invite {
  const trimmed = value.trim()
  const serverMatch = SERVER_INVITE_RE.exec(trimmed)
  if (serverMatch) {
    const keyId = serverMatch[3]!
    if (!KEY_ID_RE.test(keyId)) throw new Error('invalid chatv3 invite keyId')
    return {
      mode: 'server-encrypted',
      serverBaseUrl: decodeURIComponent(serverMatch[1]!),
      channelId: serverMatch[2]!,
      keyId,
      accessSecret: serverMatch[4]!,
    }
  }

  const match = E2E_INVITE_RE.exec(trimmed)
  if (!match) throw new Error('invalid chatv3 invite string')
  const keyId = match[3]!
  if (!KEY_ID_RE.test(keyId)) throw new Error('invalid chatv3 invite keyId')
  return {
    mode: 'e2e',
    serverBaseUrl: decodeURIComponent(match[1]!),
    channelId: match[2]!,
    keyId,
    accessSecret: match[4]!,
    wrapSecret: match[5]!,
  }
}
