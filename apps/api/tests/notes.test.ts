import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  API_PREFIX,
  backlinksResponseSchema,
  errorResponseSchema,
  noteListResponseSchema,
  noteResponseSchema,
} from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { enqueueProcessNote } from '../src/jobs/queue'
import {
  deleteNote,
  findBacklinks,
  findNoteById,
  insertNote,
  listNotes,
  updateNote,
} from '../src/repositories/notes.repository'
import type { Note } from '../src/repositories/notes.repository'

vi.mock('../src/repositories/notes.repository', () => ({
  insertNote: vi.fn(),
  findNoteById: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  listNotes: vi.fn(),
  findBacklinks: vi.fn(),
}))

vi.mock('../src/jobs/queue', () => ({
  enqueueProcessNote: vi.fn(),
}))

const NOTES_URL = `${API_PREFIX}/notes`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_NOTE_ID = '99999999-9999-4999-8999-999999999999'
const NOTE_URL = `${NOTES_URL}/${NOTE_ID}`

function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(userId, SESSION_SECRET, SESSION_TTL_SECONDS)}`
}

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = new Date().toISOString()

  return {
    id: NOTE_ID,
    type: 'note',
    title: 'A note',
    contentMd: '# A note',
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

describe(`GET ${NOTES_URL}`, () => {
  beforeEach(() => {
    vi.mocked(listNotes).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(NOTES_URL)

    expect(response.status).toBe(401)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED')
  })

  it('responds 200 with an empty page and a null cursor', async () => {
    vi.mocked(listNotes).mockResolvedValue([])

    const response = await request(createApp()).get(NOTES_URL).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = noteListResponseSchema.parse(response.body)
    expect(body.notes).toEqual([])
    expect(body.nextCursor).toBeNull()
  })

  it('slices the lookahead row and returns a cursor when more notes exist', async () => {
    // Service asks for limit + 1 rows; three come back for a limit of two.
    vi.mocked(listNotes).mockResolvedValue([
      makeNote({ id: NOTE_ID }),
      makeNote({ id: OTHER_NOTE_ID }),
      makeNote({ id: '55555555-5555-4555-8555-555555555555' }),
    ])

    const response = await request(createApp())
      .get(`${NOTES_URL}?limit=2`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = noteListResponseSchema.parse(response.body)
    expect(body.notes).toHaveLength(2)
    expect(body.nextCursor).toEqual(expect.any(String))
    expect(vi.mocked(listNotes).mock.calls[0]?.[1].limit).toBe(3)
  })

  it('forwards q, type and tag filters to the repository', async () => {
    vi.mocked(listNotes).mockResolvedValue([])

    await request(createApp())
      .get(`${NOTES_URL}?q=express&type=snippet&tag=node`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(vi.mocked(listNotes).mock.calls[0]?.[1]).toMatchObject({
      q: 'express',
      type: 'snippet',
      tag: 'node',
    })
  })

  it('responds 400 VALIDATION_ERROR for an out-of-range limit', async () => {
    const response = await request(createApp())
      .get(`${NOTES_URL}?limit=0`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(listNotes).not.toHaveBeenCalled()
  })

  it('responds 400 BAD_REQUEST for a malformed cursor', async () => {
    const response = await request(createApp())
      .get(`${NOTES_URL}?cursor=not-a-cursor`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('BAD_REQUEST')
    expect(listNotes).not.toHaveBeenCalled()
  })
})

describe(`POST ${NOTES_URL}`, () => {
  beforeEach(() => {
    vi.mocked(insertNote).mockReset()
    vi.mocked(enqueueProcessNote).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).post(NOTES_URL).send({ type: 'note', title: 'x' })

    expect(response.status).toBe(401)
    expect(insertNote).not.toHaveBeenCalled()
  })

  it('responds 201 with the created note', async () => {
    vi.mocked(insertNote).mockResolvedValue(makeNote({ title: 'Hello' }))

    const response = await request(createApp())
      .post(NOTES_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ type: 'note', title: 'Hello', contentMd: 'Body' })

    expect(response.status).toBe(201)
    const body = noteResponseSchema.parse(response.body)
    expect(body.note.title).toBe('Hello')
    expect(vi.mocked(insertNote).mock.calls[0]?.[0]).toMatchObject({
      userId: USER_ID,
      type: 'note',
      title: 'Hello',
      contentMd: 'Body',
      language: null,
    })
  })

  it('enqueues the link pipeline for the new note', async () => {
    vi.mocked(insertNote).mockResolvedValue(makeNote({ id: NOTE_ID }))

    await request(createApp())
      .post(NOTES_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ type: 'note', title: 'Hello' })

    expect(enqueueProcessNote).toHaveBeenCalledWith({ userId: USER_ID, noteId: NOTE_ID })
  })

  it('defaults contentMd to an empty string when omitted', async () => {
    vi.mocked(insertNote).mockResolvedValue(makeNote())

    await request(createApp())
      .post(NOTES_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ type: 'doc', title: 'No body' })

    expect(vi.mocked(insertNote).mock.calls[0]?.[0].contentMd).toBe('')
  })

  it('responds 400 VALIDATION_ERROR when the title is missing', async () => {
    const response = await request(createApp())
      .post(NOTES_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ type: 'note' })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(insertNote).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for an unknown type', async () => {
    const response = await request(createApp())
      .post(NOTES_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ type: 'bookmark', title: 'Nope' })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
  })
})

describe(`GET ${NOTE_URL}`, () => {
  beforeEach(() => {
    vi.mocked(findNoteById).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(NOTE_URL)

    expect(response.status).toBe(401)
  })

  it('responds 200 with the note', async () => {
    vi.mocked(findNoteById).mockResolvedValue(
      makeNote({ tags: [{ id: '22222222-2222-4222-8222-222222222222', name: 'node' }] }),
    )

    const response = await request(createApp()).get(NOTE_URL).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = noteResponseSchema.parse(response.body)
    expect(body.note.id).toBe(NOTE_ID)
    expect(body.note.tags.map((tag) => tag.name)).toEqual(['node'])
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp()).get(NOTE_URL).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid id', async () => {
    const response = await request(createApp())
      .get(`${NOTES_URL}/not-a-uuid`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteById).not.toHaveBeenCalled()
  })
})

describe(`PATCH ${NOTE_URL}`, () => {
  beforeEach(() => {
    vi.mocked(updateNote).mockReset()
    vi.mocked(enqueueProcessNote).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).patch(NOTE_URL).send({ title: 'x' })

    expect(response.status).toBe(401)
  })

  it('responds 200 with the updated note', async () => {
    vi.mocked(updateNote).mockResolvedValue(makeNote({ title: 'Renamed' }))

    const response = await request(createApp())
      .patch(NOTE_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ title: 'Renamed' })

    expect(response.status).toBe(200)
    expect(noteResponseSchema.parse(response.body).note.title).toBe('Renamed')
    expect(vi.mocked(updateNote).mock.calls[0]?.slice(0, 2)).toEqual([USER_ID, NOTE_ID])
  })

  it('enqueues the link pipeline after an update', async () => {
    vi.mocked(updateNote).mockResolvedValue(makeNote({ id: NOTE_ID }))

    await request(createApp())
      .patch(NOTE_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ contentMd: 'New [[Link]]' })

    expect(enqueueProcessNote).toHaveBeenCalledWith({ userId: USER_ID, noteId: NOTE_ID })
  })

  it('forwards an explicit null language to the repository', async () => {
    vi.mocked(updateNote).mockResolvedValue(makeNote({ language: null }))

    await request(createApp())
      .patch(NOTE_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ language: null })

    expect(vi.mocked(updateNote).mock.calls[0]?.[2].language).toBeNull()
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(updateNote).mockResolvedValue(null)

    const response = await request(createApp())
      .patch(NOTE_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ title: 'Renamed' })

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
  })

  it('responds 400 VALIDATION_ERROR for an empty body', async () => {
    const response = await request(createApp())
      .patch(NOTE_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({})

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(updateNote).not.toHaveBeenCalled()
  })
})

describe(`DELETE ${NOTE_URL}`, () => {
  beforeEach(() => {
    vi.mocked(deleteNote).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).delete(NOTE_URL)

    expect(response.status).toBe(401)
  })

  it('responds 204 with no body when a row was deleted', async () => {
    vi.mocked(deleteNote).mockResolvedValue(true)

    const response = await request(createApp())
      .delete(NOTE_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(deleteNote).mockResolvedValue(false)

    const response = await request(createApp())
      .delete(NOTE_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
  })
})

describe(`GET ${NOTE_URL}/backlinks`, () => {
  beforeEach(() => {
    vi.mocked(findNoteById).mockReset()
    vi.mocked(findBacklinks).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(`${NOTE_URL}/backlinks`)

    expect(response.status).toBe(401)
  })

  it('responds 200 with the incoming links', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(findBacklinks).mockResolvedValue([makeNote({ id: OTHER_NOTE_ID })])

    const response = await request(createApp())
      .get(`${NOTE_URL}/backlinks`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = backlinksResponseSchema.parse(response.body)
    expect(body.backlinks).toHaveLength(1)
    expect(body.backlinks[0]?.id).toBe(OTHER_NOTE_ID)
  })

  it('responds 404 NOT_FOUND when the target note is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp())
      .get(`${NOTE_URL}/backlinks`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(findBacklinks).not.toHaveBeenCalled()
  })
})
