import { syncJobStatsSchema } from '@kb/shared'
import { getPool } from '../db/pool'
import type { SyncJob, SyncJobKind, SyncJobStats, SyncJobStatus } from '@kb/shared'

/**
 * SQL for `sync_jobs` (docs/DATABASE.md). A row is the API-visible record of a
 * background import: the worker moves it `queued -> running -> done|failed` and
 * checkpoints `stats` as it goes, so `GET /github/jobs/:id` can poll progress.
 */

interface SyncJobRow {
  id: string
  kind: SyncJobKind
  status: SyncJobStatus
  stats: unknown
  error: string | null
  created_at: Date
  finished_at: Date | null
}

const SELECT_COLUMNS = 'id, kind, status, stats, error, created_at, finished_at'

/** The jsonb column starts as `{}`, so defaults fill in the zero counters. */
function toStats(value: unknown): SyncJobStats {
  return syncJobStatsSchema.parse(value ?? {})
}

function mapSyncJob(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    stats: toStats(row.stats),
    error: row.error,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  }
}

/** Creates a queued job. The worker is enqueued separately with this id. */
export async function insertSyncJob(input: {
  userId: string
  kind: SyncJobKind
}): Promise<SyncJob> {
  const { rows } = await getPool().query<SyncJobRow>(
    `insert into sync_jobs (user_id, kind)
     values ($1, $2)
     returning ${SELECT_COLUMNS}`,
    [input.userId, input.kind],
  )

  const row = rows[0]
  if (!row) {
    throw new Error('insertSyncJob did not return a row')
  }

  return mapSyncJob(row)
}

/** One job, scoped to its owner. `null` when missing or not theirs. */
export async function findSyncJobById(userId: string, id: string): Promise<SyncJob | null> {
  const { rows } = await getPool().query<SyncJobRow>(
    `select ${SELECT_COLUMNS} from sync_jobs where user_id = $1 and id = $2`,
    [userId, id],
  )

  const row = rows[0]

  return row ? mapSyncJob(row) : null
}

/**
 * Flips a queued (or previously failed/running) job to running and returns the
 * updated row, or `null` when the row is already `done` so a duplicate
 * delivery is a no-op. The caller uses the returned job to publish a
 * `sync.progress` event. Idempotent across pg-boss retries, including
 * recovering a row left `running` by a crash.
 */
export async function markSyncJobRunning(id: string): Promise<SyncJob | null> {
  const { rows } = await getPool().query<SyncJobRow>(
    `update sync_jobs set status = 'running' where id = $1 and status <> 'done'
     returning ${SELECT_COLUMNS}`,
    [id],
  )

  const row = rows[0]

  return row ? mapSyncJob(row) : null
}

/** Checkpoints progress without touching the status; returns the updated job. */
export async function updateSyncJobStats(id: string, stats: SyncJobStats): Promise<SyncJob | null> {
  const { rows } = await getPool().query<SyncJobRow>(
    `update sync_jobs set stats = $2 where id = $1
     returning ${SELECT_COLUMNS}`,
    [id, stats],
  )

  const row = rows[0]

  return row ? mapSyncJob(row) : null
}

/** Terminal state: `done` on success, `failed` with a message otherwise. */
export async function finishSyncJob(
  id: string,
  input: { status: 'done' | 'failed'; stats: SyncJobStats; error?: string | null },
): Promise<SyncJob | null> {
  const { rows } = await getPool().query<SyncJobRow>(
    `update sync_jobs
     set status = $2, stats = $3, error = $4, finished_at = now()
     where id = $1
     returning ${SELECT_COLUMNS}`,
    [id, input.status, input.stats, input.error ?? null],
  )

  const row = rows[0]

  return row ? mapSyncJob(row) : null
}
