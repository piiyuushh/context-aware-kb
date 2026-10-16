/**
 * Process-wide constants for the API.
 *
 * `SERVICE_NAME` is a literal so it stays assignable to the
 * `service: z.literal('api')` field of the shared health schema.
 */
export const SERVICE_NAME = 'api'

export const SERVICE_VERSION = '0.0.0'

export const DEFAULT_PORT = 4000

/** How long a graceful shutdown waits for open connections before forcing exit. */
export const SHUTDOWN_TIMEOUT_MS = 10_000
