import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('sync_jobs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    kind: {
      type: 'text',
      notNull: true,
      check: "kind in ('gist_import', 'repo_import', 'repo_sync')",
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'queued',
      check: "status in ('queued', 'running', 'done', 'failed')",
    },
    stats: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
  })

  pgm.createIndex('sync_jobs', ['user_id', 'created_at'])
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('sync_jobs')
}
