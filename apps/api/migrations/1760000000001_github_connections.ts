import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('github_connections', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    // One GitHub account per user: the OAuth connection is 1:1 with `users`.
    user_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    // AES-256-GCM payload: iv || auth tag || ciphertext. Plaintext never stored.
    access_token_enc: { type: 'bytea', notNull: true },
    scopes: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('github_connections')
}
