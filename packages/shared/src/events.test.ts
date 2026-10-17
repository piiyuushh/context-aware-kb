import { describe, expect, it } from 'vitest'
import {
  SSE_EVENT_TYPES,
  graphUpdatedEventSchema,
  noteUpdatedEventSchema,
  sseEventSchema,
  syncProgressEventSchema,
} from './events'

const NOTE_ID = '11111111-1111-4111-8111-111111111111'

describe('sseEventSchema', () => {
  it('accepts each known event', () => {
    const events = [
      { type: 'note.updated', data: { noteId: NOTE_ID, action: 'updated' } },
      { type: 'graph.updated', data: { noteId: NOTE_ID } },
      {
        type: 'sync.progress',
        data: {
          job: {
            id: NOTE_ID,
            kind: 'repo_import',
            status: 'running',
            stats: { total: 3, processed: 1, imported: 1, updated: 0, skipped: 0, failed: 0 },
            error: null,
            createdAt: new Date().toISOString(),
            finishedAt: null,
          },
        },
      },
    ]

    for (const event of events) {
      expect(sseEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it('rejects an unknown event name', () => {
    expect(
      sseEventSchema.safeParse({ type: 'note.deleted', data: { noteId: NOTE_ID } }).success,
    ).toBe(false)
  })

  it('rejects a note.updated payload with an unknown action', () => {
    expect(noteUpdatedEventSchema.safeParse({ noteId: NOTE_ID, action: 'renamed' }).success).toBe(
      false,
    )
  })

  it('rejects a graph.updated payload with a non-uuid note id', () => {
    expect(graphUpdatedEventSchema.safeParse({ noteId: 'not-a-uuid' }).success).toBe(false)
  })

  it('fills a partial sync job stats bag with zeroes', () => {
    const result = syncProgressEventSchema.parse({
      job: {
        id: NOTE_ID,
        kind: 'gist_import',
        status: 'queued',
        stats: {},
        error: null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
      },
    })

    expect(result.job.stats).toEqual({
      total: 0,
      processed: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    })
  })

  it('exposes every event name exactly once', () => {
    expect([...SSE_EVENT_TYPES].sort()).toEqual(['graph.updated', 'note.updated', 'sync.progress'])
  })
})
