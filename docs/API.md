# API (REST, /api/v1)

Auth via httpOnly cookie. JSON in, JSON out. Errors: `{ "error": { "code": string, "message": string } }`.

Every path below is relative to the `/api/v1` prefix (`API_PREFIX` in packages/shared). Implemented today: `GET /health`, the auth routes, `GET /me`, notes CRUD and backlinks, the tags routes, `GET /search`, and the graph routes (`GET /graph`, `GET /graph/:noteId/neighbors`). The rest is the Phase 1+ contract.

Request/response bodies are described by the zod schemas in packages/shared (`noteSchema`, `tagSchema`, `graphResponseSchema`, and their input/output wrappers); controllers parse against them, so a drift fails loudly rather than silently.

## Health
- GET /health                   liveness. 200 `{ status: "ok", service: "api", version, uptime, timestamp }`, validated by `healthResponseSchema` in packages/shared. Takes no auth.

## Error codes

| code | status | meaning |
| --- | --- | --- |
| `NOT_FOUND` | 404 | no route or resource |
| `BAD_REQUEST` | 400 | malformed body or params (e.g. an undecodable cursor) |
| `VALIDATION_ERROR` | 400 | request failed a shared zod schema |
| `UNAUTHORIZED` | 401 | missing/invalid session, or GitHub rejected the login |
| `FORBIDDEN` | 403 | OAuth state mismatch |
| `INTERNAL_ERROR` | 500 | unhandled failure (details logged, never returned) |

## Auth

Session state lives in an httpOnly cookie (`kb_session`), a signed HS256 token
(`sub` = user id). Cookie is `SameSite=Lax`, `Secure` in production, 30-day TTL.
Tokens are validated against `meResponseSchema` / `userSchema` in packages/shared.

The browser reaches these routes through the web app's same-origin `/api/v1`
proxy (`apps/web/next.config.ts`), not by calling the API origin directly: the API
sends no CORS headers and cookie auth needs a single origin. The GitHub OAuth
callback therefore targets the web origin
(`http://localhost:3000/api/v1/auth/github/callback`), so the state cookie is
same-site on the way back.

- GET  /auth/github          302 to GitHub. Sets a short-lived `kb_oauth_state` cookie.
- GET  /auth/github/callback finish OAuth. Checks `state`, upserts the user and an
                             AES-256-GCM-encrypted GitHub connection, sets
                             `kb_session`, then 302 to `WEB_APP_URL`. 403 on state
                             mismatch, 400 on missing code.
- POST /auth/logout          204. Clears `kb_session`.
- GET  /me                   requires `kb_session`. 200
                             `{ user: { id, username, email, avatarUrl, createdAt } }`,
                             validated by `meResponseSchema`. 401 without one.

## Notes

Auth required on every route. Notes are scoped to the session user, and another
user's note reads as a 404 (never 403). A `Note` is
`{ id, type, title, contentMd, language, source, sourceRef, sourceSha, tags, createdAt, updatedAt }`
where `type` is `doc | snippet | note`, `source` is `local | gist | repo`, and
`tags` is an always-present `Tag[]`.

- GET    /notes              query: q, type, tag, limit, cursor. 200
                             `{ notes: Note[], nextCursor: string | null }`,
                             newest first. `limit` defaults to 20, max 100.
                             `cursor` is opaque: pass the previous response's
                             `nextCursor`, which is null on the last page. `q`
                             full-text searches title + content, `type` filters
                             by kind, `tag` matches one exact tag name. A
                             malformed `cursor` is 400 BAD_REQUEST.
- POST   /notes              body: { type, title, contentMd?, language? }.
                             `contentMd` defaults to `""`. 201 `{ note }`.
- GET    /notes/:id          200 `{ note }`. 404 if missing.
- PATCH  /notes/:id          body: any of { type, title, contentMd, language },
                             at least one. 200 `{ note }`.
- DELETE /notes/:id          204, no body.
- GET    /notes/:id/backlinks 200 `{ backlinks: Note[] }` — notes that link to
                             this one through an explicit `[[wiki link]]` edge,
                             newest first. Computed (`suggested`) edges are
                             excluded: a backlink is a link the author wrote.

## Tags

A `Tag` is `{ id, name }`, unique per user by name. Tags are implicit: attaching
a new name creates the tag.

- GET    /tags                 200 `{ tags: Tag[] }`, alphabetical.
- POST   /notes/:id/tags       body: { name }. Creates the tag on first use and
                              links it. 201 `{ tag }`.
- DELETE /notes/:id/tags/:tagId  204, no body. Idempotent (a missing link is
                              still a success).

## Search

Auth required. Ranked full-text search over the caller's notes, using the same
index as `GET /notes?q=` but weighted and snipped. Where `q` is an optional
filter on `/notes`, here it is required: the endpoint exists to rank a term.

- GET    /search             query: q (required), type, tag, limit. 200
                             `{ results: { note: Note, rank: number, snippet: string }[] }`,
                             validated by `searchResponseSchema`. Results are
                             ordered by `ts_rank_cd` relevance (highest first),
                             then by recency. `snippet` is the note's body text
                             (its title when the body is empty) with `<mark>`
                             around the matched terms, capped at two fragments of
                             roughly 10-30 words. `type` filters by kind, `tag`
                             matches one exact tag name, and `limit` defaults to
                             20, max 50. A missing or blank `q` is 400
                             VALIDATION_ERROR.

## Graph

Auth required. Edges live in `note_links` and are rebuilt in the background
when a note is saved (see the link pipeline in docs/ARCHITECTURE.md). A `GraphNode`
is `{ id, type, title, tags }`; a `GraphEdge` is
`{ id, source, target, type, score }` where `type` is `explicit` (from a wiki
link, `score` null) or `suggested` (computed, `score` in `[0, 1]`). Responses
are validated by `graphResponseSchema` in packages/shared.

Both routes return `{ nodes, edges }` and only include edges whose source and
target are both in `nodes`, so the result is always a self-contained subgraph.

- GET /graph                     query: tag, type, minScore, limit. 200
                                 `{ nodes, edges }`. `nodes` is the caller's
                                 notes, newest first, capped at `limit`
                                 (default 200, max 2000). `tag` matches one
                                 exact tag name, `type` filters by kind.
                                 `minScore` (0-1) drops `suggested` edges below
                                 the threshold; `explicit` edges are always kept.
- GET /graph/:noteId/neighbors   query: depth (1-3, default 1). 200
                                 `{ nodes, edges }` for the subgraph within
                                 `depth` hops of the note, followed in both
                                 directions. 404 if the note is missing or not
                                 the caller's.

## GitHub
- GET  /github/gists             list user gists
- GET  /github/repos             list user repos
- POST /github/import            body: { kind, ref }. Returns job id
- GET  /github/jobs/:id
- POST /github/webhook           repo push events (signature verified)

## Realtime
- GET /events                    SSE stream: note.updated, graph.updated, sync.progress

## GraphQL

Not in v1. Add later only if the frontend needs flexible graph queries.
