import { SERVICE_NAME, SERVICE_VERSION } from '../constants'
import type { HealthResponse } from '@kb/shared'

/**
 * Builds the liveness payload. The controller validates the result against
 * `healthResponseSchema` from `@kb/shared`, so this stays contract-checked.
 */
export function getHealth(): HealthResponse {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }
}
