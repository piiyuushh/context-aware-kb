import { getPool } from '../db/pool'

/** A user as the rest of the API sees it (camelCase domain object). */
export interface User {
  id: string
  /** `users.github_id` is `bigint`; pg returns it as a string. */
  githubId: string
  username: string
  email: string | null
  avatarUrl: string | null
  createdAt: string
}

export interface UpsertGitHubUserInput {
  githubId: string
  username: string
  email: string | null
  avatarUrl: string | null
}

interface UserRow {
  id: string
  github_id: string
  username: string
  email: string | null
  avatar_url: string | null
  created_at: Date
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    githubId: row.github_id,
    username: row.username,
    email: row.email,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at.toISOString(),
  }
}

const SELECT_COLUMNS = 'id, github_id, username, email, avatar_url, created_at'

/**
 * Inserts a user, or refreshes the GitHub profile fields of an existing one.
 * Login must be idempotent across repeated OAuth round-trips.
 */
export async function upsertGitHubUser(input: UpsertGitHubUserInput): Promise<User> {
  const { rows } = await getPool().query<UserRow>(
    `insert into users (github_id, username, email, avatar_url)
     values ($1, $2, $3, $4)
     on conflict (github_id) do update
       set username = excluded.username,
           email = excluded.email,
           avatar_url = excluded.avatar_url
     returning ${SELECT_COLUMNS}`,
    [input.githubId, input.username, input.email, input.avatarUrl],
  )

  const row = rows[0]
  if (!row) {
    throw new Error('upsertGitHubUser did not return a row')
  }

  return mapUser(row)
}

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await getPool().query<UserRow>(
    `select ${SELECT_COLUMNS} from users where id = $1`,
    [id],
  )

  const row = rows[0]

  return row ? mapUser(row) : null
}
