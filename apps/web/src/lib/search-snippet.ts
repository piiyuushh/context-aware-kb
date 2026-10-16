import { SEARCH_HIGHLIGHT_END, SEARCH_HIGHLIGHT_START } from '@kb/shared'

/** One run of snippet text, flagged when it matched the query. */
export type SnippetSegment = {
  text: string
  highlighted: boolean
}

/**
 * Splits an API snippet on the shared highlight markers into ordered segments,
 * so the caller can render `<mark>` elements without ever trusting HTML.
 *
 * Markers are treated as balanced pairs. A dangling start marker (the API cut
 * the snippet off inside a match) highlights whatever is left instead of
 * leaking the raw marker into the UI; a dangling end marker stays plain text.
 */
export function parseSearchSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let rest = snippet
  let highlighted = false

  const push = (text: string) => {
    if (text.length > 0) segments.push({ text, highlighted })
  }

  while (rest.length > 0) {
    const marker = highlighted ? SEARCH_HIGHLIGHT_END : SEARCH_HIGHLIGHT_START
    const markerIndex = rest.indexOf(marker)

    if (markerIndex === -1) {
      push(rest)
      break
    }

    push(rest.slice(0, markerIndex))
    rest = rest.slice(markerIndex + marker.length)
    highlighted = !highlighted
  }

  return segments
}
