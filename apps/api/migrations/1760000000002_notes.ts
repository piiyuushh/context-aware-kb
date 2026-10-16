import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('notes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    type: { type: 'text', notNull: true, check: "type in ('doc', 'snippet', 'note')" },
    title: { type: 'text', notNull: true },
    content_md: { type: 'text', notNull: true, default: '' },
    language: { type: 'text' },
    source: {
      type: 'text',
      notNull: true,
      default: 'local',
      check: "source in ('local', 'gist', 'repo')",
    },
    source_ref: { type: 'text' },
    source_sha: { type: 'text' },
    search: {
      type: 'tsvector',
      expressionGenerated:
        "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_md, ''))",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })

  pgm.createIndex('notes', 'search', { method: 'gin' })
  pgm.createIndex('notes', ['user_id', 'updated_at'])
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('notes')
}
