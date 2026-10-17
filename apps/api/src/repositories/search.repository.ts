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
 * never as tsquery syntax (no `&`/`|`/`!` injection).
 *
 * Ranking and the `limit` happen in the `matched` CTE, before any note is
 * joined: `ts_headline` is the expensive part and it now runs only for the page
 * that is actually returned instead of for every match. The CTE selects `n.id`
 * and the rank only, so it needs no grouping; the outer query keeps the plain
 * note joins and groups by the note's primary key for the tag aggregation
 * (Postgres treats every other `n.*` column as dependent on it) plus `m.rank`,
 * which comes from the CTE and is therefore not covered by that dependency.
 *
 * Filtering by tag uses `exists` (the same shape as `listNotes`) so it never
 * changes the join cardinality. `rank` is cast to `double precision` so the pg
 * driver parses it to a JS number for `searchResultSchema`; ties fall back to
 * recency then id for a stable order.
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
    `with matched as (
       select n.id,
              ts_rank_cd(n.search, plainto_tsquery('english', $2)) as rank
       from notes n
       where ${conditions.join(' and ')}
       order by rank desc, n.updated_at desc, n.id desc
       limit ${limit}
     )
     select ${NOTE_COLUMNS},
            m.rank::double precision as rank,
            ts_headline(
              'english',
              coalesce(nullif(n.content_md, ''), n.title),
              plainto_tsquery('english', $2),
              $3
            ) as snippet
     ${NOTE_JOINS}
     join matched m on m.id = n.id
     where n.user_id = $1
     group by n.id, m.rank
     order by m.rank desc, n.updated_at desc, n.id desc`,
    values,
  )

  return rows.map((row) => ({ note: mapNote(row), rank: row.rank, snippet: row.snippet }))
}
