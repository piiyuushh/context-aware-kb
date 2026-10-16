import { z } from 'zod'

/** A tag as returned by the API. Matches `tags` in docs/DATABASE.md. */
export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
})

export type Tag = z.infer<typeof tagSchema>

export const tagListResponseSchema = z.object({
  tags: z.array(tagSchema),
})

export type TagListResponse = z.infer<typeof tagListResponseSchema>

export const tagResponseSchema = z.object({
  tag: tagSchema,
})

export type TagResponse = z.infer<typeof tagResponseSchema>

/** `POST /notes/:id/tags` body. Tags are created on first use. */
export const attachTagInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
})

export type AttachTagInput = z.infer<typeof attachTagInputSchema>

/** Route params for `/notes/:id/tags/:tagId`. */
export const noteTagParamsSchema = z.object({
  id: z.uuid(),
  tagId: z.uuid(),
})

export type NoteTagParams = z.infer<typeof noteTagParamsSchema>
