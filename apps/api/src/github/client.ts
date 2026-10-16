import { Octokit } from '@octokit/rest'
import { HttpError } from '../errors'
import { MAX_IMPORT_FILE_BYTES, MAX_REPO_FILES, isMarkdownPath } from './files'
import type { GitHubGist, GitHubRepo } from '@kb/shared'

/**
 * Thin Octokit wrapper: one authenticated client per user token, plus the few
 * read operations GitHub sync needs. Everything here is I/O; the domain logic
 * (what to import, how to store it) lives in `services/github-sync.service.ts`.
 *
 * Tests mock this module, so the sync worker never touches the network.
 */

const USER_AGENT = 'context-aware-kb'
const LIST_PAGE_SIZE = 100

/** Upper bound on how many gists/repos a picker call returns. */
export const MAX_LIST_ITEMS = 200

export interface GistFile {
  filename: string
  content: string
}

export interface GistSnapshot {
  id: string
  description: string | null
  files: GistFile[]
}

export interface RepoMarkdownFile {
  path: string
  /** GitHub blob sha, stored as the note's `source_sha`. */
  sha: string
  content: string
}

export interface RepoSnapshot {
  fullName: string
  branch: string
  /** Head commit sha at fetch time. */
  headSha: string
  files: RepoMarkdownFile[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Creates an authenticated REST client for one user's access token. */
export function createGitHubClient(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken, userAgent: USER_AGENT })
}

/**
 * Maps an Octokit failure to the API error envelope. GitHub's 404 (missing or
 * invisible with the current scopes) and 401/403 (bad token, rate limit or a
 * missing scope) are the ones a user can act on; anything else is a 500.
 */
function toGitHubError(error: unknown, subject: string): HttpError {
  const status =
    isRecord(error) && typeof error['status'] === 'number' ? error['status'] : undefined

  if (status === 404) {
    return new HttpError(404, 'NOT_FOUND', `${subject} not found on GitHub`)
  }
  if (status === 401) {
    return new HttpError(401, 'UNAUTHORIZED', 'GitHub connection is no longer valid')
  }
  if (status === 403) {
    return new HttpError(403, 'FORBIDDEN', 'GitHub denied the request (rate limit or scope)')
  }

  return new HttpError(500, 'INTERNAL_ERROR', `GitHub request failed: ${String(error)}`)
}

async function callGitHub<T>(subject: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toGitHubError(error, subject)
  }
}

/** File names inside a gist, ignoring entries without a usable name. */
function gistFileNames(files: unknown): string[] {
  if (!isRecord(files)) {
    return []
  }

  return Object.values(files).flatMap((value) =>
    isRecord(value) && typeof value['filename'] === 'string' ? [value['filename']] : [],
  )
}

/** `owner/repo` -> `{ owner, repo }`, rejecting anything malformed. */
export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = fullName.split('/')

  if (!owner || !repo || rest.length > 0) {
    throw new HttpError(400, 'BAD_REQUEST', `Invalid repository name: ${fullName}`)
  }

  return { owner, repo }
}

/** The user's gists, newest first, capped at `MAX_LIST_ITEMS`. */
export async function listGists(accessToken: string): Promise<GitHubGist[]> {
  const octokit = createGitHubClient(accessToken)
  const gists: GitHubGist[] = []

  await callGitHub('GitHub gists', async () => {
    for await (const response of octokit.paginate.iterator(octokit.gists.list, {
      per_page: LIST_PAGE_SIZE,
    })) {
      for (const gist of response.data) {
        gists.push({
          id: gist.id,
          description: gist.description ?? null,
          files: gistFileNames(gist.files),
          updatedAt: gist.updated_at,
          htmlUrl: gist.html_url,
        })

        if (gists.length >= MAX_LIST_ITEMS) {
          return
        }
      }
    }
  })

  return gists
}

/** The user's repositories, most recently updated first. */
export async function listRepos(accessToken: string): Promise<GitHubRepo[]> {
  const octokit = createGitHubClient(accessToken)
  const repos: GitHubRepo[] = []

  await callGitHub('GitHub repositories', async () => {
    for await (const response of octokit.paginate.iterator(octokit.repos.listForAuthenticatedUser, {
      per_page: LIST_PAGE_SIZE,
      sort: 'updated',
      affiliation: 'owner,collaborator,organization_member',
    })) {
      for (const repo of response.data) {
        repos.push({
          id: repo.id,
          fullName: repo.full_name,
          description: repo.description ?? null,
          private: repo.private,
          defaultBranch: repo.default_branch,
          updatedAt: repo.updated_at,
        })

        if (repos.length >= MAX_LIST_ITEMS) {
          return
        }
      }
    }
  })

  return repos
}

/** Fetches one gist with the content of every file (GitHub returns it inline). */
export async function fetchGist(accessToken: string, gistId: string): Promise<GistSnapshot> {
  const octokit = createGitHubClient(accessToken)
  const { data } = await callGitHub('Gist', () => octokit.gists.get({ gist_id: gistId }))

  const files: GistFile[] = []
  if (isRecord(data.files)) {
    for (const value of Object.values(data.files)) {
      if (
        isRecord(value) &&
        typeof value['filename'] === 'string' &&
        typeof value['content'] === 'string'
      ) {
        files.push({ filename: value['filename'], content: value['content'] })
      }
    }
  }

  return {
    id: typeof data.id === 'string' ? data.id : gistId,
    description: data.description ?? null,
    files,
  }
}

/**
 * Reads every markdown blob in a repository branch: the tree gives paths and
 * blob shas in one call, then each blob is fetched for its content. Oversized
 * files are skipped rather than truncated, the list is capped, and blobs are
 * fetched a few at a time so a large repo does not serialize hundreds of
 * round-trips.
 *
 * `branch` defaults to the repository's default branch.
 */
export async function fetchRepoMarkdown(
  accessToken: string,
  repoFullName: string,
  branch?: string,
): Promise<RepoSnapshot> {
  const octokit = createGitHubClient(accessToken)
  const { owner, repo } = parseRepoFullName(repoFullName)

  return callGitHub('Repository', async () => {
    const { data: repository } = await octokit.repos.get({ owner, repo })
    const resolvedBranch = branch ?? repository.default_branch

    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${resolvedBranch}` })
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: resolvedBranch,
      recursive: 'true',
    })

    if (tree.truncated) {
      console.warn(
        `[api] repository tree truncated for ${repoFullName}; importing at most ${MAX_REPO_FILES} markdown files`,
      )
    }

    // Sorted so the capped slice is a stable set, not GitHub's tree order.
    const targets = tree.tree
      .flatMap((entry) => {
        const path = entry.path
        const sha = entry.sha
        if (entry.type !== 'blob' || typeof path !== 'string' || typeof sha !== 'string') {
          return []
        }
        if (!isMarkdownPath(path) || (entry.size ?? 0) > MAX_IMPORT_FILE_BYTES) {
          return []
        }
        return [{ path, sha }]
      })
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, MAX_REPO_FILES)

    const fetched = await mapWithConcurrency(targets, BLOB_FETCH_CONCURRENCY, async (target) => {
      const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: target.sha })
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
        return null
      }

      return {
        path: target.path,
        sha: target.sha,
        content: Buffer.from(blob.content, 'base64').toString('utf8'),
      }
    })

    return {
      fullName: repository.full_name,
      branch: resolvedBranch,
      headSha: ref.object.sha,
      files: fetched.filter((file): file is RepoMarkdownFile => file !== null),
    }
  })
}

/** How many blobs to fetch in parallel. */
const BLOB_FETCH_CONCURRENCY = 8

/**
 * Runs `worker` over `items` with at most `limit` in flight, preserving order.
 * Rejects (after in-flight work settles is not awaited) on the first failure,
 * which the caller maps to an API error.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1

      const item = items[index]
      if (item === undefined) {
        continue
      }

      results[index] = await worker(item)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))

  return results
}
