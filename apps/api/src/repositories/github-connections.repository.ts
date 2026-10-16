import { getPool } from '../db/pool'

/** Stored GitHub OAuth connection. `accessTokenEnc` stays encrypted at rest. */
export interface GithubConnection {
  id: string
  userId: string
  accessTokenEnc: Buffer
  scopes: string[]
}

export interface UpsertGithubConnectionInput {
  userId: string
  accessTokenEnc: Buffer
  scopes: string[]
}

interface GithubConnectionRow {
  id: string
  user_id: string
  access_token_enc: Buffer
  scopes: string[]
}

const SELECT_COLUMNS = 'id, user_id, access_token_enc, scopes'

function mapConnection(row: GithubConnectionRow): GithubConnection {
  return {
    id: row.id,
    userId: row.user_id,
    accessTokenEnc: row.access_token_enc,
    scopes: row.scopes,
  }
}

/** One connection per user (enforced by a unique index on `user_id`). */
export async function upsertGithubConnection(input: UpsertGithubConnectionInput): Promise<void> {
  await getPool().query(
    `insert into github_connections (user_id, access_token_enc, scopes, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id) do update
       set access_token_enc = excluded.access_token_enc,
           scopes = excluded.scopes,
           updated_at = now()`,
    [input.userId, input.accessTokenEnc, input.scopes],
  )
}

export async function findGithubConnectionByUserId(
  userId: string,
): Promise<GithubConnection | null> {
  const { rows } = await getPool().query<GithubConnectionRow>(
    `select ${SELECT_COLUMNS} from github_connections where user_id = $1`,
    [userId],
  )

  const row = rows[0]

  return row ? mapConnection(row) : null
}
