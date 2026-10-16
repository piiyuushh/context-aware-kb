import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTE_PAGE_SIZE,
  MAX_NOTE_PAGE_SIZE,
  createNoteInputSchema,
  listNotesQuerySchema,
  noteSchema,
  updateNoteInputSchema,
} from './note'

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

describe('noteSchema', () => {
  it('accepts a well-formed note', () => {
    expect(noteSchema.safeParse(validNote).success).toBe(true)
  })

  it('rejects an unknown source', () => {
    expect(noteSchema.safeParse({ ...validNote, source: 'elsewhere' }).success).toBe(false)
  })
})

describe('createNoteInputSchema', () => {
  it('defaults contentMd to an empty string and language to undefined', () => {
    const result = createNoteInputSchema.parse({ type: 'doc', title: '  Title  ' })

    expect(result.contentMd).toBe('')
    expect(result.title).toBe('Title')
    expect(result.language).toBeUndefined()
  })

  it('rejects a blank title', () => {
    expect(createNoteInputSchema.safeParse({ type: 'doc', title: '   ' }).success).toBe(false)
  })
})

describe('updateNoteInputSchema', () => {
  it('accepts a single field', () => {
    expect(updateNoteInputSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
  })

  it('rejects an empty patch', () => {
    expect(updateNoteInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('listNotesQuerySchema', () => {
  it('coerces limit and applies the default', () => {
    expect(listNotesQuerySchema.parse({}).limit).toBe(DEFAULT_NOTE_PAGE_SIZE)
    expect(listNotesQuerySchema.parse({ limit: '5' }).limit).toBe(5)
  })

  it('rejects a limit outside the allowed range', () => {
    expect(listNotesQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(listNotesQuerySchema.safeParse({ limit: String(MAX_NOTE_PAGE_SIZE + 1) }).success).toBe(
      false,
    )
  })

  it('rejects an unknown note type', () => {
    expect(listNotesQuerySchema.safeParse({ type: 'bookmark' }).success).toBe(false)
  })
})
