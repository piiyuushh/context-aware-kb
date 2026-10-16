/**
 * Augments the Express request with the authenticated user id. Set by the
 * `requireAuth` middleware and read with `requireUserId`.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export {}
