import { z } from 'zod'
import { HttpError } from '../errors'

/**
 * Opaque keyset cursor for `GET /notes`. It carries the sort key of the last
 * row on the page (`updated_at` then `id`) so the next page can resume with a
 * stable `(updated_at, id) < (…)` comparison — no OFFSET, no skipped rows when
 * notes change between requests.
 */
const noteCursorSchema = z.object({
  updatedAt: z.iso.datetime(),
  id: z.uuid(),
})

export type NoteCursor = z.infer<typeof noteCursorSchema>

export function encodeCursor(cursor: NoteCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

/** Decodes a cursor, throwing `BAD_REQUEST` for anything malformed or forged. */
export function decodeCursor(value: string): NoteCursor {
  const result = noteCursorSchema.safeParse(parsePayload(value))

  if (!result.success) {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid cursor')
  }

  return result.data
}

function parsePayload(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid cursor')
  }
}
