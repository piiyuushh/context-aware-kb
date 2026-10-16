# Repositories

SQL lives here: one module per aggregate (`notes`, `users`, `tags`, `links`,
`jobs`) once the database lands in Phase 1. See docs/DATABASE.md.

Phase 0 has no database code yet, so this folder only holds this note.

Rules:

- Parameterized queries only. Never concatenate SQL strings.
- Map rows to domain objects, return them to services. No business logic here.
- Repositories are the only layer allowed to touch the `pg` pool.
