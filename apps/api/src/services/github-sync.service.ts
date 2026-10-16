import { z } from 'zod'
import { getConfig } from '../config'
import { HttpError } from '../errors'
import { decryptToken } from '../lib/crypto'
import { verifyWebhookSignature } from '../lib/github-signature'
import { enqueueGithubSync, enqueueProcessNote } from '../jobs/queue'
import { fetchGist, fetchRepoMarkdown, listGists, listRepos } from '../github/client'
import {
  MAX_IMPORT_FILE_BYTES,
  contentSha,
  deriveNoteTitle,
  fileBaseName,
  gistSourceRef,
  isMarkdownPath,
  repoSourceRef,
} from '../github/files'
import { findGithubConnectionByUserId } from '../repositories/github-connections.repository'
import { listRepoImporters, upsertRepoImport } from '../repositories/github-repo-imports.repository'
import { upsertSyncedNote } from '../repositories/notes.repository'
import {
  finishSyncJob,
  findSyncJobById,
  insertSyncJob,
  markSyncJobRunning,
  updateSyncJobStats,
} from '../repositories/sync-jobs.repository'
import type { GithubSyncJobData } from '../jobs/github-sync'
import type { SyncedNoteAction } from '../repositories/notes.repository'
import type { GitHubGist, GitHubImportInput, GitHubRepo, SyncJob, SyncJobStats } from '@kb/shared'

/**
 * GitHub sync orchestration (docs/API.md "GitHub"): list what a user can
 * import, accept an import request as a background job, expose its progress,
 * and turn a verified push webhook into re-sync jobs.
 *
 * The heavy lifting runs in the `github-sync` worker via `runGithubSync`, so the
 * HTTP handlers stay fast.
 */

/** Progress checkpoints are written every N files to keep the job row cheap. */
const STATS_FLUSH_EVERY = 10

const BRANCH_REF_PREFIX = 'refs/heads/'

function emptyStats(): SyncJobStats {
  return { total: 0, processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 }
}

/**
 * The caller's decrypted GitHub token. Fails fast when GitHub is not connected
 * (or was disconnected) rather than queueing a job that cannot run.
 */
async function requireAccessToken(userId: string): Promise<string> {
  const connection = await findGithubConnectionByUserId(userId)
  if (!connection) {
    throw new HttpError(400, 'BAD_REQUEST', 'Connect a GitHub account before syncing')
  }

  return decryptToken(connection.accessTokenEnc, getConfig().tokenEncryptionKey)
}

/** The caller's gists, for the import picker. */
export async function listUserGists(userId: string): Promise<GitHubGist[]> {
  return listGists(await requireAccessToken(userId))
}

/** The caller's repositories, for the import picker. */
export async function listUserRepos(userId: string): Promise<GitHubRepo[]> {
  return listRepos(await requireAccessToken(userId))
}

/**
 * Accepts an import and queues it. Fails fast when GitHub is not connected, so
 * a job row is only created when it can actually run.
 */
export async function startImport(userId: string, input: GitHubImportInput): Promise<SyncJob> {
  await requireAccessToken(userId)

  const kind = input.kind === 'gist' ? 'gist_import' : 'repo_import'
  const job = await insertSyncJob({ userId, kind })

  try {
    await enqueueGithubSync({ jobId: job.id, userId, kind, ref: input.ref })
  } catch (error) {
    await finishSyncJob(job.id, {
      status: 'failed',
      stats: emptyStats(),
      error: 'Could not enqueue the sync job',
    })
    throw error
  }

  return job
}

/** Loads an owned job or throws `NOT_FOUND` (also covers other users' jobs). */
export async function getSyncJob(userId: string, id: string): Promise<SyncJob> {
  const job = await findSyncJobById(userId, id)
  if (!job) {
    throw new HttpError(404, 'NOT_FOUND', 'Sync job not found')
  }

  return job
}

/** Subset of the GitHub push payload the re-sync needs. */
const pushPayloadSchema = z.object({
  repository: z.object({ full_name: z.string().min(1) }),
  ref: z.string().optional(),
})

export interface GitHubWebhookRequest {
  /** The exact bytes GitHub signed (raw body, before JSON parsing). */
  rawBody: Buffer
  signature: string | undefined
  event: string | undefined
}

/**
 * Handles a webhook delivery. The signature is verified over the raw body
 * first; only then is the payload trusted. A `push` queues one `repo_sync` per
 * user who imported the repo on the pushed branch.
 *
 * Returns how many jobs were queued. Non-push events (and pushes to a branch
 * nobody imported) are acknowledged with 0 so GitHub does not retry.
 */
export async function handleGitHubWebhook(request: GitHubWebhookRequest): Promise<number> {
  const { webhookSecret } = getConfig().github

  if (webhookSecret === '') {
    throw new HttpError(500, 'INTERNAL_ERROR', 'GitHub webhook secret is not configured')
  }

  if (!verifyWebhookSignature(request.rawBody, request.signature, webhookSecret)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Invalid webhook signature')
  }

  if (request.event !== 'push') {
    return 0
  }

  const payload = parsePushPayload(request.rawBody)
  if (!payload) {
    return 0
  }

  const branch = branchFromRef(payload.ref)
  // A push to a tag (or any non-branch ref) is not a branch update.
  if (!branch) {
    return 0
  }

  const importers = await listRepoImporters(payload.repository.full_name)

  let queued = 0
  for (const importer of importers) {
    if (importer.branch !== branch) {
      continue
    }

    const job = await insertSyncJob({ userId: importer.userId, kind: 'repo_sync' })
    try {
      await enqueueGithubSync({
        jobId: job.id,
        userId: importer.userId,
        kind: 'repo_sync',
        ref: payload.repository.full_name,
        branch: importer.branch,
      })
      queued += 1
    } catch (error) {
      console.error('[api] failed to enqueue repo_sync', error)
      await finishSyncJob(job.id, {
        status: 'failed',
        stats: emptyStats(),
        error: 'Could not enqueue the sync job',
      })
    }
  }

  return queued
}

function parsePushPayload(rawBody: Buffer): z.infer<typeof pushPayloadSchema> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return null
  }

  const result = pushPayloadSchema.safeParse(parsed)

  return result.success ? result.data : null
}

function branchFromRef(ref: string | undefined): string | null {
  return ref && ref.startsWith(BRANCH_REF_PREFIX) ? ref.slice(BRANCH_REF_PREFIX.length) : null
}

/** Running progress for one job: the counters plus periodic DB checkpoints. */
interface SyncProgress {
  readonly stats: SyncJobStats
  setTotal(total: number): Promise<void>
  record(action: SyncedNoteAction): Promise<void>
  fail(): Promise<void>
}

function createProgress(jobId: string): SyncProgress {
  const stats = emptyStats()
  let sinceFlush = 0

  const flush = async (): Promise<void> => {
    sinceFlush = 0
    await updateSyncJobStats(jobId, { ...stats })
  }

  const bump = async (): Promise<void> => {
    sinceFlush += 1
    if (sinceFlush >= STATS_FLUSH_EVERY) {
      await flush()
    }
  }

  return {
    stats,
    async setTotal(total) {
      stats.total = total
      await flush()
    },
    async record(action) {
      stats.processed += 1
      if (action === 'imported') stats.imported += 1
      else if (action === 'updated') stats.updated += 1
      else stats.skipped += 1
      await bump()
    },
    async fail() {
      stats.processed += 1
      stats.failed += 1
      await bump()
    },
  }
}

/**
 * Runs one import. Marks the job running, imports the files (checkpointing
 * progress), then finishes it `done`. Any fatal error finishes it `failed` and
 * is rethrown so pg-boss records (and may retry) the delivery.
 */
export async function runGithubSync(job: GithubSyncJobData): Promise<void> {
  // A duplicate delivery of an already-finished job has nothing left to do;
  // the flag is false only when the row is already `done`.
  const started = await markSyncJobRunning(job.jobId)
  if (!started) {
    return
  }

  const progress = createProgress(job.jobId)

  try {
    if (job.kind === 'gist_import') {
      await importGist(job, progress)
    } else {
      await importRepo(job, progress)
    }

    await finishSyncJob(job.jobId, { status: 'done', stats: { ...progress.stats } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishSyncJob(job.jobId, {
      status: 'failed',
      stats: { ...progress.stats },
      error: message.slice(0, 1000),
    })
    throw error
  }
}

/** Imports each markdown file of a gist as a `doc` note. */
async function importGist(job: GithubSyncJobData, progress: SyncProgress): Promise<void> {
  const token = await requireAccessToken(job.userId)
  const gist = await fetchGist(token, job.ref)
  const files = gist.files.filter(
    (file) =>
      isMarkdownPath(file.filename) &&
      Buffer.byteLength(file.content, 'utf8') <= MAX_IMPORT_FILE_BYTES,
  )

  await progress.setTotal(files.length)

  for (const file of files) {
    try {
      const result = await upsertSyncedNote({
        userId: job.userId,
        title: deriveNoteTitle(file.content, fileBaseName(file.filename)),
        contentMd: file.content,
        language: null,
        source: 'gist',
        sourceRef: gistSourceRef(gist.id, file.filename),
        // Gists expose no blob sha, so the content hash is the change detector.
        sourceSha: contentSha(file.content),
      })

      await progress.record(result.action)
      await maybeProcess(result.action, job.userId, result.noteId)
    } catch (error) {
      console.error('[api] failed to import gist file', file.filename, error)
      await progress.fail()
    }
  }
}

/** Imports each markdown blob of a repository branch as a `doc` note. */
async function importRepo(job: GithubSyncJobData, progress: SyncProgress): Promise<void> {
  const token = await requireAccessToken(job.userId)
  const snapshot = await fetchRepoMarkdown(token, job.ref, job.branch)

  // Recorded before the file loop so a webhook can find this subscription even
  // if the import later fails; the head sha is refreshed on the next success.
  await upsertRepoImport({
    userId: job.userId,
    repoFullName: snapshot.fullName,
    branch: snapshot.branch,
    lastSyncedSha: snapshot.headSha,
  })

  await progress.setTotal(snapshot.files.length)

  for (const file of snapshot.files) {
    try {
      const result = await upsertSyncedNote({
        userId: job.userId,
        title: deriveNoteTitle(file.content, fileBaseName(file.path)),
        contentMd: file.content,
        language: null,
        source: 'repo',
        sourceRef: repoSourceRef(snapshot.fullName, file.path),
        sourceSha: file.sha,
      })

      await progress.record(result.action)
      await maybeProcess(result.action, job.userId, result.noteId)
    } catch (error) {
      console.error('[api] failed to import repo file', file.path, error)
      await progress.fail()
    }
  }
}

/** Rebuilds a changed note's links/tags. Unchanged notes are left alone. */
async function maybeProcess(
  action: SyncedNoteAction,
  userId: string,
  noteId: string,
): Promise<void> {
  if (action !== 'skipped') {
    await enqueueProcessNote({ userId, noteId })
  }
}
