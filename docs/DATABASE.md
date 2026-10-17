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

Index: GIN on search. Index on (user_id, updated_at DESC, id DESC) — the
ordering every note page, search tie-break and graph node query uses, so those
reads are index-ordered instead of sorted (it keeps `user_id` leading, so
per-user lookups are covered too). Unique index on (user_id, source, source_ref)
— the identity of a synced note, so a re-import upserts instead of duplicating.
Local notes have a null `source_ref` and SQL treats nulls as distinct, so they
are never constrained by it.

### note_versions
- id uuid pk
- note_id uuid fk notes (cascade)
- user_id uuid fk users (cascade)
- title text
- content_md text
- language text null
- created_at timestamptz

Index on (note_id, created_at desc).

Written by the API, never by GitHub sync: before `PATCH /notes/:id` (and a
restore, which goes through the same update path) overwrites a note, the note's
current `title`/`content_md`/`language` are snapshotted here. A version is
therefore a state the note was changed *away from*, and the newest row is the
state the current body replaced. A patch that changes none of those three fields
(a repeat of the current values, or a `type`-only change) writes no row.
Imported notes are upserted by the sync worker and so have no history.

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

Rows are only ever written by the `process-note` job (never by a client):
`explicit` edges come from `[[wiki links]]`, `suggested` edges from shared-tag
and text similarity and carry a `score` in `[0, 1]`. Backlinks read `explicit`
only; the graph API reads both.

### sync_jobs
- id uuid pk
- user_id uuid fk
- kind text ('gist_import','repo_import','repo_sync')
- status text ('queued','running','done','failed')
- stats jsonb
- error text null
- created_at, finished_at timestamptz

Index on (user_id, created_at).

`stats` holds the progress counters (`total`, `processed`, `imported`,
`updated`, `skipped`, `failed`); it defaults to `{}` and the API fills missing
counters with zero. The worker checkpoints it while an import runs and writes the
final value with `finished_at` when it becomes `done` or `failed`.

### github_repo_imports
- id uuid pk
- user_id uuid fk users
- repo_full_name text
- branch text
- last_synced_sha text null
- created_at, updated_at timestamptz
- unique (user_id, repo_full_name)

Records which repositories a user imports and the branch they follow. A push
webhook reads it back by `repo_full_name` (indexed) to find everyone who should
re-sync; `last_synced_sha` is the head commit at the end of the last import
(recorded for display/auditing; nothing reads it to short-circuit a sync yet).

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

`GET /search` ranks and limits in a CTE first, then joins the selected notes back
to build `rank` and `ts_headline` snippets, so the expensive snippet pass runs
for the page that is returned rather than for every match.

## Graph queries

Neighbors within N hops via recursive CTE on note_links, followed in both
directions. The recursive step is two `union` branches — outgoing edges related
by `source_note_id`, incoming edges by `target_note_id` — inside a lateral
subquery, instead of an `or` over both columns, so each branch can use its own
index. (They live in the lateral because Postgres permits exactly one
self-reference in a recursive term.) Filter by type, tag, score threshold.

## Job queue

[pg-boss](https://github.com/timgit/pg-boss) runs the background jobs on the
same Postgres. It owns a `pgboss` schema that it creates and migrates itself on
startup, so the queue is **not** managed by node-pg-migrate — there is no
project migration for it, and its tables are not part of the schema above. The
`process-note` job rebuilds a note's edges (see the link pipeline in
docs/ARCHITECTURE.md) and the `github-sync` job runs an import or re-sync (see
docs/API.md "GitHub").

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
