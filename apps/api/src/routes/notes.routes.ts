import { Router } from 'express'
import {
  createNoteHandler,
  deleteNoteHandler,
  exportNoteHandler,
  getBacklinksHandler,
  getNoteHandler,
  listNoteVersionsHandler,
  listNotesHandler,
  restoreNoteVersionHandler,
  updateNoteHandler,
} from '../controllers/notes.controller'
import { addTagHandler, removeTagHandler } from '../controllers/tags.controller'
import { requireAuth } from '../middleware/require-auth'

/** Mounted at `/notes` by the v1 router. Every route requires a session. */
export const notesRouter: Router = Router()

notesRouter.use(requireAuth)

notesRouter.get('/', listNotesHandler)
notesRouter.post('/', createNoteHandler)
notesRouter.get('/:id', getNoteHandler)
notesRouter.patch('/:id', updateNoteHandler)
notesRouter.delete('/:id', deleteNoteHandler)
notesRouter.get('/:id/backlinks', getBacklinksHandler)
notesRouter.get('/:id/versions', listNoteVersionsHandler)
notesRouter.post('/:id/versions/:versionId/restore', restoreNoteVersionHandler)
notesRouter.get('/:id/export', exportNoteHandler)

// Tag membership is addressed under the note it applies to (docs/API.md "Tags").
notesRouter.post('/:id/tags', addTagHandler)
notesRouter.delete('/:id/tags/:tagId', removeTagHandler)
