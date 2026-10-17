import { getPool } from '../db/pool'
import type { NoteVersion } from '@kb/shared'

/**
 * SQL for `note_versions` (docs/DATABASE.md): one row per prior state of a
 * note. Rows are written by `notes.service.updateNote` and read back for the
 * history list and for a restore. Every query is scoped by `user_id` *and*
 * `note_id`, so a version can never be reached through a note the caller does
 * not own.
 */

interface NoteVersionRow {
  id: string
  title: string
  content_md: string
  language: string | null
  created_at: Date
}

export interface InsertNoteVersionRecord {
  userId: string
  noteId: string
  title: string
  contentMd: string
  language: string | null
}

const VERSION_COLUMNS = 'id, title, content_md, language, created_at'

function mapNoteVersion(row: NoteVersionRow): NoteVersion {
  return {
    id: row.id,
    title: row.title,
    contentMd: row.content_md,
    language: row.language,
    createdAt: row.created_at.toISOString(),
  }
}

/** Stores one state of a note. Called before an edit overwrites it. */
export async function insertNoteVersion(input: InsertNoteVersionRecord): Promise<NoteVersion> {
  const { rows } = await getPool().query<NoteVersionRow>(
    `insert into note_versions (user_id, note_id, title, content_md, language)
     values ($1, $2, $3, $4, $5)
     returning ${VERSION_COLUMNS}`,
    [input.userId, input.noteId, input.title, input.contentMd, input.language],
  )

  const row = rows[0]
  if (!row) {
    throw new Error('insertNoteVersion did not return a row')
  }

  return mapNoteVersion(row)
}

/** One note's versions, newest first, capped at `limit`. */
export async function listNoteVersions(
  userId: string,
  noteId: string,
  limit: number,
): Promise<NoteVersion[]> {
  const { rows } = await getPool().query<NoteVersionRow>(
    `select ${VERSION_COLUMNS}
     from note_versions
     where user_id = $1 and note_id = $2
     order by created_at desc, id desc
     limit $3`,
    [userId, noteId, limit],
  )

  return rows.map(mapNoteVersion)
}

/** One version, scoped to its owner and note. `null` when missing or not theirs. */
export async function findNoteVersionById(
  userId: string,
  noteId: string,
  id: string,
): Promise<NoteVersion | null> {
  const { rows } = await getPool().query<NoteVersionRow>(
    `select ${VERSION_COLUMNS}
     from note_versions
     where user_id = $1 and note_id = $2 and id = $3`,
    [userId, noteId, id],
  )

  const row = rows[0]

  return row ? mapNoteVersion(row) : null
}
