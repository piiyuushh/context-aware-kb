import { searchQuerySchema, searchResponseSchema } from '@kb/shared'
import { parseOrThrow } from '../lib/validate'
import { requireUserId } from '../middleware/require-auth'
import { searchNotes } from '../services/search.service'
import type { SearchResponse } from '@kb/shared'
import type { Request, Response } from 'express'

/** `GET /api/v1/search` — ranked full-text search with highlighted snippets. */
export async function searchHandler(req: Request, res: Response<SearchResponse>): Promise<void> {
  const query = parseOrThrow(searchQuerySchema, req.query)
  const results = await searchNotes(requireUserId(req), query)

  res.status(200).json(searchResponseSchema.parse({ results }))
}
