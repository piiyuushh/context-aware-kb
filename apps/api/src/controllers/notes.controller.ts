import {
  backlinksResponseSchema,
  createNoteInputSchema,
  listNotesQuerySchema,
  noteIdParamsSchema,
  noteListResponseSchema,
  noteResponseSchema,
  updateNoteInputSchema,
} from '@kb/shared'
import { parseOrThrow } from '../lib/validate'
import { requireUserId } from '../middleware/require-auth'
import {
  createNote,
  deleteNote,
  getBacklinks,
  getNote,
  listNotes,
  updateNote,
} from '../services/notes.service'
import type { BacklinksResponse, NoteListResponse, NoteResponse } from '@kb/shared'
import type { Request, Response } from 'express'

/** `GET /api/v1/notes` — cursor-paginated list with optional filters. */
export async function listNotesHandler(
  req: Request,
  res: Response<NoteListResponse>,
): Promise<void> {
  const query = parseOrThrow(listNotesQuerySchema, req.query)
  const { notes, nextCursor } = await listNotes(requireUserId(req), query)

  res.status(200).json(noteListResponseSchema.parse({ notes, nextCursor }))
}

/** `POST /api/v1/notes` */
export async function createNoteHandler(req: Request, res: Response<NoteResponse>): Promise<void> {
  const input = parseOrThrow(createNoteInputSchema, req.body)
  const note = await createNote(requireUserId(req), input)

  res.status(201).json(noteResponseSchema.parse({ note }))
}

/** `GET /api/v1/notes/:id` */
export async function getNoteHandler(req: Request, res: Response<NoteResponse>): Promise<void> {
  const { id } = parseOrThrow(noteIdParamsSchema, req.params)
  const note = await getNote(requireUserId(req), id)

  res.status(200).json(noteResponseSchema.parse({ note }))
}

/** `PATCH /api/v1/notes/:id` */
export async function updateNoteHandler(req: Request, res: Response<NoteResponse>): Promise<void> {
  const { id } = parseOrThrow(noteIdParamsSchema, req.params)
  const input = parseOrThrow(updateNoteInputSchema, req.body)
  const note = await updateNote(requireUserId(req), id, input)

  res.status(200).json(noteResponseSchema.parse({ note }))
}

/** `DELETE /api/v1/notes/:id` */
export async function deleteNoteHandler(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(noteIdParamsSchema, req.params)
  await deleteNote(requireUserId(req), id)

  res.status(204).send()
}

/** `GET /api/v1/notes/:id/backlinks` */
export async function getBacklinksHandler(
  req: Request,
  res: Response<BacklinksResponse>,
): Promise<void> {
  const { id } = parseOrThrow(noteIdParamsSchema, req.params)
  const backlinks = await getBacklinks(requireUserId(req), id)

  res.status(200).json(backlinksResponseSchema.parse({ backlinks }))
}
