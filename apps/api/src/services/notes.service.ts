import { HttpError } from '../errors'
import { decodeCursor, encodeCursor } from '../lib/cursor'
import { publishNoteUpdated } from '../events/bus'
import { enqueueProcessNote } from '../jobs/queue'
import {
  findNoteVersionById,
  insertNoteVersion,
  listNoteVersions as listNoteVersionRows,
} from '../repositories/note-versions.repository'
import {
  deleteNote as deleteNoteRecord,
  findBacklinks,
  findNoteById,
  insertNote,
  listNotes as listNoteRows,
  updateNote as updateNoteRecord,
} from '../repositories/notes.repository'
import type { Note } from '../repositories/notes.repository'
import type { CreateNoteInput, ListNotesQuery, NoteVersion, UpdateNoteInput } from '@kb/shared'

const NOTE_NOT_FOUND = 'Note not found'

function noteNotFound(): HttpError {
  return new HttpError(404, 'NOT_FOUND', NOTE_NOT_FOUND)
}

export async function createNote(userId: string, input: CreateNoteInput): Promise<Note> {
  const note = await insertNote({
    userId,
    type: input.type,
    title: input.title,
    contentMd: input.contentMd,
    language: input.language ?? null,
  })

  publishNoteUpdated(userId, { noteId: note.id, action: 'created' })

  // Derived data: extracted links/tags and suggested edges are rebuilt async.
  await enqueueProcessNote({ userId, noteId: note.id })

  return note
}

/** Loads an owned note or throws `NOT_FOUND` (also covers other users' notes). */
export async function getNote(userId: string, id: string): Promise<Note> {
  const note = await findNoteById(userId, id)

  if (!note) {
    throw noteNotFound()
  }

  return note
}

export interface ListNotesResult {
  notes: Note[]
  nextCursor: string | null
}

/**
 * Keyset page. Fetches one extra row to learn whether another page exists,
 * then derives the cursor from the last returned note.
 */
export async function listNotes(userId: string, query: ListNotesQuery): Promise<ListNotesResult> {
  const rows = await listNoteRows(userId, {
    q: query.q,
    type: query.type,
    tag: query.tag,
    limit: query.limit + 1,
    cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
  })

  const hasMore = rows.length > query.limit
  const notes = hasMore ? rows.slice(0, query.limit) : rows
  const last = notes[notes.length - 1]

  return {
    notes,
    nextCursor: hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null,
  }
}

/** Whether an update would change a field that version history tracks. */
function hasVersionableChange(current: Note, input: UpdateNoteInput): boolean {
  return (
    (input.title !== undefined && input.title !== current.title) ||
    (input.contentMd !== undefined && input.contentMd !== current.contentMd) ||
    (input.language !== undefined && input.language !== current.language)
  )
}

/**
 * Applies a partial update.
 *
 * The note's current editable fields are snapshotted into `note_versions`
 * before the write, so `versions` lists the states the note was changed *away
 * from* (docs/DATABASE.md). A patch that changes none of title/contentMd/
 * language — a repeat of the current values, or a `type`-only change — writes
 * no version: `type` is a classification, not content.
 *
 * GitHub sync writes through `upsertSyncedNote` rather than this service, so an
 * upstream import is never versioned; only client edits are.
 */
export async function updateNote(
  userId: string,
  id: string,
  input: UpdateNoteInput,
): Promise<Note> {
  const current = await findNoteById(userId, id)

  if (!current) {
    throw noteNotFound()
  }

  if (hasVersionableChange(current, input)) {
    await insertNoteVersion({
      userId,
      noteId: id,
      title: current.title,
      contentMd: current.contentMd,
      language: current.language,
    })
  }

  const note = await updateNoteRecord(userId, id, {
    type: input.type,
    title: input.title,
    contentMd: input.contentMd,
    language: input.language,
  })

  if (!note) {
    throw noteNotFound()
  }

  publishNoteUpdated(userId, { noteId: note.id, action: 'updated' })

  // Body/title changed, so the extracted links and suggestions must be rebuilt.
  await enqueueProcessNote({ userId, noteId: note.id })

  return note
}

export async function deleteNote(userId: string, id: string): Promise<void> {
  const deleted = await deleteNoteRecord(userId, id)

  if (!deleted) {
    throw noteNotFound()
  }

  publishNoteUpdated(userId, { noteId: id, action: 'deleted' })
}

/**
 * Incoming explicit links to a note (see `findBacklinks`). The note must exist
 * and be owned by the caller.
 */
export async function getBacklinks(userId: string, id: string): Promise<Note[]> {
  await getNote(userId, id)

  return findBacklinks(userId, id)
}

/**
 * Version history of a note, newest first. The note is loaded first so a
 * missing or unowned note is a 404, never an empty list.
 */
export async function listNoteVersions(
  userId: string,
  noteId: string,
  limit: number,
): Promise<NoteVersion[]> {
  await getNote(userId, noteId)

  return listNoteVersionRows(userId, noteId, limit)
}

/**
 * Rolls a note back to a stored version. The version is applied through
 * `updateNote`, so a restore behaves like any other edit: it snapshots the
 * state being replaced, emits `note.updated` and enqueues the link pipeline.
 */
export async function restoreNoteVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<Note> {
  await getNote(userId, noteId)

  const version = await findNoteVersionById(userId, noteId, versionId)

  if (!version) {
    throw new HttpError(404, 'NOT_FOUND', 'Note version not found')
  }

  return updateNote(userId, noteId, {
    title: version.title,
    contentMd: version.contentMd,
    language: version.language,
  })
}
