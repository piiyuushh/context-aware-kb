import { extractKeywords, toKeywordQuery } from '../markdown/keywords'
import { parseMarkdown } from '../markdown/extract'
import { suggestEdges } from '../links/similarity'
import { findNoteById } from '../repositories/notes.repository'
import {
  findNoteIdsByTitle,
  findSuggestionSignals,
  replaceNoteEdges,
} from '../repositories/links.repository'
import { attachTagsByNames } from '../repositories/tags.repository'
import type { SuggestedEdge } from '../links/similarity'

/** Most suggested edges stored per note. */
export const MAX_SUGGESTED_EDGES = 20
/** Minimum combined score for a suggested edge to be stored. */
export const MIN_SUGGESTED_SCORE = 0.2
/** How many candidates SQL may return before we rescore and trim in JS. */
const SUGGESTION_CANDIDATE_LIMIT = 100

export interface ProcessNoteResult {
  explicitEdges: number
  suggestedEdges: number
}

/**
 * The per-note half of the link pipeline (docs/ARCHITECTURE.md): parse the
 * body, persist the tags it declares, resolve wiki links to explicit edges,
 * then score shared-tag and text-similarity candidates into suggested edges.
 *
 * The whole edge set is replaced atomically, so re-processing after an edit
 * drops links that are no longer present. Idempotent and safe to run twice.
 */
export async function processNote(userId: string, noteId: string): Promise<ProcessNoteResult> {
  const note = await findNoteById(userId, noteId)

  // Deleted before the job ran: its edges were cascaded away already.
  if (!note) {
    return { explicitEdges: 0, suggestedEdges: 0 }
  }

  const { wikiLinks, tags } = parseMarkdown(note.contentMd)

  // Tags must be attached before scoring so the source's own tags are counted.
  await attachTagsByNames(userId, note.id, tags)

  const explicitTargetIds = await resolveWikiTargets(userId, note.id, wikiLinks)
  const explicit = new Set(explicitTargetIds)

  const keywords = extractKeywords(`${note.title} ${note.contentMd}`)
  const signals = await findSuggestionSignals(
    userId,
    note.id,
    toKeywordQuery(keywords),
    SUGGESTION_CANDIDATE_LIMIT,
  )

  // A note we already link to explicitly should not also be suggested.
  const suggested: SuggestedEdge[] = suggestEdges(
    signals.filter((signal) => !explicit.has(signal.targetNoteId)),
    { minScore: MIN_SUGGESTED_SCORE, limit: MAX_SUGGESTED_EDGES },
  )

  await replaceNoteEdges(userId, note.id, { explicitTargetIds, suggested })

  return { explicitEdges: explicitTargetIds.length, suggestedEdges: suggested.length }
}

/** Maps wiki-link titles to owned note ids, dropping unknown titles and self. */
async function resolveWikiTargets(
  userId: string,
  sourceNoteId: string,
  titles: string[],
): Promise<string[]> {
  if (titles.length === 0) {
    return []
  }

  const byTitle = await findNoteIdsByTitle(userId, titles)
  const ids = new Set<string>()

  for (const title of titles) {
    const id = byTitle.get(title.toLowerCase())
    if (id && id !== sourceNoteId) {
      ids.add(id)
    }
  }

  return [...ids]
}
