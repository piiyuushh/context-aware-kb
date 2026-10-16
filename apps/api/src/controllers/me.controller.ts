import { meResponseSchema } from '@kb/shared'
import { requireUserId } from '../middleware/require-auth'
import { getSessionUser } from '../services/users.service'
import type { MeResponse } from '@kb/shared'
import type { Request, Response } from 'express'

/** `GET /api/v1/me` — the authenticated user's profile. */
export async function getMeHandler(req: Request, res: Response<MeResponse>): Promise<void> {
  const user = await getSessionUser(requireUserId(req))

  // Parsed, not asserted: drift from the shared contract fails loudly.
  const body = meResponseSchema.parse({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
  })

  res.status(200).json(body)
}
