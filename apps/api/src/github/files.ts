import { createHash } from 'node:crypto'
import { parseMarkdown } from '../markdown/extract'

/**
 * Pure helpers shared by the GitHub client and the sync worker: which files to
 * import, how to turn one into a note, and how to key it back to its source.
 */

/** Files larger than this are skipped: it matches the note body schema cap. */
export const MAX_IMPORT_FILE_BYTES = 1_000_000

/** Most markdown files imported from a single repository in one run. */
export const MAX_REPO_FILES = 1_000

const MARKDOWN_EXTENSION = /\.(md|markdown|mdx)$/i

/** True for `.md`, `.markdown` and `.mdx` paths, case-insensitively. */
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSION.test(path)
}

/** The last path segment with its extension stripped: `docs/a.md` -> `a`. */
export function fileBaseName(path: string): string {
  const segments = path.split('/')
  const name = segments[segments.length - 1] ?? path

  return name.replace(MARKDOWN_EXTENSION, '')
}

/**
 * Title for an imported note: the document's first heading, falling back to the
 * caller's suggestion (usually the file name). Capped to the note title limit.
 */
export function deriveNoteTitle(contentMd: string, fallback: string): string {
  const [heading] = parseMarkdown(contentMd).headings
  const candidate = heading && heading.text.trim() !== '' ? heading.text.trim() : fallback.trim()

  return (candidate === '' ? 'Untitled' : candidate).slice(0, 500)
}

/** Stable per-file `source_sha` for gists, which do not expose a blob sha. */
export function contentSha(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** `source_ref` for a gist file: `<gist id>/<file name>`. */
export function gistSourceRef(gistId: string, fileName: string): string {
  return `${gistId}/${fileName}`
}

/** `source_ref` for a repo file: `<owner>/<repo>/<path>`. */
export function repoSourceRef(repoFullName: string, path: string): string {
  return `${repoFullName}/${path}`
}
