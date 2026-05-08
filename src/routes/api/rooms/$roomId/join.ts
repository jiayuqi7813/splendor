import { createFileRoute } from '@tanstack/react-router'
import { jsonError, jsonOk, roomStore } from '@/server/roomStore'

export const Route = createFileRoute('/api/rooms/$roomId/join')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const body = await request.json().catch(() => ({}))
          if (body.restart) return jsonOk(roomStore.restartRoom(params.roomId, body.playerSecret))
          if (body.moveSeat) return jsonOk(roomStore.moveSeat(params.roomId, body.playerSecret, body.targetPlayerId))
          if (body.setHostAi) return jsonOk(roomStore.setHostAi(params.roomId, body.playerSecret, body.difficulty))
          if (body.updateAiDifficulty) return jsonOk(roomStore.updateAiDifficulty(params.roomId, body.playerSecret, body.targetPlayerId, body.difficulty))
          if (body.removeAi) return jsonOk(roomStore.removeAiPlayer(params.roomId, body.playerSecret, body.targetPlayerId))
          if (body.aiOpponent) return jsonOk(roomStore.addAiOpponent(params.roomId, body.playerSecret, body.difficulty, Boolean(body.secondAi), body.secondDifficulty))
          if (body.confirmSeat) return jsonOk(roomStore.confirmSeat(params.roomId, body.playerSecret, body.playerName))
          return jsonOk(roomStore.joinRoom(params.roomId, body.playerSecret))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
