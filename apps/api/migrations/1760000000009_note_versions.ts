import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Version history for notes (docs/DATABASE.md `note_versions`): one row per
 * prior state of a note, written by `notes.service.updateNote` before it
 * applies an edit. Both foreign keys cascade, so history never outlives its
 * note or its user.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('note_versions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    note_id: { type: 'uuid', notNull: true, references: 'notes', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    title: { type: 'text', notNull: true },
    content_md: { type: 'text', notNull: true, default: '' },
    language: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  // History is only ever read for one note, newest first.
  pgm.createIndex('note_versions', ['note_id', { name: 'created_at', sort: 'DESC' }])
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('note_versions')
}
