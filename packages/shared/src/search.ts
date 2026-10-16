import { z } from 'zod'
import { noteSchema, noteTypeSchema } from './note'

/**
 * Markers `ts_headline` wraps around matched terms in a search snippet. They
 * are shared between the API (which asks Postgres for them) and the web app
 * (which turns them into `<mark>` elements), so the two never drift.
 */
export const SEARCH_HIGHLIGHT_START = '<mark>'
export const SEARCH_HIGHLIGHT_END = '</mark>'

export const DEFAULT_SEARCH_LIMIT = 20
export const MAX_SEARCH_LIMIT = 50

/**
 * `GET /search` query. `q` is required (this endpoint exists to rank a term,
 * unlike `GET /notes` where it is an optional filter); `limit` arrives as a
 * string so it is coerced.
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: noteTypeSchema.optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>

/**
 * One ranked hit: the full note, its relevance `rank` (higher is better) and a
 * `snippet` of the matching body text with `SEARCH_HIGHLIGHT_*` around hits.
 */
export const searchResultSchema = z.object({
  note: noteSchema,
  rank: z.number(),
  snippet: z.string(),
})

export type SearchResult = z.infer<typeof searchResultSchema>

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
})

export type SearchResponse = z.infer<typeof searchResponseSchema>
