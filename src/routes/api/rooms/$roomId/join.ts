import { createFileRoute } from '@tanstack/react-router'
import { jsonBodyObject, jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'

export const Route = createFileRoute('/api/rooms/$roomId/join')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = await jsonBodyObject(request)
          const playerSecret = typeof body.playerSecret === 'string' ? body.playerSecret : undefined
          if (body.restart === true) return jsonOk(roomStore.restartRoom(params.roomId, playerSecret ?? ''))
          if (body.moveSeat === true) return jsonOk(roomStore.moveSeat(params.roomId, playerSecret ?? '', body.targetPlayerId))
          if (body.setHostAi === true) return jsonOk(roomStore.setHostAi(params.roomId, playerSecret ?? '', body.difficulty))
          if (body.updateAiDifficulty === true) return jsonOk(roomStore.updateAiDifficulty(params.roomId, playerSecret ?? '', body.targetPlayerId, body.difficulty))
          if (body.removeAi === true) return jsonOk(roomStore.removeAiPlayer(params.roomId, playerSecret ?? '', body.targetPlayerId))
          if (body.aiOpponent === true) return jsonOk(roomStore.addAiOpponent(params.roomId, playerSecret ?? '', body.difficulty, body.secondAi === true, body.secondDifficulty))
          if (body.confirmSeat === true) return jsonOk(roomStore.confirmSeat(params.roomId, playerSecret ?? '', body.playerName))
          return jsonOk(roomStore.joinRoom(params.roomId, playerSecret))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
