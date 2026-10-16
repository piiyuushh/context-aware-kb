import { z } from 'zod'

export const API_PREFIX = '/api/v1'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  version: z.string(),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
