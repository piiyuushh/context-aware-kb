import { z } from 'zod'
import { tagSchema } from './tag'

/** Note kinds. Mirrors the `notes.type` check constraint in docs/DATABASE.md. */
export const noteTypeSchema = z.enum(['doc', 'snippet', 'note'])
export type NoteType = z.infer<typeof noteTypeSchema>

/** Where a note came from. Mirrors the `notes.source` check constraint. */
export const noteSourceSchema = z.enum(['local', 'gist', 'repo'])
export type NoteSource = z.infer<typeof noteSourceSchema>

/**
 * A note as returned by the API. `sourceRef`/`sourceSha` are populated by
 * GitHub sync and are read-only to clients. `tags` is always present (possibly
 * empty) so the frontend never has to null-check it.
 */
export const noteSchema = z.object({
  id: z.uuid(),
  type: noteTypeSchema,
  title: z.string(),
  contentMd: z.string(),
  language: z.string().nullable(),
  source: noteSourceSchema,
  sourceRef: z.string().nullable(),
  sourceSha: z.string().nullable(),
  tags: z.array(tagSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Note = z.infer<typeof noteSchema>

export const noteResponseSchema = z.object({
  note: noteSchema,
})

export type NoteResponse = z.infer<typeof noteResponseSchema>

/** Cursor-paginated `GET /notes`. `nextCursor` is null on the last page. */
export const noteListResponseSchema = z.object({
  notes: z.array(noteSchema),
  nextCursor: z.string().nullable(),
})

export type NoteListResponse = z.infer<typeof noteListResponseSchema>

export const backlinksResponseSchema = z.object({
  backlinks: z.array(noteSchema),
})

export type BacklinksResponse = z.infer<typeof backlinksResponseSchema>

const titleSchema = z.string().trim().min(1).max(500)
const contentMdSchema = z.string().max(1_000_000)
const languageSchema = z.string().trim().min(1).max(50)

/** `POST /notes` body. `source*` fields are sync-managed, never client input. */
export const createNoteInputSchema = z.object({
  type: noteTypeSchema,
  title: titleSchema,
  contentMd: contentMdSchema.default(''),
  language: languageSchema.nullable().optional(),
})

export type CreateNoteInput = z.infer<typeof createNoteInputSchema>

/** `PATCH /notes/:id` body. At least one editable field is required. */
export const updateNoteInputSchema = z
  .object({
    type: noteTypeSchema.optional(),
    title: titleSchema.optional(),
    contentMd: contentMdSchema.optional(),
    language: languageSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  })

export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>

export const DEFAULT_NOTE_PAGE_SIZE = 20
export const MAX_NOTE_PAGE_SIZE = 100

/**
 * `GET /notes` query. `limit` arrives as a string, so it is coerced; an absent
 * value falls back to `DEFAULT_NOTE_PAGE_SIZE`.
 */
export const listNotesQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  type: noteTypeSchema.optional(),
  tag: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_NOTE_PAGE_SIZE).default(DEFAULT_NOTE_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
})

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>

/** Route params for `/notes/:id`. */
export const noteIdParamsSchema = z.object({
  id: z.uuid(),
})

export type NoteIdParams = z.infer<typeof noteIdParamsSchema>

/**
 * One stored revision of a note (docs/DATABASE.md `note_versions`). A version
 * captures the editable fields as they were *before* a client edit, so the
 * newest entry is the state the note is being changed away from, not the
 * current body.
 */
export const noteVersionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  contentMd: z.string(),
  language: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export type NoteVersion = z.infer<typeof noteVersionSchema>

export const noteVersionListResponseSchema = z.object({
  versions: z.array(noteVersionSchema),
})

export type NoteVersionListResponse = z.infer<typeof noteVersionListResponseSchema>

export const noteVersionResponseSchema = z.object({
  version: noteVersionSchema,
})

export type NoteVersionResponse = z.infer<typeof noteVersionResponseSchema>

export const DEFAULT_VERSION_PAGE_SIZE = 50
export const MAX_VERSION_PAGE_SIZE = 100

/** `GET /notes/:id/versions` query. `limit` arrives as a string, so it is coerced. */
export const listNoteVersionsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_VERSION_PAGE_SIZE)
    .default(DEFAULT_VERSION_PAGE_SIZE),
})

export type ListNoteVersionsQuery = z.infer<typeof listNoteVersionsQuerySchema>

/** Route params for `/notes/:id/versions/:versionId`. */
export const noteVersionParamsSchema = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
})

export type NoteVersionParams = z.infer<typeof noteVersionParamsSchema>

/** Most characters kept from a title when it becomes an export filename. */
const EXPORT_SLUG_MAX_LENGTH = 80

/**
 * Filename (no directory) a note downloads as, e.g. `postgres-tips.md`. The
 * title is slugified to ASCII so it is safe inside a `Content-Disposition`
 * header; an untitled or symbol-only title falls back to the note id.
 */
export function noteExportFilename(note: Pick<Note, 'id' | 'title'>): string {
  const slug = note.title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, EXPORT_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')

  return `${slug.length > 0 ? slug : note.id}.md`
}
