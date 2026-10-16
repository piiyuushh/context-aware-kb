import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  API_PREFIX,
  DEFAULT_GRAPH_LIMIT,
  errorResponseSchema,
  graphResponseSchema,
} from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { findNoteById } from '../src/repositories/notes.repository'
import {
  collectNeighborNoteIds,
  listGraphEdges,
  listGraphNodes,
  listGraphNodesByIds,
} from '../src/repositories/graph.repository'
import type { GraphEdge, GraphNode } from '@kb/shared'
import type { Note } from '../src/repositories/notes.repository'

vi.mock('../src/repositories/graph.repository', () => ({
  listGraphNodes: vi.fn(),
  listGraphNodesByIds: vi.fn(),
  listGraphEdges: vi.fn(),
  collectNeighborNoteIds: vi.fn(),
}))

vi.mock('../src/repositories/notes.repository', () => ({
  insertNote: vi.fn(),
  findNoteById: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  listNotes: vi.fn(),
  findBacklinks: vi.fn(),
}))

const GRAPH_URL = `${API_PREFIX}/graph`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const EDGE_ID = '55555555-5555-4555-8555-555555555555'
const TAG_ID = '66666666-6666-4666-8666-666666666666'

function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(userId, SESSION_SECRET, SESSION_TTL_SECONDS)}`
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: NOTE_ID,
    type: 'note',
    title: 'A note',
    tags: [{ id: TAG_ID, name: 'node' }],
    ...overrides,
  }
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: EDGE_ID,
    source: NOTE_ID,
    target: OTHER_ID,
    type: 'suggested',
    score: 0.6,
    ...overrides,
  }
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

beforeEach(() => {
  vi.mocked(listGraphNodes).mockReset()
  vi.mocked(listGraphNodesByIds).mockReset()
  vi.mocked(listGraphEdges).mockReset()
  vi.mocked(collectNeighborNoteIds).mockReset()
  vi.mocked(findNoteById).mockReset()

  vi.mocked(listGraphEdges).mockResolvedValue([])
})

describe(`GET ${GRAPH_URL}`, () => {
  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(GRAPH_URL)

    expect(response.status).toBe(401)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED')
    expect(listGraphNodes).not.toHaveBeenCalled()
  })

  it('responds 200 with nodes and edges', async () => {
    vi.mocked(listGraphNodes).mockResolvedValue([makeNode()])
    vi.mocked(listGraphEdges).mockResolvedValue([makeEdge()])

    const response = await request(createApp()).get(GRAPH_URL).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = graphResponseSchema.parse(response.body)
    expect(body.nodes).toHaveLength(1)
    expect(body.nodes[0]?.tags.map((tag) => tag.name)).toEqual(['node'])
    expect(body.edges).toHaveLength(1)
    expect(body.edges[0]?.score).toBe(0.6)
    expect(vi.mocked(listGraphEdges).mock.calls[0]?.[1]).toEqual([NOTE_ID])
  })

  it('forwards tag, type, minScore and limit filters', async () => {
    vi.mocked(listGraphNodes).mockResolvedValue([makeNode()])

    await request(createApp())
      .get(`${GRAPH_URL}?tag=node&type=snippet&minScore=0.5&limit=10`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(vi.mocked(listGraphNodes).mock.calls[0]?.[1]).toEqual({
      type: 'snippet',
      tag: 'node',
      limit: 10,
    })
    expect(vi.mocked(listGraphEdges).mock.calls[0]?.[2]).toEqual({ minScore: 0.5 })
  })

  it('defaults limit and leaves minScore undefined', async () => {
    vi.mocked(listGraphNodes).mockResolvedValue([makeNode()])

    await request(createApp()).get(GRAPH_URL).set('Cookie', sessionCookie(USER_ID))

    expect(vi.mocked(listGraphNodes).mock.calls[0]?.[1].limit).toBe(DEFAULT_GRAPH_LIMIT)
    expect(vi.mocked(listGraphEdges).mock.calls[0]?.[2]).toEqual({ minScore: undefined })
  })

  it('skips the edge query when no nodes match', async () => {
    vi.mocked(listGraphNodes).mockResolvedValue([])

    const response = await request(createApp()).get(GRAPH_URL).set('Cookie', sessionCookie(USER_ID))

    expect(graphResponseSchema.parse(response.body)).toEqual({ nodes: [], edges: [] })
    expect(listGraphEdges).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for an unknown type', async () => {
    const response = await request(createApp())
      .get(`${GRAPH_URL}?type=bookmark`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(listGraphNodes).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for an out-of-range minScore', async () => {
    const response = await request(createApp())
      .get(`${GRAPH_URL}?minScore=2`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
  })

  it('responds 400 VALIDATION_ERROR for an out-of-range limit', async () => {
    const response = await request(createApp())
      .get(`${GRAPH_URL}?limit=0`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
  })
})

describe(`GET ${GRAPH_URL}/:noteId/neighbors`, () => {
  const url = `${GRAPH_URL}/${NOTE_ID}/neighbors`

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(url)

    expect(response.status).toBe(401)
    expect(findNoteById).not.toHaveBeenCalled()
  })

  it('responds 200 with the subgraph and a default depth of 1', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(collectNeighborNoteIds).mockResolvedValue([NOTE_ID, OTHER_ID])
    vi.mocked(listGraphNodesByIds).mockResolvedValue([makeNode(), makeNode({ id: OTHER_ID })])
    vi.mocked(listGraphEdges).mockResolvedValue([makeEdge({ type: 'explicit', score: null })])

    const response = await request(createApp()).get(url).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = graphResponseSchema.parse(response.body)
    expect(body.nodes).toHaveLength(2)
    expect(body.edges[0]?.type).toBe('explicit')
    expect(vi.mocked(collectNeighborNoteIds).mock.calls[0]).toEqual([USER_ID, NOTE_ID, 1])
    expect(vi.mocked(listGraphEdges).mock.calls[0]?.[2]).toEqual({})
  })

  it('forwards a custom depth', async () => {
    vi.mocked(findNoteById).mockResolvedValue(makeNote())
    vi.mocked(collectNeighborNoteIds).mockResolvedValue([NOTE_ID])
    vi.mocked(listGraphNodesByIds).mockResolvedValue([makeNode()])

    await request(createApp()).get(`${url}?depth=3`).set('Cookie', sessionCookie(USER_ID))

    expect(vi.mocked(collectNeighborNoteIds).mock.calls[0]?.[2]).toBe(3)
  })

  it('responds 404 NOT_FOUND when the note is missing', async () => {
    vi.mocked(findNoteById).mockResolvedValue(null)

    const response = await request(createApp()).get(url).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(404)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND')
    expect(collectNeighborNoteIds).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for a non-uuid note id', async () => {
    const response = await request(createApp())
      .get(`${GRAPH_URL}/not-a-uuid/neighbors`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteById).not.toHaveBeenCalled()
  })

  it('responds 400 VALIDATION_ERROR for a depth above the maximum', async () => {
    const response = await request(createApp())
      .get(`${url}?depth=4`)
      .set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR')
    expect(findNoteById).not.toHaveBeenCalled()
  })
})
