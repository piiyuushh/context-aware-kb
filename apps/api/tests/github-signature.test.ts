import { describe, expect, it } from 'vitest'
import { signWebhookPayload, verifyWebhookSignature } from '../src/lib/github-signature'

const SECRET = 'test-webhook-secret'
const BODY = Buffer.from(JSON.stringify({ repository: { full_name: 'octocat/hello' } }), 'utf8')

describe('verifyWebhookSignature', () => {
  it('accepts a signature made with the same secret and body', () => {
    expect(verifyWebhookSignature(BODY, signWebhookPayload(BODY, SECRET), SECRET)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const signature = signWebhookPayload(BODY, SECRET)

    expect(
      verifyWebhookSignature(Buffer.from('{"tampered":true}', 'utf8'), signature, SECRET),
    ).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    expect(verifyWebhookSignature(BODY, signWebhookPayload(BODY, 'other-secret'), SECRET)).toBe(
      false,
    )
  })

  it('rejects a missing, malformed or truncated header', () => {
    expect(verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false)
    expect(verifyWebhookSignature(BODY, '', SECRET)).toBe(false)
    expect(verifyWebhookSignature(BODY, 'sha1=deadbeef', SECRET)).toBe(false)
    expect(verifyWebhookSignature(BODY, 'sha256=not-a-valid-digest', SECRET)).toBe(false)
    expect(verifyWebhookSignature(BODY, 'sha256=', SECRET)).toBe(false)
  })
})
