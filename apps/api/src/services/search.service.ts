import { searchNotes as searchNoteRows } from '../repositories/search.repository'
import type { SearchHit } from '../repositories/search.repository'
import type { SearchQuery } from '@kb/shared'

/**
 * Ranked full-text search over the caller's notes. `limit` is already defaulted
 * and bounded by `searchQuerySchema`, so the repository can trust it as-is.
 */
export async function searchNotes(userId: string, query: SearchQuery): Promise<SearchHit[]> {
  return searchNoteRows(userId, {
    q: query.q,
    type: query.type,
    tag: query.tag,
    limit: query.limit,
  })
}
