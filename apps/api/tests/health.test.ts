import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { API_PREFIX, healthResponseSchema } from '@kb/shared'
import { createApp } from '../src/app'
import { SERVICE_NAME, SERVICE_VERSION } from '../src/constants'

const HEALTH_URL = `${API_PREFIX}/health`

describe(`GET ${HEALTH_URL}`, () => {
  it('responds 200 with a body that parses against healthResponseSchema', async () => {
    const response = await request(createApp()).get(HEALTH_URL)

    expect(response.status).toBe(200)

    const health = healthResponseSchema.parse(response.body)
    expect(health.status).toBe('ok')
    expect(health.service).toBe(SERVICE_NAME)
    expect(health.version).toBe(SERVICE_VERSION)
    expect(health.uptime).toBeGreaterThanOrEqual(0)
    expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp)
  })

  it('responds with JSON content type', async () => {
    const response = await request(createApp()).get(HEALTH_URL)

    expect(response.headers['content-type']).toMatch(/^application\/json/)
  })

  it('does not advertise the framework in an x-powered-by header', async () => {
    const response = await request(createApp()).get(HEALTH_URL)

    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})
