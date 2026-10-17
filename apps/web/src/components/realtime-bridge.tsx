'use client'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  API_PREFIX,
  SSE_EVENT_TYPES,
  graphUpdatedEventSchema,
  noteUpdatedEventSchema,
  syncProgressEventSchema,
  type SseEventType,
  type SyncJob,
} from '@kb/shared'

import type { ResponseParser } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { SYNC_JOB_SETTLE_MS, refreshAfterImport } from '@/lib/queries'

/**
 * `GET /events`, reached through the Next.js rewrite. EventSource requests are
 * same-origin, so the session cookie is sent with them.
 */
const EVENTS_PATH = `${API_PREFIX}/events`

/** Validates one `data:` frame against its shared schema; null when it is junk. */
function readEventData<T>(raw: string, parser: ResponseParser<T>): T | null {
  try {
    return parser.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

type BridgeContext = {
  queryClient: QueryClient
  /** Queues the extra refresh owed after a finished import's follow-up jobs run. */
  scheduleSettleRefresh: () => void
}

/**
 * One handler per stream event. Keyed by the shared event names, so adding an
 * event to the contract fails the build here until it is handled.
 */
const EVENT_HANDLERS: Record<SseEventType, (context: BridgeContext, raw: string) => void> = {
  /*
   * Another tab (or a background job) touched a note. A delete drops the note's
   * own queries so nothing renders a tombstone; both cases revalidate the lists,
   * and an edit re-reads that note's detail.
   */
  'note.updated': ({ queryClient }, raw) => {
    const payload = readEventData(raw, noteUpdatedEventSchema)
    if (payload === null) return

    if (payload.action === 'deleted') {
      queryClient.removeQueries({ queryKey: queryKeys.noteDetail(payload.noteId) })
      queryClient.removeQueries({ queryKey: queryKeys.noteBacklinks(payload.noteId) })
      queryClient.removeQueries({ queryKey: queryKeys.noteVersions(payload.noteId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot })
      void queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot })
      return
    }

    void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot })
    void queryClient.invalidateQueries({ queryKey: queryKeys.noteDetail(payload.noteId) })
  },

  /** The process-note job rebuilt a note's tags and edges. */
  'graph.updated': ({ queryClient }, raw) => {
    const payload = readEventData(raw, graphUpdatedEventSchema)
    if (payload === null) return
    void queryClient.invalidateQueries({ queryKey: queryKeys.graphRoot })
    void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
  },

  /** Live progress for a GitHub import, so the panel needs no polling. */
  'sync.progress': ({ queryClient, scheduleSettleRefresh }, raw) => {
    const payload = readEventData(raw, syncProgressEventSchema)
    if (payload === null) return
    const job = payload.job
    queryClient.setQueryData<SyncJob>(queryKeys.syncJob(job.id), job)
    if (job.status !== 'done') return
    refreshAfterImport(queryClient)
    // The import finishes before the API's per-file process-note jobs attach
    // tags and edges (the same reason `useSyncJob` waits before settling).
    scheduleSettleRefresh()
  },
}

/**
 * Subscribes to the API's SSE stream and folds every event into the query
 * cache, so two tabs (or a background import) converge without polling. Mounted
 * inside `<AuthGuard>`, so it only runs with a session.
 *
 * Reconnection is the browser's job — EventSource retries on its own using the
 * `retry:` the API sends — so there is deliberately no custom retry loop.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Absent while rendering on the server and under jsdom in unit tests.
    if (typeof EventSource === 'undefined') return

    const source = new EventSource(EVENTS_PATH)
    const settleTimers: number[] = []
    const context: BridgeContext = {
      queryClient,
      scheduleSettleRefresh: () => {
        settleTimers.push(
          window.setTimeout(() => refreshAfterImport(queryClient), SYNC_JOB_SETTLE_MS),
        )
      },
    }

    // SSE names the event, so each one gets its own listener instead of a
    // switch on a tag inside the payload.
    for (const type of SSE_EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        EVENT_HANDLERS[type](context, (event as MessageEvent<string>).data)
      })
    }

    return () => {
      for (const timer of settleTimers) window.clearTimeout(timer)
      source.close()
    }
  }, [queryClient])

  return null
}
