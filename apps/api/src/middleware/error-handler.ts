import { HttpError, toErrorResponse } from '../errors'
import type { ErrorRequestHandler } from 'express'

const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR'
const INTERNAL_ERROR_MESSAGE = 'Internal server error'
const BAD_REQUEST_CODE = 'BAD_REQUEST'
const BAD_REQUEST_MESSAGE = 'Invalid request'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads the status off our own errors and off Express/body-parser errors. */
function resolveStatus(error: unknown): number {
  if (error instanceof HttpError) {
    return error.status
  }

  if (isRecord(error)) {
    const status = error['status'] ?? error['statusCode']
    if (typeof status === 'number' && status >= 400 && status < 600) {
      return status
    }
  }

  return 500
}

/**
 * Final error handler. Always answers with the shared error envelope and never
 * leaks a stack trace: 5xx details are logged server-side, not returned.
 *
 * Express only treats a middleware as an error handler when it accepts four
 * arguments, so `_next` must stay in the signature.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    _next(error)
    return
  }

  const status = resolveStatus(error)

  if (status >= 500) {
    console.error('[api] unhandled error', error)
    res.status(status).json(toErrorResponse(INTERNAL_ERROR_CODE, INTERNAL_ERROR_MESSAGE))
    return
  }

  if (error instanceof HttpError) {
    res.status(status).json(toErrorResponse(error.code, error.message))
    return
  }

  console.warn('[api] rejected request', error)
  res.status(status).json(toErrorResponse(BAD_REQUEST_CODE, BAD_REQUEST_MESSAGE))
}
