# Context-Aware Developer Knowledge Base

Personal knowledge base for developers. Ingests docs, snippets, notes. Auto-links them. Shows a graph. Syncs with GitHub gists and repos.

## Repo layout (monorepo, npm workspaces)

```
apps/web         Next.js + React + Tailwind frontend
apps/api         Node.js (Express) + TypeScript backend
packages/shared  Shared TS types and zod schemas
docs/            Specs. Read before coding.
.opencode/       Agents and commands
```

## Read first

- docs/PROJECT.md: goals, features, scope
- docs/ARCHITECTURE.md: system design, data flow
- docs/DATABASE.md: schema and graph model
- docs/API.md: endpoints and contracts
- docs/ROADMAP.md: phases and current status

## Stack

- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- DB: PostgreSQL (relational data, FTS, note links as edge table)
- API: REST first. GitHub API via Octokit.
- Validation: zod, shared in packages/shared
- Tests: Vitest (unit), Playwright (e2e web), Supertest (api)

## Commands

```
npm install              install all workspaces
npm run dev              run web and api together
npm run dev -w apps/web  web only
npm run dev -w apps/api  api only
npm run lint             eslint all
npm run typecheck        tsc all
npm run test             vitest all
npm run db:migrate       run migrations
```

## Rules

- TypeScript strict. No `any` unless commented why.
- Shared types live in packages/shared. Never duplicate across apps.
- Validate all API input with zod.
- No secrets in code. Use .env. Keep .env.example current.
- GitHub tokens are encrypted at rest.
- SQL via a query builder or parameterized queries only. No string concat.
- Small commits. Conventional commit messages.
- Update the relevant doc in docs/ when behavior changes.
- Run lint, typecheck, test before saying a task is done.

## Code style

- Functional React components. Hooks. No class components.
- Server components by default in Next.js. Client components only when needed.
- Tailwind utility classes. No inline style objects.
- Express: routes -> controllers -> services -> repositories. No DB calls in routes.
- Name files kebab-case. Components PascalCase.

## Do not

- Do not add a graph database. Edges live in Postgres.
- Do not add dependencies without a reason.
- Do not rewrite unrelated files.
- Do not commit generated files or .env.

## Agents

- @frontend: web app work
- @backend: api, db, GitHub sync
- @reviewer: read-only code review

## Commands (opencode)

- /plan: break a feature into tasks
- /feature: implement a feature end to end
- /migrate: create a DB migration
- /review: review current changes
