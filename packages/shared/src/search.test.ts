import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  searchQuerySchema,
  searchResponseSchema,
} from './search'

const validNote = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'note',
  title: 'A note',
  contentMd: '# A note',
  language: null,
  source: 'local',
  sourceRef: null,
  sourceSha: null,
  tags: [{ id: '22222222-2222-4222-8222-222222222222', name: 'node' }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('searchQuerySchema', () => {
  it('requires a non-empty q', () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false)
    expect(searchQuerySchema.safeParse({ q: '   ' }).success).toBe(false)
  })

  it('coerces limit and defaults it to DEFAULT_SEARCH_LIMIT', () => {
    expect(searchQuerySchema.parse({ q: 'express' }).limit).toBe(DEFAULT_SEARCH_LIMIT)
    expect(searchQuerySchema.parse({ q: 'express', limit: '5' }).limit).toBe(5)
  })

  it('rejects a limit outside the allowed range', () => {
    expect(searchQuerySchema.safeParse({ q: 'express', limit: '0' }).success).toBe(false)
    expect(
      searchQuerySchema.safeParse({ q: 'express', limit: String(MAX_SEARCH_LIMIT + 1) }).success,
    ).toBe(false)
  })

  it('rejects an unknown type', () => {
    expect(searchQuerySchema.safeParse({ q: 'express', type: 'bookmark' }).success).toBe(false)
  })
})

describe('searchResponseSchema', () => {
  it('accepts a well-formed result', () => {
    const result = {
      results: [{ note: validNote, rank: 0.42, snippet: 'a <mark>note</mark>' }],
    }

    expect(searchResponseSchema.safeParse(result).success).toBe(true)
  })

  it('rejects a result without a snippet', () => {
    expect(
      searchResponseSchema.safeParse({ results: [{ note: validNote, rank: 0.42 }] }).success,
    ).toBe(false)
  })
})
