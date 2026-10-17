import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/** Explicit name so `down` can drop the index without deriving one. */
const ORDERING_INDEX = 'notes_user_id_updated_at_id_idx'

/**
 * Replaces the `notes (user_id, updated_at)` index with
 * `notes (user_id, updated_at DESC, id DESC)`, the ordering every note page,
 * search tie-break and graph node query uses. Matching the `order by` means
 * those reads can walk the index instead of sorting, and the descending
 * direction keeps keyset paging (`updatedAt desc, id desc`) index-ordered.
 *
 * `user_id` stays the leading column, so plain per-user lookups (which the old
 * index served) still have one.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('notes', ['user_id', 'updated_at'])

  pgm.createIndex(
    'notes',
    [{ name: 'user_id' }, { name: 'updated_at', sort: 'DESC' }, { name: 'id', sort: 'DESC' }],
    { name: ORDERING_INDEX },
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('notes', [], { name: ORDERING_INDEX })

  pgm.createIndex('notes', ['user_id', 'updated_at'])
}
