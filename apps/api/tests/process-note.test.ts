import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleProcessNote, processNoteWorker } from '../src/jobs/process-note'
import { processNote } from '../src/services/links.service'

vi.mock('../src/services/links.service', () => ({
  processNote: vi.fn(),
}))

const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.mocked(processNote).mockReset()
  vi.mocked(processNote).mockResolvedValue({ explicitEdges: 0, suggestedEdges: 0 })
})

describe('handleProcessNote', () => {
  it('validates the payload and runs the link pipeline', async () => {
    await handleProcessNote({ userId: USER_ID, noteId: NOTE_ID })

    expect(processNote).toHaveBeenCalledWith(USER_ID, NOTE_ID)
  })

  it('rejects a malformed payload before touching the pipeline', async () => {
    await expect(handleProcessNote({ userId: 'not-a-uuid', noteId: NOTE_ID })).rejects.toThrow()
    await expect(handleProcessNote(null)).rejects.toThrow()

    expect(processNote).not.toHaveBeenCalled()
  })
})

describe('processNoteWorker', () => {
  it('processes every job in the batch in order', async () => {
    await processNoteWorker([
      { data: { userId: USER_ID, noteId: NOTE_ID } },
      { data: { userId: USER_ID, noteId: OTHER_ID } },
    ])

    expect(processNote).toHaveBeenNthCalledWith(1, USER_ID, NOTE_ID)
    expect(processNote).toHaveBeenNthCalledWith(2, USER_ID, OTHER_ID)
  })
})
