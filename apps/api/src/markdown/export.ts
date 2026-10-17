import type { Note } from '@kb/shared'

/**
 * Markdown export (`GET /notes/:id/export`): a note as a standalone `.md` file.
 *
 * The frontmatter is deliberately small and machine-readable: the note's
 * identity, its tags, its timestamps and where it came from. Every string goes
 * through `JSON.stringify`, whose output is a valid YAML double-quoted scalar,
 * so a title containing `:`, a quote or a newline cannot break the header. The
 * tag list is written as a JSON flow sequence, which YAML also accepts.
 *
 * The body is the note's markdown verbatim: an export should round-trip through
 * an import (a paste back into the editor) without rewriting the content.
 */
export function serializeNoteAsMarkdown(note: Note): string {
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(note.title)}`,
    `type: ${JSON.stringify(note.type)}`,
    `tags: ${JSON.stringify(note.tags.map((tag) => tag.name))}`,
    `created: ${JSON.stringify(note.createdAt)}`,
    `updated: ${JSON.stringify(note.updatedAt)}`,
    `source: ${JSON.stringify(note.source)}`,
    '---',
  ].join('\n')

  return `${frontmatter}\n\n${note.contentMd}`
}
