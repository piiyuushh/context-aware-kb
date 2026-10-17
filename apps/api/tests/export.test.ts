import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { API_PREFIX, errorResponseSchema } from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { serializeNoteAsMarkdown } from '../src/markdown/export'
import { findNoteById } from '../src/repositories/notes.repository'
import type { Note } from '../src/repositories/notes.repository'

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
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const EXPORT_URL = `${NOTES_URL}/${NOTE_ID}/export`

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

beforeEach(() => {
  vi.mocked(findNoteById).mockReset()
})

describe('serializeNoteAsMarkdown', () => {
  it('writes YAML frontmatter, a blank line and the body', () => {
    const markdown = serializeNoteAsMarkdown(
      makeNote({
        title: 'Postgres tips',
        type: 'doc',
        contentMd: '# Body\n',
        tags: [
          { id: '22222222-2222-4222-8222-222222222222', name: 'postgres' },
          { id: '33333333-3333-4333-8333-333333333333', name: 'sql' },
        ],
        createdAt: '2026-01-02T03:04:05.000Z',
        updatedAt: '2026-02-03T04:05:06.000Z',
        source: 'gist',
      }),
    )

    const [frontmatter, ...body] = markdown.split('\n\n')

    expect(frontmatter).toBe(
      [
        '---',
        'title: "Postgres tips"',
        'type: "doc"',
        'tags: ["postgres","sql"]',
        'created: "2026-01-02T03:04:05.000Z"',
        'updated: "2026-02-03T04:05:06.000Z"',
        'source: "gist"',
        '---',
      ].join('\n'),
    )
    expect(body.join('\n\n')).toBe('# Body\n')
  })

  it('escapes a title that would otherwise break the frontmatter', () => {
    const markdown = serializeNoteAsMarkdown(makeNote({ title: 'a: "b"\n#c' }))

    expect(markdown.startsWith('---\ntitle: "a: \\"b\\"\\n#c"\n')).toBe(true)
  })
})

describe(`GET ${EXPORT_URL}`, () => {
  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(EXPORT_URL)

    expect(response.status).toBe(401)
    expect(findNoteById).not.toHaveBeenCalled()
  })

  it('responds 200 with the note as a markdown attachment', async () => {
    vi.mocked(findNoteById).mockResolvedValue(
      makeNote({
        title: 'Postgres tips',
        contentMd: '# Tips',
        tags: [{ id: '22222222-2222-4222-8222-222222222222', name: 'postgres' }],
      }),
    )

    const response = await request(createApp())
      .get(EXPORT_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8')
    expect(response.headers['content-disposition']).toBe('attachment; filename="postgres-tips.md"')
    expect(response.text).toContain('tags: ["postgres"]')
    expect(response.text.endsWith('\n\n# Tips')).toBe(true)
    expect(vi.mocked(findNoteById).mock.calls[0]).toEqual([USER_ID, NOTE_ID])
  })

  it('falls back to the note id for a symbol-only title', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote({ title: '###' }))

    const response = await request(createApp())
      .get(EXPORT_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.headers['content-disposition']).toBe(`attachment; filename="${NOTE_ID}.md"`)
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp())
      .get(EXPORT_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid id', async () => {
    const response = await request(createApp())
      .get(`${NOTES_URL}/not-a-uuid/export`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteById).not.toHaveBeenCalled()
  })
})
