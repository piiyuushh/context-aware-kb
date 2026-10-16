import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../src/markdown/extract'
import { extractKeywords, toKeywordQuery } from '../src/markdown/keywords'

describe('parseMarkdown', () => {
  it('returns empty collections for an empty body', () => {
    expect(parseMarkdown('')).toEqual({ wikiLinks: [], tags: [], headings: [] })
  })

  it('extracts wiki-link targets in document order, using the alias target only', () => {
    const { wikiLinks } = parseMarkdown(
      ['See [[Design Doc]] and [[api|the API]].', '', 'Then [[Design Doc]] again.'].join('\n'),
    )

    expect(wikiLinks).toEqual(['Design Doc', 'api'])
  })

  it('de-duplicates wiki links case-insensitively', () => {
    const { wikiLinks } = parseMarkdown('[[API]] then [[api]] then [[Api]]')

    expect(wikiLinks).toEqual(['API'])
  })

  it('extracts inline hashtags, lower-cased and de-duplicated', () => {
    const { tags } = parseMarkdown('Working on #Node and #express today. #Node again.')

    expect(tags).toEqual(['node', 'express'])
  })

  it('ignores hashtags that are not tags', () => {
    const { tags } = parseMarkdown(
      ['C# is not a tag and issue #123 is not either.', 'A URL https://x.test/page#frag too.'].join(
        '\n',
      ),
    )

    expect(tags).toEqual([])
  })

  it('does not treat heading markers as tags', () => {
    const { tags, headings } = parseMarkdown('# Title\n\n## Section')

    expect(tags).toEqual([])
    expect(headings).toEqual([
      { depth: 1, text: 'Title' },
      { depth: 2, text: 'Section' },
    ])
  })

  it('ignores wiki links and tags inside code', () => {
    const body = [
      'Real [[Link]] and #real.',
      '',
      '`#inlinecode` and `[[inlinecode]]`',
      '',
      '```js',
      '#fenced',
      '[[fenced]]',
      '```',
      '',
      'Done.',
    ].join('\n')

    const { wikiLinks, tags } = parseMarkdown(body)

    expect(wikiLinks).toEqual(['Link'])
    expect(tags).toEqual(['real'])
  })
})

describe('extractKeywords', () => {
  it('ranks frequent significant words first and drops stop words', () => {
    const keywords = extractKeywords('Express routing and express middleware with express handlers')

    expect(keywords[0]).toBe('express')
    expect(keywords).not.toContain('and')
    expect(keywords).not.toContain('with')
  })

  it('drops tokens shorter than three characters', () => {
    expect(extractKeywords('a b cd abcd')).toEqual(['abcd'])
  })

  it('is deterministic for equal counts (alphabetical tie-break)', () => {
    expect(extractKeywords('zebra apple')).toEqual(['apple', 'zebra'])
  })
})

describe('toKeywordQuery', () => {
  it('joins keywords into an OR expression', () => {
    expect(toKeywordQuery(['express', 'routing'])).toBe('express | routing')
  })

  it('returns null when there are no keywords', () => {
    expect(toKeywordQuery([])).toBeNull()
  })
})
