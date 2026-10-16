import { getPool } from '../db/pool'

/**
 * SQL for the `note_links` edge table: wiki-link resolution, suggestion
 * signals and edge replacement. Graph reads live in `graph.repository.ts`.
 */

/** Raw candidate signals used to score a suggested edge (see links/similarity). */
export interface SuggestionSignalsRow {
  targetNoteId: string
  sharedTags: number
  tagUnion: number
  textRank: number
}

export interface SuggestedEdgeRecord {
  targetNoteId: string
  score: number
}

/** The full set of outgoing edges for one source note. */
export interface NoteEdgeSets {
  explicitTargetIds: string[]
  suggested: SuggestedEdgeRecord[]
}

interface NoteIdRow {
  id: string
}

interface SignalsRow {
  target_note_id: string
  shared_tags: number
  tag_union: number
  text_rank: number
}

/**
 * Resolves wiki-link titles to note ids for a user, keyed by lower-cased title.
 * A title may match more than one note (titles are not unique), in which case
 * the most recently updated one wins; the query orders so the last row per
 * title is the newest.
 */
export async function findNoteIdsByTitle(
  userId: string,
  titles: string[],
): Promise<Map<string, string>> {
  const keys = titles.map((title) => title.toLowerCase())
  if (keys.length === 0) {
    return new Map()
  }

  const { rows } = await getPool().query<NoteIdRow & { title_key: string }>(
    `select distinct on (lower(title)) id, lower(title) as title_key
     from notes
     where user_id = $1 and lower(title) = any($2::text[])
     order by lower(title), updated_at desc, id desc`,
    [userId, keys],
  )

  return new Map(rows.map((row) => [row.title_key, row.id]))
}

/**
 * Candidate notes for suggested links, with their raw signals. A candidate is
 * any of the user's other notes that shares at least one tag or matches the
 * source's keywords.
 *
 * `keywordQuery` is an OR of sanitized lexemes (or null when the note is too
 * short to have keywords); it is passed as a bound parameter to `to_tsquery`,
 * so no user text is interpolated into SQL. `limit` bounds the rescorable set;
 * final weighting and ranking happen in `links/similarity.ts`.
 */
export async function findSuggestionSignals(
  userId: string,
  noteId: string,
  keywordQuery: string | null,
  limit: number,
): Promise<SuggestionSignalsRow[]> {
  const { rows } = await getPool().query<SignalsRow>(
    `with source_tags as (
       select tag_id from note_tags where note_id = $2
     ),
     scored as (
       select
         n.id as target_note_id,
         (select count(*)::int from note_tags nt
            where nt.note_id = n.id
              and nt.tag_id in (select tag_id from source_tags)) as shared_tags,
         (select count(*)::int from source_tags) as source_tag_count,
         (select count(*)::int from note_tags nt where nt.note_id = n.id) as target_tag_count,
         case
           when $3::text is null then 0::real
           else ts_rank_cd(n.search, to_tsquery('english', $3::text))
         end as text_rank
       from notes n
       where n.user_id = $1 and n.id <> $2
     )
     select
       s.target_note_id,
       s.shared_tags,
       (s.source_tag_count + s.target_tag_count - s.shared_tags) as tag_union,
       s.text_rank::double precision as text_rank
     from scored s
     where s.shared_tags > 0 or s.text_rank > 0
     order by s.shared_tags desc, s.text_rank desc, s.target_note_id
     limit $4`,
    [userId, noteId, keywordQuery, limit],
  )

  return rows.map((row) => ({
    targetNoteId: row.target_note_id,
    sharedTags: row.shared_tags,
    tagUnion: row.tag_union,
    textRank: row.text_rank,
  }))
}

/** De-duplicates targets and drops a self-link, which the schema forbids. */
function normalizeTargets(ids: string[], sourceNoteId: string): string[] {
  return [...new Set(ids)].filter((id) => id !== sourceNoteId)
}

function normalizeSuggested(
  edges: SuggestedEdgeRecord[],
  sourceNoteId: string,
): SuggestedEdgeRecord[] {
  const byTarget = new Map<string, number>()

  for (const edge of edges) {
    if (edge.targetNoteId === sourceNoteId) {
      continue
    }

    byTarget.set(edge.targetNoteId, Math.max(byTarget.get(edge.targetNoteId) ?? 0, edge.score))
  }

  return [...byTarget.entries()].map(([targetNoteId, score]) => ({ targetNoteId, score }))
}

/**
 * Atomically replaces every outgoing edge of a source note: the explicit set
 * (from wiki links) and the suggested set (with scores). Delete-then-insert
 * inside one transaction means a half-processed note never becomes visible,
 * and stale edges from a previous save are removed.
 */
export async function replaceNoteEdges(
  userId: string,
  sourceNoteId: string,
  sets: NoteEdgeSets,
): Promise<void> {
  const explicitTargets = normalizeTargets(sets.explicitTargetIds, sourceNoteId)
  const suggested = normalizeSuggested(sets.suggested, sourceNoteId)

  const client = await getPool().connect()

  try {
    await client.query('begin')

    await client.query(
      `delete from note_links
       where user_id = $1 and source_note_id = $2 and type = 'explicit'`,
      [userId, sourceNoteId],
    )

    if (explicitTargets.length > 0) {
      await client.query(
        `insert into note_links (user_id, source_note_id, target_note_id, type)
         select $1, $2, t.id, 'explicit'
         from unnest($3::uuid[]) as t(id)
         on conflict (source_note_id, target_note_id, type) do nothing`,
        [userId, sourceNoteId, explicitTargets],
      )
    }

    await client.query(
      `delete from note_links
       where user_id = $1 and source_note_id = $2 and type = 'suggested'`,
      [userId, sourceNoteId],
    )

    if (suggested.length > 0) {
      await client.query(
        `insert into note_links (user_id, source_note_id, target_note_id, type, score)
         select $1, $2, t.id, 'suggested', t.score
         from unnest($3::uuid[], $4::real[]) as t(id, score)
         on conflict (source_note_id, target_note_id, type) do nothing`,
        [
          userId,
          sourceNoteId,
          suggested.map((edge) => edge.targetNoteId),
          suggested.map((edge) => edge.score),
        ],
      )
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
