import type { NoteUpdatedEvent, SseEvent, SyncJob } from '@kb/shared'

/**
 * In-process fan-out behind `GET /events` (docs/ARCHITECTURE.md "Realtime").
 *
 * Services publish once a write has landed; the SSE controller subscribes for
 * the session user and streams whatever arrives. Listeners are keyed by user id,
 * so a stream only ever sees its own account's events.
 *
 * Scope: a single Node process. Subscribers on another API instance would not
 * receive an event published here — acceptable for Phase 5 (one API process).
 * Scaling the API horizontally needs a cross-process bus (Postgres
 * `LISTEN`/`NOTIFY`, or Redis), not a different shape of this module.
 */

/** Receives every event published for one user. */
export type UserEventListener = (event: SseEvent) => void

const listenersByUser = new Map<string, Set<UserEventListener>>()

/**
 * Registers `listener` for `userId` and returns the unsubscribe function. The
 * returned function is safe to call more than once; the last unsubscribe drops
 * the user's entry so an idle account keeps no state.
 */
export function subscribeToUserEvents(userId: string, listener: UserEventListener): () => void {
  const listeners = listenersByUser.get(userId) ?? new Set<UserEventListener>()
  listeners.add(listener)
  listenersByUser.set(userId, listeners)

  return () => {
    listeners.delete(listener)

    if (listeners.size === 0) {
      listenersByUser.delete(userId)
    }
  }
}

/**
 * Delivers `event` to every listener of `userId`. A listener that throws is
 * logged and skipped, so one dead stream cannot break the others (or the
 * service that published). Iteration runs over a copy, so a listener that
 * unsubscribes while receiving does not disturb the loop.
 */
export function publishToUserEvents(userId: string, event: SseEvent): void {
  const listeners = listenersByUser.get(userId)
  if (!listeners) {
    return
  }

  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch (error) {
      console.error('[api] user event listener failed', error)
    }
  }
}

/** `note.updated` — a note was created, edited, or deleted (docs/API.md "Realtime"). */
export function publishNoteUpdated(userId: string, data: NoteUpdatedEvent): void {
  publishToUserEvents(userId, { type: 'note.updated', data })
}

/** `graph.updated` — a note's edges/tags were rebuilt by the `process-note` job. */
export function publishGraphUpdated(userId: string, noteId: string): void {
  publishToUserEvents(userId, { type: 'graph.updated', data: { noteId } })
}

/** `sync.progress` — a GitHub import advanced or reached a terminal state. */
export function publishSyncProgress(userId: string, job: SyncJob): void {
  publishToUserEvents(userId, { type: 'sync.progress', data: { job } })
}
