# @kb/api

Express 5 + TypeScript (ESM) API for the knowledge base. Phase 0 ships the
bootstrap, the v1 router and `GET /api/v1/health`; the database, auth and GitHub
sync arrive in later phases (see docs/ROADMAP.md).

## Scripts

Run from the repo root with `-w apps/api`, or from this folder directly.

```bash
npm run dev       -w apps/api   # tsx watch src/server.ts
npm run start     -w apps/api   # tsx src/server.ts (no watch)
npm run lint      -w apps/api   # eslint .
npm run typecheck -w apps/api   # tsc --noEmit
npm run test      -w apps/api   # vitest run
```

From this folder (no workspace flag): `npm run dev`, `npm run test`, and so on.
Prettier runs from the repo root: `npx prettier --write apps/api`.

## Environment

| Variable   | Default       | Used for          |
| ---------- | ------------- | ----------------- |
| `PORT`     | `4000`        | HTTP listen port  |
| `NODE_ENV` | `development` | Logged at startup |

Keep `.env.example` at the repo root current when adding variables. Nothing in
Phase 0 reads a secret.

## Layout

```
src/
  server.ts        bootstrap: env, listen, SIGINT/SIGTERM shutdown
  app.ts           createApp(): middleware, router mount, 404, error handler
  constants.ts     SERVICE_NAME, SERVICE_VERSION, defaults
  errors.ts        HttpError + error envelope helper
  routes/          HTTP wiring only
  controllers/     parse/validate input, call services, send response
  services/        business logic
  repositories/    SQL (empty until Phase 1)
  middleware/      notFoundHandler, errorHandler
tests/             Supertest tests against createApp()
```

Requests flow `routes -> controllers -> services -> repositories`. Only
repositories may talk to Postgres.

## Contract

- All routes are mounted under `API_PREFIX` (`/api/v1`) from `@kb/shared`.
- Success and error bodies are validated against the zod schemas in
  `@kb/shared` (`healthResponseSchema`, `errorResponseSchema`).
- Every error, including 404s, returns
  `{ "error": { "code": "STRING_CODE", "message": "..." } }`. 5xx responses log
  the cause server-side and return a generic message: no stack traces go out.
- Error codes used so far: `NOT_FOUND`, `BAD_REQUEST`, `INTERNAL_ERROR`.

## Tests

Supertest drives the app in-process via `createApp()`, so no port is bound:

```bash
npm run test -w apps/api
```
