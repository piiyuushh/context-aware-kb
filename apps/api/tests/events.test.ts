import { describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import request from 'supertest'
import { API_PREFIX, SSE_RETRY_MS, sseEventSchema } from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import {
  publishGraphUpdated,
  publishNoteUpdated,
  publishSyncProgress,
  publishToUserEvents,
  subscribeToUserEvents,
} from '../src/events/bus'
import type { IncomingHttpHeaders } from 'node:http'
import type { SseEvent, SyncJob } from '@kb/shared'

const EVENTS_URL = `${API_PREFIX}/events`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const OTHER_USER_ID = '4a2c2f4b-2d3e-4f50-9bac-1d2e3f4a5b6c'
const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'

function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(userId, SESSION_SECRET, SESSION_TTL_SECONDS)}`
}

function makeJob(): SyncJob {
  return {
    id: JOB_ID,
    kind: 'gist_import',
    status: 'running',
    stats: { total: 2, processed: 1, imported: 1, updated: 0, skipped: 0, failed: 0 },
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
  }
}

describe('user event bus', () => {
  it('delivers an event to every listener of that user', () => {
    const received: SseEvent[] = []
    const stopFirst = subscribeToUserEvents(USER_ID, (event) => received.push(event))
    const stopSecond = subscribeToUserEvents(USER_ID, (event) => received.push(event))

    try {
      const event: SseEvent = { type: 'graph.updated', data: { noteId: NOTE_ID } }
      publishToUserEvents(USER_ID, event)

      expect(received).toEqual([event, event])
    } finally {
      stopFirst()
      stopSecond()
    }
  })

  it('isolates users from each other', () => {
    const received: SseEvent[] = []
    const otherReceived: SseEvent[] = []
    const stop = subscribeToUserEvents(USER_ID, (event) => received.push(event))
    const stopOther = subscribeToUserEvents(OTHER_USER_ID, (event) => otherReceived.push(event))

    try {
      publishNoteUpdated(USER_ID, { noteId: NOTE_ID, action: 'created' })

      expect(received).toHaveLength(1)
      expect(otherReceived).toEqual([])
    } finally {
      stop()
      stopOther()
    }
  })

  it('stops delivering after the returned unsubscribe runs', () => {
    const received: SseEvent[] = []
    const stop = subscribeToUserEvents(USER_ID, (event) => received.push(event))

    publishNoteUpdated(USER_ID, { noteId: NOTE_ID, action: 'created' })
    stop()
    publishNoteUpdated(USER_ID, { noteId: NOTE_ID, action: 'deleted' })

    expect(received).toEqual([
      { type: 'note.updated', data: { noteId: NOTE_ID, action: 'created' } },
    ])
  })

  it('keeps delivering to healthy listeners when one throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const received: SseEvent[] = []
    const stopThrowing = subscribeToUserEvents(USER_ID, () => {
      throw new Error('broken stream')
    })
    const stopHealthy = subscribeToUserEvents(USER_ID, (event) => received.push(event))

    try {
      publishNoteUpdated(USER_ID, { noteId: NOTE_ID, action: 'updated' })

      expect(received).toEqual([
        { type: 'note.updated', data: { noteId: NOTE_ID, action: 'updated' } },
      ])
      expect(consoleError).toHaveBeenCalled()
    } finally {
      stopThrowing()
      stopHealthy()
      consoleError.mockRestore()
    }
  })

  it('builds each typed helper into the matching event', () => {
    const received: SseEvent[] = []
    const stop = subscribeToUserEvents(USER_ID, (event) => received.push(event))
    const job = makeJob()

    try {
      publishNoteUpdated(USER_ID, { noteId: NOTE_ID, action: 'deleted' })
      publishGraphUpdated(USER_ID, NOTE_ID)
      publishSyncProgress(USER_ID, job)

      expect(received).toEqual([
        { type: 'note.updated', data: { noteId: NOTE_ID, action: 'deleted' } },
        { type: 'graph.updated', data: { noteId: NOTE_ID } },
        { type: 'sync.progress', data: { job } },
      ])
      expect(sseEventSchema.array().parse(received)).toEqual(received)
    } finally {
      stop()
    }
  })
})

interface StreamResult {
  status: number
  headers: IncomingHttpHeaders
  body: string
}

/**
 * Opens the SSE endpoint on an ephemeral port and collects frames until `done`
 * matches, then tears the socket and the server down.
 *
 * A raw `http` request is used instead of Supertest because the stream never
 * ends by design: Supertest resolves on the response's `end`, so it would hang.
 * `onFrame` sees the accumulated body after every chunk, which is how a test
 * can react to the handshake before waiting for a published event.
 */
function collectEventStream(options: {
  cookie: string
  done: (body: string) => boolean
  onFrame?: (body: string) => void
}): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const server = createApp().listen(0, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('expected the test server to listen on a TCP port'))
        return
      }

      let client: http.ClientRequest | null = null
      let settled = false

      const finish = (result: StreamResult): void => {
        if (settled) return
        settled = true
        client?.destroy()
        server.close()
        resolve(result)
      }

      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        client?.destroy()
        server.close()
        reject(error)
      }

      client = http.get(
        { port: address.port, path: EVENTS_URL, headers: { cookie: options.cookie } },
        (response) => {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', (chunk: string) => {
            body += chunk
            options.onFrame?.(body)

            if (options.done(body)) {
              finish({ status: response.statusCode ?? 0, headers: response.headers, body })
            }
          })
          response.on('error', fail)
        },
      )

      client.on('error', fail)
      client.setTimeout(3_000, () => fail(new Error('timed out waiting for SSE frames')))
    })
  })
}

describe(`GET ${EVENTS_URL}`, () => {
  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(EVENTS_URL)

    expect(response.status).toBe(401)
  })

  it('opens an unbuffered event stream with the retry frame', async () => {
    const result = await collectEventStream({
      cookie: sessionCookie(USER_ID),
      done: (body) => body.includes(`retry: ${SSE_RETRY_MS}`),
    })

    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(result.headers['cache-control']).toBe('no-cache, no-transform')
    expect(result.headers['connection']).toBe('keep-alive')
    expect(result.headers['x-accel-buffering']).toBe('no')
    expect(result.body).toBe(`retry: ${SSE_RETRY_MS}\n\n`)
  })

  it('streams an event published for the subscriber', async () => {
    let published = false

    const result = await collectEventStream({
      cookie: sessionCookie(USER_ID),
      onFrame: (body) => {
        // The retry frame proves the handler ran, so the subscription exists.
        if (!published && body.startsWith(`retry: ${SSE_RETRY_MS}`)) {
          published = true
          publishNoteUpdated(USER_ID, { noteId: NOTE_ID, action: 'updated' })
        }
      },
      done: (body) => body.includes('event: note.updated'),
    })

    expect(result.body).toContain(`retry: ${SSE_RETRY_MS}\n\n`)
    expect(result.body).toContain(
      `event: note.updated\ndata: ${JSON.stringify({ noteId: NOTE_ID, action: 'updated' })}\n\n`,
    )
  })

  it('streams a sync.progress event with the full job', async () => {
    const job = makeJob()

    const result = await collectEventStream({
      cookie: sessionCookie(USER_ID),
      onFrame: (body) => {
        if (body.startsWith(`retry: ${SSE_RETRY_MS}`)) {
          publishSyncProgress(USER_ID, job)
        }
      },
      done: (body) => body.includes('event: sync.progress'),
    })

    expect(result.body).toContain(`event: sync.progress\ndata: ${JSON.stringify({ job })}\n\n`)
  })

  it('does not stream another user\u2019s events', async () => {
    let published = false

    const result = await collectEventStream({
      cookie: sessionCookie(USER_ID),
      onFrame: (body) => {
        if (published || !body.startsWith(`retry: ${SSE_RETRY_MS}`)) {
          return
        }

        published = true
        // Another account's event must be filtered; the second publish is the
        // subscriber's own, and simply gives the read something to stop on.
        publishNoteUpdated(OTHER_USER_ID, { noteId: NOTE_ID, action: 'created' })
        publishNoteUpdated(USER_ID, { noteId: NOTE_ID, action: 'updated' })
      },
      done: (body) => body.includes('event: note.updated'),
    })

    expect(result.body).toContain(
      `event: note.updated\ndata: ${JSON.stringify({ noteId: NOTE_ID, action: 'updated' })}\n\n`,
    )
    expect(result.body).not.toContain('"action":"created"')
  })
})
