import {
  collectNeighborNoteIds,
  listGraphEdges,
  listGraphNodes,
  listGraphNodesByIds,
} from '../repositories/graph.repository'
import { getNote } from './notes.service'
import type { GraphEdge, GraphNode, GraphQuery } from '@kb/shared'

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * The whole knowledge graph for a user: up to `limit` nodes (newest first)
 * and the edges between them. Edges touching a node outside the node set are
 * omitted, so the result is always a self-contained subgraph.
 */
export async function getGraph(userId: string, query: GraphQuery): Promise<Graph> {
  const nodes = await listGraphNodes(userId, {
    type: query.type,
    tag: query.tag,
    limit: query.limit,
  })

  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const edges = await listGraphEdges(
    userId,
    nodes.map((node) => node.id),
    { minScore: query.minScore },
  )

  return { nodes, edges }
}

/**
 * The local subgraph around one note, `depth` hops out in both directions.
 * The note must exist and be owned by the caller (404 otherwise).
 */
export async function getNeighbors(userId: string, noteId: string, depth: number): Promise<Graph> {
  await getNote(userId, noteId)

  const nodeIds = await collectNeighborNoteIds(userId, noteId, depth)
  const nodes = await listGraphNodesByIds(userId, nodeIds)
  const edges = await listGraphEdges(userId, nodeIds, {})

  return { nodes, edges }
}
