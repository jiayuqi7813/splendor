import { createFileRoute } from '@tanstack/react-router'
import { jsonError, replayToRoomMachine, roomStore, withRoomMachineRouting } from '@/server/roomStore'
import type { PublicRoomEvent } from '@/game/types'

export function createRoomEventsResponse(request: Request, roomId: string): Response {
  const url = new URL(request.url)
  const after = Number(url.searchParams.get('after') ?? 0)
  const playerSecret = url.searchParams.get('playerSecret') ?? undefined
  const encoder = new TextEncoder()
  let cleanup: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  function clearHeartbeat(): void {
    if (!heartbeat) return
    clearInterval(heartbeat)
    heartbeat = undefined
  }

  function closeStream() {
    if (closed) return
    closed = true
    clearHeartbeat()
    cleanup?.()
    roomStore.disconnect(roomId, playerSecret)
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendChunk = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          closeStream()
        }
      }
      const send = (event: PublicRoomEvent) => {
        sendChunk(`id: ${event.seq}\nevent: room\ndata: ${JSON.stringify(event)}\n\n`)
      }
      cleanup = roomStore.subscribe(roomId, after, send, playerSecret)
      heartbeat = setInterval(() => sendChunk(': heartbeat\n\n'), 15000)
      request.signal.addEventListener('abort', () => {
        closeStream()
        try {
          controller.close()
        } catch {
          // The client may have already closed the stream.
        }
      })
    },
    cancel() {
      closeStream()
    },
  })

  return new Response(stream, withRoomMachineRouting({
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  }))
}

export function handleRoomEventsRequest(request: Request, roomId: string): Response {
  const replay = replayToRoomMachine(request)
  if (replay) return replay
  try {
    return createRoomEventsResponse(request, roomId)
  } catch (error) {
    return jsonError(error)
  }
}

export const Route = createFileRoute('/api/rooms/$roomId/events')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return handleRoomEventsRequest(request, params.roomId)
      },
    },
  },
})
