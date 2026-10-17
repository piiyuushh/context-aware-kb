# @kb/web

Next.js (App Router) frontend for the Context-Aware Developer Knowledge Base.

It signs you in through GitHub, keeps your notes in a sidebar, edits them in a
CodeMirror 6 markdown editor with a live, sanitized preview and autosave, searches
them from a `⌘K` command palette, maps their links in an interactive
force-directed graph, and imports markdown from your gists and repositories.

## Requirements

- Node.js >= 20.9
- Dependencies installed from the repo root (`npm install`)
- The API running on http://localhost:4000 (`npm run dev -w apps/api`)

## Scripts

Run from the repo root, or from `apps/web`:

| Command                         | What it does                                            |
| ------------------------------- | ------------------------------------------------------- |
| `npm run dev -w apps/web`       | Dev server on http://localhost:3000                     |
| `npm run build -w apps/web`     | Production build (generates gitignored `next-env.d.ts`) |
| `npm run start -w apps/web`     | Serve the production build on port 3000                 |
| `npm run lint -w apps/web`      | ESLint with the root flat config                        |
| `npm run typecheck -w apps/web` | `tsc --noEmit`                                          |
| `npm run test:e2e -w apps/web`  | Playwright e2e suite (starts the dev server itself)     |

`npm run dev` at the root starts web and API together via `concurrently`.

## Routes

| Route         | Access | Notes                                                                                        |
| ------------- | ------ | -------------------------------------------------------------------------------------------- |
| `/`           | public | Server component that `redirect('/notes')`.                                                  |
| `/login`      | public | Dark card with "Sign in with GitHub"; redirects to `/notes` when signed in.                  |
| `/notes`      | auth   | Empty state: select a note or create one.                                                    |
| `/notes/[id]` | auth   | Note editor: title, tags, markdown editor, live preview, autosave, revision history, export. |
| `/graph`      | auth   | Force-directed graph of notes and links, with filters and a detail pane.                     |
| `/github`     | auth   | Pick a gist or repo, start an import, and watch live job progress.                           |

Auth gating is **client-side** (`src/components/auth-guard.tsx`). Session state comes
from `GET /me`, which answers 401 when there is no cookie; the guard then replaces the
route with `/login`. Server components never call the API, because a relative `fetch`
has no origin to resolve against during SSR.

## Talking to the API

The API sets no CORS headers and authenticates every request with an httpOnly cookie
(`kb_session`), so the browser has to reach it **same-origin**. `next.config.ts` adds a
rewrite:

```
/api/v1/:path*  ->  ${NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/:path*
```

Client code therefore fetches relative URLs rooted at `API_PREFIX` (`/api/v1`) from
`@kb/shared` with `credentials: 'include'` — `localhost:4000` is never hardcoded in the
app, only in `next.config.ts` as the proxy target.

| Variable              | Default                 | Used by                                           |
| --------------------- | ----------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | The rewrite destination (server side, build time) |

### GitHub OAuth round trip

Because the cookie has to survive the redirect chain, the OAuth callback must go
through the **web origin**, not the API origin:

1. `/login` links to `/api/v1/auth/github` (a plain full-page `<a href>`, so the
   `kb_oauth_state` cookie is set on `localhost:3000`).
2. The rewrite proxies that to the API, which 302s to GitHub and sets the state cookie.
3. The GitHub OAuth app's callback URL must be
   `http://localhost:3000/api/v1/auth/github/callback`.
4. The API verifies `state`, sets `kb_session` on `localhost:3000`, and 302s to
   `WEB_APP_URL` (the web origin).

Point the callback at `http://localhost:4000/...` instead and step 4 lands on a
different origin, where the state cookie is not sent and the login fails with 403.

## Layout

```
next.config.ts                 reactStrictMode, transpilePackages, /api/v1 proxy rewrite
playwright.config.ts           Hermetic e2e config; starts the Next dev server itself
e2e/                           Playwright specs plus the shared page.route API stub
postcss.config.mjs             Tailwind v4 via @tailwindcss/postcss (no tailwind.config.* needed)
src/app/globals.css            @import "tailwindcss" plus @theme design tokens (dark-first)
src/app/layout.tsx             Root layout: metadata, global stylesheet, <Providers>
src/app/providers.tsx          Client QueryClientProvider (one QueryClient per browser session)
src/app/page.tsx               redirect('/notes')
src/app/login/page.tsx         "Sign in" metadata, renders the client login card
src/app/(app)/layout.tsx       AuthGuard + AppShell for every authenticated route
src/app/(app)/notes/page.tsx   Empty state
src/app/(app)/notes/[id]/page.tsx
src/app/(app)/graph/page.tsx   Graph view
src/app/(app)/github/page.tsx  GitHub import view
src/components/                auth-guard, app-shell, command-palette, notes-sidebar, note-list,
                               tag-list, note-editor, note-history, code-mirror-editor,
                               markdown-preview, user-avatar, graph-explorer, graph-canvas,
                               github-import, note-source-badge, realtime-bridge
src/lib/api-client.ts          Typed fetch wrapper: URL building, credentials, zod parsing, ApiError
src/lib/query-keys.ts          Query key factory
src/lib/queries.ts             TanStack Query hooks and cache updates
src/lib/graph-data.ts          Pure graph model builder plus match/colour helpers for the canvas
src/lib/search-snippet.ts      Pure splitter: API snippet markers -> highlighted text segments
src/lib/use-debounced-value.ts Debounce hook shared by the sidebar and the command palette
src/lib/use-element-size.ts    ResizeObserver hook that sizes the graph canvas
```

## End-to-end tests

`npm run test:e2e -w apps/web` runs Playwright against a `next dev` server that
`playwright.config.ts` starts (and reuses when one is already on port 3000). The specs are
hermetic: `e2e/support/mock-api.ts` answers every `/api/v1/*` request with `page.route` from
one mutable in-memory state, so no API, database or GitHub access is needed — and creating a
note through the UI really does make it appear in the list and open in its editor. The first
run needs `npx playwright install chromium`. The suite is deliberately **not** part of
`npm test`, which stays vitest/unit.

## Conventions

- App Router, Server Components by default. Add `'use client'` only for interactivity.
- Tailwind utility classes only; theme tokens live in the `@theme` block in `globals.css`
  (for example `--color-accent` gives `text-accent`, `bg-surface`, `border-line`).
  The one exception is the CodeMirror theme, which must be a JS object and references the
  same tokens through `var(--color-*)`.
- Types come from `@kb/shared`; never duplicate them in the app. Requests and responses are
  parsed with the shared zod schemas in `src/lib/api-client.ts`.
- No semicolons, single quotes, 2-space indent (root `.prettierrc.json`).
- The graph view must render on canvas for performance, and the editor and graph must be
  keyboard accessible.

## Notes

- `transpilePackages: ['@kb/shared']` is required because the shared package publishes
  TypeScript source directly through its `exports` map.
- Autosave debounces edits by 800 ms and PATCHes only the changed fields. A pending edit is
  flushed on unmount and when you switch notes; `Mod-s` saves immediately.
- `⌘K` / `Ctrl+K` opens the search command palette (`GET /search`, ranked best-first):
  debounced query, type and tag filters, `↑`/`↓`/`Home`/`End` to move, `Enter` to open the
  selected note, `Esc` to close with focus cycling inside the dialog. Snippets arrive with
  the shared `SEARCH_HIGHLIGHT_START`/`END` markers; `src/lib/search-snippet.ts` splits them
  into segments that the palette renders as `<mark>` — HTML is never injected.
- Markdown is rendered with `rehype-sanitize`; the schema is only widened to keep the
  `hljs`/`hljs-*` classes added by `rehype-highlight`, and raw HTML stays disabled.
- `/graph` renders on canvas via `react-force-graph-2d`, loaded with `next/dynamic`
  (`ssr: false`) so it stays out of every other route's bundle. Node fill comes from the
  note type, explicit edges are solid with an arrow, suggested edges are dashed and fade
  with `minScore`. Node positions live in the simulation (never React state), hover and
  selection only re-apply the draw accessor, and labels are culled to highlighted nodes
  below a zoom threshold — which keeps a 2000-node graph interactive. The search box
  highlights matches (others dim); its list, the legend and the detail pane give the
  canvas a keyboard-accessible counterpart.
- `/notes/[id]` keeps a revision history (`GET /notes/:id/versions`, newest first). The
  `History` toggle lists each revision with a `Restore` action behind an alert dialog; a
  restore writes the returned note into the detail cache (keeping cached tags) and bumps a
  `reloadKey` on the editor pane, so remounting re-seeds the drafts from the restored body —
  the pane only reads `note` on mount, which is what keeps autosave state per-note.
  `Export .md` is a plain same-origin anchor to `GET /notes/:id/export`, so the session cookie
  rides along and the browser handles the download.
- `RealtimeBridge` (mounted inside `AuthGuard`, so it only runs with a session) subscribes to
  `GET /events` with `EventSource` and folds each event into the query cache:
  `note.updated` revalidates the lists and that note's detail (a delete drops the note's
  queries instead), `graph.updated` revalidates the graph and tags, and `sync.progress` seeds
  the job cache and revalidates once the job is `done` (plus one settle refresh, for the same
  reason `useSyncJob` waits). Reconnection is left to the browser; there is no retry loop.
- `/github` lists gists and repositories from the API, starts an import, and polls the
  accepted job every 1.5 s while it is `queued` or `running` (stopping on `done`,
  `failed` or an error). When it finishes, the note list, tags and graph are
  invalidated — once immediately and once after a short delay, because the API attaches
  tags and edges in a follow-up job. Imported notes show a source badge (`Gist`/`Repo`)
  in the sidebar and the editor header.
