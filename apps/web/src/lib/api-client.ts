import {
  API_PREFIX,
  attachTagInputSchema,
  backlinksResponseSchema,
  createNoteInputSchema,
  errorResponseSchema,
  graphResponseSchema,
  meResponseSchema,
  noteListResponseSchema,
  noteResponseSchema,
  searchResponseSchema,
  tagListResponseSchema,
  tagResponseSchema,
  updateNoteInputSchema,
  type AttachTagInput,
  type CreateNoteInput,
  type GraphQuery,
  type GraphResponse,
  type ListNotesQuery,
  type Note,
  type NoteListResponse,
  type SearchQuery,
  type SearchResult,
  type Tag,
  type UpdateNoteInput,
  type User,
} from '@kb/shared'

/**
 * Minimal structural view of a zod schema. Importing `zod` directly here would
 * add a dependency the web app does not declare; the shared schemas already
 * carry the parse contract we need.
 */
type ResponseParser<T> = {
  parse: (value: unknown) => T
}

type QueryValue = string | number | boolean | undefined

export type ApiRequestOptions = {
  signal?: AbortSignal | undefined
}

type RequestOptions = ApiRequestOptions & {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, QueryValue>
  body?: unknown
}

/** Filters accepted by `GET /notes`. Every field is optional but `limit`. */
export type NoteFilters = Partial<ListNotesQuery>

/** Filters accepted by `GET /search`. `q` is what ranks the hits, so it leads. */
export type SearchFilters = Partial<SearchQuery>

/**
 * Filters accepted by `GET /graph`. `limit` caps the node count; `minScore`
 * drops low-confidence suggested edges. All fields are optional here — the API
 * applies its own defaults.
 */
export type GraphFilters = Partial<GraphQuery>

export type UpdateNoteVariables = {
  id: string
  input: UpdateNoteInput
}

/** The API's error envelope (`errorResponseSchema`) as a throwable. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** True for failures that retrying cannot fix (auth, validation, missing). */
export function isClientError(error: unknown): boolean {
  return isApiError(error) && error.status >= 400 && error.status < 500
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const searchString = search.toString()
  return searchString.length > 0 ? `${API_PREFIX}${path}?${searchString}` : `${API_PREFIX}${path}`
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const parsed = errorResponseSchema.safeParse(payload)
  if (parsed.success) {
    return new ApiError(status, parsed.data.error.code, parsed.data.error.message)
  }
  return new ApiError(status, 'UNKNOWN_ERROR', `Request failed with status ${status}`)
}

/** Sends a request and returns the raw response, or throws an `ApiError`. */
async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' })
  const init: RequestInit = {
    method: options.method ?? 'GET',
    // Session lives in an httpOnly cookie, so it must ride along.
    credentials: 'include',
    headers,
    signal: options.signal,
  }
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    init.body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'The API could not be reached',
    )
  }

  if (!response.ok) {
    throw toApiError(response.status, await readJson(response))
  }

  return response
}

async function requestJson<T>(
  path: string,
  schema: ResponseParser<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options)
  return schema.parse(await readJson(response))
}

async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options)
}

function notePath(id: string): string {
  return `/notes/${encodeURIComponent(id)}`
}

/** `GET /me` — 401 (as an `ApiError`) when there is no session. */
export async function getMe(options?: ApiRequestOptions): Promise<User> {
  const { user } = await requestJson('/me', meResponseSchema, options)
  return user
}

/** `POST /auth/logout` */
export async function logout(): Promise<void> {
  await requestVoid('/auth/logout', { method: 'POST' })
}

/** `GET /notes` — newest first, cursor paginated. */
export async function listNotes(
  filters: NoteFilters = {},
  options?: ApiRequestOptions,
): Promise<NoteListResponse> {
  return requestJson('/notes', noteListResponseSchema, {
    ...options,
    query: {
      q: filters.q,
      type: filters.type,
      tag: filters.tag,
      limit: filters.limit,
      cursor: filters.cursor,
    },
  })
}

/** `POST /notes` */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  const { note } = await requestJson('/notes', noteResponseSchema, {
    method: 'POST',
    body: createNoteInputSchema.parse(input),
  })
  return note
}

/** `GET /notes/:id` */
export async function getNote(id: string, options?: ApiRequestOptions): Promise<Note> {
  const { note } = await requestJson(notePath(id), noteResponseSchema, options)
  return note
}

/** `PATCH /notes/:id` */
export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
  const { note } = await requestJson(notePath(id), noteResponseSchema, {
    method: 'PATCH',
    body: updateNoteInputSchema.parse(input),
  })
  return note
}

/** `DELETE /notes/:id` */
export async function deleteNote(id: string): Promise<void> {
  await requestVoid(notePath(id), { method: 'DELETE' })
}

/** `GET /notes/:id/backlinks` — notes that link to this one. */
export async function getBacklinks(id: string, options?: ApiRequestOptions): Promise<Note[]> {
  const { backlinks } = await requestJson(
    `${notePath(id)}/backlinks`,
    backlinksResponseSchema,
    options,
  )
  return backlinks
}

/** `GET /tags` — alphabetical. */
export async function listTags(options?: ApiRequestOptions): Promise<Tag[]> {
  const { tags } = await requestJson('/tags', tagListResponseSchema, options)
  return tags
}

/** `POST /notes/:id/tags` — creates the tag on first use. */
export async function attachTag(noteId: string, input: AttachTagInput): Promise<Tag> {
  const { tag } = await requestJson(`${notePath(noteId)}/tags`, tagResponseSchema, {
    method: 'POST',
    body: attachTagInputSchema.parse(input),
  })
  return tag
}

/** `DELETE /notes/:id/tags/:tagId` — idempotent. */
export async function detachTag(noteId: string, tagId: string): Promise<void> {
  await requestVoid(`${notePath(noteId)}/tags/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  })
}

/** `GET /search` — ranked full-text hits, best first. `q` is required. */
export async function searchNotes(
  filters: SearchFilters = {},
  options?: ApiRequestOptions,
): Promise<SearchResult[]> {
  const { results } = await requestJson('/search', searchResponseSchema, {
    ...options,
    query: {
      q: filters.q,
      type: filters.type,
      tag: filters.tag,
      limit: filters.limit,
    },
  })
  return results
}

/**
 * `GET /graph` — the nodes matching the filters plus the edges between them.
 * The response is the wire shape (`{ nodes, edges }`); the canvas converts it.
 */
export async function getGraph(
  filters: GraphFilters = {},
  options?: ApiRequestOptions,
): Promise<GraphResponse> {
  return requestJson('/graph', graphResponseSchema, {
    ...options,
    query: {
      tag: filters.tag,
      type: filters.type,
      minScore: filters.minScore,
      limit: filters.limit,
    },
  })
}
