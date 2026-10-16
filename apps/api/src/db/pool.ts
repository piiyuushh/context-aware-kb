import { Pool } from 'pg'
import { getConfig } from '../config'

/**
 * Single connection pool for the process. Created lazily so importing a
 * repository never opens a socket; the first query does.
 */
let pool: Pool | undefined

export function getPool(): Pool {
  pool ??= new Pool({ connectionString: getConfig().databaseUrl })

  return pool
}

/** Drains the pool. Used by shutdown and integration tests. */
export async function closePool(): Promise<void> {
  if (!pool) {
    return
  }

  const current = pool
  pool = undefined
  await current.end()
}
