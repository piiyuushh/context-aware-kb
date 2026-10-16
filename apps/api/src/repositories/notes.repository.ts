import { getPool } from '../db/pool'
import type { NoteSource, NoteType } from '@kb/shared'
import type { Tag } from './tags.repository'

/** A note plus its tags, as the rest of the API sees it (camelCase). */
export interface Note {
  id: string
  type: NoteType
  title: string
  contentMd: string
  language: string | null
  source: NoteSource
  sourceRef: string | null
  sourceSha: string | null
  tags: Tag[]
  createdAt: string
  updatedAt: string
}

/** The scalar note columns, without the aggregated tags. */
type NoteColumns = Omit<Note, 'tags'>

interface NoteColumnsRow {
  id: string
  type: NoteType
  title: string
  content_md: string
  language: string | null
  source: NoteSource
  source_ref: string | null
  source_sha: string | null
  created_at: Date
  updated_at: Date
}

export interface NoteRow extends NoteColumnsRow {
  tags: Tag[] | null
}

/**
 * Selected once so every read returns the same shape. `json_agg` is wrapped in
 * `coalesce`/`filter` so a note with no tags yields `[]`, not `[null]`.
 *
 * Exported (with `NOTE_JOINS`/`mapNote`) so other repositories can select a
 * note the exact same way instead of re-declaring the column list.
 */
export const NOTE_COLUMNS = `
  n.id, n.type, n.title, n.content_md, n.language, n.source,
  n.source_ref, n.source_sha, n.created_at, n.updated_at,
  coalesce(
    json_agg(json_build_object('id', t.id, 'name', t.name) order by t.name)
      filter (where t.id is not null),
    '[]'
  ) as tags
`

export const NOTE_JOINS = `
  from notes n
  left join note_tags nt on nt.note_id = n.id
  left join tags t on t.id = nt.tag_id
`

function mapNoteColumns(row: NoteColumnsRow): NoteColumns {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    contentMd: row.content_md,
    language: row.language,
    source: row.source,
    sourceRef: row.source_ref,
    sourceSha: row.source_sha,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/** Row-shaped note (snake_case, `Date` timestamps) -> the API's camelCase note. */
export function mapNote(row: NoteRow): Note {
  return { ...mapNoteColumns(row), tags: row.tags ?? [] }
}

export interface CreateNoteRecord {
  userId: string
  type: NoteType
  title: string
  contentMd: string
  language: string | null
}

/** Inserts a note and returns it with an empty tag list (none attached yet). */
export async function insertNote(input: CreateNoteRecord): Promise<Note> {
  const { rows } = await getPool().query<NoteColumnsRow>(
    `insert into notes (user_id, type, title, content_md, language)
     values ($1, $2, $3, $4, $5)
     returning id, type, title, content_md, language, source,
               source_ref, source_sha, created_at, updated_at`,
    [input.userId, input.type, input.title, input.contentMd, input.language],
  )

  const row = rows[0]
  if (!row) {
    throw new Error('insertNote did not return a row')
  }

  return { ...mapNoteColumns(row), tags: [] }
}

/** A single note, scoped to its owner. `null` when missing or not theirs. */
export async function findNoteById(userId: string, id: string): Promise<Note | null> {
  const { rows } = await getPool().query<NoteRow>(
    `select ${NOTE_COLUMNS} ${NOTE_JOINS}
     where n.user_id = $1 and n.id = $2
     group by n.id`,
    [userId, id],
  )

  const row = rows[0]

  return row ? mapNote(row) : null
}

export interface UpdateNoteRecord {
  type?: NoteType
  title?: string
  contentMd?: string
  language?: string | null
}

/**
 * Applies a partial update. Column names come from an allowlist, never from
 * input; values are always parameterized. Returns the updated note, or `null`
 * when no owned row matched.
 */
export async function updateNote(
  userId: string,
  id: string,
  patch: UpdateNoteRecord,
): Promise<Note | null> {
  const values: unknown[] = [userId, id]
  const assignments: string[] = []

  const assign = (column: string, value: unknown): void => {
    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }

  if (patch.type !== undefined) assign('type', patch.type)
  if (patch.title !== undefined) assign('title', patch.title)
  if (patch.contentMd !== undefined) assign('content_md', patch.contentMd)
  if (patch.language !== undefined) assign('language', patch.language)

  if (assignments.length === 0) {
    return findNoteById(userId, id)
  }

  const { rowCount } = await getPool().query(
    `update notes
     set ${assignments.join(', ')}, updated_at = now()
     where user_id = $1 and id = $2`,
    values,
  )

  if ((rowCount ?? 0) === 0) {
    return null
  }

  return findNoteById(userId, id)
}

/** Deletes a note. Returns whether an owned row was removed. */
export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`delete from notes where user_id = $1 and id = $2`, [
    userId,
    id,
  ])

  return (rowCount ?? 0) > 0
}

export interface ListNotesFilter {
  q?: string
  type?: NoteType
  tag?: string
  limit: number
  cursor?: { updatedAt: string; id: string }
}

/**
 * Newest-first page of a user's notes. Ordering is `(updated_at desc, id desc)`
 * to match the cursor, and filtering by tag uses `exists` so it never changes
 * the join cardinality.
 *
 * Timestamps are truncated to milliseconds on both sides of the cursor
 * comparison: JS `Date` (what node-postgres returns, and what the cursor
 * carries) only has millisecond precision, so comparing it against a
 * microsecond `timestamptz` could drop or repeat rows at a page boundary.
 */
export async function listNotes(userId: string, filter: ListNotesFilter): Promise<Note[]> {
  const values: unknown[] = [userId]
  const conditions: string[] = ['n.user_id = $1']

  const bind = (value: unknown): string => {
    values.push(value)
    return `$${values.length}`
  }

  if (filter.type) {
    conditions.push(`n.type = ${bind(filter.type)}`)
  }

  if (filter.q) {
    conditions.push(`n.search @@ plainto_tsquery('english', ${bind(filter.q)})`)
  }

  if (filter.tag) {
    conditions.push(
      `exists (
         select 1 from note_tags tn
         join tags tt on tt.id = tn.tag_id
         where tn.note_id = n.id and tt.name = ${bind(filter.tag)}
       )`,
    )
  }

  if (filter.cursor) {
    const updatedAt = bind(filter.cursor.updatedAt)
    const id = bind(filter.cursor.id)
    conditions.push(
      `(date_trunc('milliseconds', n.updated_at), n.id) < (${updatedAt}::timestamptz, ${id}::uuid)`,
    )
  }

  const limit = bind(filter.limit)

  const { rows } = await getPool().query<NoteRow>(
    `select ${NOTE_COLUMNS} ${NOTE_JOINS}
     where ${conditions.join(' and ')}
     group by n.id
     order by date_trunc('milliseconds', n.updated_at) desc, n.id desc
     limit ${limit}`,
    values,
  )

  return rows.map(mapNote)
}

/**
 * Notes that link to `noteId` through an explicit edge (a `[[wiki link]]`),
 * newest first. Suggested edges are excluded: a backlink is a link the author
 * actually wrote, not a computed suggestion.
 */
export async function findBacklinks(userId: string, noteId: string): Promise<Note[]> {
  const { rows } = await getPool().query<NoteRow>(
    `select ${NOTE_COLUMNS}
     from note_links l
     join notes n on n.id = l.source_note_id
     left join note_tags nt on nt.note_id = n.id
     left join tags t on t.id = nt.tag_id
     where l.user_id = $1 and l.target_note_id = $2 and l.type = 'explicit'
     group by n.id
     order by n.updated_at desc, n.id desc`,
    [userId, noteId],
  )

  return rows.map(mapNote)
}
