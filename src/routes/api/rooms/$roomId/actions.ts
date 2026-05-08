import { createFileRoute } from '@tanstack/react-router'
import { RuleError } from '@/game/rules'
import { jsonError, jsonOk, roomStore } from '@/server/roomStore'
import type { AnyGameAction } from '@/game/types'

export const Route = createFileRoute('/api/rooms/$roomId/actions')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const body = (await request.json()) as { playerSecret?: string; action?: AnyGameAction }
          if (!body.playerSecret || !body.action) return jsonError(new RuleError('请求缺少玩家身份或行动。'))
          return jsonOk(roomStore.apply(params.roomId, body.playerSecret, body.action))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
