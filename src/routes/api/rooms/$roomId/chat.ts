import { createFileRoute } from '@tanstack/react-router'
import { RuleError } from '@/game/rules'
import { jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'

export const Route = createFileRoute('/api/rooms/$roomId/chat')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = (await request.json()) as { playerSecret?: string; message?: unknown }
          if (!body.playerSecret) return jsonError(new RuleError('请求缺少玩家身份。'))
          return jsonOk(roomStore.postChatMessage(params.roomId, body.playerSecret, body.message))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
