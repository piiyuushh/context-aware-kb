import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAPH_LIMIT,
  MAX_NEIGHBOR_DEPTH,
  graphNeighborsQuerySchema,
  graphQuerySchema,
  graphResponseSchema,
} from './graph'

const validGraph = {
  nodes: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'note',
      title: 'A note',
      tags: [{ id: '22222222-2222-4222-8222-222222222222', name: 'node' }],
    },
  ],
  edges: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      source: '11111111-1111-4111-8111-111111111111',
      target: '44444444-4444-4444-8444-444444444444',
      type: 'suggested',
      score: 0.42,
    },
  ],
}

describe('graphQuerySchema', () => {
  it('defaults limit and coerces minScore', () => {
    expect(graphQuerySchema.parse({}).limit).toBe(DEFAULT_GRAPH_LIMIT)
    expect(graphQuerySchema.parse({ limit: '10', minScore: '0.5' })).toMatchObject({
      limit: 10,
      minScore: 0.5,
    })
  })

  it('rejects an unknown type', () => {
    expect(graphQuerySchema.safeParse({ type: 'bookmark' }).success).toBe(false)
  })

  it('rejects an out-of-range minScore', () => {
    expect(graphQuerySchema.safeParse({ minScore: '-0.1' }).success).toBe(false)
    expect(graphQuerySchema.safeParse({ minScore: '1.1' }).success).toBe(false)
  })

  it('rejects an out-of-range limit', () => {
    expect(graphQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
  })
})

describe('graphNeighborsQuerySchema', () => {
  it('defaults depth to 1 and coerces it', () => {
    expect(graphNeighborsQuerySchema.parse({}).depth).toBe(1)
    expect(graphNeighborsQuerySchema.parse({ depth: '3' }).depth).toBe(3)
  })

  it('rejects a depth outside 1..MAX_NEIGHBOR_DEPTH', () => {
    expect(graphNeighborsQuerySchema.safeParse({ depth: '0' }).success).toBe(false)
    expect(
      graphNeighborsQuerySchema.safeParse({ depth: String(MAX_NEIGHBOR_DEPTH + 1) }).success,
    ).toBe(false)
  })
})

describe('graphResponseSchema', () => {
  it('accepts a well-formed graph', () => {
    expect(graphResponseSchema.safeParse(validGraph).success).toBe(true)
  })

  it('accepts a null score on an explicit edge', () => {
    const graph = {
      ...validGraph,
      edges: [{ ...validGraph.edges[0], type: 'explicit', score: null }],
    }

    expect(graphResponseSchema.safeParse(graph).success).toBe(true)
  })

  it('rejects an unknown edge type', () => {
    const graph = { ...validGraph, edges: [{ ...validGraph.edges[0], type: 'implied' }] }

    expect(graphResponseSchema.safeParse(graph).success).toBe(false)
  })
})
