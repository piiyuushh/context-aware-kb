import { z } from 'zod'
import { noteTypeSchema } from './note'
import { tagSchema } from './tag'

/**
 * Graph edge kinds. Mirrors the `note_links.type` check constraint in
 * docs/DATABASE.md: `explicit` edges come from `[[wiki links]]`, `suggested`
 * edges are computed from shared tags and text similarity.
 */
export const edgeTypeSchema = z.enum(['explicit', 'suggested'])
export type EdgeType = z.infer<typeof edgeTypeSchema>

/**
 * A node in the knowledge graph. Deliberately lighter than `noteSchema`: the
 * graph view only needs identity, kind, label and tag colouring, not the body.
 */
export const graphNodeSchema = z.object({
  id: z.uuid(),
  type: noteTypeSchema,
  title: z.string(),
  tags: z.array(tagSchema),
})

export type GraphNode = z.infer<typeof graphNodeSchema>

/**
 * A directed graph edge. `source`/`target` are note ids. `score` is the
 * suggestion confidence in `[0, 1]` for `suggested` edges and null for
 * `explicit` ones (a wiki link is either present or not).
 */
export const graphEdgeSchema = z.object({
  id: z.uuid(),
  source: z.uuid(),
  target: z.uuid(),
  type: edgeTypeSchema,
  score: z.number().nullable(),
})

export type GraphEdge = z.infer<typeof graphEdgeSchema>

export const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
})

export type GraphResponse = z.infer<typeof graphResponseSchema>

export const DEFAULT_GRAPH_LIMIT = 200
export const MAX_GRAPH_LIMIT = 2000

/**
 * `GET /graph` query. `limit` caps the number of nodes (edges are then the
 * links between those nodes). `minScore` drops low-confidence `suggested`
 * edges; explicit edges are always kept. Both arrive as strings, so they are
 * coerced.
 */
export const graphQuerySchema = z.object({
  tag: z.string().trim().min(1).max(50).optional(),
  type: noteTypeSchema.optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_GRAPH_LIMIT).default(DEFAULT_GRAPH_LIMIT),
})

export type GraphQuery = z.infer<typeof graphQuerySchema>

export const MAX_NEIGHBOR_DEPTH = 3

/** Route params for `/graph/:noteId/neighbors`. */
export const graphNeighborsParamsSchema = z.object({
  noteId: z.uuid(),
})

export type GraphNeighborsParams = z.infer<typeof graphNeighborsParamsSchema>

/** `GET /graph/:noteId/neighbors` query. `depth` is 1-3 hops, default 1. */
export const graphNeighborsQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(MAX_NEIGHBOR_DEPTH).default(1),
})

export type GraphNeighborsQuery = z.infer<typeof graphNeighborsQuerySchema>

/** Neighbors return the same `{ nodes, edges }` shape as the full graph. */
export const graphNeighborsResponseSchema = graphResponseSchema

export type GraphNeighborsResponse = z.infer<typeof graphNeighborsResponseSchema>
