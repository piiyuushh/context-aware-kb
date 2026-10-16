import {
  githubGistListResponseSchema,
  githubImportInputSchema,
  githubImportResponseSchema,
  githubRepoListResponseSchema,
  githubWebhookResponseSchema,
  syncJobParamsSchema,
  syncJobResponseSchema,
} from '@kb/shared'
import { parseOrThrow } from '../lib/validate'
import { requireUserId } from '../middleware/require-auth'
import {
  getSyncJob,
  handleGitHubWebhook,
  listUserGists,
  listUserRepos,
  startImport,
} from '../services/github-sync.service'
import type {
  GitHubGistListResponse,
  GitHubImportResponse,
  GitHubRepoListResponse,
  GitHubWebhookResponse,
  SyncJobResponse,
} from '@kb/shared'
import type { Request, Response } from 'express'

/** `GET /api/v1/github/gists` — the user's gists, for the import picker. */
export async function listGistsHandler(
  req: Request,
  res: Response<GitHubGistListResponse>,
): Promise<void> {
  const gists = await listUserGists(requireUserId(req))

  res.status(200).json(githubGistListResponseSchema.parse({ gists }))
}

/** `GET /api/v1/github/repos` — the user's repositories, for the picker. */
export async function listReposHandler(
  req: Request,
  res: Response<GitHubRepoListResponse>,
): Promise<void> {
  const repos = await listUserRepos(requireUserId(req))

  res.status(200).json(githubRepoListResponseSchema.parse({ repos }))
}

/** `POST /api/v1/github/import` — accepts an import, returns the queued job. */
export async function importHandler(
  req: Request,
  res: Response<GitHubImportResponse>,
): Promise<void> {
  const input = parseOrThrow(githubImportInputSchema, req.body)
  const job = await startImport(requireUserId(req), input)

  res.status(202).json(githubImportResponseSchema.parse({ job }))
}

/** `GET /api/v1/github/jobs/:id` — poll a job's status and progress. */
export async function getJobHandler(req: Request, res: Response<SyncJobResponse>): Promise<void> {
  const { id } = parseOrThrow(syncJobParamsSchema, req.params)
  const job = await getSyncJob(requireUserId(req), id)

  res.status(200).json(syncJobResponseSchema.parse({ job }))
}

/**
 * `POST /api/v1/github/webhook` — GitHub push deliveries. Unauthenticated by
 * session (GitHub cannot send cookies); the HMAC signature is the credential,
 * so the route is served the raw request body by `app.ts`.
 */
export async function webhookHandler(
  req: Request,
  res: Response<GitHubWebhookResponse>,
): Promise<void> {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const queued = await handleGitHubWebhook({
    rawBody,
    signature: req.get('x-hub-signature-256'),
    event: req.get('x-github-event'),
  })

  res.status(202).json(githubWebhookResponseSchema.parse({ queued }))
}
