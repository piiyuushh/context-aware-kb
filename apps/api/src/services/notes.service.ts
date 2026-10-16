import { HttpError } from '../errors'
import { decodeCursor, encodeCursor } from '../lib/cursor'
import {
  deleteNote as deleteNoteRecord,
  findBacklinks,
  findNoteById,
  insertNote,
  listNotes as listNoteRows,
  updateNote as updateNoteRecord,
} from '../repositories/notes.repository'
import type { Note } from '../repositories/notes.repository'
import type { CreateNoteInput, ListNotesQuery, UpdateNoteInput } from '@kb/shared'

const NOTE_NOT_FOUND = 'Note not found'

function noteNotFound(): HttpError {
  return new HttpError(404, 'NOT_FOUND', NOTE_NOT_FOUND)
}

export async function createNote(userId: string, input: CreateNoteInput): Promise<Note> {
  return insertNote({
    userId,
    type: input.type,
    title: input.title,
    contentMd: input.contentMd,
    language: input.language ?? null,
  })
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

export async function updateNote(
  userId: string,
  id: string,
  input: UpdateNoteInput,
): Promise<Note> {
  const note = await updateNoteRecord(userId, id, {
    type: input.type,
    title: input.title,
    contentMd: input.contentMd,
    language: input.language,
  })

  if (!note) {
    throw noteNotFound()
  }

  return note
}

export async function deleteNote(userId: string, id: string): Promise<void> {
  const deleted = await deleteNoteRecord(userId, id)

  if (!deleted) {
    throw noteNotFound()
  }
}

/** Incoming links to a note. The note must exist and be owned by the caller. */
export async function getBacklinks(userId: string, id: string): Promise<Note[]> {
  await getNote(userId, id)

  return findBacklinks(userId, id)
}
