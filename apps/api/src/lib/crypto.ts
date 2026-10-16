import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM helpers for GitHub access tokens.
 *
 * Stored payload layout: `iv (12 bytes) || auth tag (16 bytes) || ciphertext`.
 * The tag makes tampering fail loudly on decrypt instead of returning garbage.
 */
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i

/** Turns a 64-character hex env value into the 32-byte key GCM expects. */
export function parseEncryptionKey(hex: string): Buffer {
  if (!HEX_KEY_PATTERN.test(hex)) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex characters)')
  }

  return Buffer.from(hex, 'hex')
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes, received ${key.length}`)
  }
}

export function encryptToken(plaintext: string, key: Buffer): Buffer {
  assertKey(key)

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

export function decryptToken(payload: Buffer, key: Buffer): string {
  assertKey(key)

  if (payload.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted token payload is too short')
  }

  const iv = payload.subarray(0, IV_BYTES)
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
