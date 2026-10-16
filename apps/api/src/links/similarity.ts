/**
 * Link suggestion scoring. Kept pure and free of SQL so the weighting is easy
 * to read, tune and unit-test; the repository hands over raw signals and this
 * module turns them into a single `[0, 1]` confidence per candidate.
 */

/** Raw per-candidate signals, computed in SQL (see links.repository.ts). */
export interface SuggestionSignals {
  targetNoteId: string
  /** Number of tags the two notes have in common. */
  sharedTags: number
  /** Size of the union of the two tag sets (Jaccard denominator). */
  tagUnion: number
  /** `ts_rank_cd` of the candidate against the source note's keywords. */
  textRank: number
}

export interface SuggestedEdge {
  targetNoteId: string
  score: number
}

export interface SuggestOptions {
  /** Drop candidates scoring below this (0-1). */
  minScore: number
  /** Keep at most this many edges, highest score first. */
  limit: number
}

/**
 * How much each signal contributes to the combined score. Tag overlap is the
 * stronger signal (a shared tag is an explicit topic match), text similarity
 * refines it. Weights sum to 1 so the combined score stays in `[0, 1]`.
 */
export const SUGGESTION_WEIGHTS = { tags: 0.6, text: 0.4 } as const

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Jaccard similarity of the two tag sets: `|A ∩ B| / |A ∪ B|`. */
export function scoreSharedTags(sharedTags: number, tagUnion: number): number {
  if (tagUnion <= 0) {
    return 0
  }

  return clamp01(sharedTags / tagUnion)
}

/**
 * Saturating transform of `ts_rank_cd`, which is unbounded above: `r/(r+1)`
 * maps `[0, ∞)` to `[0, 1)` and keeps low ranks meaningfully separated.
 */
export function scoreTextSimilarity(textRank: number): number {
  if (!Number.isFinite(textRank) || textRank <= 0) {
    return 0
  }

  return textRank / (textRank + 1)
}

/** Weighted blend of the tag and text signals for one candidate. */
export function combineScore(signals: SuggestionSignals): number {
  const tagScore = scoreSharedTags(signals.sharedTags, signals.tagUnion)
  const textScore = scoreTextSimilarity(signals.textRank)

  return clamp01(SUGGESTION_WEIGHTS.tags * tagScore + SUGGESTION_WEIGHTS.text * textScore)
}

/**
 * Scores, filters and ranks candidates into the suggested edges to store.
 * Ordering is `(score desc, targetNoteId asc)` so equal scores are stable.
 */
export function suggestEdges(
  signals: SuggestionSignals[],
  options: SuggestOptions,
): SuggestedEdge[] {
  return signals
    .map((signal) => ({ targetNoteId: signal.targetNoteId, score: combineScore(signal) }))
    .filter((edge) => edge.score >= options.minScore)
    .sort((a, b) => b.score - a.score || a.targetNoteId.localeCompare(b.targetNoteId))
    .slice(0, options.limit)
}
