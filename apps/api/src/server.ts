import { createApp } from './app'
import { DEFAULT_PORT, SERVICE_NAME, SERVICE_VERSION, SHUTDOWN_TIMEOUT_MS } from './constants'

/** `PORT` when it is a usable TCP port, otherwise the default. */
function resolvePort(rawPort: string | undefined): number {
  const parsed = Number.parseInt(rawPort ?? '', 10)

  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : DEFAULT_PORT
}

const port = resolvePort(process.env.PORT)
const nodeEnv = process.env.NODE_ENV ?? 'development'

const logPrefix = `[${SERVICE_NAME}]`

const server = createApp().listen(port, () => {
  const url = `http://localhost:${port}`
  console.log(`${logPrefix} v${SERVICE_VERSION} listening on ${url} (${nodeEnv})`)
})

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${logPrefix} ${signal} received, closing server`)

  // Do not hang forever on keep-alive connections.
  const forceExit = setTimeout(() => {
    console.error(`${logPrefix} shutdown timed out, forcing exit`)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref()

  server.close((error) => {
    if (error) {
      console.error(`${logPrefix} failed to close server`, error)
      process.exit(1)
    }

    console.log(`${logPrefix} closed`)
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
