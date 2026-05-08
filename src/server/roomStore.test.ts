import { describe, expect, it, vi } from 'vitest'
import { jsonError, replayToRoomMachine, roomStore, RoomNotFoundError, withRoomMachineRouting } from './roomStore'
import { legalActions } from '@/game/ai'
import type { BoardCell, PlayerId } from '@/game/types'

function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Timed out waiting for condition'))
        return
      }
      setTimeout(tick, 20)
    }
    tick()
  })
}

function startTwoHumanRoom() {
  const first = roomStore.createRoom()
  const firstReady = roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
  const second = roomStore.joinRoom(first.roomId)
  const secondReady = roomStore.confirmSeat(first.roomId, second.playerSecret, '蓝方')
  const started = roomStore.apply(first.roomId, firstReady.playerSecret, { type: 'startGame', playerId: 'p1' })
  if (started.type !== 'action') throw new Error('Expected start action event')
  return { first: firstReady, second: secondReady, state: started.state }
}

describe('room store', () => {
  it('creates a room, confirms seats, and waits for the host to start', () => {
    const first = roomStore.createRoom()
    expect(first.playerId).toBe('p1')
    expect(first.state.players.p1.seated).toBe(false)
    const firstReady = roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
    expect(firstReady.state.players.p1).toMatchObject({ name: '红方', seated: true })

    const second = roomStore.joinRoom(first.roomId)
    expect(second.playerId).toBe('p2')
    const secondReady = roomStore.confirmSeat(first.roomId, second.playerSecret, '')
    expect(secondReady.state.status).toBe('waiting')
    expect(secondReady.state.players.p2).toMatchObject({ name: '玩家二', seated: true })
    expect(() => roomStore.apply(first.roomId, second.playerSecret, { type: 'startGame', playerId: 'p2' })).toThrow(/只有房主/)
    const started = roomStore.apply(first.roomId, first.playerSecret, { type: 'startGame', playerId: 'p1' })
    expect(started.type).toBe('action')
    if (started.type === 'action') expect(started.state.status).toBe('playing')

    const reconnected = roomStore.joinRoom(first.roomId, first.playerSecret)
    expect(reconnected.playerId).toBe('p1')
    expect(reconnected.playerSecret).toBe(first.playerSecret)
  })

  it('rejects actions from the wrong player secret', () => {
    const { first, second, state } = startTwoHumanRoom()
    const current = state.currentPlayer
    const wrongSecret = current === first.playerId ? second.playerSecret : first.playerSecret
    const tokenCell = state.board.find((cell: BoardCell) => cell.token?.type !== 'gold')
    expect(tokenCell).toBeTruthy()
    expect(() =>
      roomStore.apply(first.roomId, wrongSecret, {
        type: 'takeTokens',
        playerId: current,
        cellIds: [tokenCell!.id],
      }),
    ).toThrow(/替其他玩家/)
  })

  it('emits action events with increasing sequence numbers', () => {
    const { first, second, state } = startTwoHumanRoom()
    const current = state.currentPlayer
    const secret = current === first.playerId ? first.playerSecret : second.playerSecret
    const tokenCell = state.board.find((cell: BoardCell) => cell.token?.type !== 'gold')
    const event = roomStore.apply(first.roomId, secret, {
      type: 'takeTokens',
      playerId: current,
      cellIds: [tokenCell!.id],
    })
    expect(event.type).toBe('action')
    expect(event.seq).toBeGreaterThan(0)
    if (event.type === 'action') expect(event.state.turnNumber).toBeGreaterThanOrEqual(1)
  })

  it('broadcasts transient intent events without replaying them', () => {
    const { first, second, state } = startTwoHumanRoom()
    const current = state.currentPlayer
    const currentSecret = current === first.playerId ? first.playerSecret : second.playerSecret
    const liveEvents: unknown[] = []
    roomStore.subscribe(first.roomId, 0, (event) => liveEvents.push(event), second.playerSecret)
    const event = roomStore.publishIntent(first.roomId, currentSecret, { type: 'hoverToken', cellId: '0:0' })
    expect(event).toMatchObject({ type: 'intent', playerId: current, intent: { type: 'hoverToken', cellId: '0:0' } })
    expect(liveEvents).toContain(event)

    const replayed: unknown[] = []
    roomStore.subscribe(first.roomId, 0, (item) => replayed.push(item))
    expect(replayed.some((item) => (item as { type?: string }).type === 'intent')).toBe(false)
  })

  it('sanitizes cursor sync intents before broadcasting them', () => {
    const first = roomStore.createRoom()
    const second = roomStore.joinRoom(first.roomId)
    const liveEvents: unknown[] = []
    roomStore.subscribe(first.roomId, first.seq, (event) => liveEvents.push(event), second.playerSecret)

    const event = roomStore.publishIntent(first.roomId, first.playerSecret, {
      type: 'cursorMove',
      x: 1.2,
      y: -0.4,
      visible: true,
      click: true,
      panel: { playerId: 'p2', x: 1.5, y: -0.2 },
      path: [
        { x: 0.1, y: 0.2, at: 10, visible: true, panel: { playerId: 'p1', x: 0.4, y: 0.5 } },
        { x: 4, y: -2, at: 100000, visible: true, panel: { playerId: 'broken' as PlayerId, x: 0.2, y: 0.3 } },
      ],
    })

    expect(event).toMatchObject({
      type: 'intent',
      playerId: first.playerId,
      intent: {
        type: 'cursorMove',
        x: 1,
        y: 0,
        visible: true,
        click: true,
        panel: { playerId: 'p2', x: 1, y: 0 },
      },
    })
    expect(event.type === 'intent' && event.intent.type === 'cursorMove' ? event.intent.path?.[0] : undefined).toEqual({ x: 0.1, y: 0.2, at: 10, visible: true, panel: { playerId: 'p1', x: 0.4, y: 0.5 } })
    expect(event.type === 'intent' && event.intent.type === 'cursorMove' ? event.intent.path?.at(-1) : undefined).toEqual({ x: 1, y: 0, at: 5000, visible: true, panel: { playerId: 'p2', x: 1, y: 0 } })
    expect(liveEvents).toContain(event)
  })

  it('stores chat messages in the room feed and broadcasts them', () => {
    const first = roomStore.createRoom()
    roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
    const liveEvents: unknown[] = []
    roomStore.subscribe(first.roomId, first.seq, (event) => liveEvents.push(event), first.playerSecret)

    const event = roomStore.postChatMessage(first.roomId, first.playerSecret, ` ${'a'.repeat(320)} `)
    expect(event.type).toBe('snapshot')
    const snapshot = roomStore.getSnapshot(first.roomId)
    const latest = snapshot.state.feed.at(-1)

    expect(latest).toMatchObject({ kind: 'chat', playerId: 'p1', playerName: '红方' })
    expect(latest.message).toHaveLength(280)
    expect(liveEvents).toContainEqual(expect.objectContaining({ seq: event.seq, type: 'snapshot' }))
    expect(() => roomStore.postChatMessage(first.roomId, first.playerSecret, '   ')).toThrow(/不能为空/)
  })

  it('temporarily hands a disconnected human player to AI and restores control on reconnect', async () => {
    vi.useFakeTimers()
    try {
      const { first } = startTwoHumanRoom()
      roomStore.getSnapshot(first.roomId).state.currentPlayer = 'p1'
      roomStore.disconnect(first.roomId, first.playerSecret)

      await vi.advanceTimersByTimeAsync(20_000)
      const takeover = roomStore.getSnapshot(first.roomId).state
      expect(takeover.players.p1).toMatchObject({ connected: false, aiControlled: true, aiDifficulty: 'standard' })
      expect(takeover.players.p1.isAi).toBeUndefined()
      expect(takeover.feed.at(-1).message).toContain('AI 已临时接管')

      const rejoined = roomStore.joinRoom(first.roomId, first.playerSecret)
      expect(rejoined.state.players.p1).toMatchObject({ connected: true, aiControlled: undefined, aiDifficulty: undefined })
      expect(rejoined.state.feed.at(-1).message).toContain('AI 托管已停止')
    } finally {
      vi.useRealTimers()
    }
  })

  it('tracks player presence from live event streams', () => {
    const first = roomStore.createRoom()
    const cleanup = roomStore.subscribe(first.roomId, first.seq, () => undefined, first.playerSecret)
    cleanup()
    roomStore.disconnect(first.roomId, first.playerSecret)
    expect(roomStore.getSnapshot(first.roomId).state.players.p1.connected).toBe(false)

    const events: unknown[] = []
    roomStore.subscribe(first.roomId, first.seq, (event) => events.push(event), first.playerSecret)
    const snapshot = roomStore.getSnapshot(first.roomId)
    expect(snapshot.state.players.p1.connected).toBe(true)
    expect(events.length).toBeGreaterThan(0)
  })

  it('keeps an AI room alive through a short human reconnect gap', () => {
    const startedAt = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    try {
      const first = roomStore.createRoom()
      roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
      roomStore.addAiOpponent(first.roomId, first.playerSecret)
      const cleanup = roomStore.subscribe(first.roomId, first.seq, () => undefined, first.playerSecret)

      cleanup()
      roomStore.disconnect(first.roomId, first.playerSecret)
      expect(roomStore.getSnapshot(first.roomId).state.players.p1.connected).toBe(false)

      now.mockReturnValue(startedAt + 1000 * 60 - 1)
      const rejoined = roomStore.joinRoom(first.roomId, first.playerSecret)
      expect(rejoined.playerId).toBe('p1')

      now.mockReturnValue(startedAt + 1000 * 60 + 1)
      expect(roomStore.getSnapshot(first.roomId).state.players.p1.connected).toBe(true)
    } finally {
      now.mockRestore()
    }
  })

  it('keeps an unconfirmed waiting room alive through a short reconnect gap', () => {
    const startedAt = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    try {
      const first = roomStore.createRoom()
      const cleanup = roomStore.subscribe(first.roomId, first.seq, () => undefined, first.playerSecret)

      cleanup()
      roomStore.disconnect(first.roomId, first.playerSecret)
      expect(roomStore.getSnapshot(first.roomId).state.players.p1.connected).toBe(false)

      now.mockReturnValue(startedAt + 1000 * 60 - 1)
      const rejoined = roomStore.joinRoom(first.roomId, first.playerSecret)
      expect(rejoined.playerId).toBe('p1')
      expect(rejoined.state.players.p1.seated).toBe(false)
      expect(rejoined.state.players.p1.connected).toBe(true)
    } finally {
      now.mockRestore()
    }
  })

  it('expires an AI room after the human has been gone for one minute', () => {
    const startedAt = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
    try {
      const first = roomStore.createRoom()
      roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
      roomStore.addAiOpponent(first.roomId, first.playerSecret)
      const cleanup = roomStore.subscribe(first.roomId, first.seq, () => undefined, first.playerSecret)

      cleanup()
      roomStore.disconnect(first.roomId, first.playerSecret)
      now.mockReturnValue(startedAt + 1000 * 60)

      expect(() => roomStore.getSnapshot(first.roomId)).toThrow(/房间不存在或已过期/)
    } finally {
      now.mockRestore()
    }
  })

  it('adds an AI opponent from a waiting room and waits for the host to start', () => {
    const first = roomStore.createRoom()
    roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
    const result = roomStore.addAiOpponent(first.roomId, first.playerSecret)
    expect(result.playerId).toBe('p1')
    expect(result.playerSecret).toBe(first.playerSecret)
    expect(result.state.status).toBe('waiting')
    expect(result.state.players.p2.name).toBe('AI 对手')
    expect(result.state.players.p2.seated).toBe(true)
    expect(result.state.players.p2.connected).toBe(true)
    const started = roomStore.apply(first.roomId, first.playerSecret, { type: 'startGame', playerId: 'p1' })
    if (started.type === 'action') expect(started.state.status).toBe('playing')
    expect(() => roomStore.joinRoom(first.roomId)).toThrow(/房间已满/)
  })

  it('creates a classic room with four Duel-engine seats and supports waiting-room moves', () => {
    const first = roomStore.createRoom({ gameType: 'classic' })
    roomStore.confirmSeat(first.roomId, first.playerSecret, '房主')
    const second = roomStore.joinRoom(first.roomId)
    roomStore.confirmSeat(first.roomId, second.playerSecret, '客人')

    const moved = roomStore.moveSeat(first.roomId, first.playerSecret, 'p4')
    expect(moved.playerId).toBe('p4')
    expect(moved.state.gameType).toBe('classic')
    expect(moved.state.playerOrder).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(moved.state.players.p1).toMatchObject({ id: 'p1', seated: false })
    expect(moved.state.players.p4).toMatchObject({ id: 'p4', name: '房主', seated: true })

    const swappedHuman = roomStore.moveSeat(first.roomId, first.playerSecret, 'p2')
    expect(swappedHuman.playerId).toBe('p2')
    expect(roomStore.joinRoom(first.roomId, second.playerSecret).playerId).toBe('p4')
    expect(swappedHuman.state.players.p2).toMatchObject({ id: 'p2', name: '房主', seated: true })
    expect(swappedHuman.state.players.p4).toMatchObject({ id: 'p4', name: '客人', seated: true })
  })

  it('keeps waiting-room host permissions attached to the creator after seat moves', () => {
    const first = roomStore.createRoom({ gameType: 'classic' })
    roomStore.confirmSeat(first.roomId, first.playerSecret, '房主')
    const second = roomStore.joinRoom(first.roomId)
    roomStore.confirmSeat(first.roomId, second.playerSecret, '客人')
    const hostEvents: unknown[] = []
    const cleanupHost = roomStore.subscribe(first.roomId, first.seq, (event) => hostEvents.push(event), first.playerSecret)

    const hostMoved = roomStore.moveSeat(first.roomId, first.playerSecret, 'p4')
    const guestMoved = roomStore.moveSeat(first.roomId, second.playerSecret, 'p1')
    const hostSnapshot = roomStore.getSnapshot(first.roomId, first.playerSecret)
    const guestSnapshot = roomStore.getSnapshot(first.roomId, second.playerSecret)

    expect(hostMoved.playerId).toBe('p4')
    expect(hostMoved.state).toMatchObject({ myPlayerId: 'p4', myIsHost: true })
    expect(guestMoved.playerId).toBe('p1')
    expect(guestMoved.state).toMatchObject({ myPlayerId: 'p1', myIsHost: false })
    expect(hostSnapshot.state).toMatchObject({ myPlayerId: 'p4', myIsHost: true })
    expect(guestSnapshot.state).toMatchObject({ myPlayerId: 'p1', myIsHost: false })
    expect(hostEvents.at(-1)).toMatchObject({ state: { myPlayerId: 'p4', myIsHost: true } })
    expect(() => roomStore.apply(first.roomId, second.playerSecret, { type: 'startGame', playerId: 'p1' })).toThrow(/只有房主/)

    const started = roomStore.apply(first.roomId, first.playerSecret, { type: 'startGame', playerId: 'p4' })
    expect(started.type).toBe('action')
    if (started.type === 'action') {
      expect(started.state.status).toBe('playing')
      expect(started.state).toMatchObject({ myPlayerId: 'p4', myIsHost: true })
    }
    cleanupHost()
  })

  it('adds and runs AI players in a classic Splendor room', async () => {
    const first = roomStore.createRoom({ gameType: 'classic' })
    roomStore.confirmSeat(first.roomId, first.playerSecret, '房主')
    const liveEvents: unknown[] = []
    roomStore.subscribe(first.roomId, first.seq, (event) => liveEvents.push(event), first.playerSecret)

    const joined = roomStore.addAiOpponent(first.roomId, first.playerSecret, 'beginner')
    expect(joined.state.players.p2).toMatchObject({ name: 'AI 对手一', isAi: true, seated: true, connected: true })
    const secondJoined = roomStore.addAiOpponent(first.roomId, first.playerSecret, 'beginner')
    expect(secondJoined.state.players.p3).toMatchObject({ name: 'AI 对手二', isAi: true, seated: true, connected: true })

    const started = roomStore.apply(first.roomId, first.playerSecret, { type: 'startGame', playerId: 'p1' })
    if (started.type === 'action' && started.state.currentPlayer === 'p1') {
      const humanAction = legalActions(started.state, 'p1')[0]
      expect(humanAction).toBeTruthy()
      roomStore.apply(first.roomId, first.playerSecret, humanAction!)
    }

    await waitFor(() => liveEvents.some((event) => (event as { type?: string; action?: { playerId?: PlayerId } }).type === 'action' && ['p2', 'p3'].includes((event as { action?: { playerId?: PlayerId } }).action?.playerId ?? '')), 6000)
  })

  it('manages classic AI difficulty, removal, and host AI conversion', () => {
    const first = roomStore.createRoom({ gameType: 'classic' })
    roomStore.confirmSeat(first.roomId, first.playerSecret, '房主')
    roomStore.addAiOpponent(first.roomId, first.playerSecret, 'beginner')
    roomStore.addAiOpponent(first.roomId, first.playerSecret, 'casual')
    roomStore.addAiOpponent(first.roomId, first.playerSecret, 'standard')

    const updated = roomStore.updateAiDifficulty(first.roomId, first.playerSecret, 'p2', 'expert')
    expect(updated.state.players.p2.aiDifficulty).toBe('expert')

    const removed = roomStore.removeAiPlayer(first.roomId, first.playerSecret, 'p3')
    expect(removed.state.players.p3).toMatchObject({ isAi: undefined, aiDifficulty: undefined, seated: false, connected: false })

    roomStore.addAiOpponent(first.roomId, first.playerSecret, 'hard')
    const hostAi = roomStore.setHostAi(first.roomId, first.playerSecret, 'nightmare')
    expect(hostAi.state.players.p1).toMatchObject({ isAi: true, aiDifficulty: 'nightmare', seated: true, connected: true })
  })

  it('starts a dual AI room from the waiting room', async () => {
    const first = roomStore.createRoom()
    roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
    first.state.firstPlayer = 'p1'
    first.state.currentPlayer = 'p1'
    const liveEvents: unknown[] = []
    roomStore.subscribe(first.roomId, first.seq, (event) => liveEvents.push(event), first.playerSecret)

    const result = roomStore.addAiOpponent(first.roomId, first.playerSecret, 'beginner', true, 'hard')

    expect(result.state.status).toBe('waiting')
    expect(result.state.players.p1.name).toBe('AI 甲')
    expect(result.state.players.p2.name).toBe('AI 乙')
    roomStore.apply(first.roomId, first.playerSecret, { type: 'startGame', playerId: 'p1' })

    await waitFor(() => {
      const actedPlayers = new Set(
        liveEvents
          .filter((event): event is { type: string; action?: { playerId?: PlayerId } } => (event as { type?: string }).type === 'action')
          .map((event) => event.action?.playerId)
          .filter(Boolean),
      )
      return actedPlayers.has('p1') && actedPlayers.has('p2')
    }, 6000)
  })

  it('restarts a finished game in the same room with the same seats', () => {
    const { first, second } = startTwoHumanRoom()
    const liveState = roomStore.getSnapshot(first.roomId).state
    liveState.players.p1.tokens.ruby = 3
    liveState.players.p1.tokenSlots = [
      { id: 'ruby-test-0', type: 'ruby' },
      { id: 'ruby-test-1', type: 'ruby' },
      { id: 'ruby-test-2', type: 'ruby' },
    ]
    liveState.status = 'finished'
    liveState.winner = { playerId: 'p1', reason: 'points' }

    expect(() => roomStore.restartRoom(first.roomId, second.playerSecret)).toThrow(/只有房主/)
    const restarted = roomStore.restartRoom(first.roomId, first.playerSecret)

    expect(restarted.roomId).toBe(first.roomId)
    expect(restarted.playerId).toBe('p1')
    expect(restarted.playerSecret).toBe(first.playerSecret)
    expect(restarted.state.status).toBe('playing')
    expect(restarted.state.winner).toBeUndefined()
    expect(restarted.state.players.p1.name).toBe('红方')
    expect(restarted.state.players.p2.name).toBe('蓝方')
    expect(restarted.state.players.p1.tokens.ruby).toBe(0)
    expect(restarted.state.players.p1.tokenSlots).toEqual([])
    expect(restarted.seq).toBeGreaterThan(second.seq)
  })

  it('rejects invalid AI opponent joins', () => {
    const first = roomStore.createRoom()
    expect(() => roomStore.addAiOpponent(first.roomId, 'bad-secret')).toThrow(/身份无效/)
    roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
    expect(() => roomStore.addAiOpponent(first.roomId, first.playerSecret, 'broken')).toThrow(/难度无效/)

    const secondRoom = roomStore.createRoom()
    roomStore.joinRoom(secondRoom.roomId)
    roomStore.confirmSeat(secondRoom.roomId, secondRoom.playerSecret, '房主')
    expect(() => roomStore.addAiOpponent(secondRoom.roomId, secondRoom.playerSecret)).toThrow(/房间已满/)
  })

  it('runs the AI when it is first player', async () => {
    const first = roomStore.createRoom()
    roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
    const liveState = roomStore.getSnapshot(first.roomId).state
    liveState.firstPlayer = 'p2'
    liveState.currentPlayer = 'p2'
    const liveEvents: unknown[] = []
    roomStore.subscribe(first.roomId, first.seq, (event) => liveEvents.push(event), first.playerSecret)
    roomStore.addAiOpponent(first.roomId, first.playerSecret)
    roomStore.apply(first.roomId, first.playerSecret, { type: 'startGame', playerId: 'p1' })

    await waitFor(() => roomStore.getSnapshot(first.roomId).state.currentPlayer === 'p1' || Boolean(roomStore.getSnapshot(first.roomId).state.winner))
    expect(liveEvents.some((event) => (event as { type?: string; action?: { playerId?: PlayerId } }).type === 'action' && (event as { action?: { playerId?: PlayerId } }).action?.playerId === 'p2')).toBe(true)
  })

  it('runs the AI after a human action', async () => {
    const first = roomStore.createRoom()
    roomStore.confirmSeat(first.roomId, first.playerSecret, '红方')
    const liveState = roomStore.getSnapshot(first.roomId).state
    liveState.firstPlayer = 'p1'
    liveState.currentPlayer = 'p1'
    roomStore.addAiOpponent(first.roomId, first.playerSecret)
    roomStore.apply(first.roomId, first.playerSecret, { type: 'startGame', playerId: 'p1' })
    const tokenCell = liveState.board.find((cell: BoardCell) => cell.token?.type !== 'gold')
    expect(tokenCell).toBeTruthy()
    roomStore.apply(first.roomId, first.playerSecret, { type: 'takeTokens', playerId: 'p1', cellIds: [tokenCell!.id] })

    await waitFor(() => roomStore.getSnapshot(first.roomId).state.currentPlayer === 'p1' || Boolean(roomStore.getSnapshot(first.roomId).state.winner))
    expect(roomStore.getSnapshot(first.roomId).state.status).toBe('playing')
  })

  it('returns 404 JSON for missing rooms', async () => {
    const response = jsonError(new RoomNotFoundError('房间不存在或已过期。'))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: '房间不存在或已过期。' })
  })

  it('adds Fly machine routing metadata to room responses', () => {
    const previousMachine = process.env.FLY_MACHINE_ID
    try {
      process.env.FLY_MACHINE_ID = 'machine_a'
      const init = withRoomMachineRouting({ headers: { 'Cache-Control': 'no-store' } })
      const headers = new Headers(init.headers)
      expect(headers.get('X-Splendor-Room-Machine')).toBe('machine_a')
      expect(headers.get('Set-Cookie')).toContain('splendor_room_machine=machine_a')
      expect(headers.get('Cache-Control')).toBe('no-store')
    } finally {
      if (previousMachine === undefined) delete process.env.FLY_MACHINE_ID
      else process.env.FLY_MACHINE_ID = previousMachine
    }
  })

  it('replays room requests to the machine that owns the room', () => {
    const previousMachine = process.env.FLY_MACHINE_ID
    try {
      process.env.FLY_MACHINE_ID = 'machine_a'
      const replay = replayToRoomMachine(new Request('https://example.test/api/rooms/abc123/join?roomMachine=machine_b'))
      expect(replay?.status).toBe(409)
      expect(replay?.headers.get('Fly-Replay')).toBe('instance=machine_b')
      expect(replayToRoomMachine(new Request('https://example.test/api/rooms/abc123/join?roomMachine=machine_a'))).toBeUndefined()
    } finally {
      if (previousMachine === undefined) delete process.env.FLY_MACHINE_ID
      else process.env.FLY_MACHINE_ID = previousMachine
    }
  })
})
