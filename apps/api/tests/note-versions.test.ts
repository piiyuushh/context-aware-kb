import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  API_PREFIX,
  DEFAULT_VERSION_PAGE_SIZE,
  errorResponseSchema,
  noteResponseSchema,
  noteVersionListResponseSchema,
} from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { subscribeToUserEvents } from '../src/events/bus'
import { enqueueProcessNote } from '../src/jobs/queue'
import {
  findNoteVersionById,
  insertNoteVersion,
  listNoteVersions,
} from '../src/repositories/note-versions.repository'
import { findNoteById, updateNote } from '../src/repositories/notes.repository'
import type { Note } from '../src/repositories/notes.repository'
import type { NoteVersion, SseEvent } from '@kb/shared'

vi.mock('../src/repositories/notes.repository', () => ({
  insertNote: vi.fn(),
  findNoteById: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  listNotes: vi.fn(),
  findBacklinks: vi.fn(),
}))

vi.mock('../src/repositories/note-versions.repository', () => ({
  insertNoteVersion: vi.fn(),
  listNoteVersions: vi.fn(),
  findNoteVersionById: vi.fn(),
}))

vi.mock('../src/jobs/queue', () => ({
  enqueueProcessNote: vi.fn(),
}))

const NOTES_URL = `${API_PREFIX}/notes`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const OTHER_USER_ID = '4a2c2f4b-2d3e-4f50-9bac-1d2e3f4a5b6c'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const VERSION_ID = '22222222-2222-4222-8222-222222222222'
const OLDER_VERSION_ID = '33333333-3333-4333-8333-333333333333'
const VERSIONS_URL = `${NOTES_URL}/${NOTE_ID}/versions`

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

function makeVersion(overrides: Partial<NoteVersion> = {}): NoteVersion {
  return {
    id: VERSION_ID,
    title: 'Older title',
    contentMd: 'older body',
    language: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(findNoteById).mockReset()
  vi.mocked(updateNote).mockReset()
  vi.mocked(insertNoteVersion).mockReset()
  vi.mocked(listNoteVersions).mockReset()
  vi.mocked(findNoteVersionById).mockReset()
  vi.mocked(enqueueProcessNote).mockReset()
})

describe(`GET ${VERSIONS_URL}`, () => {
  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(VERSIONS_URL)

    expect(response.status).toBe(401)
    expect(listNoteVersions).not.toHaveBeenCalled()
  })

  it('responds 200 with the history, newest first', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(listNoteVersions).mockResolvedValue([
      makeVersion({ id: VERSION_ID, title: 'Newest' }),
      makeVersion({ id: OLDER_VERSION_ID, title: 'Older' }),
    ])

    const response = await request(createApp())
      .get(VERSIONS_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = noteVersionListResponseSchema.parse(response.body)
    expect(body.versions.map((version) => version.title)).toEqual(['Newest', 'Older'])
    expect(vi.mocked(listNoteVersions).mock.calls[0]).toEqual([
      USER_ID,
      NOTE_ID,
      DEFAULT_VERSION_PAGE_SIZE,
    ])
  })

  it('forwards a custom limit', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(listNoteVersions).mockResolvedValue([])

    await request(createApp()).get(`${VERSIONS_URL}?limit=5`).set('Cookie', sessionCookie(USER_ID))

    expect(vi.mocked(listNoteVersions).mock.calls[0]?.[2]).toBe(5)
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp())
      .get(VERSIONS_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
    expect(listNoteVersions).not.toHaveBeenCalled()
  })

  it('responds 404 NOT_FOUND for another user\u2019s note', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp())
      .get(VERSIONS_URL)
      .set('Cookie', sessionCookie(OTHER_USER_ID))

    expect(response.status).toBe(404)
    expect(findNoteById).toHaveBeenCalledWith(OTHER_USER_ID, NOTE_ID)
    expect(listNoteVersions).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid note id', async () => {
    const response = await request(createApp())
      .get(`${NOTES_URL}/not-a-uuid/versions`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteById).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for an out-of-range limit', async () => {
    const response = await request(createApp())
      .get(`${VERSIONS_URL}?limit=0`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(listNoteVersions).not.toHaveBeenCalled()
  })
})

describe(`POST ${VERSIONS_URL}/:versionId/restore`, () => {
  const restoreUrl = `${VERSIONS_URL}/${VERSION_ID}/restore`

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).post(restoreUrl)

    expect(response.status).toBe(401)
    expect(findNoteVersionById).not.toHaveBeenCalled()
  })

  it('applies the version through updateNote and returns the restored note', async () => {
    const received: SseEvent[] = []
    const unsubscribe = subscribeToUserEvents(USER_ID, (event) => received.push(event))

    try {
      vi.mocked(findNoteById).mockResolvedValue(makeNote({ title: 'Current' }))
      vi.mocked(findNoteVersionById).mockResolvedValue(
        makeVersion({ title: 'Older title', contentMd: 'older body', language: 'ts' }),
      )
      vi.mocked(updateNote).mockResolvedValue(
        makeNote({ title: 'Older title', contentMd: 'older body', language: 'ts' }),
      )

      const response = await request(createApp())
        .post(restoreUrl)
        .set('Cookie', sessionCookie(USER_ID))

      expect(response.status).toBe(200)
      const body = noteResponseSchema.parse(response.body)
      expect(body.note.title).toBe('Older title')
      expect(vi.mocked(findNoteVersionById).mock.calls[0]).toEqual([USER_ID, NOTE_ID, VERSION_ID])
      expect(vi.mocked(updateNote).mock.calls[0]).toEqual([
        USER_ID,
        NOTE_ID,
        { type: undefined, title: 'Older title', contentMd: 'older body', language: 'ts' },
      ])
      expect(enqueueProcessNote).toHaveBeenCalledWith({ userId: USER_ID, noteId: NOTE_ID })
      expect(received).toEqual([
        { type: 'note.updated', data: { noteId: NOTE_ID, action: 'updated' } },
      ])
    } finally {
      unsubscribe()
    }
  })

  it('snapshots the state it replaces, so the restore is itself versioned', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote({ title: 'Current', contentMd: 'current' }))
    vi.mocked(findNoteVersionById).mockResolvedValue(
      makeVersion({ title: 'Older title', contentMd: 'older body' }),
    )
    vi.mocked(updateNote).mockResolvedValue(makeNote({ title: 'Older title' }))

    await request(createApp()).post(restoreUrl).set('Cookie', sessionCookie(USER_ID))

    expect(insertNoteVersion).toHaveBeenCalledWith({
      userId: USER_ID,
      noteId: NOTE_ID,
      title: 'Current',
      contentMd: 'current',
      language: null,
    })
  })

  it('responds 404 NOT_FOUND when the version is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(findNoteVersionById).mockResolvedValue(null)

    const response = await request(createApp())
      .post(restoreUrl)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
    expect(updateNote).not.toHaveBeenCalled()
  })

  it('responds 404 NOT_FOUND when the note is another user\u2019s', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp())
      .post(restoreUrl)
      .set('Cookie', sessionCookie(OTHER_USER_ID))

    expect(response.status).toBe(404)
    expect(findNoteVersionById).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid version id', async () => {
    const response = await request(createApp())
      .post(`${VERSIONS_URL}/not-a-uuid/restore`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteVersionById).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid note id', async () => {
    const response = await request(createApp())
      .post(`${NOTES_URL}/not-a-uuid/versions/${VERSION_ID}/restore`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
  })
})
