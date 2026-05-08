import { createFileRoute } from '@tanstack/react-router'
import { roomStore } from '@/server/roomStore'
import type { PublicRoomEvent } from '@/game/types'

export const Route = createFileRoute('/api/rooms/$roomId/events')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        const after = Number(url.searchParams.get('after') ?? 0)
        const playerSecret = url.searchParams.get('playerSecret') ?? undefined
        const encoder = new TextEncoder()
        let cleanup: (() => void) | undefined
        let closed = false
        function closeStream() {
          if (closed) return
          closed = true
          cleanup?.()
          roomStore.disconnect(params.roomId, playerSecret)
        }
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: PublicRoomEvent) => {
              controller.enqueue(encoder.encode(`id: ${event.seq}\nevent: room\ndata: ${JSON.stringify(event)}\n\n`))
            }
            cleanup = roomStore.subscribe(params.roomId, after, send, playerSecret)
            const heartbeat = setInterval(() => controller.enqueue(encoder.encode(': heartbeat\n\n')), 15000)
            request.signal.addEventListener('abort', () => {
              clearInterval(heartbeat)
              closeStream()
              controller.close()
            })
          },
          cancel() {
            closeStream()
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
