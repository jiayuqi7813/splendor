import { createFileRoute } from '@tanstack/react-router'
import { replayToRoomMachine, roomStore, withRoomMachineRouting } from '@/server/roomStore'
import type { PublicRoomEvent } from '@/game/types'

export const Route = createFileRoute('/api/rooms/$roomId/events')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        const url = new URL(request.url)
        const after = Number(url.searchParams.get('after') ?? 0)
        const playerSecret = url.searchParams.get('playerSecret') ?? undefined
        const encoder = new TextEncoder()
        let cleanup: (() => void) | undefined
        let closed = false
        let heartbeat: ReturnType<typeof setInterval> | undefined
        function closeStream() {
          if (closed) return
          closed = true
          if (heartbeat) {
            clearInterval(heartbeat)
            heartbeat = undefined
          }
          cleanup?.()
          roomStore.disconnect(params.roomId, playerSecret)
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
            cleanup = roomStore.subscribe(params.roomId, after, send, playerSecret)
            heartbeat = setInterval(() => sendChunk(': heartbeat\n\n'), 15000)
            request.signal.addEventListener('abort', () => {
              closeStream()
              try {
                controller.close()
              } catch {
                // The stream may already be closed by the runtime on abort.
              }
            }, { once: true })
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
      },
    },
  },
})
