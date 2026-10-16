import PgBoss from 'pg-boss'
import { getConfig } from '../config'
import { GITHUB_SYNC_QUEUE, PROCESS_NOTE_QUEUE } from './constants'
import { githubSyncWorker } from './github-sync'
import { processNoteWorker } from './process-note'

/**
 * pg-boss runs on the same Postgres as the app (docs/ARCHITECTURE.md), in its
 * own `pgboss` schema which it creates and migrates on `start()`. No project
 * migration is needed for the queue.
 *
 * The instance is a lazy singleton so importing this module (e.g. from a
 * repository or the notes service) never opens a socket.
 */
let boss: PgBoss | undefined

export function getBoss(): PgBoss {
  boss ??= new PgBoss({ connectionString: getConfig().databaseUrl })

  return boss
}

/**
 * Boots pg-boss, ensures the queue exists and registers the workers. Called
 * from `server.ts` at startup; tests never start it.
 */
export async function startJobs(): Promise<void> {
  const instance = getBoss()

  instance.on('error', (error) => {
    console.error('[api] pg-boss error', error)
  })

  await instance.start()
  await instance.createQueue(PROCESS_NOTE_QUEUE)
  await instance.createQueue(GITHUB_SYNC_QUEUE)
  await instance.work(PROCESS_NOTE_QUEUE, processNoteWorker)
  await instance.work(GITHUB_SYNC_QUEUE, githubSyncWorker)
}

/** Stops pg-boss and clears the singleton. Safe when it was never started. */
export async function stopJobs(): Promise<void> {
  if (!boss) {
    return
  }

  const current = boss
  boss = undefined

  await current.stop({ graceful: true })
}
