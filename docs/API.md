# API (REST, /api/v1)

Auth via httpOnly cookie. JSON in, JSON out. Errors: `{ "error": { "code": string, "message": string } }`.

Every path below is relative to the `/api/v1` prefix (`API_PREFIX` in packages/shared). Implemented today: `GET /health`, the auth routes, `GET /me`, notes CRUD, backlinks, versions and export, the tags routes, `GET /search`, the graph routes (`GET /graph`, `GET /graph/:noteId/neighbors`), the GitHub sync routes (`GET /github/gists`, `GET /github/repos`, `POST /github/import`, `GET /github/jobs/:id`, `POST /github/webhook`), and the SSE stream (`GET /events`). The rest is the Phase 1+ contract.

Request/response bodies are described by the zod schemas in packages/shared (`noteSchema`, `tagSchema`, `graphResponseSchema`, and their input/output wrappers); controllers parse against them, so a drift fails loudly rather than silently.

## Health
- GET /health                   liveness. 200 `{ status: "ok", service: "api", version, uptime, timestamp }`, validated by `healthResponseSchema` in packages/shared. Takes no auth.

## Error codes

| code | status | meaning |
| --- | --- | --- |
| `NOT_FOUND` | 404 | no route or resource |
| `BAD_REQUEST` | 400 | malformed body or params (e.g. an undecodable cursor) |
| `VALIDATION_ERROR` | 400 | request failed a shared zod schema |
| `UNAUTHORIZED` | 401 | missing/invalid session, an invalid webhook signature, or GitHub rejected a request (login or revoked token) |
| `FORBIDDEN` | 403 | OAuth state mismatch, or GitHub denied an API request (rate limit or missing scope) |
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
                             at least one. 200 `{ note }`. The note's previous
                             title/contentMd/language are snapshotted into its
                             version history first, but only when one of them
                             actually changes (a no-op repeat, or a `type`-only
                             change, writes no version).
- DELETE /notes/:id          204, no body.
- GET    /notes/:id/backlinks 200 `{ backlinks: Note[] }` — notes that link to
                             this one through an explicit `[[wiki link]]` edge,
                             newest first. Computed (`suggested`) edges are
                             excluded: a backlink is a link the author wrote.
- GET    /notes/:id/versions  query: limit (1-100, default 50). 200
                             `{ versions: NoteVersion[] }`, newest first,
                             validated by `noteVersionListResponseSchema`. A
                             `NoteVersion` is `{ id, title, contentMd, language,
                             createdAt }`: a state this note was changed away
                             from (see docs/DATABASE.md `note_versions`).
- POST   /notes/:id/versions/:versionId/restore
                             200 `{ note }` — the restored note. Applies the
                             version through the normal update path, so the
                             restore is itself versioned, emits `note.updated`
                             and rebuilds the note's links. 404 if the version
                             (or the note) is missing or not the caller's.
- GET    /notes/:id/export   200 `text/markdown; charset=utf-8`, served as a
                             `Content-Disposition: attachment` download named
                             from the note's slugged title (`noteExportFilename`,
                             falling back to the note id). The body is YAML
                             frontmatter (title, type, tags, created, updated,
                             source) followed by a blank line and the note's
                             markdown body. Not JSON, so no shared response
                             schema. 404 if the note is missing.

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

Sync is one-way (GitHub -> notes) in this phase. The user's OAuth token is
decrypted from `github_connections` and used with Octokit; it never leaves the
API. Reading private repositories needs the `repo` scope and listing secret
gists needs `gist`, so the OAuth request asks for `read:user`, `user:email`,
`repo` and `gist`. A connection stored before those scopes were added works for
public repos only until the user logs in again.

Every route except the webhook requires a session. Gists/repos are read live
from GitHub; an import runs in the background and is polled by id. Responses are
validated by the schemas in `packages/shared` (`githubGistListResponseSchema`,
`githubRepoListResponseSchema`, `githubImportResponseSchema`,
`syncJobResponseSchema`, `githubWebhookResponseSchema`).

- GET  /github/gists          200 `{ gists: GitHubGist[] }`, newest first, capped
                             at 200. A gist is `{ id, description, files, updatedAt,
                             htmlUrl }` where `files` are the file names inside it.
- GET  /github/repos          200 `{ repos: GitHubRepo[] }`, most recently updated
                             first, capped at 200. A repo is `{ id, fullName,
                             description, private, defaultBranch, updatedAt }`.
- POST /github/import         body: `{ kind, ref }` where `kind` is `gist` (then
                             `ref` is a gist id) or `repo` (then `ref` is an
                             `owner/repo` full name). 202 `{ job }` — the accepted
                             `SyncJob`. The import is enqueued as a pg-boss job.
                             Fails 400 before creating anything when GitHub is not
                             connected; a 404 from GitHub (unknown gist/repo, or a
                             private repo the token cannot see) is passed through.
- GET  /github/jobs/:id       200 `{ job }`. A `SyncJob` is `{ id, kind, status,
                             stats, error, createdAt, finishedAt }`; `kind` is
                             `gist_import | repo_import | repo_sync`, `status` is
                             `queued | running | done | failed`, and `stats` is
                             `{ total, processed, imported, updated, skipped,
                             failed }`. 404 if the job is missing or not the
                             caller's, 400 for a non-uuid id.
- POST /github/webhook        202 `{ queued }` for a GitHub delivery.
                             Takes no session: GitHub authenticates with the
                             `X-Hub-Signature-256` HMAC over the raw body, checked
                             against `GITHUB_WEBHOOK_SECRET`. A bad or missing
                             signature is 401 UNAUTHORIZED. Only `push` events do
                             work: each user who imported the repository on the
                             pushed branch gets a `repo_sync` job, and `queued` is
                             how many. Other events (or a branch nobody imported)
                             return 202 `{ queued: 0 }` so GitHub stops retrying.

Imported markdown becomes a `doc` note. `source` is `gist` or `repo`,
`source_ref` keys the file (`<gist id>/<file>` or `<owner>/<repo>/<path>`), and
`source_sha` is the file's content hash for gists (GitHub exposes no per-file
blob sha) or the blob sha for repositories. Re-importing a file whose
`source_sha` is unchanged is a no-op, which is also what leaves local edits
alone between upstream changes; when it differs, the upstream copy wins (v1 is
one-way). Files over 1 MB and non-markdown files are skipped.

Import is additive only: a markdown file deleted upstream leaves its note in
place (no tombstone) in this phase.

## Realtime

Auth required. `GET /events` is a Server-Sent Events stream of the caller's own
events; the news is per-user, so a stream never carries another account's data.
The event name is the SSE `event:` field and the payload is the JSON `data:`
field, so a browser subscribes with `addEventListener(<name>, …)`. The stream is
opened with `retry: 3000` and a comment frame (`: keep-alive`) is written every
25 s; both are SSE stream settings, not events.

- GET /events                 200 `text/event-stream`. Emits:
  - `note.updated`  `{ noteId, action }` with `action` `created | updated |
                    deleted` — a note was created, edited, or deleted.
  - `graph.updated` `{ noteId }` — the `process-note` job rebuilt that note's
                    tags/edges, so any graph on screen may be stale.
  - `sync.progress` `{ job }` — a GitHub import was queued, started, checkpointed
                    or finished; `job` is the same `SyncJob` as
                    `GET /github/jobs/:id`.

The publisher is in-process, so events reach only streams held by this API
instance (fine for a single instance). The connection is held until the client
goes away; the response is never ended by the API and is not compressed.

## GraphQL

Not in v1. Add later only if the frontend needs flexible graph queries.
