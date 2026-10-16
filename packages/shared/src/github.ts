import { z } from 'zod'

/**
 * GitHub sync contract (docs/API.md "GitHub").
 *
 * The list responses are deliberately slimmed down from the raw GitHub
 * payloads: the web app only needs enough to render a picker.
 */

/** A gist summary. `files` are the file names inside the gist. */
export const githubGistSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  files: z.array(z.string()),
  updatedAt: z.iso.datetime().nullable(),
  htmlUrl: z.string(),
})

export type GitHubGist = z.infer<typeof githubGistSchema>

export const githubGistListResponseSchema = z.object({
  gists: z.array(githubGistSchema),
})

export type GitHubGistListResponse = z.infer<typeof githubGistListResponseSchema>

/** A repository summary the user can import markdown from. */
export const githubRepoSchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  defaultBranch: z.string(),
  updatedAt: z.iso.datetime().nullable(),
})

export type GitHubRepo = z.infer<typeof githubRepoSchema>

export const githubRepoListResponseSchema = z.object({
  repos: z.array(githubRepoSchema),
})

export type GitHubRepoListResponse = z.infer<typeof githubRepoListResponseSchema>

/** What a `POST /github/import` can pull in. */
export const githubImportKindSchema = z.enum(['gist', 'repo'])
export type GitHubImportKind = z.infer<typeof githubImportKindSchema>

/** `owner/repo`, each segment limited to GitHub's allowed name characters. */
const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/**
 * `POST /github/import` body. `ref` is a gist id for `kind: "gist"`, or an
 * `owner/repo` full name for `kind: "repo"` — validated here so a malformed ref
 * fails at the boundary instead of queueing a job that cannot run.
 */
export const githubImportInputSchema = z
  .object({
    kind: githubImportKindSchema,
    ref: z.string().trim().min(1).max(300),
  })
  .refine((value) => value.kind !== 'repo' || REPO_FULL_NAME_PATTERN.test(value.ref), {
    message: 'A repo ref must be "owner/repo"',
    path: ['ref'],
  })

export type GitHubImportInput = z.infer<typeof githubImportInputSchema>

/** Sync job kinds. Mirrors the `sync_jobs.kind` check constraint. */
export const syncJobKindSchema = z.enum(['gist_import', 'repo_import', 'repo_sync'])
export type SyncJobKind = z.infer<typeof syncJobKindSchema>

/** Sync job lifecycle. Mirrors the `sync_jobs.status` check constraint. */
export const syncJobStatusSchema = z.enum(['queued', 'running', 'done', 'failed'])
export type SyncJobStatus = z.infer<typeof syncJobStatusSchema>

/**
 * Progress counters stored in `sync_jobs.stats` (jsonb). The migration default
 * is `{}`, so every field defaults to 0 and a brand-new job reads as all zeros.
 *
 * `total` is known once the file list is fetched; `processed` is the running
 * count, and `imported`/`updated`/`skipped`/`failed` break it down. A skipped
 * file is one whose upstream `source_sha` is unchanged, or one that was too
 * large to import.
 */
export const syncJobStatsSchema = z.object({
  total: z.number().int().nonnegative().default(0),
  processed: z.number().int().nonnegative().default(0),
  imported: z.number().int().nonnegative().default(0),
  updated: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
})

export type SyncJobStats = z.infer<typeof syncJobStatsSchema>

/** A background import/re-sync, as returned by the API. */
export const syncJobSchema = z.object({
  id: z.uuid(),
  kind: syncJobKindSchema,
  status: syncJobStatusSchema,
  stats: syncJobStatsSchema,
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
})

export type SyncJob = z.infer<typeof syncJobSchema>

/** `POST /github/import` response: the accepted job, polled via its id. */
export const githubImportResponseSchema = z.object({
  job: syncJobSchema,
})

export type GitHubImportResponse = z.infer<typeof githubImportResponseSchema>

/** `GET /github/jobs/:id` response. */
export const syncJobResponseSchema = z.object({
  job: syncJobSchema,
})

export type SyncJobResponse = z.infer<typeof syncJobResponseSchema>

/** Route params for `/github/jobs/:id`. */
export const syncJobParamsSchema = z.object({
  id: z.uuid(),
})

export type SyncJobParams = z.infer<typeof syncJobParamsSchema>

/**
 * `POST /github/webhook` response. `queued` is the number of re-sync jobs the
 * event triggered (0 when nothing imported the repository, or the event is not
 * a `push`). The webhook is acknowledged either way so GitHub stops retrying.
 */
export const githubWebhookResponseSchema = z.object({
  queued: z.number().int().nonnegative(),
})

export type GitHubWebhookResponse = z.infer<typeof githubWebhookResponseSchema>
