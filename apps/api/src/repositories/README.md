# Repositories

SQL lives here: one module per aggregate. Phase 1 adds `users`,
`github_connections`, `notes`, and `tags`; `links` and `jobs` follow. See
docs/DATABASE.md.

Rules:

- Parameterized queries only. Never concatenate SQL strings.
- Map rows to domain objects (camelCase), return them to services. No business logic here.
- Repositories are the only layer allowed to touch the `pg` pool (`db/pool.ts`).
