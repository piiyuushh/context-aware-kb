# Architecture

## Overview

```
Browser (Next.js)
   | REST + SSE
Express API (Node, TS)
   |-- Postgres (notes, links, users, search index)
   |-- GitHub API (Octokit)
   |-- Job queue (pg-boss on Postgres) for sync and link processing
```

## Frontend (apps/web)

- Next.js App Router, TypeScript, Tailwind.
- Editor: CodeMirror 6 (markdown mode) with a sanitized live preview.
- Graph: react-force-graph or d3-force with canvas rendering.
- Data fetching: TanStack Query. API client typed from packages/shared.
- Same-origin API access: `next.config.ts` rewrites `/api/v1/*` to the API
  (`NEXT_PUBLIC_API_URL`). The API sends no CORS headers and uses cookie auth, so
  the browser must stay on the web origin.
- Real-time: SSE subscription for note and sync events.

## Backend (apps/api)

Layers:

- routes: HTTP wiring only
- controllers: parse input, call services
- services: business logic
- repositories: SQL

Modules:

- auth: GitHub OAuth, sessions (JWT in httpOnly cookie)
- notes: CRUD, versions
- markdown: parse, extract headings, links, code blocks (unified/remark)
- search: tsvector queries, ranking
- links: extract explicit links, compute suggested links
- graph: return nodes and edges for a user, with filters
- github: OAuth token storage, gist and repo import, webhooks
- events: in-process, per-user pub/sub that backs `GET /events`
- jobs: pg-boss workers

## Link processing pipeline

1. Note saved.
2. Job enqueued: process-note.
3. Parse markdown. Extract `[[wiki links]]`, tags, headings.
4. Upsert explicit edges (type = `explicit`).
5. Compute suggested edges (type = `suggested`) from shared tags and text similarity. Store score.
6. Emit SSE event so the graph updates.

## Realtime

Services publish to a per-user, in-process bus after a write lands (notes
created/edited/deleted, a note's edges rebuilt, an import advancing). `GET
/events` subscribes for the session user and streams those as SSE frames
(`note.updated`, `graph.updated`, `sync.progress`); the web app folds each one
into the TanStack Query cache, so open tabs converge without polling.

The bus is in-process: a subscriber on another API instance would not see an
event published here. That is fine while the API runs as one instance; scaling
it horizontally needs a cross-process bus (Postgres `LISTEN`/`NOTIFY`, or Redis)
rather than a different shape of the module.

## Version history and export

`notes.service.updateNote` snapshots a note's previous `title`/`content_md`/
`language` into `note_versions` before overwriting them, so `GET
/notes/:id/versions` is the list of states the note was changed away from and a
restore is just another versioned edit. `GET /notes/:id/export` serializes a
note as a standalone markdown file (YAML frontmatter plus the body).

## Why Express and not Go (v1)

Same language across stack, shared types, faster to ship. Revisit Go for the indexing worker only if profiling shows a need.

## Why no graph DB

Edge table in Postgres with recursive CTEs handles personal-scale graphs. One datastore, simpler ops.

## Security

- Encrypt GitHub tokens (AES-256-GCM, key from env).
- CSRF protection on cookie auth.
- Rate limit API.
- Sanitize rendered markdown (rehype-sanitize).

## Local development

- `npm install` once at the root (npm workspaces).
- `npm run dev` starts web on http://localhost:3000 and api on http://localhost:4000.
- Postgres 16: `docker compose up -d` (see docs/DATABASE.md).
- `npm run lint`, `npm run typecheck`, `npm run test` run across every workspace; CI runs the same three plus a Prettier check.
