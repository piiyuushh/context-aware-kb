import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  API_PREFIX,
  errorResponseSchema,
  githubGistListResponseSchema,
  githubImportResponseSchema,
  githubRepoListResponseSchema,
  syncJobResponseSchema,
} from '@kb/shared'
import { createApp } from '../src/app'
import { getConfig } from '../src/config'
import { encryptToken } from '../src/lib/crypto'
import { signWebhookPayload } from '../src/lib/github-signature'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { findGithubConnectionByUserId } from '../src/repositories/github-connections.repository'
import { listGists, listRepos } from '../src/github/client'
import { findSyncJobById, insertSyncJob } from '../src/repositories/sync-jobs.repository'
import { listRepoImporters } from '../src/repositories/github-repo-imports.repository'
import { enqueueGithubSync } from '../src/jobs/queue'
import type { SyncJob } from '@kb/shared'

vi.mock('../src/repositories/github-connections.repository', () => ({
  findGithubConnectionByUserId: vi.fn(),
  upsertGithubConnection: vi.fn(),
}))

vi.mock('../src/github/client', () => ({
  listGists: vi.fn(),
  listRepos: vi.fn(),
  fetchGist: vi.fn(),
  fetchRepoMarkdown: vi.fn(),
}))

vi.mock('../src/repositories/sync-jobs.repository', () => ({
  insertSyncJob: vi.fn(),
  findSyncJobById: vi.fn(),
  markSyncJobRunning: vi.fn(),
  updateSyncJobStats: vi.fn(),
  finishSyncJob: vi.fn(),
}))

vi.mock('../src/repositories/github-repo-imports.repository', () => ({
  upsertRepoImport: vi.fn(),
  listRepoImporters: vi.fn(),
}))

vi.mock('../src/jobs/queue', () => ({
  enqueueProcessNote: vi.fn(),
  enqueueGithubSync: vi.fn(),
}))

const GITHUB_URL = `${API_PREFIX}/github`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const JOB_ID = '11111111-1111-4111-8111-111111111111'

function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(userId, SESSION_SECRET, SESSION_TTL_SECONDS)}`
}

/** A stored connection carrying a real, decryptable token. */
function connectedGitHub(): void {
  vi.mocked(findGithubConnectionByUserId).mockResolvedValue({
    id: '22222222-2222-4222-8222-222222222222',
    userId: USER_ID,
    accessTokenEnc: encryptToken('gh-token', getConfig().tokenEncryptionKey),
    scopes: [],
  })
}

function makeJob(overrides: Partial<SyncJob> = {}): SyncJob {
  const now = new Date().toISOString()

  return {
    id: JOB_ID,
    kind: 'gist_import',
    status: 'queued',
    stats: { total: 0, processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 },
    error: null,
    createdAt: now,
    finishedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(findGithubConnectionByUserId).mockReset()
  vi.mocked(listGists).mockReset()
  vi.mocked(listRepos).mockReset()
  vi.mocked(insertSyncJob).mockReset()
  vi.mocked(findSyncJobById).mockReset()
  vi.mocked(listRepoImporters).mockReset()
  vi.mocked(enqueueGithubSync).mockReset()
  vi.mocked(enqueueGithubSync).mockResolvedValue(undefined)
})

describe(`GET ${GITHUB_URL}/gists`, () => {
  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(`${GITHUB_URL}/gists`)

    expect(response.status).toBe(401)
    expect(listGists).not.toHaveBeenCalled()
  })

  it('responds 200 with the user gists', async () => {
    connectedGitHub()
    vi.mocked(listGists).mockResolvedValue([
      {
        id: 'abc123',
        description: 'Snippets',
        files: ['a.md', 'b.md'],
        updatedAt: new Date().toISOString(),
        htmlUrl: 'https://gist.github.com/abc123',
      },
    ])

    const response = await request(createApp())
      .get(`${GITHUB_URL}/gists`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    expect(githubGistListResponseSchema.parse(response.body).gists).toHaveLength(1)
    expect(vi.mocked(listGists).mock.calls[0]?.[0]).toBe('gh-token')
  })

  it('responds 400 BAD_REQUEST when GitHub is not connected', async () => {
    vi.mocked(findGithubConnectionByUserId).mockResolvedValue(null)

    const response = await request(createApp())
      .get(`${GITHUB_URL}/gists`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('BAD_REQUEST')
  })
})

describe(`GET ${GITHUB_URL}/repos`, () => {
  it('responds 200 with the user repositories', async () => {
    connectedGitHub()
    vi.mocked(listRepos).mockResolvedValue([
      {
        id: 42,
        fullName: 'octocat/hello-world',
        description: null,
        private: false,
        defaultBranch: 'main',
        updatedAt: new Date().toISOString(),
      },
    ])

    const response = await request(createApp())
      .get(`${GITHUB_URL}/repos`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    expect(githubRepoListResponseSchema.parse(response.body).repos[0]?.fullName).toBe(
      'octocat/hello-world',
    )
  })
})

describe(`POST ${GITHUB_URL}/import`, () => {
  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp())
      .post(`${GITHUB_URL}/import`)
      .send({ kind: 'gist', ref: 'abc123' })

    expect(response.status).toBe(401)
    expect(insertSyncJob).not.toHaveBeenCalled()
  })

  it('queues a gist import and returns 202 with the job', async () => {
    connectedGitHub()
    vi.mocked(insertSyncJob).mockResolvedValue(makeJob({ kind: 'gist_import' }))

    const response = await request(createApp())
      .post(`${GITHUB_URL}/import`)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ kind: 'gist', ref: 'abc123' })

    expect(response.status).toBe(202)
    expect(githubImportResponseSchema.parse(response.body).job.id).toBe(JOB_ID)
    expect(vi.mocked(insertSyncJob).mock.calls[0]?.[0]).toEqual({
      userId: USER_ID,
      kind: 'gist_import',
    })
    expect(enqueueGithubSync).toHaveBeenCalledWith({
      jobId: JOB_ID,
      userId: USER_ID,
      kind: 'gist_import',
      ref: 'abc123',
    })
  })

  it('maps a repo import to the repo_import kind', async () => {
    connectedGitHub()
    vi.mocked(insertSyncJob).mockResolvedValue(makeJob({ kind: 'repo_import' }))

    await request(createApp())
      .post(`${GITHUB_URL}/import`)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ kind: 'repo', ref: 'octocat/hello-world' })

    expect(vi.mocked(insertSyncJob).mock.calls[0]?.[0].kind).toBe('repo_import')
  })

  it('responds 400 VALIDATION_ERROR for an unsupported kind', async () => {
    const response = await request(createApp())
      .post(`${GITHUB_URL}/import`)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ kind: 'org', ref: 'octocat' })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(insertSyncJob).not.toHaveBeenCalled()
  })

  it('rejects a repo ref that is not owner/repo before queueing', async () => {
    const response = await request(createApp())
      .post(`${GITHUB_URL}/import`)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ kind: 'repo', ref: 'just-a-name' })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(insertSyncJob).not.toHaveBeenCalled()
  })
})

describe(`GET ${GITHUB_URL}/jobs/:id`, () => {
  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(`${GITHUB_URL}/jobs/${JOB_ID}`)

    expect(response.status).toBe(401)
  })

  it('responds 200 with the job and its progress', async () => {
    vi.mocked(findSyncJobById).mockResolvedValue(
      makeJob({
        status: 'running',
        stats: { total: 10, processed: 4, imported: 3, updated: 1, skipped: 0, failed: 0 },
      }),
    )

    const response = await request(createApp())
      .get(`${GITHUB_URL}/jobs/${JOB_ID}`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = syncJobResponseSchema.parse(response.body)
    expect(body.job.status).toBe('running')
    expect(body.job.stats.processed).toBe(4)
  })

  it('responds 404 NOT_FOUND for an unknown job', async () => {
    vi.mocked(findSyncJobById).mockResolvedValue(null)

    const response = await request(createApp())
      .get(`${GITHUB_URL}/jobs/${JOB_ID}`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid id', async () => {
    const response = await request(createApp())
      .get(`${GITHUB_URL}/jobs/not-a-uuid`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findSyncJobById).not.toHaveBeenCalled()
  })
})

describe(`POST ${GITHUB_URL}/webhook`, () => {
  const WEBHOOK_URL = `${GITHUB_URL}/webhook`

  function pushBody(): string {
    return JSON.stringify({
      ref: 'refs/heads/main',
      repository: { full_name: 'octocat/hello-world' },
    })
  }

  it('responds 401 UNAUTHORIZED for an invalid signature', async () => {
    const body = pushBody()

    const response = await request(createApp())
      .post(WEBHOOK_URL)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', 'sha256=' + '0'.repeat(64))
      .send(body)

    expect(response.status).toBe(401)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED')
    expect(insertSyncJob).not.toHaveBeenCalled()
  })

  it('acknowledges a non-push event without queueing work', async () => {
    const body = JSON.stringify({ action: 'opened' })
    const signature = signWebhookPayload(Buffer.from(body, 'utf8'), WEBHOOK_SECRET)

    const response = await request(createApp())
      .post(WEBHOOK_URL)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'issues')
      .set('X-Hub-Signature-256', signature)
      .send(body)

    expect(response.status).toBe(202)
    expect(response.body).toEqual({ queued: 0 })
    expect(listRepoImporters).not.toHaveBeenCalled()
  })

  it('queues a repo_sync for each importer on the pushed branch', async () => {
    vi.mocked(listRepoImporters).mockResolvedValue([{ userId: USER_ID, branch: 'main' }])
    vi.mocked(insertSyncJob).mockResolvedValue(makeJob({ kind: 'repo_sync' }))

    const body = pushBody()
    const signature = signWebhookPayload(Buffer.from(body, 'utf8'), WEBHOOK_SECRET)

    const response = await request(createApp())
      .post(WEBHOOK_URL)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signature)
      .send(body)

    expect(response.status).toBe(202)
    expect(response.body).toEqual({ queued: 1 })
    expect(vi.mocked(insertSyncJob).mock.calls[0]?.[0]).toEqual({
      userId: USER_ID,
      kind: 'repo_sync',
    })
    expect(enqueueGithubSync).toHaveBeenCalledWith({
      jobId: JOB_ID,
      userId: USER_ID,
      kind: 'repo_sync',
      ref: 'octocat/hello-world',
      branch: 'main',
    })
  })

  it('queues nothing for a branch nobody imported', async () => {
    vi.mocked(listRepoImporters).mockResolvedValue([{ userId: USER_ID, branch: 'release' }])

    const body = pushBody()
    const signature = signWebhookPayload(Buffer.from(body, 'utf8'), WEBHOOK_SECRET)

    const response = await request(createApp())
      .post(WEBHOOK_URL)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signature)
      .send(body)

    expect(response.body).toEqual({ queued: 0 })
    expect(insertSyncJob).not.toHaveBeenCalled()
  })

  it('ignores a tag push', async () => {
    const body = JSON.stringify({
      ref: 'refs/tags/v1.0.0',
      repository: { full_name: 'octocat/hello-world' },
    })
    const signature = signWebhookPayload(Buffer.from(body, 'utf8'), WEBHOOK_SECRET)

    const response = await request(createApp())
      .post(WEBHOOK_URL)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signature)
      .send(body)

    expect(response.body).toEqual({ queued: 0 })
    expect(listRepoImporters).not.toHaveBeenCalled()
  })

  it('verifies the signature over the raw bytes, not a re-serialized body', async () => {
    vi.mocked(listRepoImporters).mockResolvedValue([{ userId: USER_ID, branch: 'main' }])
    vi.mocked(insertSyncJob).mockResolvedValue(makeJob({ kind: 'repo_sync' }))

    // Deliberately unusual whitespace/key order: JSON.parse + stringify would
    // not reproduce these bytes, so a signature check on a parsed body fails.
    const body =
      '{ "repository" : { "full_name" : "octocat/hello-world" }, "ref" : "refs/heads/main" }'
    const signature = signWebhookPayload(Buffer.from(body, 'utf8'), WEBHOOK_SECRET)

    const response = await request(createApp())
      .post(WEBHOOK_URL)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signature)
      .send(body)

    expect(response.status).toBe(202)
    expect(response.body).toEqual({ queued: 1 })
  })
})
