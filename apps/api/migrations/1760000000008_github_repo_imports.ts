import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Remembers which repositories a user imports, so a push webhook can map a
 * repo back to its importers (and the branch they follow) and enqueue a
 * re-sync. One subscription per user per repo.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'github_repo_imports',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
      repo_full_name: { type: 'text', notNull: true },
      branch: { type: 'text', notNull: true },
      // Head commit sha at the end of the last successful import.
      last_synced_sha: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { constraints: { unique: [['user_id', 'repo_full_name']] } },
  )

  // Webhook lookup is by repo across all users, not by owner.
  pgm.createIndex('github_repo_imports', 'repo_full_name')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('github_repo_imports')
}
