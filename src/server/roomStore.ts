import { applyAction, createInitialGame, RuleError, startGameIfReady } from '@/game/rules'
import type { AnyGameAction, AnyGameState, GameAction, GameState, PlayerId, PokemonSpecialSet, PublicRoomEvent, PublicRoomStateEvent, RoomFeedItem, RoomFeedKind, RoomIntent } from '@/game/types'
import { chooseAiAction, isDifficultyId } from '@/game/ai'
import type { AiMemory, DifficultyId } from '@/game/ai'

export class RoomNotFoundError extends RuleError {}

type Subscriber = (event: PublicRoomEvent) => void
const AI_ACTION_DELAY_MS = 1600
const AI_FAST_PENDING_DELAY_MS = 900
const AI_OPENING_ACTION_DELAY_MS = 2600
const AI_MAX_CHAIN_ACTIONS = 40
const EMPTY_ROOM_TTL_MS = 1000 * 60
const TEMPORARY_AI_DISCONNECT_MS = 1000 * 20
const ROOM_EVENT_LIMIT = 80
const ROOM_FEED_LIMIT = 120
const CHAT_MESSAGE_LIMIT = 280
const ROOM_MACHINE_COOKIE = 'splendor_room_machine'
const ROOM_MACHINE_HEADER = 'X-Splendor-Room-Machine'
const ROOM_MACHINE_PARAM = 'roomMachine'
const ROOM_MACHINE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12
const CURSOR_PATH_POINT_LIMIT = 48
const CURSOR_PATH_DURATION_LIMIT_MS = 5000

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
  temporary?: boolean
}

interface Room {
  id: string
  createdAt: number
  updatedAt: number
  emptySince?: number
  hostSecret?: string
  seats: Partial<Record<RoomPlayerId, Seat>>
  connections: Partial<Record<RoomPlayerId, number>>
  state: GameState
  seq: number
  events: PublicRoomEvent[]
  subscribers: Set<Subscriber>
  ai?: Partial<Record<RoomPlayerId, AiController>>
  temporaryAiTimers?: Partial<Record<RoomPlayerId, ReturnType<typeof setTimeout>>>
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

function currentFlyMachineId(): string | undefined {
  return process.env.FLY_MACHINE_ID || undefined
}

function isValidMachineId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of (cookieHeader ?? '').split(';')) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      // Ignore malformed cookie escaping and use the raw value.
    }
    if (key) cookies[key] = value
  }
  return cookies
}

function machineFromUrl(value: string | null): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const machine = url.searchParams.get(ROOM_MACHINE_PARAM) ?? undefined
    return isValidMachineId(machine) ? machine : undefined
  } catch {
    return undefined
  }
}

function requestedRoomMachine(request: Request): string | undefined {
  const requestUrlMachine = machineFromUrl(request.url)
  if (requestUrlMachine) return requestUrlMachine

  const headerMachine = request.headers.get(ROOM_MACHINE_HEADER) ?? undefined
  if (isValidMachineId(headerMachine)) return headerMachine

  const referrerMachine = machineFromUrl(request.headers.get('referer'))
  if (referrerMachine) return referrerMachine

  const cookieMachine = parseCookieHeader(request.headers.get('cookie'))[ROOM_MACHINE_COOKIE]
  return isValidMachineId(cookieMachine) ? cookieMachine : undefined
}

export function replayToRoomMachine(request: Request): Response | undefined {
  const currentMachine = currentFlyMachineId()
  const targetMachine = requestedRoomMachine(request)
  if (!currentMachine || !targetMachine || targetMachine === currentMachine || request.headers.has('fly-replay-failed')) return undefined

  return new Response(null, {
    status: 409,
    headers: {
      'Fly-Replay': `instance=${targetMachine}`,
      'Cache-Control': 'no-store',
    },
  })
}

export function withRoomMachineRouting(init?: ResponseInit): ResponseInit {
  const machineId = currentFlyMachineId()
  if (!machineId) return init ?? {}

  const headers = new Headers(init?.headers)
  headers.set(ROOM_MACHINE_HEADER, machineId)
  headers.append(
    'Set-Cookie',
    `${ROOM_MACHINE_COOKIE}=${encodeURIComponent(machineId)}; Path=/; Max-Age=${ROOM_MACHINE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax; HttpOnly; Secure`,
  )
  return { ...init, headers }
}

function publicEvent(room: Room, type: PublicRoomStateEvent['type'], message: string, action?: AnyGameAction): PublicRoomStateEvent {
  return { seq: room.seq, type, message, state: room.state, action }
}

function viewStateForPlayer(state: AnyGameState, playerId?: RoomPlayerId, myIsHost = false): AnyGameState {
  if (!playerId) return state
  return { ...state, myPlayerId: playerId, myIsHost }
}

function viewEventForPlayer(event: PublicRoomEvent, playerId?: RoomPlayerId, myIsHost = false): PublicRoomEvent {
  if (event.type === 'intent') return event
  return { ...event, state: viewStateForPlayer(event.state, playerId, myIsHost) }
}

function clampUnit(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value))
}

function sanitizeCursorPanel(value: unknown): { playerId: RoomPlayerId; x: number; y: number } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const panel = value as { playerId?: unknown; x?: unknown; y?: unknown }
  if (!isRoomPlayerId(panel.playerId)) return undefined
  const x = clampUnit(panel.x)
  const y = clampUnit(panel.y)
  if (x === undefined || y === undefined) return undefined
  return { playerId: panel.playerId, x, y }
}

function sanitizeCursorPathAt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(CURSOR_PATH_DURATION_LIMIT_MS, value))
}

function sameCursorPoint(
  left: { x: number; y: number; visible: boolean; panel?: { playerId: RoomPlayerId; x: number; y: number } },
  right: { x: number; y: number; visible: boolean; panel?: { playerId: RoomPlayerId; x: number; y: number } },
): boolean {
  const samePanel = !left.panel && !right.panel
    ? true
    : Boolean(
        left.panel
        && right.panel
        && left.panel.playerId === right.panel.playerId
        && Math.abs(left.panel.x - right.panel.x) <= 0.0001
        && Math.abs(left.panel.y - right.panel.y) <= 0.0001,
      )
  return left.visible === right.visible && Math.abs(left.x - right.x) <= 0.0001 && Math.abs(left.y - right.y) <= 0.0001 && samePanel
}

function sanitizeCursorIntent(intent: Extract<RoomIntent, { type: 'cursorMove' }>): Extract<RoomIntent, { type: 'cursorMove' }> | undefined {
  const x = clampUnit(intent.x)
  const y = clampUnit(intent.y)
  if (x === undefined || y === undefined) return undefined
  const visible = intent.visible === true
  const path = Array.isArray(intent.path)
    ? intent.path.slice(-CURSOR_PATH_POINT_LIMIT).flatMap((point) => {
        const pointX = clampUnit(point.x)
        const pointY = clampUnit(point.y)
        if (pointX === undefined || pointY === undefined) return []
        const panel = sanitizeCursorPanel(point.panel)
        return [{ x: pointX, y: pointY, at: sanitizeCursorPathAt(point.at), visible: point.visible === true, ...(panel ? { panel } : {}) }]
      })
    : []
  const latestPanel = sanitizeCursorPanel(intent.panel)
  const latest = { x, y, at: path[path.length - 1]?.at ?? 0, visible, ...(latestPanel ? { panel: latestPanel } : {}) }
  if (path.length === 0 || !sameCursorPoint(path[path.length - 1], latest)) {
    path.push(latest)
  }
  const trimmed = path.slice(-CURSOR_PATH_POINT_LIMIT)
  const sample = trimmed[trimmed.length - 1] ?? latest
  return {
    type: 'cursorMove',
    x: sample.x,
    y: sample.y,
    visible: sample.visible,
    ...(sample.panel ? { panel: sample.panel } : {}),
    path: trimmed,
    ...(intent.click === true ? { click: true } : {}),
  }
}

class RoomStore {
  private rooms = new Map<string, Room>()

  createRoom(options?: { gameType?: unknown; playerCount?: unknown; pokemonSpecialSet?: unknown }): JoinResult {
    this.cleanup()
    const id = randomId(8)
    const gameType = options?.gameType === 'classic' || options?.gameType === 'pokemon' ? options.gameType : 'duel'
    const pokemonSpecialSet: PokemonSpecialSet = options?.pokemonSpecialSet === 'alternate' ? 'alternate' : 'primary'
    const state = createInitialGame(id, { gameType, playerCount: gameType === 'classic' || gameType === 'pokemon' ? 4 : 2, pokemonSpecialSet })
    state.feed = []
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
    const firstSeat = Object.values(room.seats).every((seat) => !seat)
    const playerSecret = existing?.secret ?? randomId(24)
    if (!room.hostSecret && firstSeat) room.hostSecret = playerSecret
    room.seats[playerId] = { playerId, secret: playerSecret }
    room.emptySince = undefined
    const player = this.playerById(room, playerId)
    const wasConnected = player.connected
    const restoredTemporaryAi = existing ? this.stopTemporaryAi(room, playerId) : false
    player.connected = true
    if (!existing) {
      this.emit(room, 'joined', `${this.playerName(player)} 已占位。`)
    } else if (restoredTemporaryAi) {
      this.emit(room, 'joined', `${this.playerName(player)} 已回来，AI 托管已停止。`)
    } else if (!wasConnected) {
      this.emit(room, 'joined', `${this.playerName(player)} 已重新连接。`)
    }
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

    const targetId = room.state.playerOrder.find((playerId) => playerId !== requester.playerId && !room.seats[playerId])
    if (!targetId) throw new RuleError('房间已满。')

    const aiSecret = randomId(24)
    room.seats[targetId] = { playerId: targetId, secret: aiSecret }
    room.ai = {
      [targetId]: createAiController(targetId, difficulty),
    }
    if (secondAi) {
      room.ai[requester.playerId] = createAiController(requester.playerId, resolvedSecondDifficulty)
      room.state.players[requester.playerId].name = 'AI 甲'
      room.state.players[requester.playerId].aiDifficulty = resolvedSecondDifficulty
      room.state.players[targetId].name = 'AI 乙'
      room.state.players[requester.playerId].isAi = true
      room.state.players[requester.playerId].seated = true
      room.state.players[requester.playerId].connected = true
    } else {
      room.state.players[targetId].name = 'AI 对手'
    }
    room.state.players[targetId].isAi = true
    room.state.players[targetId].aiDifficulty = difficulty
    room.state.players[targetId].connected = true
    room.state.players[targetId].seated = true
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
      player.aiControlled = undefined
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
    const nextState = createInitialGame(room.id, { gameType: previousState.gameType, playerCount: previousState.playerOrder.length === 4 ? 4 : 2, pokemonSpecialSet: previousState.pokemonSpecial?.set })
    for (const playerId of previousState.playerOrder) {
      nextState.players[playerId].name = previousState.players[playerId].name
      nextState.players[playerId].connected = previousState.players[playerId].connected
      nextState.players[playerId].seated = previousState.players[playerId].seated
      nextState.players[playerId].isAi = previousState.players[playerId].isAi
      nextState.players[playerId].aiDifficulty = previousState.players[playerId].aiDifficulty
      nextState.players[playerId].aiControlled = undefined
    }
    nextState.feed = previousState.feed ?? []
    room.state = nextState
    room.ai = this.resetAiControllers(room.ai, true)
    startGameIfReady(room.state)
    this.emit(room, 'snapshot', '新一局已开始。')
    this.queueAiIfNeeded(room, AI_OPENING_ACTION_DELAY_MS)
    return this.joinResult(room, requester.playerId, requester.secret)
  }

  getSnapshot(roomId: string, secret?: string): { state: AnyGameState; seq: number } {
    const room = this.getRoom(roomId)
    const seat = secret ? this.findSeat(room, secret) : undefined
    return { state: viewStateForPlayer(room.state, seat?.playerId, Boolean(seat && this.isHostSeat(room, seat))), seq: room.seq }
  }

  postChatMessage(roomId: string, secret: string, message: unknown): PublicRoomEvent {
    const room = this.getRoom(roomId)
    const seat = this.findSeat(room, secret)
    if (!seat) throw new RuleError('玩家身份无效，请重新加入房间。')
    const text = typeof message === 'string' ? message.trim().replace(/\s+/g, ' ') : ''
    if (!text) throw new RuleError('聊天内容不能为空。')
    const clipped = text.slice(0, CHAT_MESSAGE_LIMIT)
    const player = this.playerById(room, seat.playerId)
    const event = this.emit(room, 'snapshot', `${this.playerName(player)}：${clipped}`, undefined, {
      kind: 'chat',
      playerId: seat.playerId,
      playerName: this.playerName(player),
      message: clipped,
    })
    return viewEventForPlayer(event, seat.playerId, this.isHostSeat(room, seat))
  }

  apply(roomId: string, secret: string, action: AnyGameAction): PublicRoomEvent {
    const room = this.getRoom(roomId)
    const seat = Object.values(room.seats).find((item) => item?.secret === secret)
    if (!seat) throw new RuleError('玩家身份无效，请重新加入房间。')
    const duelAction = action as GameAction
    if (action.type === 'startGame') {
      if (!this.isHostSeat(room, seat)) throw new RuleError('只有房主可以开始游戏。')
      const startAction = { ...duelAction, playerId: seat.playerId }
      this.resetAiChainActions(room)
      room.state = applyAction(room.state, startAction)
      const event = this.emit(room, 'action', '游戏已开始。', startAction)
      this.queueAiIfNeeded(room, AI_OPENING_ACTION_DELAY_MS)
      return viewEventForPlayer(event, seat.playerId, true)
    }
    if (seat.playerId !== action.playerId) throw new RuleError('不能替其他玩家行动。')
    if (this.isAiPlayer(room, seat.playerId)) throw new RuleError('不能使用 AI 身份提交行动。')
    if (!room.state.players[seat.playerId as PlayerId].seated) throw new RuleError('请先输入名字并入座。')
    this.resetAiChainActions(room)
    room.state = applyAction(room.state, duelAction)
    const event = this.emit(room, 'action', '行动已执行。', duelAction)
    this.queueAiIfNeeded(room, aiDelayAfterAction(duelAction))
    return viewEventForPlayer(event, seat.playerId, this.isHostSeat(room, seat))
  }

  publishIntent(roomId: string, secret: string, intent: RoomIntent): PublicRoomEvent {
    const room = this.getRoom(roomId)
    const seat = this.findSeat(room, secret)
    if (!seat) throw new RuleError('玩家身份无效，请重新加入房间。')
    if (room.state.gameType !== 'duel' && room.state.gameType !== 'classic' && room.state.gameType !== 'pokemon') throw new RuleError('当前房间不支持同步操作意图。')
    if (intent.type === 'cursorMove') {
      const sanitized = sanitizeCursorIntent(intent)
      if (!sanitized) throw new RuleError('鼠标同步数据无效。')
      const event: PublicRoomEvent = { seq: room.seq + 1, type: 'intent', playerId: seat.playerId, intent: sanitized }
      room.seq += 1
      room.updatedAt = Date.now()
      room.subscribers.forEach((subscriber) => subscriber(event))
      return event
    }
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
    const wrappedSubscriber: Subscriber = (event) => {
      const liveSeat = secret ? this.findSeat(room, secret) : undefined
      subscriber(viewEventForPlayer(event, liveSeat?.playerId, Boolean(liveSeat && this.isHostSeat(room, liveSeat))))
    }
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
      this.scheduleTemporaryAi(room, seat.playerId)
    }
    if (this.hasActiveHumanConnection(room)) {
      room.emptySince = undefined
    } else {
      room.emptySince ??= Date.now()
    }
  }

  moveSeat(roomId: string, secret: string, targetPlayerId: unknown): JoinResult {
    const room = this.getRoom(roomId)
    this.ensureHostSecret(room)
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

  private emit(
    room: Room,
    type: PublicRoomStateEvent['type'],
    message: string,
    action?: AnyGameAction,
    feed?: Pick<RoomFeedItem, 'kind' | 'message' | 'playerId' | 'playerName'>,
  ): PublicRoomStateEvent {
    room.seq += 1
    room.updatedAt = Date.now()
    this.appendFeed(room, feed ?? this.feedItemForStateEvent(type, message, action))
    const event = publicEvent(room, type, message, action)
    room.events.push(event)
    if (room.events.length > ROOM_EVENT_LIMIT) room.events.splice(0, room.events.length - ROOM_EVENT_LIMIT)
    room.subscribers.forEach((subscriber) => subscriber(event))
    return event
  }

  private appendFeed(room: Room, item: Pick<RoomFeedItem, 'kind' | 'message' | 'playerId' | 'playerName'> | undefined): void {
    if (!item?.message) return
    const feed = (room.state.feed ??= [])
    feed.push({
      id: `${room.id}:${room.seq}:${feed.length}`,
      seq: room.seq,
      at: Date.now(),
      kind: item.kind,
      message: item.message,
      playerId: item.playerId,
      playerName: item.playerName,
    })
    if (feed.length > ROOM_FEED_LIMIT) feed.splice(0, feed.length - ROOM_FEED_LIMIT)
  }

  private feedItemForStateEvent(type: PublicRoomStateEvent['type'], message: string, action?: AnyGameAction): Pick<RoomFeedItem, 'kind' | 'message' | 'playerId' | 'playerName'> | undefined {
    if (!message) return undefined
    const kind: RoomFeedKind = type === 'action' ? 'action' : type === 'joined' ? 'event' : type === 'error' ? 'status' : 'status'
    const playerId = action && isRoomPlayerId(action.playerId) ? action.playerId : undefined
    return { kind, message, playerId }
  }

  private joinResult(room: Room, playerId: RoomPlayerId, playerSecret: string): JoinResult {
    const seat = room.seats[playerId]
    return { roomId: room.id, playerId, playerSecret, state: viewStateForPlayer(room.state, playerId, Boolean(seat && this.isHostSeat(room, seat))), seq: room.seq }
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

  private isPermanentAiPlayer(room: Room, playerId: RoomPlayerId): boolean {
    return Boolean(room.ai?.[playerId] && !room.ai?.[playerId]?.temporary)
  }

  private isHostSeat(room: Room, seat: Seat): boolean {
    return seat.secret === this.ensureHostSecret(room)
  }

  private ensureHostSecret(room: Room): string | undefined {
    room.hostSecret ??= room.seats.p1?.secret
    return room.hostSecret
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

  private resetAiControllers(ai: Room['ai'], dropTemporary = false): Room['ai'] {
    if (!ai) return undefined
    const entries = Object.entries(ai).filter(([, controller]) => !dropTemporary || !controller.temporary)
    if (entries.length === 0) return undefined
    return Object.fromEntries(
      entries.map(([playerId, controller]) => [
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
      Object.values(room.temporaryAiTimers ?? {}).forEach((timer) => timer && clearTimeout(timer))
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

  private playerById(room: Room, playerId: RoomPlayerId): GameState['players'][PlayerId] {
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
    this.clearTemporaryAiTimer(room, playerId)
    const restoredTemporaryAi = this.stopTemporaryAi(room, playerId)
    if (!player.connected || restoredTemporaryAi) {
      player.connected = true
      this.emit(room, 'joined', restoredTemporaryAi ? `${this.playerName(player)} 已重新连接，AI 托管已停止。` : `${this.playerName(player)} 已重新连接。`)
    }
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [id, room] of this.rooms) {
      if (this.isExpired(room, now)) {
        Object.values(room.temporaryAiTimers ?? {}).forEach((timer) => timer && clearTimeout(timer))
        this.rooms.delete(id)
      }
    }
  }

  private isExpired(room: Room, now: number): boolean {
    return room.emptySince !== undefined && now - room.emptySince >= EMPTY_ROOM_TTL_MS
  }

  private hasActiveHumanConnection(room: Room): boolean {
    return Object.values(room.seats).some((seat) => {
      if (!seat || this.isPermanentAiPlayer(room, seat.playerId)) return false
      return (room.connections[seat.playerId] ?? 0) > 0
    })
  }

  private scheduleTemporaryAi(room: Room, playerId: RoomPlayerId): void {
    const player = this.playerById(room, playerId)
    if (player.isAi || !player.seated || room.state.status !== 'playing' || room.state.winner) return
    this.clearTemporaryAiTimer(room, playerId)
    room.temporaryAiTimers ??= {}
    room.temporaryAiTimers[playerId] = setTimeout(() => {
      const liveRoom = this.rooms.get(room.id)
      if (!liveRoom || this.isExpired(liveRoom, Date.now())) return
      delete liveRoom.temporaryAiTimers?.[playerId]
      if ((liveRoom.connections[playerId] ?? 0) > 0) return
      const livePlayer = this.playerById(liveRoom, playerId)
      if (livePlayer.isAi || !livePlayer.seated || liveRoom.state.status !== 'playing' || liveRoom.state.winner) return
      liveRoom.ai ??= {}
      liveRoom.ai[playerId] = createAiController(playerId, 'standard', true)
      livePlayer.aiControlled = true
      livePlayer.aiDifficulty = 'standard'
      this.emit(liveRoom, 'snapshot', `${this.playerName(livePlayer)} 离线超过 20 秒，AI 已临时接管。`)
      this.queueAiIfNeeded(liveRoom, AI_FAST_PENDING_DELAY_MS)
    }, TEMPORARY_AI_DISCONNECT_MS)
  }

  private clearTemporaryAiTimer(room: Room, playerId: RoomPlayerId): void {
    const timer = room.temporaryAiTimers?.[playerId]
    if (!timer) return
    clearTimeout(timer)
    delete room.temporaryAiTimers?.[playerId]
  }

  private stopTemporaryAi(room: Room, playerId: RoomPlayerId): boolean {
    this.clearTemporaryAiTimer(room, playerId)
    const ai = room.ai?.[playerId]
    if (!ai?.temporary) return false
    delete room.ai?.[playerId]
    if (Object.keys(room.ai ?? {}).length === 0) room.ai = undefined
    const player = this.playerById(room, playerId)
    player.aiControlled = undefined
    if (!player.isAi) player.aiDifficulty = undefined
    return true
  }
}

function createAiController(playerId: RoomPlayerId, difficulty: DifficultyId, temporary = false): AiController {
  return { playerId, difficulty, queued: false, running: false, chainActions: 0, ...(temporary ? { temporary } : {}) }
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
  if (action.type === 'evolvePokemon' || action.type === 'undoPokemonAction' || action.type === 'undoPokemonEvolution' || action.type === 'chooseNoble') return AI_FAST_PENDING_DELAY_MS
  if (action.type === 'endTurn') return AI_FAST_PENDING_DELAY_MS
  return AI_ACTION_DELAY_MS
}

type DuelSeatPayload = Pick<GameState['players'][PlayerId], 'name' | 'isAi' | 'aiDifficulty' | 'aiControlled' | 'seated' | 'connected'>

function duelSeatPayload(player: GameState['players'][PlayerId]): DuelSeatPayload {
  return {
    name: player.name,
    isAi: player.isAi,
    aiDifficulty: player.aiDifficulty,
    aiControlled: player.aiControlled,
    seated: player.seated,
    connected: player.connected,
  }
}

function emptyDuelSeatPayload(playerId: PlayerId): DuelSeatPayload {
  return {
    name: { p1: '玩家一', p2: '玩家二', p3: '玩家三', p4: '玩家四' }[playerId],
    isAi: undefined,
    aiDifficulty: undefined,
    aiControlled: undefined,
    seated: false,
    connected: false,
  }
}

function applyDuelSeatPayload(player: GameState['players'][PlayerId], payload: DuelSeatPayload): void {
  player.name = payload.name
  player.isAi = payload.isAi
  player.aiDifficulty = payload.aiDifficulty
  player.aiControlled = payload.aiControlled
  player.seated = payload.seated
  player.connected = payload.connected
}

const roomStoreGlobal = globalThis as typeof globalThis & {
  __gemDuelArenaRoomStore?: RoomStore
}

if (roomStoreGlobal.__gemDuelArenaRoomStore) {
  Object.setPrototypeOf(roomStoreGlobal.__gemDuelArenaRoomStore, RoomStore.prototype)
}

export const roomStore = (roomStoreGlobal.__gemDuelArenaRoomStore ??= new RoomStore())

export function jsonOk(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, withRoomMachineRouting(init))
}

export async function jsonBodyObject(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}))
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

export function jsonError(error: unknown): Response {
  const message = error instanceof Error ? error.message : '未知错误。'
  const status = error instanceof RoomNotFoundError ? 404 : error instanceof RuleError ? 400 : 500
  return Response.json({ error: message }, withRoomMachineRouting({ status }))
}
