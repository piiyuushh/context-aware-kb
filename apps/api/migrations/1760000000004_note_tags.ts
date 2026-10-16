import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'note_tags',
    {
      note_id: { type: 'uuid', notNull: true, references: 'notes', onDelete: 'CASCADE' },
      tag_id: { type: 'uuid', notNull: true, references: 'tags', onDelete: 'CASCADE' },
    },
    { constraints: { primaryKey: ['note_id', 'tag_id'] } },
  )

  // Reverse lookups ("which notes carry this tag") need their own index; the
  // composite primary key already covers lookups by note_id.
  pgm.createIndex('note_tags', 'tag_id')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('note_tags')
}
