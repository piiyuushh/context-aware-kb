# Database (PostgreSQL)

## Tables

### users
- id uuid pk
- github_id bigint unique
- username text
- email text
- avatar_url text
- created_at timestamptz

### github_connections
- id uuid pk
- user_id uuid fk users (unique: one connection per user)
- access_token_enc bytea (AES-256-GCM: iv || auth tag || ciphertext)
- scopes text[]
- updated_at timestamptz

### notes
- id uuid pk
- user_id uuid fk users
- type text check in ('doc','snippet','note')
- title text
- content_md text
- language text null (for snippets)
- source text check in ('local','gist','repo')
- source_ref text null (gist id or repo/path)
- source_sha text null
- search tsvector (generated from title + content_md)
- created_at, updated_at timestamptz

Index: GIN on search. Index on (user_id, updated_at).

### tags
- id uuid pk
- user_id uuid fk
- name text
- unique (user_id, name)

### note_tags
- note_id uuid fk
- tag_id uuid fk
- pk (note_id, tag_id)
- index on tag_id (reverse lookup by tag)

### note_links (graph edges)
- id uuid pk
- user_id uuid fk
- source_note_id uuid fk notes
- target_note_id uuid fk notes
- type text check in ('explicit','suggested')
- score real null
- created_at timestamptz
- unique (source_note_id, target_note_id, type)

Index on source_note_id and target_note_id.

### sync_jobs
- id uuid pk
- user_id uuid fk
- kind text ('gist_import','repo_import','repo_sync')
- status text ('queued','running','done','failed')
- stats jsonb
- error text null
- created_at, finished_at timestamptz

Index on (user_id, created_at).

### Constraints and defaults

- Primary keys are `uuid default gen_random_uuid()` (built into Postgres 13+).
- `type`/`source`/`kind`/`status` use `check` constraints, not enums, so adding a
  value is a code change plus a migration, never an `ALTER TYPE`.
- `content_md` defaults to `''`; `source` defaults to `local`; `status` defaults
  to `queued`; `scopes`/`stats` default to empty.
- All `user_id` foreign keys cascade on delete.

## Full-text search

`notes.search` is a generated `tsvector` over `title || ' ' || content_md`
(english config) with a GIN index, added with the `notes` table. Both search
endpoints read it, so neither needs an extra index or migration:

- `GET /notes?q=` adds a `n.search @@ plainto_tsquery('english', …)` filter
  alongside the other list filters.
- `GET /search` reads the same column but ranks rows with `ts_rank_cd`
  (relevance, most relevant first) and builds each hit's snippet with
  `ts_headline`, wrapping matched terms in the `<mark>`/`</mark>` markers shared
  from packages/shared (passed as `ts_headline` options, not interpolated).

Both go through `plainto_tsquery` with the term as a bound parameter, so a search
string is parsed as words, never as tsquery syntax.

## Graph queries

Neighbors within N hops via recursive CTE on note_links. Filter by type, tag, score threshold.

## Migrations

Tool: [node-pg-migrate](https://github.com/salsita/node-pg-migrate). One migration
per change. Never edit an applied migration.

- Migrations live in `apps/api/migrations` as TypeScript files, one per table,
  prefixed with a sortable timestamp (`up` and `down` in each).
- `pgmigrations` records what has run.
- Run from the repo root; the root `.env` supplies `DATABASE_URL`.

```
npm run db:migrate         # apply all pending migrations
npm run db:migrate:down    # roll back the last one
npm run db:migrate:create  # scaffold migrations/<timestamp>_<name>.ts
```

## Local development

Postgres 16 comes from `docker-compose.yml`:

```
docker compose up -d
npm run db:migrate
```

Connection string (also in .env.example): `postgresql://kb:kb@localhost:5432/kb`.
