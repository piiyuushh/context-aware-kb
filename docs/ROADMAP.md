# Roadmap

Update status as work completes.

## Phase 0: Setup
- [x] Monorepo with npm workspaces
- [x] ESLint, Prettier, tsconfig base
- [x] Docker compose for Postgres
- [x] .env.example
- [x] CI: lint, typecheck, test

## Phase 1: Core notes
- [ ] DB schema and migrations
- [ ] GitHub OAuth login
- [ ] Notes CRUD API
- [ ] Markdown editor and preview
- [ ] Tags

## Phase 2: Search
- [ ] tsvector index
- [ ] Search API and UI
- [ ] Command palette (Cmd+K)

## Phase 3: Graph
- [ ] Markdown link extraction
- [ ] note_links table and processing job
- [ ] Graph API
- [ ] Graph UI with filters
- [ ] Suggested links by tags and text similarity

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
