import { SEARCH_HIGHLIGHT_END, SEARCH_HIGHLIGHT_START } from '@kb/shared'
import { getPool } from '../db/pool'
import { NOTE_COLUMNS, NOTE_JOINS, mapNote } from './notes.repository'
import type { Note, NoteRow } from './notes.repository'
import type { NoteType } from '@kb/shared'

/** One ranked hit: the full note, its relevance score and a marked-up snippet. */
export interface SearchHit {
  note: Note
  rank: number
  snippet: string
}

export interface SearchNotesFilter {
  q: string
  type?: NoteType
  tag?: string
  limit: number
}

interface SearchRow extends NoteRow {
  rank: number
  snippet: string
}

/**
 * Options for `ts_headline`, assembled in JS from the shared highlight markers.
 * They are passed as a bound parameter (never concatenated into SQL) because
 * `ts_headline` takes them as a text argument; building them here keeps the web
 * app and the API reading the same `<mark>`/`</mark>` markers.
 */
const HEADLINE_OPTIONS = [
  `StartSel=${SEARCH_HIGHLIGHT_START}`,
  `StopSel=${SEARCH_HIGHLIGHT_END}`,
  'MaxWords=30',
  'MinWords=10',
  'ShortWord=2',
  'HighlightAll=false',
  'MaxFragments=2',
].join(', ')

/**
 * Ranked full-text search across one user's notes.
 *
 * The term goes through `plainto_tsquery`, so user input is parsed as words,
 * never as tsquery syntax (no `&`/`|`/`!` injection). The tsquery expression is
 * written inline in the three places that consume it (the `@@` filter,
 * `ts_rank_cd`, `ts_headline`) rather than selected through a CTE: grouping by a
 * `tsquery` column would lean on that type's btree opclass, whereas grouping by
 * the note's primary key alone is enough — Postgres treats every other `n.*`
 * column as functionally dependent on it.
 *
 * Filtering by tag uses `exists` (the same shape as `listNotes`) so it never
 * changes the join cardinality and `group by n.id` stays valid. `rank` is cast
 * to `double precision` so the pg driver parses it to a JS number for
 * `searchResultSchema`; ties fall back to recency then id for a stable order.
 */
export async function searchNotes(userId: string, filter: SearchNotesFilter): Promise<SearchHit[]> {
  const values: unknown[] = [userId, filter.q, HEADLINE_OPTIONS]
  const conditions: string[] = ['n.user_id = $1', `n.search @@ plainto_tsquery('english', $2)`]

  const bind = (value: unknown): string => {
    values.push(value)
    return `$${values.length}`
  }

  if (filter.type) {
    conditions.push(`n.type = ${bind(filter.type)}`)
  }

  if (filter.tag) {
    conditions.push(
      `exists (
         select 1 from note_tags tn
         join tags tt on tt.id = tn.tag_id
         where tn.note_id = n.id and tt.name = ${bind(filter.tag)}
       )`,
    )
  }

  const limit = bind(filter.limit)

  const { rows } = await getPool().query<SearchRow>(
    `select ${NOTE_COLUMNS},
            ts_rank_cd(n.search, plainto_tsquery('english', $2))::double precision as rank,
            ts_headline(
              'english',
              coalesce(nullif(n.content_md, ''), n.title),
              plainto_tsquery('english', $2),
              $3
            ) as snippet
     ${NOTE_JOINS}
     where ${conditions.join(' and ')}
     group by n.id
     order by rank desc, n.updated_at desc, n.id desc
     limit ${limit}`,
    values,
  )

  return rows.map((row) => ({ note: mapNote(row), rank: row.rank, snippet: row.snippet }))
}
