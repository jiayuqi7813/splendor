import { describe, expect, it, vi } from 'vitest'
import { roomStore } from '@/server/roomStore'
import { createRoomEventsResponse, handleRoomEventsRequest } from './events'

describe('room event stream route', () => {
  it('returns a 404 response when the room is missing', async () => {
    const response = handleRoomEventsRequest(new Request('https://example.test/api/rooms/missing/events'), 'missing')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: '房间不存在或已过期。' })
  })

  it('cleans up heartbeat timers when the stream is cancelled', async () => {
    vi.useFakeTimers()
    try {
      const room = roomStore.createRoom()
      const response = createRoomEventsResponse(new Request(`https://example.test/api/rooms/${room.roomId}/events?after=${room.seq}&playerSecret=${room.playerSecret}`), room.roomId)
      const reader = response.body?.getReader()

      expect(reader).toBeTruthy()
      await reader?.cancel()

      expect(() => vi.advanceTimersByTime(30_000)).not.toThrow()
      expect(roomStore.getSnapshot(room.roomId).state.players.p1.connected).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
