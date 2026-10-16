import { createHmac, timingSafeEqual } from 'node:crypto'

const SIGNATURE_PREFIX = 'sha256='
const DIGEST_HEX_LENGTH = 64

/**
 * Verifies the `X-Hub-Signature-256` header GitHub sends with webhook
 * deliveries: `sha256=<hex HMAC-SHA256>` over the request body, keyed by the
 * webhook secret.
 *
 * The caller must pass the exact bytes GitHub signed — the raw body, before
 * JSON parsing — otherwise the re-serialized JSON will not match. Comparison is
 * constant-time so the signature cannot be probed byte by byte.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false
  }

  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length)
  if (provided.length !== DIGEST_HEX_LENGTH) {
    return false
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

  return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))
}

/** Builds the header value for a payload. Test helper and manual client aid. */
export function signWebhookPayload(rawBody: Buffer, secret: string): string {
  return `${SIGNATURE_PREFIX}${createHmac('sha256', secret).update(rawBody).digest('hex')}`
}
