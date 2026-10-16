import { HttpError } from '../errors'
import type { ZodType, z } from 'zod'

const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR'

/**
 * Parses input against a shared zod schema, turning a failure into the API's
 * `VALIDATION_ERROR` envelope (400). Used by controllers so validation lives at
 * the HTTP boundary and services only ever see well-formed data.
 */
export function parseOrThrow<S extends ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value)

  if (!result.success) {
    const issue = result.error.issues[0]
    throw new HttpError(400, VALIDATION_ERROR_CODE, issue?.message ?? 'Invalid request')
  }

  return result.data
}
