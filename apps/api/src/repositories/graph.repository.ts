import { getPool } from '../db/pool'
import type { EdgeType, GraphEdge, GraphNode, NoteType } from '@kb/shared'
import type { Tag } from './tags.repository'

/**
 * Read-only graph queries over `notes` and `note_links`. Edge writes live in
 * `links.repository.ts`.
 */

interface GraphNodeRow {
  id: string
  type: NoteType
  title: string
  tags: Tag[] | null
}

interface GraphEdgeRow {
  id: string
  source_note_id: string
  target_note_id: string
  type: EdgeType
  score: number | null
}

/**
 * Node projection: just enough for the graph view. `json_agg` is wrapped in
 * `coalesce`/`filter` so a note without tags yields `[]`, not `[null]`.
 */
const GRAPH_NODE_COLUMNS = `
  n.id, n.type, n.title,
  coalesce(
    json_agg(json_build_object('id', t.id, 'name', t.name) order by t.name)
      filter (where t.id is not null),
    '[]'
  ) as tags
`

const GRAPH_NODE_GROUP_JOINS = `
  left join note_tags nt on nt.note_id = n.id
  left join tags t on t.id = nt.tag_id
`

function mapNode(row: GraphNodeRow): GraphNode {
  return { id: row.id, type: row.type, title: row.title, tags: row.tags ?? [] }
}

function mapEdge(row: GraphEdgeRow): GraphEdge {
  return {
    id: row.id,
    source: row.source_note_id,
    target: row.target_note_id,
    type: row.type,
    score: row.score,
  }
}

export interface GraphNodeFilter {
  type?: NoteType
  tag?: string
  limit: number
}

/**
 * Nodes for the graph view: the user's notes, newest first, capped at `limit`.
 * `tag` filtering uses `exists` so it never changes the join cardinality and
 * `group by n.id` stays valid.
 */
export async function listGraphNodes(
  userId: string,
  filter: GraphNodeFilter,
): Promise<GraphNode[]> {
  const values: unknown[] = [userId]
  const conditions: string[] = ['n.user_id = $1']

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

  const { rows } = await getPool().query<GraphNodeRow>(
    `select ${GRAPH_NODE_COLUMNS}
     from notes n
     ${GRAPH_NODE_GROUP_JOINS}
     where ${conditions.join(' and ')}
     group by n.id
     order by n.updated_at desc, n.id desc
     limit ${limit}`,
    values,
  )

  return rows.map(mapNode)
}

/** Hydrates a known set of note ids (e.g. the result of a neighbor walk). */
export async function listGraphNodesByIds(userId: string, ids: string[]): Promise<GraphNode[]> {
  if (ids.length === 0) {
    return []
  }

  const { rows } = await getPool().query<GraphNodeRow>(
    `select ${GRAPH_NODE_COLUMNS}
     from notes n
     ${GRAPH_NODE_GROUP_JOINS}
     where n.user_id = $1 and n.id = any($2::uuid[])
     group by n.id
     order by n.updated_at desc, n.id desc`,
    [userId, ids],
  )

  return rows.map(mapNode)
}

export interface GraphEdgeFilter {
  /** Drop `suggested` edges scoring below this; explicit edges are kept. */
  minScore?: number
}

/**
 * Edges whose source and target are both in `nodeIds`. When `minScore` is set,
 * low-confidence suggested edges are dropped but explicit ones always survive
 * (a wiki link is not a confidence judgement).
 */
export async function listGraphEdges(
  userId: string,
  nodeIds: string[],
  filter: GraphEdgeFilter = {},
): Promise<GraphEdge[]> {
  if (nodeIds.length === 0) {
    return []
  }

  const { rows } = await getPool().query<GraphEdgeRow>(
    `select l.id, l.source_note_id, l.target_note_id, l.type, l.score
     from note_links l
     where l.user_id = $1
       and l.source_note_id = any($2::uuid[])
       and l.target_note_id = any($2::uuid[])
       and ($3::real is null or l.type = 'explicit' or l.score >= $3::real)`,
    [userId, nodeIds, filter.minScore ?? null],
  )

  return rows.map(mapEdge)
}

/**
 * Note ids reachable from `noteId` within `depth` hops, followed in both
 * directions (a graph view treats links as undirected).
 *
 * The step is two `union` branches — outgoing edges related by
 * `source_note_id`, incoming edges by `target_note_id` — instead of one join
 * whose condition is an `or` of both columns: a branch that relates on a single
 * column can use that column's index, which an `or` cannot. The branches live
 * in a lateral subquery because Postgres allows exactly one self-reference in
 * the recursive term; the lateral correlation (`r.note_id`) keeps each branch's
 * predicate on one column and therefore index-usable.
 *
 * `union` de-duplicates `(note_id, depth)` rows across iterations, so a cycle
 * (or two paths to the same note) terminates within the depth bound. The start
 * id is always included.
 */
export async function collectNeighborNoteIds(
  userId: string,
  noteId: string,
  depth: number,
): Promise<string[]> {
  const { rows } = await getPool().query<{ note_id: string }>(
    `with recursive reach(note_id, depth) as (
       select $2::uuid, 0
       union
       select next_note.note_id, r.depth + 1
       from reach r
       cross join lateral (
         select l.target_note_id as note_id
         from note_links l
         where l.user_id = $1 and l.source_note_id = r.note_id
         union
         select l.source_note_id as note_id
         from note_links l
         where l.user_id = $1 and l.target_note_id = r.note_id
       ) as next_note
       where r.depth < $3
     )
     select distinct note_id from reach`,
    [userId, noteId, depth],
  )

  return rows.map((row) => row.note_id)
}
