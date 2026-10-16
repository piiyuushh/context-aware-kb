import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Makes `(user_id, source, source_ref)` the identity of a synced note, so a
 * re-import can upsert instead of duplicating. Local notes have a null
 * `source_ref`, and SQL treats nulls as distinct, so their rows never collide —
 * only GitHub-sourced notes are constrained.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('notes', ['user_id', 'source', 'source_ref'], { unique: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('notes', ['user_id', 'source', 'source_ref'])
}
