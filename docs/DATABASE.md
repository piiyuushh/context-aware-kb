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
- user_id uuid fk users
- access_token_enc bytea
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

## Graph queries

Neighbors within N hops via recursive CTE on note_links. Filter by type, tag, score threshold.

## Migrations

Tool: drizzle-kit or node-pg-migrate. One migration per change. Never edit applied migrations.

Migrations land in Phase 1; `npm run db:migrate` is a placeholder until the tool is wired up.

## Local development

Postgres 16 comes from `docker-compose.yml`:

```
docker compose up -d
```

Connection string (also in .env.example): `postgresql://kb:kb@localhost:5432/kb`.
