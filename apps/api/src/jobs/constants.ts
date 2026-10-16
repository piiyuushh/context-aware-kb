/**
 * Queue names. Kept in their own module so the boss bootstrap, the enqueue
 * helper and the worker can share them without an import cycle.
 */

/** Per-note link pipeline: parse markdown, upsert edges, suggest edges. */
export const PROCESS_NOTE_QUEUE = 'process-note'
