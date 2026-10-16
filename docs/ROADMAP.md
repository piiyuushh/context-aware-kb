# Roadmap

Update status as work completes.

## Phase 0: Setup
- [x] Monorepo with npm workspaces
- [x] ESLint, Prettier, tsconfig base
- [x] Docker compose for Postgres
- [x] .env.example
- [x] CI: lint, typecheck, test

## Phase 1: Core notes
- [x] DB schema and migrations
- [x] GitHub OAuth login
- [x] Notes CRUD API
- [x] Web shell: login page, notes list and tags sidebar
- [x] Markdown editor and preview
- [x] Tags

## Phase 2: Search
- [x] tsvector index (generated `notes.search` column + GIN index, shipped with the notes table)
- [x] Search API and UI (GET /search: ranked hits, highlighted snippets, type/tag filters)
- [x] Command palette (Cmd+K)

## Phase 3: Graph
- [x] Markdown link extraction
- [x] note_links table and processing job
- [x] Graph API
- [x] Graph UI with filters
- [x] Suggested links by tags and text similarity

## Phase 4: GitHub sync
- [ ] Gist import
- [ ] Repo markdown import
- [ ] Background jobs with progress
- [ ] Webhook re-sync

## Phase 5: Realtime and polish
- [ ] SSE events
- [ ] Version history
- [ ] Export
- [ ] Performance pass
- [ ] Deploy (web on Vercel, api and db on Railway or Fly)
