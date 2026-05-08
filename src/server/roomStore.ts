import { applyAction, createInitialGame, RuleError, startGameIfReady } from '@/game/rules'
import type { AnyGameAction, AnyGameState, GameAction, GameState, PlayerId, PublicRoomEvent, PublicRoomStateEvent, RoomIntent } from '@/game/types'
import { chooseAiAction, isDifficultyId } from '@/game/ai'
import type { AiMemory, DifficultyId } from '@/game/ai'

export class RoomNotFoundError extends RuleError {}

type Subscriber = (event: PublicRoomEvent) => void
const AI_ACTION_DELAY_MS = 1600
const AI_FAST_PENDING_DELAY_MS = 900
const AI_OPENING_ACTION_DELAY_MS = 2600
const AI_MAX_CHAIN_ACTIONS = 40
const EMPTY_ROOM_TTL_MS = 1000 * 60 * 5

interface Seat {
  playerId: RoomPlayerId
  secret: string
}

type RoomPlayerId = PlayerId

interface AiController {
  playerId: RoomPlayerId
  difficulty: DifficultyId
  memory?: AiMemory
  queued: boolean
  running: boolean
  chainActions: number
}

interface Room {
  id: string
  createdAt: number
  updatedAt: number
  emptySince?: number
  seats: Partial<Record<RoomPlayerId, Seat>>
  connections: Partial<Record<RoomPlayerId, number>>
  state: GameState
  seq: number
  events: PublicRoomEvent[]
  subscribers: Set<Subscriber>
  ai?: Partial<Record<RoomPlayerId, AiController>>
}

export interface JoinResult {
  roomId: string
  playerId: RoomPlayerId
  playerSecret: string
  state: AnyGameState
  seq: number
}

function randomId(size = 8): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, size)
}

function publicEvent(room: Room, type: PublicRoomStateEvent['type'], message: string, action?: AnyGameAction): PublicRoomStateEvent {
  return { seq: room.seq, type, message, state: room.state, action }
}

function viewStateForPlayer(state: AnyGameState, playerId?: RoomPlayerId): AnyGameState {
  if (!playerId || (state.gameType !== 'classic' && state.gameType !== 'pokemon')) return state
  return { ...state, myPlayerId: playerId }
}

function viewEventForPlayer(event: PublicRoomEvent, playerId?: RoomPlayerId): PublicRoomEvent {
  if (event.type === 'intent') return event
  return { ...event, state: viewStateForPlayer(event.state, playerId) }
}

class RoomStore {
  private rooms = new Map<string, Room>()

  createRoom(options?: { gameType?: unknown; playerCount?: unknown }): JoinResult {
    this.cleanup()
    const id = randomId(8)
    const gameType = options?.gameType === 'classic' || options?.gameType === 'pokemon' ? options.gameType : 'duel'
    const state = createInitialGame(id, { gameType, playerCount: gameType === 'classic' || gameType === 'pokemon' ? 4 : 2 })
    const room: Room = {
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      seats: {},
      connections: {},
      state,
      seq: 0,
      events: [],
      subscribers: new Set(),
    }
    this.rooms.set(id, room)
    return this.joinRoom(id)
  }

  joinRoom(roomId: string, secret?: string): JoinResult {
    const room = this.getRoom(roomId)
    const existing = secret ? Object.values(room.seats).find((seat) => seat?.secret === secret) : undefined
    const playerId = existing?.playerId ?? this.nextOpenSeat(room)
    if (!playerId) throw new RuleError('房间已满。')
    const playerSecret = existing?.secret ?? randomId(24)
    room.seats[playerId] = { playerId, secret: playerSecret }
    room.emptySince = undefined
    const player = this.playerById(room, playerId)
    player.connected = true
    this.emit(room, 'joined', `${this.playerName(player)} 已占位。`)
    return this.joinResult(room, playerId, playerSecret)
  }

  confirmSeat(roomId: string, secret: string, name: unknown): JoinResult {
    const room = this.getRoom(roomId)
    const seat = this.findSeat(room, secret)
    if (!seat) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (this.isAiPlayer(room, seat.playerId)) throw new RuleError('不能修改 AI 玩家。')
    if (room.state.status !== 'waiting') throw new RuleError('游戏已经开始，不能修改入座信息。')
    const playerName = typeof name === 'string' ? name.trim() : ''
    if (playerName.length > 16) throw new RuleError('玩家名字最多 16 个字符。')

    const player = this.playerById(room, seat.playerId)
    if (playerName) this.setPlayerName(player, playerName)
    player.seated = true
    player.connected = true
    room.emptySince = undefined
    this.emit(room, 'joined', `${this.playerName(player)} 已入座。`)
    return this.joinResult(room, seat.playerId, seat.secret)
  }

  addAiOpponent(roomId: string, requesterSecret: string, difficulty: unknown = 'standard', secondAi = false, secondDifficulty: unknown = 'standard'): JoinResult {
    const room = this.getRoom(roomId)
    const requester = this.findSeat(room, requesterSecret)
    if (!requester) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (!this.isHostSeat(room, requester)) throw new RuleError('只有房主可以加入 AI 对手。')
    if (!this.playerById(room, requester.playerId).seated) throw new RuleError('请先输入名字并入座。')
    if (room.state.status !== 'waiting') throw new RuleError('游戏已经开始，不能再加入 AI 对手。')
    if (!isDifficultyId(difficulty)) throw new RuleError('AI 难度无效。')
    let resolvedSecondDifficulty: DifficultyId = 'standard'
    if (secondAi) {
      if (!isDifficultyId(secondDifficulty)) throw new RuleError('第二个 AI 难度无效。')
      resolvedSecondDifficulty = secondDifficulty
    }

    if (room.state.gameType === 'classic' || room.state.gameType === 'pokemon') {
      return this.addClassicAiOpponent(room, requester, difficulty, secondAi, resolvedSecondDifficulty)
    }

    if (room.seats.p2) throw new RuleError('房间已满。')

    const aiSecret = randomId(24)
    room.seats.p2 = { playerId: 'p2', secret: aiSecret }
    room.ai = {
      p2: createAiController('p2', difficulty),
    }
    if (secondAi) {
      room.ai.p1 = createAiController('p1', resolvedSecondDifficulty)
      room.state.players.p1.name = 'AI 甲'
      room.state.players.p1.aiDifficulty = resolvedSecondDifficulty
      room.state.players.p2.name = 'AI 乙'
      room.state.players.p1.isAi = true
      room.state.players.p1.seated = true
      room.state.players.p1.connected = true
    } else {
      room.state.players.p2.name = 'AI 对手'
    }
    room.state.players.p2.isAi = true
    room.state.players.p2.aiDifficulty = difficulty
    room.state.players.p2.connected = true
    room.state.players.p2.seated = true
    this.emit(room, 'joined', secondAi ? '双 AI 已加入房间。' : 'AI 对手已加入房间。')
    return this.joinResult(room, requester.playerId, requester.secret)
  }

  private addClassicAiOpponent(room: Room, requester: Seat, difficulty: DifficultyId, secondAi: boolean, secondDifficulty: DifficultyId): JoinResult {
    const targetId = room.state.playerOrder.find((playerId) => playerId !== requester.playerId && !room.seats[playerId])
    if (!targetId) throw new RuleError('房间已满。')
    const aiSecret = randomId(24)
    room.seats[targetId] = { playerId: targetId, secret: aiSecret }
    room.ai ??= {}
    room.ai[targetId] = createAiController(targetId, difficulty)
    const aiPlayer = room.state.players[targetId]
    aiPlayer.name = classicAiName(targetId)
    aiPlayer.isAi = true
    aiPlayer.aiDifficulty = difficulty
    aiPlayer.connected = true
    aiPlayer.seated = true
    if (secondAi) {
      room.ai[requester.playerId] = createAiController(requester.playerId, secondDifficulty)
      const hostPlayer = room.state.players[requester.playerId]
      hostPlayer.name = 'AI 房主'
      hostPlayer.isAi = true
      hostPlayer.aiDifficulty = secondDifficulty
      hostPlayer.connected = true
      hostPlayer.seated = true
    }
    this.emit(room, 'joined', secondAi ? `${aiPlayer.name} 已加入，房主位交给 AI。` : `${aiPlayer.name} 已加入房间。`)
    return this.joinResult(room, requester.playerId, requester.secret)
  }

  setHostAi(roomId: string, requesterSecret: string, difficulty: unknown = 'standard'): JoinResult {
    const room = this.getRoom(roomId)
    const requester = this.findSeat(room, requesterSecret)
    if (!requester) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (!this.isHostSeat(room, requester)) throw new RuleError('只有房主可以设置 AI。')
    if (room.state.status !== 'waiting') throw new RuleError('游戏已经开始，不能修改 AI。')
    if (room.state.gameType !== 'classic' && room.state.gameType !== 'pokemon') throw new RuleError('只有璀璨宝石房间支持四人 AI。')
    if (!isDifficultyId(difficulty)) throw new RuleError('AI 难度无效。')
    const nonHost = room.state.playerOrder.filter((playerId) => playerId !== 'p1')
    if (!nonHost.every((playerId) => this.isAiPlayer(room, playerId))) throw new RuleError('需要先添加三个 AI 对手。')
    room.ai ??= {}
    room.ai.p1 = createAiController('p1', difficulty)
    const hostPlayer = room.state.players.p1
    hostPlayer.name = 'AI 房主'
    hostPlayer.isAi = true
    hostPlayer.aiDifficulty = difficulty
    hostPlayer.seated = true
    hostPlayer.connected = true
    this.emit(room, 'joined', '房主位已交给 AI。')
    return this.joinResult(room, requester.playerId, requester.secret)
  }

  updateAiDifficulty(roomId: string, requesterSecret: string, targetPlayerId: unknown, difficulty: unknown): JoinResult {
    const room = this.getRoom(roomId)
    const requester = this.findSeat(room, requesterSecret)
    if (!requester) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (!this.isHostSeat(room, requester)) throw new RuleError('只有房主可以修改 AI。')
    if (room.state.status !== 'waiting') throw new RuleError('游戏已经开始，不能修改 AI。')
    if (!isRoomPlayerId(targetPlayerId) || !room.state.playerOrder.includes(targetPlayerId)) throw new RuleError('目标 AI 不存在。')
    if (!this.isAiPlayer(room, targetPlayerId)) throw new RuleError('目标玩家不是 AI。')
    if (!isDifficultyId(difficulty)) throw new RuleError('AI 难度无效。')
    const ai = room.ai?.[targetPlayerId]
    if (!ai) throw new RuleError('目标 AI 不存在。')
    ai.difficulty = difficulty
    ai.memory = undefined
    room.state.players[targetPlayerId].aiDifficulty = difficulty
    this.emit(room, 'joined', `${this.playerName(room.state.players[targetPlayerId])} 难度已更新。`)
    return this.joinResult(room, requester.playerId, requester.secret)
  }

  removeAiPlayer(roomId: string, requesterSecret: string, targetPlayerId: unknown): JoinResult {
    const room = this.getRoom(roomId)
    const requester = this.findSeat(room, requesterSecret)
    if (!requester) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (!this.isHostSeat(room, requester)) throw new RuleError('只有房主可以移除 AI。')
    if (room.state.status !== 'waiting') throw new RuleError('游戏已经开始，不能移除 AI。')
    if (!isRoomPlayerId(targetPlayerId) || !room.state.playerOrder.includes(targetPlayerId)) throw new RuleError('目标 AI 不存在。')
    if (!this.isAiPlayer(room, targetPlayerId)) throw new RuleError('目标玩家不是 AI。')
    delete room.ai?.[targetPlayerId]
    if (Object.keys(room.ai ?? {}).length === 0) room.ai = undefined
    if (targetPlayerId !== requester.playerId) {
      delete room.seats[targetPlayerId]
      room.connections[targetPlayerId] = 0
      applyDuelSeatPayload(room.state.players[targetPlayerId], emptyDuelSeatPayload(targetPlayerId))
    } else {
      const player = room.state.players[targetPlayerId]
      player.name = '玩家一'
      player.isAi = undefined
      player.aiDifficulty = undefined
      player.seated = true
      player.connected = true
    }
    this.emit(room, 'joined', 'AI 已移除。')
    return this.joinResult(room, requester.playerId, requester.secret)
  }

  restartRoom(roomId: string, requesterSecret: string): JoinResult {
    const room = this.getRoom(roomId)
    const requester = this.findSeat(room, requesterSecret)
    if (!requester) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (!this.isHostSeat(room, requester)) throw new RuleError('只有房主可以开启新一局。')
    if (this.isAiPlayer(room, requester.playerId) && requester.playerId !== 'p1') throw new RuleError('不能使用 AI 身份开启新一局。')
    if (room.state.status !== 'finished') throw new RuleError('只有游戏结束后才能开启新一局。')
    if (!room.state.playerOrder.every((id) => room.seats[id])) throw new RuleError('需要所有玩家都在房间内才能开启新一局。')

    const previousState = room.state
    const nextState = createInitialGame(room.id, { gameType: previousState.gameType, playerCount: previousState.playerOrder.length === 4 ? 4 : 2 })
    for (const playerId of previousState.playerOrder) {
      nextState.players[playerId].name = previousState.players[playerId].name
      nextState.players[playerId].connected = previousState.players[playerId].connected
      nextState.players[playerId].seated = previousState.players[playerId].seated
      nextState.players[playerId].isAi = previousState.players[playerId].isAi
      nextState.players[playerId].aiDifficulty = previousState.players[playerId].aiDifficulty
    }
    room.state = nextState
    room.ai = this.resetAiControllers(room.ai)
    startGameIfReady(room.state)
    this.emit(room, 'snapshot', '新一局已开始。')
    this.queueAiIfNeeded(room, AI_OPENING_ACTION_DELAY_MS)
    return this.joinResult(room, requester.playerId, requester.secret)
  }

  getSnapshot(roomId: string, secret?: string): { state: AnyGameState; seq: number } {
    const room = this.getRoom(roomId)
    const seat = secret ? this.findSeat(room, secret) : undefined
    return { state: viewStateForPlayer(room.state, seat?.playerId), seq: room.seq }
  }

  apply(roomId: string, secret: string, action: AnyGameAction): PublicRoomEvent {
    const room = this.getRoom(roomId)
    const seat = Object.values(room.seats).find((item) => item?.secret === secret)
    if (!seat) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (seat.playerId !== action.playerId) throw new RuleError('不能替其他玩家行动。')
    const duelAction = action as GameAction
    if (action.type === 'startGame') {
      if (seat.playerId !== 'p1') throw new RuleError('只有房主可以开始游戏。')
      this.resetAiChainActions(room)
      room.state = applyAction(room.state, duelAction)
      const event = this.emit(room, 'action', '游戏已开始。', duelAction)
      this.queueAiIfNeeded(room, AI_OPENING_ACTION_DELAY_MS)
      return viewEventForPlayer(event, seat.playerId)
    }
    if (this.isAiPlayer(room, seat.playerId)) throw new RuleError('不能使用 AI 身份提交行动。')
    if (!room.state.players[seat.playerId as PlayerId].seated) throw new RuleError('请先输入名字并入座。')
    this.resetAiChainActions(room)
    room.state = applyAction(room.state, duelAction)
    const event = this.emit(room, 'action', '行动已执行。', duelAction)
    this.queueAiIfNeeded(room, aiDelayAfterAction(duelAction))
    return viewEventForPlayer(event, seat.playerId)
  }

  publishIntent(roomId: string, secret: string, intent: RoomIntent): PublicRoomEvent {
    const room = this.getRoom(roomId)
    const seat = this.findSeat(room, secret)
    if (!seat) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (room.state.gameType !== 'duel' && room.state.gameType !== 'classic' && room.state.gameType !== 'pokemon') throw new RuleError('当前房间不支持同步操作意图。')
    if (room.state.status !== 'playing' || room.state.winner || room.state.pending || room.state.currentPlayer !== seat.playerId) {
      throw new RuleError('当前不能同步操作意图。')
    }
    room.seq += 1
    room.updatedAt = Date.now()
    const event: PublicRoomEvent = { seq: room.seq, type: 'intent', playerId: seat.playerId, intent }
    room.subscribers.forEach((subscriber) => subscriber(event))
    return event
  }

  subscribe(roomId: string, after: number, subscriber: Subscriber, secret?: string): () => void {
    const room = this.getRoom(roomId)
    const seat = secret ? this.findSeat(room, secret) : undefined
    const wrappedSubscriber: Subscriber = (event) => subscriber(viewEventForPlayer(event, secret ? this.findSeat(room, secret)?.playerId : undefined))
    room.events.filter((event) => event.seq > after).forEach(wrappedSubscriber)
    room.subscribers.add(wrappedSubscriber)
    if (seat) this.markConnected(room, seat.playerId)
    return () => room.subscribers.delete(wrappedSubscriber)
  }

  disconnect(roomId: string, secret?: string): void {
    if (!secret) return
    const room = this.rooms.get(roomId)
    if (!room) return
    const seat = this.findSeat(room, secret)
    if (!seat) return
    const connections = Math.max(0, (room.connections[seat.playerId] ?? 1) - 1)
    room.connections[seat.playerId] = connections
    const player = this.playerById(room, seat.playerId)
    if (connections === 0 && player.connected) {
      player.connected = false
      this.emit(room, 'snapshot', `${this.playerName(player)} 已离线。`)
    }
    if (this.hasActiveHumanConnection(room)) {
      room.emptySince = undefined
    } else {
      room.emptySince ??= Date.now()
    }
  }

  moveSeat(roomId: string, secret: string, targetPlayerId: unknown): JoinResult {
    const room = this.getRoom(roomId)
    if (room.state.status !== 'waiting') throw new RuleError('游戏已经开始，不能换座。')
    const sourceSeat = this.findSeat(room, secret)
    if (!sourceSeat) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (this.isAiPlayer(room, sourceSeat.playerId)) throw new RuleError('不能使用 AI 身份换座。')
    const targetId = typeof targetPlayerId === 'string' && room.state.playerOrder.includes(targetPlayerId as PlayerId) ? (targetPlayerId as PlayerId) : undefined
    if (!targetId) throw new RuleError('目标座位不存在。')
    if (targetId === sourceSeat.playerId) return this.joinResult(room, sourceSeat.playerId, sourceSeat.secret)

    const source = room.state.players[sourceSeat.playerId]
    const target = room.state.players[targetId]
    const targetSeat = room.seats[targetId]
    const sourcePayload = duelSeatPayload(source)
    const targetPayload = targetSeat ? duelSeatPayload(target) : emptyDuelSeatPayload(targetId)

    applyDuelSeatPayload(target, sourcePayload)
    applyDuelSeatPayload(source, targetPayload)

    if (targetSeat) {
      room.seats[source.id] = { ...targetSeat, playerId: source.id }
      room.seats[targetId] = { ...sourceSeat, playerId: targetId }
    } else {
      delete room.seats[source.id]
      room.seats[targetId] = { ...sourceSeat, playerId: targetId }
    }
    this.swapAiControllers(room, source.id, targetId, Boolean(targetSeat))
    this.swapConnections(room, source.id, targetId, Boolean(targetSeat))

    this.emit(room, 'joined', targetSeat ? `${target.name} 与 ${source.name} 已交换座位。` : `${source.name} 已移动座位。`)
    return this.joinResult(room, targetId, sourceSeat.secret)
  }

  private emit(room: Room, type: PublicRoomStateEvent['type'], message: string, action?: AnyGameAction): PublicRoomStateEvent {
    room.seq += 1
    room.updatedAt = Date.now()
    const event = publicEvent(room, type, message, action)
    room.events.push(event)
    if (room.events.length > 250) room.events.splice(0, room.events.length - 250)
    room.subscribers.forEach((subscriber) => subscriber(event))
    return event
  }

  private joinResult(room: Room, playerId: RoomPlayerId, playerSecret: string): JoinResult {
    return { roomId: room.id, playerId, playerSecret, state: viewStateForPlayer(room.state, playerId), seq: room.seq }
  }

  private queueAiIfNeeded(room: Room, delayMs = AI_ACTION_DELAY_MS): void {
    const ai = this.aiToAct(room)
    if (!ai || ai.running || ai.queued) return
    ai.queued = true
    setTimeout(() => {
      try {
        ai.queued = false
        this.runAiIfNeeded(room, ai.playerId)
      } catch (error) {
        ai.running = false
        const message = error instanceof Error ? error.message : '未知 AI 错误。'
        this.recordAiIssue(room, `AI 行动失败：${message}`)
        this.emit(room, 'error', `AI 行动失败：${message}`)
      }
    }, delayMs)
  }

  private runAiIfNeeded(room: Room, playerId: RoomPlayerId): void {
    const ai = room.ai?.[playerId]
    if (!ai || ai.running) return
    ai.running = true
    let action: AnyGameAction | null = null
    try {
      if (!this.isAiToAct(room, ai.playerId)) {
        ai.chainActions = 0
        return
      }
      ai.chainActions += 1
      if (ai.chainActions > AI_MAX_CHAIN_ACTIONS) {
        this.recordAiIssue(room, 'AI 行动超过安全上限，已停止自动行动。')
        this.emit(room, 'error', 'AI 行动超过安全上限，已停止自动行动。')
        return
      }
      const decision = chooseAiAction({
        state: room.state,
        aiPlayerId: ai.playerId,
        config: { difficulty: ai.difficulty },
        memory: ai.memory,
      })
      ai.memory = decision.updatedMemory
      action = decision.action
      if (!action) {
        this.recordAiIssue(room, 'AI 没有可执行的合法行动。')
        this.emit(room, 'error', 'AI 没有可执行的合法行动。')
        return
      }
      room.state = applyAction(room.state, action as GameAction)
      this.emit(room, 'action', 'AI 已行动。', action)
    } finally {
      ai.running = false
      const nextAi = this.aiToAct(room)
      if (nextAi) this.queueAiIfNeeded(room, aiDelayAfterAction(action))
      if (nextAi?.playerId !== ai.playerId) ai.chainActions = 0
    }
  }

  private isAiToAct(room: Room, playerId: RoomPlayerId): boolean {
    if (!this.isAiPlayer(room, playerId) || room.state.status !== 'playing' || room.state.winner) return false
    if (room.state.pending) return room.state.pending.playerId === playerId
    return room.state.currentPlayer === playerId
  }

  private aiToAct(room: Room): AiController | undefined {
    if (!room.ai || room.state.status !== 'playing' || room.state.winner) return undefined
    const playerId = (room.state.pending?.playerId ?? room.state.currentPlayer) as PlayerId
    return room.ai[playerId]
  }

  private isAiPlayer(room: Room, playerId: RoomPlayerId): boolean {
    return Boolean(room.ai?.[playerId])
  }

  private isHostSeat(room: Room, seat: Seat): boolean {
    return seat.playerId === 'p1'
  }

  private swapAiControllers(room: Room, sourceId: RoomPlayerId, targetId: RoomPlayerId, swapTarget: boolean): void {
    const sourceAi = room.ai?.[sourceId]
    const targetAi = room.ai?.[targetId]
    if (!sourceAi && !targetAi) return
    room.ai ??= {}
    if (swapTarget && targetAi) room.ai[sourceId] = { ...targetAi, playerId: sourceId }
    else delete room.ai[sourceId]
    if (sourceAi) room.ai[targetId] = { ...sourceAi, playerId: targetId }
    else delete room.ai[targetId]
  }

  private swapConnections(room: Room, sourceId: RoomPlayerId, targetId: RoomPlayerId, swapTarget: boolean): void {
    const sourceConnections = room.connections[sourceId] ?? 0
    const targetConnections = room.connections[targetId] ?? 0
    room.connections[targetId] = sourceConnections
    room.connections[sourceId] = swapTarget ? targetConnections : 0
  }

  private recordAiIssue(room: Room, message: string): void {
    room.state.log.unshift(message)
  }

  private resetAiControllers(ai: Room['ai']): Room['ai'] {
    if (!ai) return undefined
    return Object.fromEntries(
      Object.entries(ai).map(([playerId, controller]) => [
        playerId,
        {
          ...controller,
          memory: undefined,
          queued: false,
          running: false,
          chainActions: 0,
        },
      ]),
    ) as Room['ai']
  }

  private resetAiChainActions(room: Room): void {
    Object.values(room.ai ?? {}).forEach((ai) => {
      if (ai) ai.chainActions = 0
    })
  }

  private getRoom(roomId: string): Room {
    const room = this.rooms.get(roomId)
    if (!room) throw new RoomNotFoundError('房间不存在或已过期。')
    if (this.isExpired(room, Date.now())) {
      this.rooms.delete(roomId)
      throw new RoomNotFoundError('房间不存在或已过期。')
    }
    room.updatedAt = Date.now()
    return room
  }

  private findSeat(room: Room, secret: string): Seat | undefined {
    return Object.values(room.seats).find((seat) => seat?.secret === secret)
  }

  private nextOpenSeat(room: Room): RoomPlayerId | undefined {
    return room.state.playerOrder.find((playerId) => !room.seats[playerId])
  }

  private playerById(room: Room, playerId: RoomPlayerId): { connected?: boolean; seated?: boolean; name?: string; username?: string } {
    const player = room.state.players[playerId]
    if (!player) throw new RuleError('玩家不存在。')
    return player
  }

  private playerName(player: { name?: string; username?: string }): string {
    return player.name ?? player.username ?? '玩家'
  }

  private setPlayerName(player: { name?: string; username?: string }, name: string): void {
    if ('username' in player) player.username = name
    else player.name = name
  }

  private markConnected(room: Room, playerId: RoomPlayerId): void {
    room.connections[playerId] = (room.connections[playerId] ?? 0) + 1
    room.emptySince = undefined
    const player = this.playerById(room, playerId)
    if (!player.connected) {
      player.connected = true
      this.emit(room, 'joined', `${this.playerName(player)} 已重新连接。`)
    }
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [id, room] of this.rooms) {
      if (this.isExpired(room, now)) this.rooms.delete(id)
    }
  }

  private isExpired(room: Room, now: number): boolean {
    return room.emptySince !== undefined && now - room.emptySince >= EMPTY_ROOM_TTL_MS
  }

  private hasActiveHumanConnection(room: Room): boolean {
    return Object.values(room.seats).some((seat) => {
      if (!seat || this.isAiPlayer(room, seat.playerId)) return false
      return (room.connections[seat.playerId] ?? 0) > 0
    })
  }
}

function createAiController(playerId: RoomPlayerId, difficulty: DifficultyId): AiController {
  return { playerId, difficulty, queued: false, running: false, chainActions: 0 }
}

function classicAiName(playerId: RoomPlayerId): string {
  return {
    p1: 'AI 房主',
    p2: 'AI 对手一',
    p3: 'AI 对手二',
    p4: 'AI 对手三',
  }[playerId]
}

function isRoomPlayerId(value: unknown): value is RoomPlayerId {
  return value === 'p1' || value === 'p2' || value === 'p3' || value === 'p4'
}

function aiDelayAfterAction(action: AnyGameAction | null): number {
  if (!action) return AI_ACTION_DELAY_MS
  if (action.type === 'startGame') return AI_OPENING_ACTION_DELAY_MS
  if (action.type === 'chooseRoyal' || action.type === 'discardToken' || action.type === 'discardTokens' || action.type === 'reorderTokenSlots') return AI_FAST_PENDING_DELAY_MS
  if (action.type === 'purchaseCard' || action.type === 'buyCard') return 1900
  if (action.type === 'reserveCard') return 1800
  if (action.type === 'takeTokens' || action.type === 'takeClassicBankTokens' || action.type === 'takeGems') return 1500
  if (action.type === 'replenishBoard' || action.type === 'usePrivilege' || action.type === 'takeBoardToken' || action.type === 'stealToken') return 1500
  if (action.type === 'evolvePokemon' || action.type === 'chooseNoble') return AI_FAST_PENDING_DELAY_MS
  if (action.type === 'endTurn') return AI_FAST_PENDING_DELAY_MS
  return AI_ACTION_DELAY_MS
}

type DuelSeatPayload = Pick<GameState['players'][PlayerId], 'name' | 'isAi' | 'aiDifficulty' | 'seated' | 'connected'>

function duelSeatPayload(player: GameState['players'][PlayerId]): DuelSeatPayload {
  return {
    name: player.name,
    isAi: player.isAi,
    aiDifficulty: player.aiDifficulty,
    seated: player.seated,
    connected: player.connected,
  }
}

function emptyDuelSeatPayload(playerId: PlayerId): DuelSeatPayload {
  return {
    name: { p1: '玩家一', p2: '玩家二', p3: '玩家三', p4: '玩家四' }[playerId],
    isAi: undefined,
    aiDifficulty: undefined,
    seated: false,
    connected: false,
  }
}

function applyDuelSeatPayload(player: GameState['players'][PlayerId], payload: DuelSeatPayload): void {
  player.name = payload.name
  player.isAi = payload.isAi
  player.aiDifficulty = payload.aiDifficulty
  player.seated = payload.seated
  player.connected = payload.connected
}

const roomStoreGlobal = globalThis as typeof globalThis & {
  __gemDuelArenaRoomStore?: RoomStore
}

export const roomStore = (roomStoreGlobal.__gemDuelArenaRoomStore ??= new RoomStore())

export function jsonOk(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

export function jsonError(error: unknown): Response {
  const message = error instanceof Error ? error.message : '未知错误。'
  const status = error instanceof RoomNotFoundError ? 404 : error instanceof RuleError ? 400 : 500
  return Response.json({ error: message }, { status })
}
