import { z } from 'zod'
import { syncJobSchema } from './github'

/**
 * Server-Sent Events contract for `GET /events` (docs/API.md "Realtime").
 *
 * The event name is the SSE `event:` field and the payload is the JSON `data:`
 * field, so a browser subscribes with `addEventListener(<name>, …)` and never
 * has to switch on a tag inside the body. The frontend parses each payload with
 * the matching schema below, so a backend drift fails loudly in dev.
 */
export const sseEventTypeSchema = z.enum(['note.updated', 'graph.updated', 'sync.progress'])

export type SseEventType = z.infer<typeof sseEventTypeSchema>

/** Every event name the stream can emit, for tests and the frontend listener list. */
export const SSE_EVENT_TYPES = sseEventTypeSchema.options

/** A note was created, edited, or deleted by this user. */
export const noteUpdatedEventSchema = z.object({
  noteId: z.uuid(),
  action: z.enum(['created', 'updated', 'deleted']),
})

export type NoteUpdatedEvent = z.infer<typeof noteUpdatedEventSchema>

/**
 * A note's derived data (tags and `note_links` edges) was rebuilt by the
 * `process-note` job, so any graph the client is showing may be stale.
 */
export const graphUpdatedEventSchema = z.object({
  noteId: z.uuid(),
})

export type GraphUpdatedEvent = z.infer<typeof graphUpdatedEventSchema>

/** A background GitHub import advanced or reached a terminal state. */
export const syncProgressEventSchema = z.object({
  job: syncJobSchema,
})

export type SyncProgressEvent = z.infer<typeof syncProgressEventSchema>

/** One event as it is published internally (name + validated payload). */
export const sseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('note.updated'), data: noteUpdatedEventSchema }),
  z.object({ type: z.literal('graph.updated'), data: graphUpdatedEventSchema }),
  z.object({ type: z.literal('sync.progress'), data: syncProgressEventSchema }),
])

export type SseEvent = z.infer<typeof sseEventSchema>

/**
 * Comment frame cadence the API writes to keep idle connections alive through
 * proxies. Comments carry no `event:`/`data:`, so browsers discard them.
 */
export const SSE_KEEPALIVE_MS = 25_000

/** Reconnect delay (ms) the API suggests via the SSE `retry:` field. */
export const SSE_RETRY_MS = 3_000
