import { z } from 'zod'

/**
 * Every API error response has this shape.
 * See docs/API.md.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>
