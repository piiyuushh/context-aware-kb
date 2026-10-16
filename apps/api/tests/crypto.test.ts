import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken, parseEncryptionKey } from '../src/lib/crypto'

const KEY = parseEncryptionKey('a'.repeat(64))
const OTHER_KEY = parseEncryptionKey('b'.repeat(64))

describe('parseEncryptionKey', () => {
  it('accepts 32 bytes as 64 hex characters', () => {
    expect(parseEncryptionKey('0f'.repeat(32))).toHaveLength(32)
  })

  it('rejects a key of the wrong length', () => {
    expect(() => parseEncryptionKey('ab'.repeat(16))).toThrow(/32 bytes/)
  })

  it('rejects non-hex input', () => {
    expect(() => parseEncryptionKey('z'.repeat(64))).toThrow(/hex/)
  })
})

describe('token encryption', () => {
  it('round-trips a GitHub token', () => {
    const secret = 'gho_1234567890abcdef'

    expect(decryptToken(encryptToken(secret, KEY), KEY)).toBe(secret)
  })

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const first = encryptToken('same', KEY)
    const second = encryptToken('same', KEY)

    expect(first.equals(second)).toBe(false)
    expect(decryptToken(first, KEY)).toBe('same')
    expect(decryptToken(second, KEY)).toBe('same')
  })

  it('fails to decrypt with the wrong key', () => {
    const payload = encryptToken('gho_secret', KEY)

    expect(() => decryptToken(payload, OTHER_KEY)).toThrow()
  })

  it('fails when the ciphertext is tampered with', () => {
    const payload = encryptToken('gho_secret', KEY)
    const tampered = Buffer.from(payload)
    const lastIndex = tampered.length - 1
    tampered[lastIndex] = (tampered[lastIndex] ?? 0) ^ 0xff

    expect(() => decryptToken(tampered, KEY)).toThrow()
  })
})
