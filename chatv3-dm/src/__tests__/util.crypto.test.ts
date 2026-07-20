import { describe, expect, it, vi } from 'vitest'
import {
  getChatv3ServerKeyConfig,
  hashesEqual,
  mintMemberToken,
  parseMemberToken,
  randomEpochKeyB64Url,
  sha256Hex,
  unwrapServerManagedEpochKey,
  wrapServerManagedEpochKey,
} from '../application/util.crypto.js'

describe('member token mint/parse/verify', () => {
  it('roundtrips: minted token parses back to the same member and hash', () => {
    const memberId = 'b6d1f9a2-1111-4222-8333-444455556666'
    const minted = mintMemberToken(memberId)
    const parsed = parseMemberToken(minted.token)
    expect(parsed).not.toBeNull()
    expect(parsed!.memberId).toBe(memberId)
    expect(hashesEqual(parsed!.secretHash, minted.tokenHash)).toBe(true)
  })

  it('rejects tampered secrets', () => {
    const minted = mintMemberToken('b6d1f9a2-1111-4222-8333-444455556666')
    const tampered = minted.token.slice(0, -2) + 'xx'
    const parsed = parseMemberToken(tampered)
    expect(parsed).not.toBeNull()
    expect(hashesEqual(parsed!.secretHash, minted.tokenHash)).toBe(false)
  })

  it('rejects malformed tokens', () => {
    expect(parseMemberToken('not-a-token')).toBeNull()
    expect(parseMemberToken('cv3m_only-two')).toBeNull()
    expect(parseMemberToken('wrong_a_bbbbbbbbbbbbbbbbbbbb')).toBeNull()
  })

  it('hashesEqual is length-safe', () => {
    expect(hashesEqual(sha256Hex('a'), sha256Hex('a'))).toBe(true)
    expect(hashesEqual(sha256Hex('a'), sha256Hex('b'))).toBe(false)
    expect(hashesEqual('', sha256Hex('a'))).toBe(false)
  })

  it('uses configured server-managed key material without a dev fallback', () => {
    const keyConfig = getChatv3ServerKeyConfig({
      CHATV3_SERVER_KEY_ID: 'k-prod',
      CHATV3_SERVER_KEY_SECRET: 'configured-secret',
      NODE_ENV: 'production',
    })
    expect(keyConfig).toEqual({ keyId: 'k-prod', secret: 'configured-secret', devDefault: false })
  })

  it('allows the development server-managed key for trusted local auth signals only', () => {
    expect(() =>
      getChatv3ServerKeyConfig({ NODE_ENV: 'development', AOPS_AUTH_PROVIDER: 'authv2-jwt-session' })
    ).toThrow(/CHATV3_SERVER_KEY_SECRET/)
    expect(() => getChatv3ServerKeyConfig({ NODE_ENV: 'production', AOPS_AUTH_PROVIDER: 'trusted-local' })).toThrow(
      /CHATV3_SERVER_KEY_SECRET/
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(getChatv3ServerKeyConfig({ NODE_ENV: 'development' })).toMatchObject({
        keyId: 'k1',
        devDefault: true,
      })
      expect(
        getChatv3ServerKeyConfig({ NODE_ENV: 'development', AOPS_AUTH_PROVIDER: 'trusted_local' })
      ).toMatchObject({ keyId: 'k1', devDefault: true })
      expect(
        getChatv3ServerKeyConfig({
          NODE_ENV: 'development',
          AOPS_AUTH_PROVIDER: 'authv2-jwt-session',
          CHATV3_TRUSTED_LOCAL: 'auth-playground',
        })
      ).toMatchObject({ keyId: 'k1', devDefault: true })
      expect(
        getChatv3ServerKeyConfig({ NODE_ENV: 'development', CHATV3_TRUSTED_LOCAL: 'true' })
      ).toMatchObject({ keyId: 'k1', devDefault: true })
    } finally {
      warn.mockRestore()
    }
  })

  it('wraps server-managed epoch keys with keyId-bound metadata', () => {
    const rawEpochKey = randomEpochKeyB64Url()
    const keyConfig = { keyId: 'k-test', secret: 'unit-secret', devDefault: false }
    const wrapped = wrapServerManagedEpochKey({
      tenantId: 'default',
      spaceId: 'b6d1f9a2-1111-4222-8333-444455556666',
      channelId: 'b6d1f9a2-1111-4222-8333-444455556667',
      roomId: 'b6d1f9a2-1111-4222-8333-444455556668',
      epoch: 1,
      rawEpochKey,
      keyConfig,
    })
    expect(wrapped.kdfMeta.keyId).toBe('k-test')
    expect(wrapped.kdfMeta.kekSource).toBe('server-master')
    const unwrapped = unwrapServerManagedEpochKey({
      tenantId: 'default',
      spaceId: 'b6d1f9a2-1111-4222-8333-444455556666',
      channelId: 'b6d1f9a2-1111-4222-8333-444455556667',
      roomId: 'b6d1f9a2-1111-4222-8333-444455556668',
      epoch: 1,
      wrappedKeyBlob: wrapped.wrappedKeyBlob,
      kdfMeta: wrapped.kdfMeta,
      keyConfig,
    })
    expect(unwrapped).toBe(rawEpochKey)
  })
})
