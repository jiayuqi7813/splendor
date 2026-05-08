import { createFileRoute } from '@tanstack/react-router'
import { RuleError } from '@/game/rules'
import { jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'
import type { RoomIntent } from '@/game/types'

export const Route = createFileRoute('/api/rooms/$roomId/intents')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = (await request.json()) as { playerSecret?: string; intent?: RoomIntent }
          if (!body.playerSecret || !body.intent) return jsonError(new RuleError('请求缺少玩家身份或同步意图。'))
          return jsonOk(roomStore.publishIntent(params.roomId, body.playerSecret, body.intent))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
