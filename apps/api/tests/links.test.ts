import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SUGGESTED_EDGES, processNote } from '../src/services/links.service'
import { findNoteById } from '../src/repositories/notes.repository'
import { attachTagsByNames } from '../src/repositories/tags.repository'
import {
  findNoteIdsByTitle,
  findSuggestionSignals,
  replaceNoteEdges,
} from '../src/repositories/links.repository'
import type { Note } from '../src/repositories/notes.repository'

vi.mock('../src/repositories/notes.repository', () => ({
  findNoteById: vi.fn(),
}))

vi.mock('../src/repositories/tags.repository', () => ({
  attachTagsByNames: vi.fn(),
}))

vi.mock('../src/repositories/links.repository', () => ({
  findNoteIdsByTitle: vi.fn(),
  findSuggestionSignals: vi.fn(),
  replaceNoteEdges: vi.fn(),
}))

const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const TARGET_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ID = '33333333-3333-4333-8333-333333333333'
const THIRD_ID = '44444444-4444-4444-8444-444444444444'

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = new Date().toISOString()

  return {
    id: NOTE_ID,
    type: 'note',
    title: 'A note',
    contentMd: '',
    language: null,
    source: 'local',
    sourceRef: null,
    sourceSha: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(findNoteById).mockReset()
  vi.mocked(attachTagsByNames).mockReset()
  vi.mocked(findNoteIdsByTitle).mockReset()
  vi.mocked(findSuggestionSignals).mockReset()
  vi.mocked(replaceNoteEdges).mockReset()

  vi.mocked(attachTagsByNames).mockResolvedValue(undefined)
  vi.mocked(findNoteIdsByTitle).mockResolvedValue(new Map())
  vi.mocked(findSuggestionSignals).mockResolvedValue([])
  vi.mocked(replaceNoteEdges).mockResolvedValue(undefined)
})

describe('processNote', () => {
  it('does nothing when the note no longer exists', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const result = await processNote(USER_ID, NOTE_ID)

    expect(result).toEqual({ explicitEdges: 0, suggestedEdges: 0 })
    expect(attachTagsByNames).not.toHaveBeenCalled()
    expect(replaceNoteEdges).not.toHaveBeenCalled()
  })

  it('attaches extracted tags and replaces edges from wiki links', async () => {
    vi.mocked(findNoteById).mockResolvedValue(
      makeNote({ contentMd: '# Heading\n\nSee [[Target Note]] and #alpha #beta.' }),
    )
    vi.mocked(findNoteIdsByTitle).mockResolvedValue(new Map([['target note', TARGET_ID]]))

    const result = await processNote(USER_ID, NOTE_ID)

    expect(attachTagsByNames).toHaveBeenCalledWith(USER_ID, NOTE_ID, ['alpha', 'beta'])
    expect(findNoteIdsByTitle).toHaveBeenCalledWith(USER_ID, ['Target Note'])
    expect(replaceNoteEdges).toHaveBeenCalledWith(USER_ID, NOTE_ID, {
      explicitTargetIds: [TARGET_ID],
      suggested: [],
    })
    expect(result).toEqual({ explicitEdges: 1, suggestedEdges: 0 })
  })

  it('drops a self-referencing wiki link', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote({ title: 'Self', contentMd: '[[Self]]' }))
    vi.mocked(findNoteIdsByTitle).mockResolvedValue(new Map([['self', NOTE_ID]]))

    const result = await processNote(USER_ID, NOTE_ID)

    expect(result.explicitEdges).toBe(0)
    expect(replaceNoteEdges).toHaveBeenCalledWith(USER_ID, NOTE_ID, {
      explicitTargetIds: [],
      suggested: [],
    })
  })

  it('scores candidates, excluding explicit links and low scores', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote({ contentMd: '[[Target Note]]' }))
    vi.mocked(findNoteIdsByTitle).mockResolvedValue(new Map([['target note', TARGET_ID]]))
    vi.mocked(findSuggestionSignals).mockResolvedValue([
      { targetNoteId: TARGET_ID, sharedTags: 4, tagUnion: 4, textRank: 0 },
      { targetNoteId: OTHER_ID, sharedTags: 4, tagUnion: 4, textRank: 0 },
      { targetNoteId: THIRD_ID, sharedTags: 1, tagUnion: 20, textRank: 0 },
    ])

    const result = await processNote(USER_ID, NOTE_ID)

    const [, , sets] = vi.mocked(replaceNoteEdges).mock.calls[0] ?? []
    expect(sets?.explicitTargetIds).toEqual([TARGET_ID])
    expect(sets?.suggested).toHaveLength(1)
    expect(sets?.suggested[0]?.targetNoteId).toBe(OTHER_ID)
    expect(sets?.suggested[0]?.score).toBeCloseTo(0.6)
    expect(result).toEqual({ explicitEdges: 1, suggestedEdges: 1 })
  })

  it('passes a null keyword query when the note has no significant words', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote({ title: 'A', contentMd: 'to be or' }))

    await processNote(USER_ID, NOTE_ID)

    const call = vi.mocked(findSuggestionSignals).mock.calls[0]
    expect(call?.[2]).toBeNull()
    expect(call?.[3]).toBeGreaterThanOrEqual(MAX_SUGGESTED_EDGES)
  })

  it('builds an OR keyword query from the note text', async () => {
    vi.mocked(findNoteById).mockResolvedValue(
      makeNote({ title: 'Express', contentMd: 'express express routing' }),
    )

    await processNote(USER_ID, NOTE_ID)

    expect(vi.mocked(findSuggestionSignals).mock.calls[0]?.[2]).toBe('express | routing')
  })
})
