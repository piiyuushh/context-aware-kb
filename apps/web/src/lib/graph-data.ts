import type { EdgeType, GraphResponse, NoteType } from '@kb/shared'

/**
 * Canvas-facing graph model. Separate from the API's `GraphNode`/`GraphEdge`
 * (which stay the wire contract): here a node carries the `degree` we compute
 * for sizing, and a link carries its endpoints as ids until force-graph
 * replaces them with node references during simulation.
 */
export type GraphNodeModel = {
  id: string
  title: string
  type: NoteType
  tags: GraphResponse['nodes'][number]['tags']
  degree: number
}

export type GraphLinkModel = {
  id: string
  source: string
  target: string
  type: EdgeType
  score: number | null
}

export type GraphModel = {
  nodes: GraphNodeModel[]
  links: GraphLinkModel[]
}

/** Node fill colours, kept in sync with the `@theme` tokens in globals.css. */
export const NODE_TYPE_COLOR: Record<NoteType, string> = {
  doc: '#7dd3fc',
  snippet: '#8be0b0',
  note: '#a3b4c8',
}

export const NODE_TYPE_LABEL: Record<NoteType, string> = {
  doc: 'Doc',
  snippet: 'Snippet',
  note: 'Note',
}

/** Node radius grows a little with connectivity, capped so hubs stay readable. */
export function nodeRadius(degree: number): number {
  return 3 + Math.min(6, Math.sqrt(Math.max(0, degree)))
}

export function truncateLabel(title: string, maxLength = 32): string {
  return title.length > maxLength ? `${title.slice(0, maxLength - 1)}…` : title
}

/**
 * Builds the canvas model from an API response. Edges whose endpoints are not
 * in `nodes` are dropped: the API already scopes edges to the node set, but a
 * dangling edge would crash the force layout, so it is filtered defensively.
 * Node `degree` counts each incident edge once.
 */
export function buildGraphModel(response: GraphResponse): GraphModel {
  const nodeIds = new Set(response.nodes.map((node) => node.id))
  const degree = new Map<string, number>()
  const links: GraphLinkModel[] = []

  for (const edge of response.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue
    }

    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    links.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      score: edge.score,
    })
  }

  const nodes = response.nodes.map<GraphNodeModel>((node) => ({
    id: node.id,
    title: node.title,
    type: node.type,
    tags: node.tags,
    degree: degree.get(node.id) ?? 0,
  }))

  return { nodes, links }
}

/**
 * Ids of nodes whose title contains `query` (case-insensitive), or null when
 * the query is blank. Null means "no active search"; the canvas dims nothing.
 */
export function findMatchingNodeIds(
  nodes: readonly { id: string; title: string }[],
  query: string,
): Set<string> | null {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return null
  }

  const matches = new Set<string>()
  for (const node of nodes) {
    if (node.title.toLowerCase().includes(needle)) {
      matches.add(node.id)
    }
  }

  return matches
}
