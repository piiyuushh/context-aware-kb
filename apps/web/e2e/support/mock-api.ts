import type { Page, Route } from '@playwright/test'

/**
 * Hermetic API stub for the e2e suite.
 *
 * Every `/api/v1/*` request the page makes is answered from one mutable
 * in-memory object, so the specs need no API, database or GitHub access — and
 * no running API either, since the page never gets past the browser. Mutating
 * the state from a handler (creating a note, for instance) is visible to the
 * next request, which is what makes "click New note, land in its editor" work
 * without a real backend.
 */

/** Mirrors `API_PREFIX` from packages/shared, duplicated to keep e2e standalone. */
const API_PREFIX = '/api/v1'

const USER_ID = '55555555-5555-4555-8555-555555555555'
export const NOTE_ID = '11111111-1111-4111-8111-111111111111'
export const SNIPPET_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TAG_ID = '33333333-3333-4333-8333-333333333333'
const SNIPPET_TAG_ID = '44444444-4444-4444-8444-444444444444'
const NEW_TAG_ID = '88888888-8888-4888-8888-888888888888'
const EDGE_ID = '99999999-9999-4999-8999-999999999999'

/** Datetimes are fixed, so a spec can assert on rendered dates if it wants to. */
const BASE_TIME_MS = Date.UTC(2026, 9, 17, 9, 0, 0)

export const NOTE_TITLE = 'Postgres index tuning'
export const SNIPPET_TITLE = 'Vitest patterns'
export const NOTE_CONTENT =
  '# Postgres index tuning\n\nEvery hot query should hit an index; check EXPLAIN before shipping a migration.\n'

/** Term the search spec types; it appears in `NOTE_CONTENT`, so a hit is guaranteed. */
export const SEARCH_TERM = 'index'

type MockNoteType = 'doc' | 'snippet' | 'note'
type MockNoteSource = 'local' | 'gist' | 'repo'

export type MockTag = {
  id: string
  name: string
}

export type MockNote = {
  id: string
  type: MockNoteType
  title: string
  contentMd: string
  language: string | null
  source: MockNoteSource
  sourceRef: string | null
  sourceSha: string | null
  tags: MockTag[]
  createdAt: string
  updatedAt: string
}

export type MockNoteVersion = {
  id: string
  title: string
  contentMd: string
  language: string | null
  createdAt: string
}

export type MockApiState = {
  /** The login spec flips this to simulate signing in. */
  signedIn: boolean
  notes: MockNote[]
  versions: Record<string, MockNoteVersion[]>
  /** Monotonic clock, so created/updated timestamps stay ordered. */
  ticks: number
  /** Counter behind the ids of notes the specs create. */
  created: number
}

export type MockApi = {
  /** Mutable stub state; change it mid-test to change what the API returns. */
  state: MockApiState
}

const isoAt = (offsetSeconds: number): string =>
  new Date(BASE_TIME_MS + offsetSeconds * 1000).toISOString()

function seedNotes(): MockNote[] {
  return [
    {
      id: NOTE_ID,
      type: 'doc',
      title: NOTE_TITLE,
      contentMd: NOTE_CONTENT,
      language: null,
      source: 'local',
      sourceRef: null,
      sourceSha: null,
      tags: [{ id: TAG_ID, name: 'postgres' }],
      createdAt: isoAt(0),
      updatedAt: isoAt(60),
    },
    {
      id: SNIPPET_ID,
      type: 'snippet',
      title: SNIPPET_TITLE,
      contentMd: 'Prefer table-driven tests and keep every case independent.\n',
      language: 'typescript',
      source: 'gist',
      sourceRef: 'abcdef/vitest-patterns',
      sourceSha: null,
      tags: [{ id: SNIPPET_TAG_ID, name: 'testing' }],
      createdAt: isoAt(120),
      updatedAt: isoAt(180),
    },
  ]
}

/**
 * Serves the API the specs touch from `state`. Returns the state so a test can
 * read it (or mutate it, like the login spec does).
 */
export async function mockApi(page: Page, options: { signedIn?: boolean } = {}): Promise<MockApi> {
  const state: MockApiState = {
    signedIn: options.signedIn ?? true,
    notes: seedNotes(),
    versions: {
      [NOTE_ID]: [
        {
          id: VERSION_ID,
          title: NOTE_TITLE,
          contentMd: '# Postgres index tuning\n\nAn earlier draft.\n',
          language: null,
          createdAt: isoAt(30),
        },
      ],
    },
    ticks: 300,
    created: 0,
  }

  await page.route(
    (url) => url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`),
    (route) => handleRoute(route, state),
  )

  return { state }
}

function tick(state: MockApiState): string {
  state.ticks += 1
  return isoAt(state.ticks)
}

async function sendJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function sendError(
  route: Route,
  status: number,
  code: string,
  message: string,
): Promise<void> {
  await sendJson(route, status, { error: { code, message } })
}

async function readJsonBody(route: Route): Promise<Record<string, unknown>> {
  const raw = route.request().postData()
  if (raw === null) return {}
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function findNote(state: MockApiState, id: string | undefined): MockNote | undefined {
  return state.notes.find((note) => note.id === id)
}

function matchesTerm(note: MockNote, term: string): boolean {
  return note.title.toLowerCase().includes(term) || note.contentMd.toLowerCase().includes(term)
}

/** Snippet with `<mark>` around the first match, like the API's `ts_headline`. */
function buildSnippet(note: MockNote, term: string): string {
  const source = note.contentMd.length > 0 ? note.contentMd : note.title
  const index = source.toLowerCase().indexOf(term.toLowerCase())
  if (index === -1) return source.slice(0, 80)
  const matched = source.slice(index, index + term.length)
  return `${source.slice(Math.max(0, index - 20), index)}<mark>${matched}</mark>${source.slice(
    index + term.length,
    index + term.length + 40,
  )}`
}

function allTags(state: MockApiState): MockTag[] {
  const byId = new Map<string, MockTag>()
  for (const note of state.notes) {
    for (const tag of note.tags) byId.set(tag.id, tag)
  }
  return [...byId.values()]
}

function exportFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug.length > 0 ? slug : 'note'}.md`
}

function nextCreatedNoteId(state: MockApiState): string {
  state.created += 1
  return `70000000-0000-4000-8000-${String(state.created).padStart(12, '0')}`
}

async function handleRoute(route: Route, state: MockApiState): Promise<void> {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname.slice(API_PREFIX.length)
  const method = request.method()
  const segments = path.split('/').filter((segment) => segment.length > 0)
  const [resource, noteId, sub, subId] = segments

  // --- session ------------------------------------------------------------

  if (path === '/me' && method === 'GET') {
    if (!state.signedIn) {
      await sendError(route, 401, 'UNAUTHORIZED', 'No session')
      return
    }
    await sendJson(route, 200, {
      user: {
        id: USER_ID,
        username: 'octocat',
        email: 'octocat@example.com',
        avatarUrl: null,
        createdAt: isoAt(0),
      },
    })
    return
  }

  if (path === '/auth/logout' && method === 'POST') {
    state.signedIn = false
    await route.fulfill({ status: 204 })
    return
  }

  // --- realtime -----------------------------------------------------------

  if (path === '/events' && method === 'GET') {
    /*
     * A well-formed but short-lived stream: the app must not error, and the
     * browser's EventSource reconnects on its own afterwards. The stream is
     * never used to deliver events in these specs.
     */
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
      body: ': keepalive\n\n',
    })
    return
  }

  // --- collections --------------------------------------------------------

  if (resource === 'tags' && noteId === undefined && method === 'GET') {
    await sendJson(route, 200, { tags: allTags(state) })
    return
  }

  if (resource === 'search' && method === 'GET') {
    const term = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const hits =
      term.length === 0
        ? []
        : state.notes
            .filter((note) => matchesTerm(note, term))
            .map((note, index) => ({
              note,
              rank: 1 - index * 0.1,
              snippet: buildSnippet(note, term),
            }))
    await sendJson(route, 200, { results: hits })
    return
  }

  if (resource === 'graph' && method === 'GET') {
    const nodes = state.notes.map((note) => ({
      id: note.id,
      type: note.type,
      title: note.title,
      tags: note.tags,
    }))
    const ids = new Set(nodes.map((node) => node.id))
    const edges =
      ids.has(NOTE_ID) && ids.has(SNIPPET_ID)
        ? [{ id: EDGE_ID, source: NOTE_ID, target: SNIPPET_ID, type: 'explicit', score: null }]
        : []
    await sendJson(route, 200, { nodes, edges })
    return
  }

  // --- notes --------------------------------------------------------------

  if (resource === 'notes' && noteId === undefined) {
    if (method === 'GET') {
      const term = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      const notes =
        term.length === 0 ? state.notes : state.notes.filter((note) => matchesTerm(note, term))
      await sendJson(route, 200, { notes, nextCursor: null })
      return
    }

    if (method === 'POST') {
      const body = await readJsonBody(route)
      const title =
        typeof body.title === 'string' && body.title.length > 0 ? body.title : 'Untitled'
      const note: MockNote = {
        id: nextCreatedNoteId(state),
        type: body.type === 'doc' || body.type === 'snippet' ? body.type : 'note',
        title,
        contentMd: typeof body.contentMd === 'string' ? body.contentMd : '',
        language: typeof body.language === 'string' ? body.language : null,
        source: 'local',
        sourceRef: null,
        sourceSha: null,
        tags: [],
        createdAt: tick(state),
        updatedAt: tick(state),
      }
      state.notes = [note, ...state.notes]
      await sendJson(route, 201, { note })
      return
    }
  }

  if (resource === 'notes' && noteId !== undefined) {
    const note = findNote(state, noteId)

    if (sub === undefined) {
      if (note === undefined) {
        await sendError(route, 404, 'NOT_FOUND', 'Note not found')
        return
      }
      if (method === 'GET') {
        await sendJson(route, 200, { note })
        return
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(route)
        if (typeof body.title === 'string' && body.title.length > 0) note.title = body.title
        if (typeof body.contentMd === 'string') note.contentMd = body.contentMd
        if (typeof body.language === 'string') note.language = body.language
        note.updatedAt = tick(state)
        await sendJson(route, 200, { note })
        return
      }
      if (method === 'DELETE') {
        state.notes = state.notes.filter((item) => item.id !== noteId)
        await route.fulfill({ status: 204 })
        return
      }
      await sendError(route, 405, 'NOT_FOUND', `No mock for ${method} ${path}`)
      return
    }

    if (note === undefined) {
      await sendError(route, 404, 'NOT_FOUND', 'Note not found')
      return
    }

    // The e2e notes have no wiki links, so no note is ever a backlink.
    if (sub === 'backlinks' && method === 'GET') {
      await sendJson(route, 200, { backlinks: [] })
      return
    }

    if (sub === 'export' && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': `attachment; filename="${exportFilename(note.title)}"`,
        },
        body: note.contentMd,
      })
      return
    }

    if (sub === 'versions') {
      const versions = state.versions[noteId] ?? []
      if (subId === undefined && method === 'GET') {
        await sendJson(route, 200, { versions })
        return
      }
      if (method === 'POST' && segments[4] === 'restore') {
        const version = versions.find((item) => item.id === subId)
        if (version === undefined) {
          await sendError(route, 404, 'NOT_FOUND', 'Version not found')
          return
        }
        note.title = version.title
        note.contentMd = version.contentMd
        note.language = version.language
        note.updatedAt = tick(state)
        await sendJson(route, 200, { note })
        return
      }
    }

    if (sub === 'tags') {
      if (method === 'POST' && subId === undefined) {
        const body = await readJsonBody(route)
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const tag: MockTag = { id: NEW_TAG_ID, name }
        note.tags = [...note.tags, tag]
        await sendJson(route, 201, { tag })
        return
      }
      if (method === 'DELETE') {
        note.tags = note.tags.filter((tag) => tag.id !== subId)
        await route.fulfill({ status: 204 })
        return
      }
    }
  }

  /*
   * Anything unmocked is a 404 in the API's error envelope: the app renders its
   * own error state, and a missing stub stays obvious instead of silently
   * reaching (and failing against) a dev API.
   */
  await sendError(route, 404, 'NOT_FOUND', `No mock for ${method} ${path}`)
}
