import type { ErrorResponse } from '@kb/shared'

/**
 * Error carrying the HTTP status and machine-readable code that the API
 * error envelope (see docs/API.md) exposes to clients.
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

/** Builds a body that satisfies `errorResponseSchema` from `@kb/shared`. */
export function toErrorResponse(code: string, message: string): ErrorResponse {
  return { error: { code, message } }
}
