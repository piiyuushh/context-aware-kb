import { z } from 'zod'
import { syncJobKindSchema } from '@kb/shared'
import { runGithubSync } from '../services/github-sync.service'
import type { SyncJobKind } from '@kb/shared'

/** Payload of a `github-sync` job. */
export interface GithubSyncJobData {
  /** `sync_jobs.id`, the row whose progress the worker checkpoints. */
  jobId: string
  userId: string
  kind: SyncJobKind
  /** Gist id for `gist_import`, `owner/repo` full name otherwise. */
  ref: string
  /** Branch to read; the repository default when omitted. */
  branch?: string
}

/**
 * Job payloads cross a process boundary, so they are untrusted and parsed like
 * any other input. A bad payload throws so pg-boss records the failure.
 */
export const githubSyncJobSchema = z.object({
  jobId: z.uuid(),
  userId: z.uuid(),
  kind: syncJobKindSchema,
  ref: z.string().min(1),
  branch: z.string().min(1).optional(),
})

export async function handleGithubSync(data: unknown): Promise<void> {
  await runGithubSync(githubSyncJobSchema.parse(data))
}

/** pg-boss batch handler for the `github-sync` queue, one import per job. */
export async function githubSyncWorker(jobs: { data: unknown }[]): Promise<void> {
  for (const job of jobs) {
    await handleGithubSync(job.data)
  }
}
