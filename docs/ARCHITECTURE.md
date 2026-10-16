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
- jobs: pg-boss workers

## Link processing pipeline

1. Note saved.
2. Job enqueued: process-note.
3. Parse markdown. Extract `[[wiki links]]`, tags, headings.
4. Upsert explicit edges (type = `explicit`).
5. Compute suggested edges (type = `suggested`) from shared tags and text similarity. Store score.
6. Emit SSE event so the graph updates.

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
