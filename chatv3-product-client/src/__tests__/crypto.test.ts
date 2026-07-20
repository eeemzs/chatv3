import { describe, expect, it } from 'vitest'
import {
  decryptText,
  deriveKek,
  encryptText,
  fromB64Url,
  generateEpochKey,
  sha256Hex,
  toB64Url,
  unwrapEpochKey,
  wrapEpochKey,
} from '../crypto.js'
import { buildInvite, parseInvite } from '../invite.js'

const salt = { tenantId: 'default', spaceId: 's-1', keyId: 'cvk_abc', epoch: 1 }

describe('b64url roundtrip', () => {
  it('encodes and decodes arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255])
    expect([...fromB64Url(toB64Url(bytes))]).toEqual([...bytes])
  })
})

describe('v0 epoch key wrap/unwrap (server-blind)', () => {
  it('a holder of wrapSecret can unwrap; a different secret cannot', async () => {
    const wrapSecret = 'wrap-secret-aaaaaaaaaaaaaaaaaaaa'
    const epochKey = await generateEpochKey()
    const kek = await deriveKek(wrapSecret, salt)
    const blob = await wrapEpochKey(kek, epochKey)

    // correct secret -> same key can decrypt what the original encrypted
    const envelope = await encryptText(epochKey, 1, 'gizli ✓')
    const kek2 = await deriveKek(wrapSecret, salt)
    const unwrapped = await unwrapEpochKey(kek2, blob)
    expect(await decryptText(unwrapped, envelope)).toBe('gizli ✓')

    // wrong wrapSecret -> unwrap fails (AES-GCM auth tag)
    const wrongKek = await deriveKek('different-secret-bbbbbbbbbbbbbbbb', salt)
    await expect(unwrapEpochKey(wrongKek, blob)).rejects.toBeTruthy()
  })

  it('issue 8a342df1: unwrap yields a NON-extractable key — the only form safe to persist', async () => {
    const kek = await deriveKek('wrap-secret-dddddddddddddddddddd', salt)
    const blob = await wrapEpochKey(kek, await generateEpochKey())
    const unwrapped = await unwrapEpochKey(kek, blob)
    expect(unwrapped.extractable).toBe(false)
    await expect(globalThis.crypto.subtle.exportKey('raw', unwrapped)).rejects.toBeTruthy()
  })

  it('salt domain-separates: different epoch yields a non-interchangeable KEK', async () => {
    const wrapSecret = 'wrap-secret-cccccccccccccccccccc'
    const epochKey = await generateEpochKey()
    const blob = await wrapEpochKey(await deriveKek(wrapSecret, salt), epochKey)
    const otherEpoch = await deriveKek(wrapSecret, { ...salt, epoch: 2 })
    await expect(unwrapEpochKey(otherEpoch, blob)).rejects.toBeTruthy()
  })
})

describe('message encryption', () => {
  it('ciphertext differs from plaintext and roundtrips', async () => {
    const key = await generateEpochKey()
    const env = await encryptText(key, 3, 'hello agents')
    expect(env.epoch).toBe(3)
    expect(env.ciphertext).not.toContain('hello')
    expect(await decryptText(key, env)).toBe('hello agents')
  })
})

describe('sha256 verifier', () => {
  it('matches a known digest shape', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('invite string', () => {
  it('builds and parses with two fragment secrets', () => {
    const invite = {
      serverBaseUrl: 'https://chat.example.com',
      channelId: 'b6d1f9a2-1111-4222-8333-444455556666',
      keyId: 'cvk_abcdefghi',
      accessSecret: 'access-secret-xyz',
      wrapSecret: 'wrap-secret-xyz',
    }
    const str = buildInvite(invite)
    expect(str.startsWith('chv3://join/')).toBe(true)
    // secrets live after the '#', i.e. in the URL fragment (never sent to server)
    expect(str.split('#')[1]).toBe('cvk_abcdefghi.access-secret-xyz.wrap-secret-xyz')
    expect(parseInvite(str)).toEqual({ mode: 'e2e', ...invite })
  })

  it('rejects malformed invites', () => {
    expect(() => parseInvite('https://example.com')).toThrow()
    expect(() => parseInvite('chv3://join/x/not-a-uuid#a.b.c')).toThrow()
  })
})
