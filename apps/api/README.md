# @kb/api

Express 5 + TypeScript (ESM) API for the knowledge base. Phase 1 ships the
database schema and migrations, GitHub OAuth login with an httpOnly cookie
session, `GET /api/v1/me`, and the existing `GET /api/v1/health`. Notes CRUD,
search, graph and GitHub sync arrive in later phases (see docs/ROADMAP.md).

## Scripts

Run from the repo root with `-w apps/api`, or from this folder directly.

```bash
npm run dev              -w apps/api   # tsx watch src/server.ts
npm run start            -w apps/api   # tsx src/server.ts (no watch)
npm run lint             -w apps/api   # eslint .
npm run typecheck        -w apps/api   # tsc --noEmit
npm run test             -w apps/api   # vitest run
npm run db:migrate       -w apps/api   # node-pg-migrate up
npm run db:migrate:down  -w apps/api   # roll back the last migration
npm run db:migrate:create -w apps/api  # scaffold a migration
```

`db:migrate*` read the repo-root `.env` (`--envPath ../../.env`), so run them
from this workspace, not from a nested folder. From the repo root,
`npm run db:migrate` delegates here.

Prettier runs from the repo root: `npx prettier --write apps/api`.

## Environment

| Variable                      | Default                 | Used for                        |
| ----------------------------- | ----------------------- | ------------------------------- |
| `PORT`                        | `4000`                  | HTTP listen port                |
| `NODE_ENV`                    | `development`           | `Secure` cookies in production  |
| `DATABASE_URL`                | —                       | Postgres connection             |
| `SESSION_SECRET`              | —                       | Signs the session token         |
| `GITHUB_CLIENT_ID`            | —                       | OAuth app                       |
| `GITHUB_CLIENT_SECRET`        | —                       | OAuth app                       |
| `GITHUB_OAUTH_CALLBACK_URL`   | —                       | OAuth redirect URI              |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | —                       | 32-byte hex key for AES-256-GCM |
| `WEB_APP_URL`                 | `http://localhost:3000` | Post-login redirect target      |

Keep `.env.example` at the repo root current when adding variables. Config is
read lazily and validated on first use (`src/config.ts`); missing variables
throw with the variable name. Nothing is logged from the config.

## Layout

```
src/
  server.ts        bootstrap: env, listen, SIGINT/SIGTERM shutdown
  app.ts           createApp(): json + cookie parsing, router mount, 404, error handler
  config.ts        env parsing/validation (getConfig, loadConfig)
  constants.ts     SERVICE_NAME, SERVICE_VERSION, defaults
  errors.ts        HttpError + error envelope helper
  db/pool.ts       lazily-created pg Pool
  lib/             crypto (AES-256-GCM), session tokens, cookie options
  routes/          HTTP wiring only
  controllers/     parse/validate input, call services, send response
  services/        business logic (auth, github, users, health)
  repositories/    SQL (users, github_connections)
  middleware/      requireAuth, notFoundHandler, errorHandler
migrations/        node-pg-migrate TypeScript migrations
tests/             Vitest + Supertest tests against createApp()
```

Requests flow `routes -> controllers -> services -> repositories`. Only
repositories may talk to Postgres.

## Database

Schema and migrations are described in docs/DATABASE.md. Migrations are
TypeScript files under `migrations/`, one per table. Never edit an applied
migration; add a new one.

## Auth

`GET /auth/github` redirects to GitHub with a random `state` also stored in a
short-lived `kb_oauth_state` cookie. The callback verifies that state, exchanges
the code, upserts the user, stores the access token encrypted with AES-256-GCM
(`lib/crypto.ts`), and sets the `kb_session` cookie. `/me` reads that cookie.

GitHub access tokens are never stored or logged in plaintext; the key comes from
`GITHUB_TOKEN_ENCRYPTION_KEY`.

## Contract

- All routes are mounted under `API_PREFIX` (`/api/v1`) from `@kb/shared`.
- Success and error bodies are validated against the zod schemas in
  `@kb/shared` (`healthResponseSchema`, `errorResponseSchema`,
  `meResponseSchema`).
- Every error, including 404s, returns
  `{ "error": { "code": "STRING_CODE", "message": "..." } }`. 5xx responses log
  the cause server-side and return a generic message: no stack traces go out.
- Error codes used so far: `NOT_FOUND`, `BAD_REQUEST`, `UNAUTHORIZED`,
  `FORBIDDEN`, `INTERNAL_ERROR`.

## Tests

Supertest drives the app in-process via `createApp()`, so no port is bound.
Repositories and the GitHub client are mocked, so the suite needs neither a
database nor a real GitHub app:

```bash
npm run test -w apps/api
```
