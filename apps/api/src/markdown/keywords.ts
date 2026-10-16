/**
 * Very small English stop-word list. Deliberately short: the goal is to keep
 * `to_tsquery` from being dominated by function words, not to be a complete
 * NLP list, and Postgres stems the rest anyway.
 */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'any',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'day',
  'get',
  'has',
  'him',
  'his',
  'how',
  'its',
  'new',
  'now',
  'old',
  'see',
  'two',
  'way',
  'who',
  'boy',
  'did',
  'use',
  'with',
  'that',
  'this',
  'from',
  'they',
  'will',
  'would',
  'there',
  'their',
  'what',
  'about',
  'into',
  'than',
  'then',
  'them',
  'these',
  'some',
  'such',
  'only',
  'also',
  'over',
  'when',
  'where',
  'which',
  'while',
  'have',
  'been',
  'were',
  'your',
  'each',
  'more',
  'most',
  'other',
  'should',
  'could',
  'because',
  'between',
  'does',
  'doing',
  'done',
  'here',
  'just',
  'like',
  'make',
  'many',
  'much',
  'must',
  'onto',
  'same',
  'very',
  'well',
  'without',
  'using',
  'used',
  'via',
  'per',
])

/** Lower-cased word-ish tokens; used to build the text-similarity query. */
const WORD_PATTERN = /[a-z][a-z0-9-]*/g

const MIN_WORD_LENGTH = 3

/**
 * Extracts the most frequent significant words from a note, most frequent
 * first (ties broken alphabetically for determinism).
 *
 * The result is fed to `to_tsquery` as an OR of lexemes. Every token matches
 * `[a-z][a-z0-9-]*`, so no tsquery operator (`&`, `|`, `!`, `(...)`, `:*`) can
 * ever be injected from note content.
 */
export function extractKeywords(text: string, limit = 20): string[] {
  const counts = new Map<string, number>()

  for (const match of text.toLowerCase().matchAll(WORD_PATTERN)) {
    const word = match[0]
    if (word.length < MIN_WORD_LENGTH || STOP_WORDS.has(word)) {
      continue
    }

    counts.set(word, (counts.get(word) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word)
}

/** Joins keywords into a `to_tsquery` OR expression, or null when empty. */
export function toKeywordQuery(keywords: string[]): string | null {
  return keywords.length > 0 ? keywords.join(' | ') : null
}
