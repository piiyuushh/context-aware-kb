import {
  graphNeighborsParamsSchema,
  graphNeighborsQuerySchema,
  graphNeighborsResponseSchema,
  graphQuerySchema,
  graphResponseSchema,
} from '@kb/shared'
import { parseOrThrow } from '../lib/validate'
import { requireUserId } from '../middleware/require-auth'
import { getGraph, getNeighbors } from '../services/graph.service'
import type { GraphNeighborsResponse, GraphResponse } from '@kb/shared'
import type { Request, Response } from 'express'

/** `GET /api/v1/graph` — nodes and edges, with tag/type/score filters. */
export async function getGraphHandler(req: Request, res: Response<GraphResponse>): Promise<void> {
  const query = parseOrThrow(graphQuerySchema, req.query)
  const graph = await getGraph(requireUserId(req), query)

  res.status(200).json(graphResponseSchema.parse(graph))
}

/** `GET /api/v1/graph/:noteId/neighbors` — the subgraph within N hops. */
export async function getNeighborsHandler(
  req: Request,
  res: Response<GraphNeighborsResponse>,
): Promise<void> {
  const { noteId } = parseOrThrow(graphNeighborsParamsSchema, req.params)
  const { depth } = parseOrThrow(graphNeighborsQuerySchema, req.query)
  const graph = await getNeighbors(requireUserId(req), noteId, depth)

  res.status(200).json(graphNeighborsResponseSchema.parse(graph))
}
