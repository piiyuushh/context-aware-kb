import {
  attachTagInputSchema,
  noteIdParamsSchema,
  noteTagParamsSchema,
  tagListResponseSchema,
  tagResponseSchema,
} from '@kb/shared'
import { parseOrThrow } from '../lib/validate'
import { requireUserId } from '../middleware/require-auth'
import { addTagToNote, listTags, removeTagFromNote } from '../services/tags.service'
import type { TagListResponse, TagResponse } from '@kb/shared'
import type { Request, Response } from 'express'

/** `GET /api/v1/tags` */
export async function listTagsHandler(req: Request, res: Response<TagListResponse>): Promise<void> {
  const tags = await listTags(requireUserId(req))

  res.status(200).json(tagListResponseSchema.parse({ tags }))
}

/** `POST /api/v1/notes/:id/tags` — attaches (or creates then attaches) a tag. */
export async function addTagHandler(req: Request, res: Response<TagResponse>): Promise<void> {
  const { id } = parseOrThrow(noteIdParamsSchema, req.params)
  const input = parseOrThrow(attachTagInputSchema, req.body)
  const tag = await addTagToNote(requireUserId(req), id, input.name)

  res.status(201).json(tagResponseSchema.parse({ tag }))
}

/** `DELETE /api/v1/notes/:id/tags/:tagId` */
export async function removeTagHandler(req: Request, res: Response): Promise<void> {
  const { id, tagId } = parseOrThrow(noteTagParamsSchema, req.params)
  await removeTagFromNote(requireUserId(req), id, tagId)

  res.status(204).send()
}
