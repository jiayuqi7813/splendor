import { createFileRoute } from '@tanstack/react-router'
import { RuleError } from '@/game/rules'
import { jsonBodyObject, jsonError, jsonOk, replayToRoomMachine, roomStore } from '@/server/roomStore'
import type { AnyGameAction } from '@/game/types'

export const Route = createFileRoute('/api/rooms/$roomId/actions')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const replay = replayToRoomMachine(request)
        if (replay) return replay
        try {
          const body = await jsonBodyObject(request)
          const playerSecret = typeof body.playerSecret === 'string' ? body.playerSecret : ''
          const action = body.action && typeof body.action === 'object' ? (body.action as AnyGameAction) : undefined
          if (!playerSecret || !action) return jsonError(new RuleError('请求缺少玩家身份或行动。'))
          return jsonOk(roomStore.apply(params.roomId, playerSecret, action))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
