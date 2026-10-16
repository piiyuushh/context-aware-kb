import { describe, expect, it } from 'vitest'

import { healthResponseSchema } from './health'

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      version: '0.0.0',
      uptime: 12.5,
      timestamp: new Date().toISOString(),
    })

    expect(result.success).toBe(true)
  })

  it('rejects an unknown status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'down',
      service: 'api',
      version: '0.0.0',
      uptime: 0,
      timestamp: new Date().toISOString(),
    })

    expect(result.success).toBe(false)
  })
})
