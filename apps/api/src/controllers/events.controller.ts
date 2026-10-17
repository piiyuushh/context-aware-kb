import { SSE_KEEPALIVE_MS, SSE_RETRY_MS } from '@kb/shared'
import { subscribeToUserEvents } from '../events/bus'
import { requireUserId } from '../middleware/require-auth'
import type { Request, Response } from 'express'

/**
 * `GET /api/v1/events` — the SSE stream (docs/API.md "Realtime").
 *
 * The response is opened once and never ended by the API: each published event
 * is written as an `event:`/`data:` frame, and an idle connection gets a
 * comment frame on a timer so proxies do not drop it. The browser's
 * `EventSource` reconnects on its own using the `retry:` value sent up front.
 *
 * Cleanup is driven by the request closing (navigation away, dropped socket)
 * and is guarded, because a close can be reported more than once. No
 * compression middleware is installed anywhere: it would buffer the stream.
 */
export function eventsHandler(req: Request, res: Response): void {
  const userId = requireUserId(req)

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // nginx buffers proxied responses by default, which would hold every frame.
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // A stream-level setting, so it is sent once, before any event.
  res.write(`retry: ${SSE_RETRY_MS}\n\n`)

  let closed = false

  const unsubscribe = subscribeToUserEvents(userId, (event) => {
    if (closed) {
      return
    }

    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
  })

  const keepAlive = setInterval(() => {
    if (closed) {
      return
    }

    res.write(': keep-alive\n\n')
  }, SSE_KEEPALIVE_MS)

  // An idle stream must not be the reason the process stays up (e.g. in tests).
  keepAlive.unref()

  const close = (): void => {
    if (closed) {
      return
    }

    closed = true
    clearInterval(keepAlive)
    unsubscribe()
  }

  req.on('close', close)
}
