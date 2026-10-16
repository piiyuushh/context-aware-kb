import { getPool } from '../db/pool'

/**
 * SQL for `github_repo_imports`: which repositories a user has imported and the
 * branch they follow. A push webhook reads this table back to find everyone who
 * should re-sync.
 */

export interface RepoImportInput {
  userId: string
  repoFullName: string
  branch: string
  lastSyncedSha: string
}

/** A user subscribed to a repo, with the branch they imported. */
export interface RepoImporter {
  userId: string
  branch: string
}

interface RepoImporterRow {
  user_id: string
  branch: string
}

/** Records (or refreshes) a user's import of a repository and its head sha. */
export async function upsertRepoImport(input: RepoImportInput): Promise<void> {
  await getPool().query(
    `insert into github_repo_imports (user_id, repo_full_name, branch, last_synced_sha, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, repo_full_name) do update
       set branch = excluded.branch,
           last_synced_sha = excluded.last_synced_sha,
           updated_at = now()`,
    [input.userId, input.repoFullName, input.branch, input.lastSyncedSha],
  )
}

/** Every user who imported `repoFullName`, for a push webhook to re-sync. */
export async function listRepoImporters(repoFullName: string): Promise<RepoImporter[]> {
  const { rows } = await getPool().query<RepoImporterRow>(
    `select user_id, branch from github_repo_imports where repo_full_name = $1`,
    [repoFullName],
  )

  return rows.map((row) => ({ userId: row.user_id, branch: row.branch }))
}
