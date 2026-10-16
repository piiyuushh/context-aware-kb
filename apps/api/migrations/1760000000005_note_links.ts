import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'note_links',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
      source_note_id: { type: 'uuid', notNull: true, references: 'notes', onDelete: 'CASCADE' },
      target_note_id: { type: 'uuid', notNull: true, references: 'notes', onDelete: 'CASCADE' },
      type: { type: 'text', notNull: true, check: "type in ('explicit', 'suggested')" },
      score: { type: 'real' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { constraints: { unique: [['source_note_id', 'target_note_id', 'type']] } },
  )

  pgm.createIndex('note_links', 'source_note_id')
  pgm.createIndex('note_links', 'target_note_id')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('note_links')
}
