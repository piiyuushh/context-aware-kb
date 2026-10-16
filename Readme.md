# Context-Aware Developer Knowledge Base

A personal notebook for developers. It's a place to save short code snippets,
quick reminders, and longer written-up docs — and it connects related notes for
you, so ideas are easy to find and follow later.

The "context-aware" part means the app works out which of your notes belong
together, both from links you write yourself and from notes that talk about
similar things. It can then show your whole collection as an interactive map of
dots and lines, so you can see how one idea leads to another instead of digging
through folders of files.

Everything is private to one account, and you sign in with your GitHub account —
there's no separate username and password to look after.

> **Where things stand:** the app works end to end. You can sign in, write and
> organise notes, search across everything, and explore the connections map.
> Importing from GitHub and live syncing across browser tabs are still to come.
> See [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.

## What it does today

- **Sign in with GitHub** — no extra password to remember. Your session is kept
  in a secure browser cookie, and the access key GitHub gives us is scrambled
  (encrypted) before it's stored, so it can't be read if the database is ever
  exposed.
- **Write and edit notes** — three kinds: a **doc** for a longer write-up, a
  **snippet** for a small piece of code, and a **note** for a quick thought.
  You type in a proper text editor that formats as you go, and your work saves
  itself automatically.
- **Organise with tags** — type a tag like `postgres` and it's created on the
  spot. Later, filter your notes by tag.
- **Search everything** — type a few words and get the best matches first,
  with the matching words highlighted. Press `⌘K` (or `Ctrl+K`) anywhere to
  search from a quick pop-up.
- **See how notes connect** — the app links notes automatically: the links you
  write yourself (in the form `[[another note]]`) plus suggestions based on
  shared tags or similar wording. The **graph** page draws all of it as an
  interactive map you can zoom, pan, filter, and click through.

## What's coming

- **Import from GitHub** — bring in your gists and the markdown files from your
  repositories, watch progress while it runs, and refresh them when they change.
- **Live updates** — see edits appear in every open tab without reloading.

## Who it's for

Developers who want their own personal knowledge in one place. A single account
owns its notes; sharing, teams, and collaboration are not part of the plan.

## How it works, in plain terms

Three moving parts:

1. **The website** — the pages you see in the browser: your note list, the
   editor, the search pop-up, and the connections map.
2. **The engine behind it** — learns which notes are related, saves your edits,
   and answers searches.
3. **A database** — stores your notes. It also does the searching and keeps
   track of which note links to which. Notes are connected through ordinary
   rows in a table rather than a specialist "graph" database; that's a
   deliberate, simpler choice explained in
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The website and the engine live in the same project so they always agree on
what a note looks like.

## Under the hood

| Layer            | What it is, and why                                         |
| ---------------- | ----------------------------------------------------------- |
| Website          | Next.js, React, TypeScript, Tailwind CSS                    |
| Engine           | Node.js, Express, TypeScript                                |
| Database         | PostgreSQL (stores notes, search index, and the link table) |
| Input checking   | zod, shared by both halves so rules are defined once        |
| GitHub           | GitHub sign-in plus the GitHub API (Octokit)                |
| Automated checks | Vitest, Supertest, and Playwright                           |

## What's in this repository

```
apps/web             The website (Next.js, React, Tailwind CSS)
apps/api             The engine that powers it (Express, TypeScript)
packages/shared      Rules and data shapes both halves rely on
docs/                Written specs: project, architecture, database, API, roadmap
docker-compose.yml   Ready-made local database for development
```

## Before you start

- **Node.js 20.9 or newer** — the toolkit that runs the app.
- **Docker** (recommended) — runs the database for you in a self-contained box.
  If you'd rather use your own PostgreSQL 16 database, you can point the app at
  it instead (`DATABASE_URL`).

## Getting started

The steps below are written for a terminal (the command line). Run each block
from the project's main folder.

```bash
# 1. Download the libraries the project depends on
npm install

# 2. Make your own settings file from the example
cp .env.example .env
```

Now open `.env` in a text editor and fill in the values. At a minimum you need
`DATABASE_URL`, a `SESSION_SECRET`, and a `GITHUB_TOKEN_ENCRYPTION_KEY`. The
last two are secret strings you generate; run this twice and paste each result
in its place:

```bash
openssl rand -hex 32   # for SESSION_SECRET
openssl rand -hex 32   # for GITHUB_TOKEN_ENCRYPTION_KEY (needs to be 64 characters)
```

### Set up GitHub sign-in

Logging in won't work until you register what's called a **GitHub OAuth app**.
That's simply a way to tell GitHub "this website is allowed to use GitHub
sign-in", the same idea as the "Sign in with Google" button you see on other
sites.

Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
(https://github.com/settings/applications/new) and fill it in like this:

| Field                      | Value                                               |
| -------------------------- | --------------------------------------------------- |
| Homepage URL               | `http://localhost:3000`                             |
| Authorization callback URL | `http://localhost:3000/api/v1/auth/github/callback` |

Then copy the **Client ID** and a freshly generated **Client secret** into your
`.env` file:

```dotenv
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

One detail matters here: the callback address must use port **3000** (the
website), not 4000 (the engine). Get that wrong and sign-in fails with a "state"
error. There's a longer explanation in
[apps/web/README.md](apps/web/README.md#github-oauth-round-trip).

### Start the database and run the app

```bash
# 3. Start the database
docker compose up -d

# 4. Set up the database tables (reads your .env)
npm run db:migrate

# 5. Start everything — the website and the engine together
npm run dev
```

Finally, open http://localhost:3000 in your browser and sign in with GitHub.

## Everyday commands

Run these from the project's main folder.

| Command                                           | What it does                              |
| ------------------------------------------------- | ----------------------------------------- |
| `npm run dev`                                     | Start the website and the engine together |
| `npm run dev -w apps/web` / `-w apps/api`         | Start just one of the two                 |
| `npm run build`                                   | Prepare everything for release            |
| `npm run lint` / `npm run lint:fix`               | Check (and auto-fix) code style           |
| `npm run typecheck`                               | Check the code's consistency              |
| `npm run test`                                    | Run the automated tests                   |
| `npm run format` / `npm run format:check`         | Tidy (or check) file formatting           |
| `npm run db:migrate`                              | Apply any pending database changes        |
| `npm run db:migrate:down`                         | Undo the most recent database change      |
| `npm run db:migrate:create -w apps/api -- <name>` | Create a new database change file         |

Before calling a task finished, run `npm run lint`, `npm run typecheck`, and
`npm run test`.

## Automated tests

```bash
npm run test                 # everything
npm run test -w apps/api     # just the engine (no database or GitHub needed)
```

The engine's tests run the code in memory with a stand-in for the database and
GitHub, so they need neither a real database nor a real GitHub account. That
keeps the checks fast and reliable on any machine.

## Settings (environment variables)

Every setting is explained in [`.env.example`](.env.example). The engine reads
the `.env` file in the project's main folder once when it starts, and the
database setup command reads the same file. If a required setting is missing,
the app stops and tells you its name. Nothing secret is ever printed to the
screen.

## Learn more

- [docs/PROJECT.md](docs/PROJECT.md) — goals, features, and scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together
- [docs/DATABASE.md](docs/DATABASE.md) — how notes and links are stored
- [docs/API.md](docs/API.md) — the engine's available actions
- [docs/ROADMAP.md](docs/ROADMAP.md) — what's done and what's next
- [apps/api/README.md](apps/api/README.md) and
  [apps/web/README.md](apps/web/README.md) — notes for each half
