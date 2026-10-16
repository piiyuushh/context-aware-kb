import { HttpError } from '../errors'
import { findUserById } from '../repositories/users.repository'
import type { User } from '../repositories/users.repository'

/**
 * Loads the session user. A valid session whose user row has vanished (e.g.
 * account deleted) is treated as unauthenticated rather than a 404.
 */
export async function getSessionUser(userId: string): Promise<User> {
  const user = await findUserById(userId)
  if (!user) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Session user no longer exists')
  }

  return user
}
