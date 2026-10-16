import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  API_PREFIX,
  DEFAULT_SEARCH_LIMIT,
  errorResponseSchema,
  searchResponseSchema,
} from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { searchNotes } from '../src/repositories/search.repository'
import type { Note } from '../src/repositories/notes.repository'
import type { SearchHit } from '../src/repositories/search.repository'

vi.mock('../src/repositories/search.repository', () => ({
  searchNotes: vi.fn(),
}))

const SEARCH_URL = `${API_PREFIX}/search`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const TAG_ID = '22222222-2222-4222-8222-222222222222'

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

function makeHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return { note: makeNote(), rank: 0.4, snippet: 'a <mark>note</mark>', ...overrides }
}

describe(`GET ${SEARCH_URL}`, () => {
  beforeEach(() => {
    vi.mocked(searchNotes).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(`${SEARCH_URL}?q=express`)

    expect(response.status).toBe(401)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED')
    expect(searchNotes).not.toHaveBeenCalled()
  })

  it('responds 200 with ranked results, preserving rank, snippet and tags', async () => {
    vi.mocked(searchNotes).mockResolvedValue([
      makeHit({
        rank: 0.721,
        snippet: 'runs <mark>express</mark> handlers',
        note: makeNote({ tags: [{ id: TAG_ID, name: 'node' }] }),
      }),
    ])

    const response = await request(createApp())
      .get(`${SEARCH_URL}?q=express`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = searchResponseSchema.parse(response.body)
    expect(body.results).toHaveLength(1)
    expect(body.results[0]?.rank).toBe(0.721)
    expect(body.results[0]?.snippet).toBe('runs <mark>express</mark> handlers')
    expect(body.results[0]?.note.tags.map((tag) => tag.name)).toEqual(['node'])
  })

  it('responds 400 VALIDATION_ERROR when q is missing', async () => {
    const response = await request(createApp())
      .get(SEARCH_URL)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(searchNotes).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR when q is blank', async () => {
    const response = await request(createApp())
      .get(`${SEARCH_URL}?q=%20%20`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(searchNotes).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for an unknown type', async () => {
    const response = await request(createApp())
      .get(`${SEARCH_URL}?q=express&type=bookmark`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(searchNotes).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for an out-of-range limit', async () => {
    const response = await request(createApp())
      .get(`${SEARCH_URL}?q=express&limit=0`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(searchNotes).not.toHaveBeenCalled()
  })

  it('forwards q, type, tag and limit to the repository', async () => {
    vi.mocked(searchNotes).mockResolvedValue([])

    await request(createApp())
      .get(`${SEARCH_URL}?q=express&type=snippet&tag=node&limit=5`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(vi.mocked(searchNotes).mock.calls[0]?.[0]).toBe(USER_ID)
    expect(vi.mocked(searchNotes).mock.calls[0]?.[1]).toEqual({
      q: 'express',
      type: 'snippet',
      tag: 'node',
      limit: 5,
    })
  })

  it('defaults limit to DEFAULT_SEARCH_LIMIT when omitted', async () => {
    vi.mocked(searchNotes).mockResolvedValue([])

    await request(createApp()).get(`${SEARCH_URL}?q=express`).set('Cookie', sessionCookie(USER_ID))

    expect(vi.mocked(searchNotes).mock.calls[0]?.[1].limit).toBe(DEFAULT_SEARCH_LIMIT)
  })
})
