import { z } from 'zod'
import { processNote } from '../services/links.service'

/** Payload of a `process-note` job. */
export interface ProcessNoteJobData {
  userId: string
  noteId: string
}

/**
 * Job payloads cross a process boundary, so they are untrusted on the way in
 * and parsed like any other input. A bad payload throws (rather than being
 * ignored) so pg-boss retries it and the failure is visible.
 */
export const processNoteJobSchema = z.object({
  userId: z.uuid(),
  noteId: z.uuid(),
})

export async function handleProcessNote(data: unknown): Promise<void> {
  const { userId, noteId } = processNoteJobSchema.parse(data)

  await processNote(userId, noteId)
}

/**
 * pg-boss batch handler for the `process-note` queue. Jobs arrive in small
 * batches; processing them in order keeps a note's edge rewrite serial.
 */
export async function processNoteWorker(jobs: { data: unknown }[]): Promise<void> {
  for (const job of jobs) {
    await handleProcessNote(job.data)
  }
}
