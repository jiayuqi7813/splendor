import { createFileRoute } from '@tanstack/react-router'
import { jsonBodyObject, jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'

export const Route = createFileRoute('/api/rooms')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = await jsonBodyObject(request)
          return jsonOk(roomStore.createRoom({ gameType: body.gameType, playerCount: body.playerCount, pokemonSpecialSet: body.pokemonSpecialSet }))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
