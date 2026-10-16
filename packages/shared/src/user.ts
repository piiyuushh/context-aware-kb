import { z } from 'zod'

/** A user as returned by the API. Matches docs/API.md (`GET /me`). */
export const userSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.email().nullable(),
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
})

export type User = z.infer<typeof userSchema>

export const meResponseSchema = z.object({
  user: userSchema,
})

export type MeResponse = z.infer<typeof meResponseSchema>
