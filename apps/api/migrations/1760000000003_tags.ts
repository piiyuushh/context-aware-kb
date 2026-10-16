import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'tags',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
      name: { type: 'text', notNull: true },
    },
    { constraints: { unique: [['user_id', 'name']] } },
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('tags')
}
