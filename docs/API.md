# API (REST, /api/v1)

Auth via httpOnly cookie. JSON in, JSON out. Errors: `{ "error": { "code": string, "message": string } }`.

Every path below is relative to the `/api/v1` prefix (`API_PREFIX` in packages/shared). Only `GET /health` is implemented today; the rest is the Phase 1+ contract.

## Health
- GET /health                   liveness. 200 `{ status: "ok", service: "api", version, uptime, timestamp }`, validated by `healthResponseSchema` in packages/shared. Takes no auth.

## Error codes

| code | status | meaning |
| --- | --- | --- |
| `NOT_FOUND` | 404 | no route or resource |
| `BAD_REQUEST` | 400 | malformed body or params |
| `INTERNAL_ERROR` | 500 | unhandled failure (details logged, never returned) |

Validation failures use `VALIDATION_ERROR` and auth failures use `UNAUTHORIZED` / `FORBIDDEN` from Phase 1 on.

## Auth
- GET  /auth/github          start OAuth
- GET  /auth/github/callback finish OAuth
- POST /auth/logout
- GET  /me

## Notes
- GET    /notes              query: q, type, tag, limit, cursor
- POST   /notes
- GET    /notes/:id
- PATCH  /notes/:id
- DELETE /notes/:id
- GET    /notes/:id/backlinks

## Tags
- GET /tags
- POST /notes/:id/tags
- DELETE /notes/:id/tags/:tagId

## Search
- GET /search?q=...&type=&tag=   ranked results with snippets

## Graph
- GET /graph                     query: tag, type, minScore, limit. Returns { nodes, edges }
- GET /graph/:noteId/neighbors   query: depth (1-3)

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
