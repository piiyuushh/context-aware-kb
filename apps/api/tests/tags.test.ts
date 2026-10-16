import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  API_PREFIX,
  errorResponseSchema,
  tagListResponseSchema,
  tagResponseSchema,
} from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { findNoteById } from '../src/repositories/notes.repository'
import {
  attachTagToNote,
  detachTagFromNote,
  listTags,
  upsertTag,
} from '../src/repositories/tags.repository'
import type { Note } from '../src/repositories/notes.repository'
import type { Tag } from '../src/repositories/tags.repository'

vi.mock('../src/repositories/notes.repository', () => ({
  insertNote: vi.fn(),
  findNoteById: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  listNotes: vi.fn(),
  findBacklinks: vi.fn(),
}))

vi.mock('../src/repositories/tags.repository', () => ({
  listTags: vi.fn(),
  upsertTag: vi.fn(),
  attachTagToNote: vi.fn(),
  detachTagFromNote: vi.fn(),
}))

const TAGS_URL = `${API_PREFIX}/tags`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const TAG_ID = '22222222-2222-4222-8222-222222222222'
const NOTE_TAGS_URL = `${API_PREFIX}/notes/${NOTE_ID}/tags`

function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(userId, SESSION_SECRET, SESSION_TTL_SECONDS)}`
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: TAG_ID, name: 'node', ...overrides }
}

function makeNote(): Note {
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
  }
}

describe(`GET ${TAGS_URL}`, () => {
  beforeEach(() => {
    vi.mocked(listTags).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(TAGS_URL)

    expect(response.status).toBe(401)
    expect(listTags).not.toHaveBeenCalled()
  })

  it('responds 200 with the user tags', async () => {
    vi.mocked(listTags).mockResolvedValue([
      makeTag(),
      makeTag({ id: '33333333-3333-4333-8333-333333333333', name: 'express' }),
    ])

    const response = await request(createApp()).get(TAGS_URL).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = tagListResponseSchema.parse(response.body)
    expect(body.tags).toHaveLength(2)
    expect(vi.mocked(listTags).mock.calls[0]?.[0]).toBe(USER_ID)
  })
})

describe(`POST ${NOTE_TAGS_URL}`, () => {
  beforeEach(() => {
    vi.mocked(findNoteById).mockReset()
    vi.mocked(upsertTag).mockReset()
    vi.mocked(attachTagToNote).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).post(NOTE_TAGS_URL).send({ name: 'node' })

    expect(response.status).toBe(401)
    expect(upsertTag).not.toHaveBeenCalled()
  })

  it('responds 201 with the attached tag', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(upsertTag).mockResolvedValue(makeTag())
    vi.mocked(attachTagToNote).mockResolvedValue(undefined)

    const response = await request(createApp())
      .post(NOTE_TAGS_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ name: 'node' })

    expect(response.status).toBe(201)
    expect(tagResponseSchema.parse(response.body).tag.id).toBe(TAG_ID)
    expect(vi.mocked(upsertTag).mock.calls[0]).toEqual([USER_ID, 'node'])
    expect(vi.mocked(attachTagToNote).mock.calls[0]).toEqual([NOTE_ID, TAG_ID])
  })

  it('trims the tag name before storing it', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(upsertTag).mockResolvedValue(makeTag())
    vi.mocked(attachTagToNote).mockResolvedValue(undefined)

    await request(createApp())
      .post(NOTE_TAGS_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ name: '  node  ' })

    expect(vi.mocked(upsertTag).mock.calls[0]?.[1]).toBe('node')
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp())
      .post(NOTE_TAGS_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ name: 'node' })

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
    expect(upsertTag).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for an empty name', async () => {
    const response = await request(createApp())
      .post(NOTE_TAGS_URL)
      .set('Cookie', sessionCookie(USER_ID))
      .send({ name: '   ' })

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteById).not.toHaveBeenCalled()
  })
})

describe(`DELETE ${NOTE_TAGS_URL}/:tagId`, () => {
  const url = `${NOTE_TAGS_URL}/${TAG_ID}`

  beforeEach(() => {
    vi.mocked(findNoteById).mockReset()
    vi.mocked(detachTagFromNote).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).delete(url)

    expect(response.status).toBe(401)
  })

  it('responds 204 with no body', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(detachTagFromNote).mockResolvedValue(true)

    const response = await request(createApp()).delete(url).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(vi.mocked(detachTagFromNote).mock.calls[0]).toEqual([NOTE_ID, TAG_ID])
  })

  it('responds 204 even when the tag was not attached (idempotent)', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(detachTagFromNote).mockResolvedValue(false)

    const response = await request(createApp()).delete(url).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(204)
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp()).delete(url).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(detachTagFromNote).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid tag id', async () => {
    const response = await request(createApp())
      .delete(`${NOTE_TAGS_URL}/not-a-uuid`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteById).not.toHaveBeenCalled()
  })
})
