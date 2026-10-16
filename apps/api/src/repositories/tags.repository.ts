import { getPool } from '../db/pool'

/** A tag owned by a user (camelCase domain object). */
export interface Tag {
  id: string
  name: string
}

interface TagRow {
  id: string
  name: string
}

function mapTag(row: TagRow): Tag {
  return { id: row.id, name: row.name }
}

/** All tags for a user, alphabetically. */
export async function listTags(userId: string): Promise<Tag[]> {
  const { rows } = await getPool().query<TagRow>(
    `select id, name from tags where user_id = $1 order by name asc`,
    [userId],
  )

  return rows.map(mapTag)
}

/**
 * Finds a tag by name or creates it. Tags are implicit: attaching a note to a
 * new name is enough to mint the tag, and re-attaching an existing one is a
 * no-op thanks to the `(user_id, name)` unique constraint.
 */
export async function upsertTag(userId: string, name: string): Promise<Tag> {
  const { rows } = await getPool().query<TagRow>(
    `insert into tags (user_id, name)
     values ($1, $2)
     on conflict (user_id, name) do update set name = excluded.name
     returning id, name`,
    [userId, name],
  )

  const row = rows[0]
  if (!row) {
    throw new Error('upsertTag did not return a row')
  }

  return mapTag(row)
}

/** Links a tag to a note. Re-linking is a no-op (composite primary key). */
export async function attachTagToNote(noteId: string, tagId: string): Promise<void> {
  await getPool().query(
    `insert into note_tags (note_id, tag_id)
     values ($1, $2)
     on conflict do nothing`,
    [noteId, tagId],
  )
}

/** Removes a link. Returns whether a row was actually deleted. */
export async function detachTagFromNote(noteId: string, tagId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `delete from note_tags where note_id = $1 and tag_id = $2`,
    [noteId, tagId],
  )

  return (rowCount ?? 0) > 0
}
