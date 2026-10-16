import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { API_PREFIX, errorResponseSchema } from '@kb/shared'
import { createApp } from '../src/app'

describe('unmatched routes', () => {
  it('responds 404 with the shared error envelope as JSON', async () => {
    const response = await request(createApp()).get(`${API_PREFIX}/does-not-exist`)

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toMatch(/^application\/json/)

    const body = errorResponseSchema.parse(response.body)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toContain('GET')
  })

  it('answers 404 for paths outside the API prefix too', async () => {
    const response = await request(createApp()).get('/nope')

    expect(response.status).toBe(404)

    const body = errorResponseSchema.parse(response.body)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
