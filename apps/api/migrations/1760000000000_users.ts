import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    github_id: { type: 'bigint', notNull: true, unique: true },
    username: { type: 'text', notNull: true },
    email: { type: 'text' },
    avatar_url: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('users')
}
