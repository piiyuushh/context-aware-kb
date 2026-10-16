# @kb/web

Next.js (App Router) frontend for the Context-Aware Developer Knowledge Base.

Phase 0 is a static shell: a server-rendered landing page that proves the `@kb/shared`
workspace package resolves. It does not call the API yet (no CORS setup exists).

## Requirements

- Node.js >= 20.9
- Dependencies installed from the repo root (`npm install`)

## Scripts

Run from the repo root, or from `apps/web`:

| Command                         | What it does                                            |
| ------------------------------- | ------------------------------------------------------- |
| `npm run dev -w apps/web`       | Dev server on http://localhost:3000                     |
| `npm run build -w apps/web`     | Production build (generates gitignored `next-env.d.ts`) |
| `npm run start -w apps/web`     | Serve the production build on port 3000                 |
| `npm run lint -w apps/web`      | ESLint with the root flat config                        |
| `npm run typecheck -w apps/web` | `tsc --noEmit`                                          |

`npm run dev` at the root starts web and API together via `concurrently`.

## Layout

```
next.config.ts        NextConfig: reactStrictMode + transpilePackages for @kb/shared
postcss.config.mjs    Tailwind v4 via @tailwindcss/postcss (no tailwind.config.* needed)
src/app/globals.css   @import "tailwindcss" plus @theme design tokens (dark-first)
src/app/layout.tsx    Root layout, metadata, global stylesheet
src/app/page.tsx      Server-component landing page
```

## Conventions

- App Router, Server Components by default. Add `'use client'` only for interactivity.
- Tailwind utility classes only; theme tokens live in the `@theme` block in `globals.css`
  (for example `--color-accent` gives `text-accent`, `bg-surface`, `border-line`).
- Types come from `@kb/shared`; never duplicate them in the app.
- No semicolons, single quotes, 2-space indent (root `.prettierrc.json`).
- The graph view must render on canvas for performance, and the editor and graph must be
  keyboard accessible.

## Notes

- `transpilePackages: ['@kb/shared']` is required because the shared package publishes
  TypeScript source directly through its `exports` map.
- The planned API prefix (`/api/v1`) is imported from `@kb/shared` and displayed on the
  landing page.
