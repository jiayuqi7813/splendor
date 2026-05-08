import { createFileRoute } from '@tanstack/react-router'
import { jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'

export const Route = createFileRoute('/api/rooms/$roomId/snapshot')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const url = new URL(request.url)
          return jsonOk(roomStore.getSnapshot(params.roomId, url.searchParams.get('playerSecret') ?? undefined))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
