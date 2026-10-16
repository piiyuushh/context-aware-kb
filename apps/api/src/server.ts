// Must come first: loads the repo-root .env before any module reads getConfig().
import './env'
import { createApp } from './app'
import { startJobs, stopJobs } from './jobs/boss'
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

// Workers boot alongside HTTP. A failure here is logged, not fatal: the API can
// still serve reads/writes while the queue recovers.
startJobs().catch((error) => {
  console.error(`${logPrefix} failed to start job workers`, error)
})

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`${logPrefix} ${signal} received, closing server`)

  // Do not hang forever on keep-alive connections.
  const forceExit = setTimeout(() => {
    console.error(`${logPrefix} shutdown timed out, forcing exit`)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref()

  await stopJobs().catch((error) => {
    console.error(`${logPrefix} failed to stop job workers`, error)
  })

  server.close((error) => {
    if (error) {
      console.error(`${logPrefix} failed to close server`, error)
      process.exit(1)
    }

    console.log(`${logPrefix} closed`)
    process.exit(0)
  })
}

function handleSignal(signal: NodeJS.Signals): void {
  void shutdown(signal)
}

process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)
