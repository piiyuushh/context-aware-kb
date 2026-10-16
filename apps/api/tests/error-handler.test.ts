import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { API_PREFIX, errorResponseSchema } from '@kb/shared'
import { createApp } from '../src/app'

describe('error handler', () => {
  it('maps a malformed JSON body to a 400 error envelope', async () => {
    const response = await request(createApp())
      .post(`${API_PREFIX}/does-not-exist`)
      .set('content-type', 'application/json')
      .send('{"broken":')

    expect(response.status).toBe(400)

    const body = errorResponseSchema.parse(response.body)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('never leaks a stack trace in an error response', async () => {
    const response = await request(createApp())
      .post(`${API_PREFIX}/does-not-exist`)
      .set('content-type', 'application/json')
      .send('{"broken":')

    expect(Object.keys(response.body)).toEqual(['error'])
    expect(response.text).not.toMatch(/\bat\s+\w+.*:\d+:\d+/) // no "at fn (file:line:col)"
  })
})
