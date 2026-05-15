import { createFileRoute } from '@tanstack/react-router'
import { RuleError } from '@/game/rules'
import { jsonBodyObject, jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'
import type { RoomIntent } from '@/game/types'

export const Route = createFileRoute('/api/rooms/$roomId/intents')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = await jsonBodyObject(request)
          const playerSecret = typeof body.playerSecret === 'string' ? body.playerSecret : ''
          const intent = body.intent && typeof body.intent === 'object' ? (body.intent as RoomIntent) : undefined
          if (!playerSecret || !intent) return jsonError(new RuleError('请求缺少玩家身份或同步意图。'))
          return jsonOk(roomStore.publishIntent(params.roomId, playerSecret, intent))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
