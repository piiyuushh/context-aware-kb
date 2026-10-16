import { healthResponseSchema } from '@kb/shared'
import { getHealth } from '../services/health.service'
import type { HealthResponse } from '@kb/shared'
import type { Request, Response } from 'express'

/** `GET /api/v1/health` */
export function getHealthHandler(_req: Request, res: Response<HealthResponse>): void {
  // Parsed, not asserted: a drift from the shared contract fails loudly.
  const health = healthResponseSchema.parse(getHealth())

  res.status(200).json(health)
}
