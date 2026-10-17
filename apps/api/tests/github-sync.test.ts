import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig } from '../src/config'
import { subscribeToUserEvents } from '../src/events/bus'
import { encryptToken } from '../src/lib/crypto'
import { findGithubConnectionByUserId } from '../src/repositories/github-connections.repository'
import { fetchGist, fetchRepoMarkdown } from '../src/github/client'
import { upsertSyncedNote } from '../src/repositories/notes.repository'
import { upsertRepoImport } from '../src/repositories/github-repo-imports.repository'
import {
  finishSyncJob,
  markSyncJobRunning,
  updateSyncJobStats,
} from '../src/repositories/sync-jobs.repository'
import { enqueueProcessNote } from '../src/jobs/queue'
import { handleGithubSync } from '../src/jobs/github-sync'
import { runGithubSync } from '../src/services/github-sync.service'
import type { GithubSyncJobData } from '../src/jobs/github-sync'
import type { SseEvent, SyncJob } from '@kb/shared'

vi.mock('../src/repositories/github-connections.repository', () => ({
  findGithubConnectionByUserId: vi.fn(),
  upsertGithubConnection: vi.fn(),
}))

vi.mock('../src/github/client', () => ({
  listGists: vi.fn(),
  listRepos: vi.fn(),
  fetchGist: vi.fn(),
  fetchRepoMarkdown: vi.fn(),
  parseRepoFullName: vi.fn(),
}))

vi.mock('../src/repositories/notes.repository', () => ({
  upsertSyncedNote: vi.fn(),
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

const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const JOB_ID = '11111111-1111-4111-8111-111111111111'
const NOTE_ID = '33333333-3333-4333-8333-333333333333'
const NOTE_ID_2 = '44444444-4444-4444-8444-444444444444'

const GIST_JOB: GithubSyncJobData = {
  jobId: JOB_ID,
  userId: USER_ID,
  kind: 'gist_import',
  ref: 'abc123',
}

const REPO_JOB: GithubSyncJobData = {
  jobId: JOB_ID,
  userId: USER_ID,
  kind: 'repo_import',
  ref: 'octocat/hello-world',
}

function connectedGitHub(): void {
  vi.mocked(findGithubConnectionByUserId).mockResolvedValue({
    id: '22222222-2222-4222-8222-222222222222',
    userId: USER_ID,
    accessTokenEnc: encryptToken('gh-token', getConfig().tokenEncryptionKey),
    scopes: [],
  })
}

function makeJob(overrides: Partial<SyncJob> = {}): SyncJob {
  return {
    id: JOB_ID,
    kind: 'gist_import',
    status: 'queued',
    stats: { total: 0, processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 },
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(findGithubConnectionByUserId).mockReset()
  vi.mocked(fetchGist).mockReset()
  vi.mocked(fetchRepoMarkdown).mockReset()
  vi.mocked(upsertSyncedNote).mockReset()
  vi.mocked(upsertRepoImport).mockReset()
  vi.mocked(markSyncJobRunning).mockReset()
  vi.mocked(updateSyncJobStats).mockReset()
  vi.mocked(finishSyncJob).mockReset()
  vi.mocked(enqueueProcessNote).mockReset()
  vi.mocked(markSyncJobRunning).mockResolvedValue(makeJob({ status: 'running' }))
  vi.mocked(updateSyncJobStats).mockResolvedValue(makeJob({ status: 'running' }))
  vi.mocked(finishSyncJob).mockResolvedValue(makeJob({ status: 'done' }))
  vi.mocked(upsertRepoImport).mockResolvedValue(undefined)
  vi.mocked(enqueueProcessNote).mockResolvedValue(undefined)
  connectedGitHub()
})

describe('runGithubSync gist import', () => {
  it('imports markdown files as gist notes with a content sha', async () => {
    vi.mocked(fetchGist).mockResolvedValue({
      id: 'abc123',
      description: 'Snippets',
      files: [
        { filename: 'a.md', content: '# Alpha\n' },
        { filename: 'notes.txt', content: 'not markdown' },
      ],
    })
    vi.mocked(upsertSyncedNote).mockResolvedValue({ noteId: NOTE_ID, action: 'imported' })

    await runGithubSync(GIST_JOB)

    expect(markSyncJobRunning).toHaveBeenCalledWith(JOB_ID)
    expect(fetchGist).toHaveBeenCalledWith('gh-token', 'abc123')
    expect(upsertSyncedNote).toHaveBeenCalledTimes(1)
    expect(vi.mocked(upsertSyncedNote).mock.calls[0]?.[0]).toMatchObject({
      userId: USER_ID,
      title: 'Alpha',
      contentMd: '# Alpha\n',
      language: null,
      source: 'gist',
      sourceRef: 'abc123/a.md',
    })
    expect(vi.mocked(upsertSyncedNote).mock.calls[0]?.[0].sourceSha).toMatch(/^[0-9a-f]{64}$/)
    expect(updateSyncJobStats).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ total: 1 }))
    expect(finishSyncJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: 'done',
        stats: expect.objectContaining({ total: 1, processed: 1, imported: 1 }),
      }),
    )
    expect(enqueueProcessNote).toHaveBeenCalledWith({ userId: USER_ID, noteId: NOTE_ID })
  })

  it('does not re-process a note whose sha is unchanged', async () => {
    vi.mocked(fetchGist).mockResolvedValue({
      id: 'abc123',
      description: null,
      files: [{ filename: 'a.md', content: '# Alpha\n' }],
    })
    vi.mocked(upsertSyncedNote).mockResolvedValue({ noteId: NOTE_ID, action: 'skipped' })

    await runGithubSync(GIST_JOB)

    expect(enqueueProcessNote).not.toHaveBeenCalled()
    expect(finishSyncJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ stats: expect.objectContaining({ skipped: 1 }) }),
    )
  })

  it('skips markdown files over the size cap', async () => {
    vi.mocked(fetchGist).mockResolvedValue({
      id: 'abc123',
      description: null,
      files: [{ filename: 'huge.md', content: 'x'.repeat(1_000_001) }],
    })

    await runGithubSync(GIST_JOB)

    expect(upsertSyncedNote).not.toHaveBeenCalled()
    expect(finishSyncJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ stats: expect.objectContaining({ total: 0 }) }),
    )
  })

  it('does nothing when the job is already done', async () => {
    vi.mocked(markSyncJobRunning).mockResolvedValue(null)

    await runGithubSync(GIST_JOB)

    expect(fetchGist).not.toHaveBeenCalled()
    expect(finishSyncJob).not.toHaveBeenCalled()
  })

  it('publishes sync.progress on each state change', async () => {
    const received: SseEvent[] = []
    const unsubscribe = subscribeToUserEvents(USER_ID, (event) => received.push(event))

    try {
      vi.mocked(fetchGist).mockResolvedValue({
        id: 'abc123',
        description: null,
        files: [{ filename: 'a.md', content: '# Alpha\n' }],
      })
      vi.mocked(upsertSyncedNote).mockResolvedValue({ noteId: NOTE_ID, action: 'imported' })

      await runGithubSync(GIST_JOB)

      // running, then the setTotal checkpoint, then done.
      expect(received.map((event) => event.type)).toEqual([
        'sync.progress',
        'sync.progress',
        'sync.progress',
      ])
      expect(received.at(-1)).toMatchObject({
        type: 'sync.progress',
        data: { job: { id: JOB_ID, status: 'done' } },
      })
    } finally {
      unsubscribe()
    }
  })
})

describe('runGithubSync repo import', () => {
  it('imports repo markdown with the blob sha and records the subscription', async () => {
    vi.mocked(fetchRepoMarkdown).mockResolvedValue({
      fullName: 'octocat/hello-world',
      branch: 'main',
      headSha: 'head-sha',
      files: [{ path: 'docs/a.md', sha: 'blob-sha', content: '# A' }],
    })
    vi.mocked(upsertSyncedNote).mockResolvedValue({ noteId: NOTE_ID, action: 'imported' })

    await runGithubSync(REPO_JOB)

    expect(fetchRepoMarkdown).toHaveBeenCalledWith('gh-token', 'octocat/hello-world', undefined)
    expect(upsertRepoImport).toHaveBeenCalledWith({
      userId: USER_ID,
      repoFullName: 'octocat/hello-world',
      branch: 'main',
      lastSyncedSha: 'head-sha',
    })
    expect(vi.mocked(upsertSyncedNote).mock.calls[0]?.[0]).toMatchObject({
      source: 'repo',
      sourceRef: 'octocat/hello-world/docs/a.md',
      sourceSha: 'blob-sha',
    })
    expect(finishSyncJob).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: 'done' }))
  })

  it('passes the subscribed branch through on a re-sync', async () => {
    vi.mocked(fetchRepoMarkdown).mockResolvedValue({
      fullName: 'octocat/hello-world',
      branch: 'release',
      headSha: 'head-sha',
      files: [],
    })

    await runGithubSync({ ...REPO_JOB, kind: 'repo_sync', branch: 'release' })

    expect(fetchRepoMarkdown).toHaveBeenCalledWith('gh-token', 'octocat/hello-world', 'release')
  })

  it('counts a failed file and keeps importing the rest', async () => {
    vi.mocked(fetchRepoMarkdown).mockResolvedValue({
      fullName: 'octocat/hello-world',
      branch: 'main',
      headSha: 'head-sha',
      files: [
        { path: 'a.md', sha: 'sha-a', content: '# A' },
        { path: 'b.md', sha: 'sha-b', content: '# B' },
      ],
    })
    vi.mocked(upsertSyncedNote)
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce({ noteId: NOTE_ID_2, action: 'imported' })

    await runGithubSync(REPO_JOB)

    expect(finishSyncJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        status: 'done',
        stats: expect.objectContaining({ total: 2, processed: 2, failed: 1, imported: 1 }),
      }),
    )
  })

  it('marks the job failed and rethrows on a fatal error', async () => {
    vi.mocked(fetchRepoMarkdown).mockRejectedValue(new Error('GitHub is down'))

    await expect(runGithubSync(REPO_JOB)).rejects.toThrow('GitHub is down')

    expect(finishSyncJob).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ status: 'failed', error: 'GitHub is down' }),
    )
  })
})

describe('handleGithubSync', () => {
  it('rejects a malformed payload before touching GitHub', async () => {
    await expect(handleGithubSync({ jobId: 'not-a-uuid', userId: USER_ID })).rejects.toThrow()

    expect(fetchGist).not.toHaveBeenCalled()
    expect(fetchRepoMarkdown).not.toHaveBeenCalled()
  })

  it('runs a valid payload', async () => {
    vi.mocked(fetchGist).mockResolvedValue({ id: 'abc123', description: null, files: [] })

    await handleGithubSync(GIST_JOB)

    expect(fetchGist).toHaveBeenCalledWith('gh-token', 'abc123')
  })
})
