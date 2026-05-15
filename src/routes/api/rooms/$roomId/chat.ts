import { createFileRoute } from '@tanstack/react-router'
import { RuleError } from '@/game/rules'
import { jsonBodyObject, jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'

export const Route = createFileRoute('/api/rooms/$roomId/chat')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = await jsonBodyObject(request)
          const playerSecret = typeof body.playerSecret === 'string' ? body.playerSecret : ''
          if (!playerSecret) return jsonError(new RuleError('请求缺少玩家身份。'))
          return jsonOk(roomStore.postChatMessage(params.roomId, playerSecret, body.message))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
