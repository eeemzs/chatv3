import { describe, expect, it } from 'vitest'
import { buildInvite, parseInvite } from '../invite.js'

const channelId = '11111111-1111-4111-8111-111111111111'

describe('ChatV3 invites', () => {
  it('parses legacy e2e three-part invites', () => {
    const invite = `chv3://join/${encodeURIComponent('http://localhost:5940')}/${channelId}#cvk_abc.access_secret.wrap_secret`

    expect(parseInvite(invite)).toEqual({
      mode: 'e2e',
      serverBaseUrl: 'http://localhost:5940',
      channelId,
      keyId: 'cvk_abc',
      accessSecret: 'access_secret',
      wrapSecret: 'wrap_secret',
    })
  })

  it('builds and parses server-encrypted srv invites', () => {
    const invite = buildInvite({
      mode: 'server-encrypted',
      serverBaseUrl: 'http://localhost:5940',
      channelId,
      keyId: 'cvk_server',
      accessSecret: 'access_secret',
    })

    expect(invite).toBe(`chv3://join/${encodeURIComponent('http://localhost:5940')}/${channelId}#srv.cvk_server.access_secret`)
    expect(parseInvite(invite)).toEqual({
      mode: 'server-encrypted',
      serverBaseUrl: 'http://localhost:5940',
      channelId,
      keyId: 'cvk_server',
      accessSecret: 'access_secret',
    })
  })

  it('rejects srv invites without a cvk_ key id', () => {
    const invite = `chv3://join/${encodeURIComponent('http://localhost:5940')}/${channelId}#srv.bad_key.access_secret`

    expect(() => parseInvite(invite)).toThrow(/keyId/)
  })
})
