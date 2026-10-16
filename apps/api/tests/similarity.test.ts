import { describe, expect, it } from 'vitest'
import {
  SUGGESTION_WEIGHTS,
  combineScore,
  scoreSharedTags,
  scoreTextSimilarity,
  suggestEdges,
} from '../src/links/similarity'
import type { SuggestionSignals } from '../src/links/similarity'

const TARGET_A = '11111111-1111-4111-8111-111111111111'
const TARGET_B = '22222222-2222-4222-8222-222222222222'
const TARGET_C = '33333333-3333-4333-8333-333333333333'

function signals(overrides: Partial<SuggestionSignals> = {}): SuggestionSignals {
  return { targetNoteId: TARGET_A, sharedTags: 0, tagUnion: 0, textRank: 0, ...overrides }
}

describe('scoreSharedTags', () => {
  it('returns the Jaccard ratio', () => {
    expect(scoreSharedTags(2, 4)).toBe(0.5)
    expect(scoreSharedTags(3, 3)).toBe(1)
  })

  it('returns 0 when there is no union or no overlap', () => {
    expect(scoreSharedTags(0, 0)).toBe(0)
    expect(scoreSharedTags(0, 5)).toBe(0)
  })

  it('clamps to 1 even for inconsistent counts', () => {
    expect(scoreSharedTags(5, 4)).toBe(1)
  })
})

describe('scoreTextSimilarity', () => {
  it('maps the rank onto [0, 1)', () => {
    expect(scoreTextSimilarity(0)).toBe(0)
    expect(scoreTextSimilarity(1)).toBeCloseTo(0.5)
    expect(scoreTextSimilarity(9)).toBeCloseTo(0.9)
  })

  it('treats negative and non-finite ranks as no signal', () => {
    expect(scoreTextSimilarity(-1)).toBe(0)
    expect(scoreTextSimilarity(Number.NaN)).toBe(0)
    expect(scoreTextSimilarity(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('combineScore', () => {
  it('blends tag and text signals with the configured weights', () => {
    const score = combineScore(signals({ sharedTags: 2, tagUnion: 4, textRank: 1 }))

    expect(score).toBeCloseTo(SUGGESTION_WEIGHTS.tags * 0.5 + SUGGESTION_WEIGHTS.text * 0.5)
  })

  it('is 0 when neither signal fires', () => {
    expect(combineScore(signals())).toBe(0)
  })
})

describe('suggestEdges', () => {
  it('drops candidates below minScore', () => {
    const edges = suggestEdges(
      [
        signals({ targetNoteId: TARGET_A, sharedTags: 3, tagUnion: 3 }), // 0.6
        signals({ targetNoteId: TARGET_B, sharedTags: 1, tagUnion: 10 }), // 0.06
      ],
      { minScore: 0.2, limit: 10 },
    )

    expect(edges.map((edge) => edge.targetNoteId)).toEqual([TARGET_A])
  })

  it('orders by score descending, then by target id for stability', () => {
    const edges = suggestEdges(
      [
        signals({ targetNoteId: TARGET_B, sharedTags: 1, tagUnion: 2 }), // 0.3
        signals({ targetNoteId: TARGET_A, sharedTags: 1, tagUnion: 2 }), // 0.3 (tie)
        signals({ targetNoteId: TARGET_C, sharedTags: 2, tagUnion: 2 }), // 0.6
      ],
      { minScore: 0, limit: 10 },
    )

    expect(edges.map((edge) => edge.targetNoteId)).toEqual([TARGET_C, TARGET_A, TARGET_B])
  })

  it('keeps at most `limit` edges, the highest scoring ones', () => {
    const edges = suggestEdges(
      [
        signals({ targetNoteId: TARGET_A, sharedTags: 1, tagUnion: 4 }),
        signals({ targetNoteId: TARGET_B, sharedTags: 4, tagUnion: 4 }),
        signals({ targetNoteId: TARGET_C, sharedTags: 2, tagUnion: 4 }),
      ],
      { minScore: 0, limit: 2 },
    )

    expect(edges.map((edge) => edge.targetNoteId)).toEqual([TARGET_B, TARGET_C])
  })
})
