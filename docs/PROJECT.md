# Project: Context-Aware Developer Knowledge Base

## Summary

Web app for developers to store docs, snippets, and notes. The system links related items automatically and shows them as an interactive graph. It syncs with GitHub gists and repos.

## Goals

- One place for personal dev knowledge.
- Notes connect themselves. Less manual linking.
- Fast search across everything.
- Import from GitHub, keep in sync.

## Non-goals (v1)

- Team collaboration and sharing
- Mobile app
- Paid plans
- Non-GitHub providers

## Core features

1. Auth (GitHub OAuth)
2. Markdown editor with live preview, code blocks, syntax highlight
3. Note types: doc, snippet, note
4. Tags and folders
5. Full-text search (Postgres tsvector)
6. Auto-linking: wiki links `[[note]]`, tag overlap, keyword and text similarity
7. Knowledge graph view: zoom, pan, filter by tag/type, click to open
8. GitHub sync: gists and selected repos (markdown files), one-way import first, two-way later
9. Real-time sync across tabs/devices (SSE or WebSocket)

## Users

Solo developers. One account owns its notes.

## Success criteria

- Search returns results under 200 ms for 10k notes.
- Graph renders 2k nodes smoothly.
- GitHub import of a repo with 500 md files completes in background without blocking UI.
