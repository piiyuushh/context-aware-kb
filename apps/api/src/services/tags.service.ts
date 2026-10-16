import {
  attachTagToNote,
  detachTagFromNote,
  listTags as listTagRows,
  upsertTag,
} from '../repositories/tags.repository'
import { getNote } from './notes.service'
import type { Tag } from '../repositories/tags.repository'

/** All tags for a user, alphabetically. */
export async function listTags(userId: string): Promise<Tag[]> {
  return listTagRows(userId)
}

/**
 * Attaches a tag to a note, creating the tag on first use. The note is loaded
 * first so a missing or unowned note is a 404 rather than a stray tag.
 */
export async function addTagToNote(userId: string, noteId: string, name: string): Promise<Tag> {
  await getNote(userId, noteId)

  const tag = await upsertTag(userId, name)
  await attachTagToNote(noteId, tag.id)

  return tag
}

/** Detaches a tag from a note. Idempotent: a missing link is still a success. */
export async function removeTagFromNote(
  userId: string,
  noteId: string,
  tagId: string,
): Promise<void> {
  await getNote(userId, noteId)
  await detachTagFromNote(noteId, tagId)
}
