import { getBoss } from './boss'
import { PROCESS_NOTE_QUEUE } from './constants'
import type { ProcessNoteJobData } from './process-note'

/**
 * Enqueues the per-note link pipeline.
 *
 * Best-effort by design: links, tags and suggestions are derived data, so a
 * queue or database hiccup must not fail the note write that triggered it. The
 * failure is logged and the note simply keeps its previous edges until the
 * next save (or a manual re-process). Rapid saves of one note collapse into a
 * single queued job via `singletonKey`, so a burst of edits costs one run.
 */
export async function enqueueProcessNote(data: ProcessNoteJobData): Promise<void> {
  try {
    await getBoss().send(PROCESS_NOTE_QUEUE, data, {
      singletonKey: data.noteId,
      retryLimit: 3,
      retryBackoff: true,
    })
  } catch (error) {
    console.error('[api] failed to enqueue process-note', error)
  }
}
