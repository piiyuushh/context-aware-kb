import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { Root } from 'mdast'

/**
 * A heading pulled out of the document. `depth` is the markdown level (1-6).
 * Used later for a table of contents / outline; not persisted yet.
 */
export interface MarkdownHeading {
  depth: number
  text: string
}

/** The structured bits of a note's markdown body. */
export interface ExtractedMarkdown {
  /** Wiki-link targets, de-duplicated case-insensitively, in document order. */
  wikiLinks: string[]
  /** Single-word tags, lower-cased and de-duplicated. */
  tags: string[]
  headings: MarkdownHeading[]
}

/**
 * `[[Target]]` or `[[Target|Label]]`. The label (if any) is for display only,
 * so the target group is what we keep.
 */
const WIKI_LINK_PATTERN = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g

/**
 * `#tag` outside of a word: the lookbehind rejects `C#`, `http://x#frag` and a
 * doubled `##`. Leading letter is required so issue refs like `#123` are not
 * treated as tags.
 */
const TAG_PATTERN = /(?<![\w/#])#([A-Za-z][\w-]*)/g

function collectWikiLinks(text: string, into: string[]): void {
  const seen = new Set(into.map((link) => link.toLowerCase()))

  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const target = match[1]?.trim()
    if (!target) {
      continue
    }

    const key = target.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    into.push(target)
  }
}

function collectTags(text: string, into: string[]): void {
  const seen = new Set(into)

  for (const match of text.matchAll(TAG_PATTERN)) {
    const name = match[1]?.toLowerCase()
    if (!name || seen.has(name)) {
      continue
    }

    seen.add(name)
    into.push(name)
  }
}

/**
 * Parses markdown into the things the link pipeline cares about.
 *
 * Only `text` nodes are scanned for wiki links and tags, so fenced code,
 * inline code and link URLs never produce phantom links. Because remark turns
 * a line-leading `# Heading` into a `heading` node (dropping the `#`), heading
 * hashes never leak into the tag list either.
 */
export function parseMarkdown(markdown: string): ExtractedMarkdown {
  const tree: Root = unified().use(remarkParse).parse(markdown)

  const wikiLinks: string[] = []
  const tags: string[] = []
  const headings: MarkdownHeading[] = []

  visit(tree, (node) => {
    if (node.type === 'heading') {
      headings.push({ depth: node.depth, text: toString(node).trim() })
      return
    }

    if (node.type === 'text') {
      collectWikiLinks(node.value, wikiLinks)
      collectTags(node.value, tags)
    }
  })

  return { wikiLinks, tags, headings }
}
