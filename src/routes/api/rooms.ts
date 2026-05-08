import { createFileRoute } from '@tanstack/react-router'
import { jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'

export const Route = createFileRoute('/api/rooms')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = await request.json().catch(() => ({}))
          return jsonOk(roomStore.createRoom({ gameType: body.gameType, playerCount: body.playerCount }))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
