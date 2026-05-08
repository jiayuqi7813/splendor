import { createFileRoute } from '@tanstack/react-router'
import { Bell, BellOff, BookOpen, Bot, Check, Copy, Home, Loader2, Maximize2, MessageSquare, Play, RefreshCw, Send, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { SPIRAL_CELL_IDS, TOKEN_LABELS } from '@/game/data/static'
import { getCard } from '@/game/cards'
import { canAfford, computePayment, otherPlayer, playerStats, royalCardOwner } from '@/game/rules'
import { GEM_TYPES, type AnyGameAction, type BoardCell, type CardSource, type GameAction, type GameState, type GameType, type GemType, type PlayerId, type PublicRoomEvent, type RoomFeedItem, type RoomIntent, type Token, type TokenType } from '@/game/types'
import { displayPlayerName } from '@/game/playerDisplay'
import { turnHudLabels } from '@/game/turnHud'
import type { DifficultyId } from '@/game/ai'
import { selectTutorialStep, type TutorialCounts, type TutorialStep } from '@/game/tutorial'
import { CardView } from '@/components/CardView'
import { PlayerPanel, TokenImage, cardNeedsWildChoice } from '@/components/GamePanels'
import { ClassicCardView, ClassicDeckBack, ClassicNobleView, ClassicTokenImage, SplendorRoom, isSplendorRoomState, type ClassicTokenDraftView } from '@/components/SplendorRoom'
import { appPath, assetPath } from '@/utils/paths'

export const Route = createFileRoute('/room/$roomId')({
  component: Room,
})

const AI_DIFFICULTY_OPTIONS = [
  { id: 'idiot', label: '弱智' },
  { id: 'beginner', label: '新手' },
  { id: 'casual', label: '休闲' },
  { id: 'standard', label: '标准' },
  { id: 'hard', label: '困难' },
  { id: 'expert', label: '专家' },
  { id: 'nightmare', label: '最最最最难' },
] as const satisfies readonly { id: DifficultyId; label: string }[]

const DEFAULT_AI_DIFFICULTY_INDEX = AI_DIFFICULTY_OPTIONS.findIndex((option) => option.id === 'standard')
const ALL_PLAYER_IDS = ['p1', 'p2', 'p3', 'p4'] as const satisfies readonly PlayerId[]
const ROOM_TOAST_TIMEOUT_MS = 1800
const ROOM_MACHINE_HEADER = 'X-Splendor-Room-Machine'
const ROOM_MACHINE_PARAM = 'roomMachine'
const JOIN_AS_NEW_PARAM = 'joinAsNew'
const TURN_SOUND_STORAGE_KEY = 'splendor:turnReminderSound'
const TURN_NOTIFICATION_STORAGE_KEY = 'splendor:turnReminderNotification'
const CHAT_OPEN_STORAGE_KEY = 'splendor:roomChatOpen'
const CHAT_POSITION_STORAGE_KEY = 'splendor:roomChatPosition'
const CHAT_SIZE_STORAGE_KEY = 'splendor:roomChatSize'
const CHAT_MESSAGE_MAX_LENGTH = 280
const CURSOR_TRACE_THROTTLE_MS = 33
const CURSOR_SEND_INTERVAL_MS = 110
const CURSOR_IDLE_END_MS = 680
const CURSOR_TRAIL_BUFFER_MAX_POINTS = 48
const CURSOR_SEND_MAX_PATH_POINTS = 48
const CURSOR_TRAIL_MAX_POINTS = 48
const CURSOR_TRACK_STALE_MS = 3800
const CURSOR_TRACK_FADE_MS = 2400
const CURSOR_LAYER_TICK_MS = 1400
const REMOTE_CURSOR_CLICK_MS = 720
const REMOTE_CURSOR_CLICK_LIMIT = 18
const REMOTE_CURSOR_COLORS: Record<PlayerId, string> = {
  p1: '#f6c75e',
  p2: '#74c0fc',
  p3: '#bde3af',
  p4: '#ff8da1',
}
const CURSOR_POINTER_BASE_SIZE = 20

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

type RemoteCursorIntentPoint = {
  x: number
  y: number
  at: number
  visible: boolean
}

type ChatPanelPosition = {
  left: number
  top: number
}

type ChatPanelSize = {
  width: number
  height: number
}

function readRoomMachineFromLocation(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(ROOM_MACHINE_PARAM) ?? ''
}

function shouldJoinAsNewPlayer(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(JOIN_AS_NEW_PARAM) === '1'
}

function withRoomMachine(path: string, machineId: string): string {
  if (!machineId) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${ROOM_MACHINE_PARAM}=${encodeURIComponent(machineId)}`
}

function roomPath(roomId: string, machineId: string | null): string {
  return appPath(withRoomMachine(`/room/${roomId}`, machineId ?? ''))
}

function roomInvitePath(roomId: string, machineId: string | null): string {
  return appPath(withRoomMachine(`/room/${roomId}?${JOIN_AS_NEW_PARAM}=1`, machineId ?? ''))
}

function roomToastError(error: string): string {
  const normalized = error.trim()
  if (!normalized || normalized === '还没有轮到你' || normalized === '还没有轮到你。') return ''
  return error
}

function roomPlayer(state: any, id: string) {
  if (!state?.players) return undefined
  return Array.isArray(state.players) ? state.players.find((player: { id: string }) => player.id === id) : state.players[id]
}

function isClassicShellGame(state: GameState | undefined): boolean {
  return state?.gameType === 'classic' || state?.gameType === 'pokemon'
}

function shellVariant(state: GameState | undefined): GameType | undefined {
  if (state?.gameType === 'pokemon') return 'pokemon'
  if (state?.gameType === 'classic') return 'classic'
  return undefined
}

function Room() {
  const { roomId } = Route.useParams()
  const [state, setState] = useState<any>()
  const [seq, setSeq] = useState(0)
  const [playerId, setPlayerId] = useState<any>()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [aiBusy, setAiBusy] = useState(false)
  const [restartBusy, setRestartBusy] = useState(false)
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [playerNameInput, setPlayerNameInput] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [aiDifficultyIndex, setAiDifficultyIndex] = useState(DEFAULT_AI_DIFFICULTY_INDEX)
  const [secondAiEnabled, setSecondAiEnabled] = useState(false)
  const [secondAiDifficultyIndex, setSecondAiDifficultyIndex] = useState(DEFAULT_AI_DIFFICULTY_INDEX)
  const [copiedLink, setCopiedLink] = useState(false)
  const [tutorialEnabled, setTutorialEnabled] = useState(false)
  const [, setTutorialCounts] = useState<TutorialCounts>({})
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>()
  const [boardFocusOpen, setBoardFocusOpen] = useState(false)
  const [isMobileBoardLayout, setIsMobileBoardLayout] = useState(false)
  const seqRef = useRef(0)
  const roomMachineRef = useRef(readRoomMachineFromLocation())
  const stateRef = useRef<any>(undefined)
  const boardFocusOpenRef = useRef(false)
  const isMobileBoardLayoutRef = useRef(false)
  const tutorialCountsRef = useRef<TutorialCounts>({})
  const countedTutorialKeyRef = useRef('')
  const tokenBoardRef = useRef<HTMLDivElement>(null)
  const tokenCarryRef = useRef<TokenCarry | undefined>(undefined)
  const classicTokenCarryRef = useRef<ClassicTokenCarry | undefined>(undefined)
  const tokenSlotCarryRef = useRef<TokenSlotCarry | undefined>(undefined)
  const cardCarryRef = useRef<CardCarry | undefined>(undefined)
  const privilegeCarryRef = useRef<PrivilegeCarry | undefined>(undefined)
  const classicTokenDraftRef = useRef<ClassicTokenDraft | undefined>(undefined)
  const remoteClassicTokenDraftsRef = useRef<Partial<Record<PlayerId, ClassicTokenDraft>>>({})
  const deferredStateRef = useRef<DeferredStateUpdate | undefined>(undefined)
  const pendingDeferredSubmitRef = useRef<PendingDeferredSubmit | undefined>(undefined)
  const pendingDeckReserveRevealRef = useRef<{ playerId: PlayerId; index: number } | undefined>(undefined)
  const committedSeqRef = useRef(0)
  const queuedStateUpdatesRef = useRef<QueuedStateUpdate[]>([])
  const processingQueuedStateRef = useRef(false)
  const lastIntentKeyRef = useRef('')
  const remoteGoldAnchorRef = useRef<RemoteGoldAnchor | undefined>(undefined)
  const remoteClassicTokenAnchorRef = useRef<RemoteClassicTokenAnchor | undefined>(undefined)
  const remotePrivilegeAnchorRef = useRef<RemotePrivilegeAnchor | undefined>(undefined)
  const pendingPrivilegeCarryRef = useRef<PrivilegeCarry | undefined>(undefined)
  const classicCommittedDraftPlayersRef = useRef(new Set<PlayerId>())
  const classicCommittedDraftTimersRef = useRef<Partial<Record<PlayerId, number>>>({})
  const remoteGoldSettleTimerRef = useRef<number | undefined>(undefined)
  const remoteGoldFrameRef = useRef<number | undefined>(undefined)
  const remoteClassicTokenSettleTimerRef = useRef<number | undefined>(undefined)
  const remoteClassicTokenFrameRef = useRef<number | undefined>(undefined)
  const remotePrivilegeSettleTimerRef = useRef<number | undefined>(undefined)
  const remotePrivilegeFrameRef = useRef<number | undefined>(undefined)
  const startedIntroRef = useRef(false)
  const [tokenDrag, setTokenDrag] = useState<ActiveTokenDrag>()
  const [tokenSelection, setTokenSelection] = useState<TokenDragSelection>()
  const [tokenCarry, setTokenCarry] = useState<TokenCarry>()
  const [classicTokenCarry, setClassicTokenCarry] = useState<ClassicTokenCarry>()
  const [tokenSlotCarry, setTokenSlotCarry] = useState<TokenSlotCarry>()
  const [cardCarry, setCardCarry] = useState<CardCarry>()
  const [privilegeCarry, setPrivilegeCarry] = useState<PrivilegeCarry>()
  const [classicTokenDraft, setClassicTokenDraftState] = useState<ClassicTokenDraft>()
  const [remoteClassicTokenDrafts, setRemoteClassicTokenDraftsState] = useState<Partial<Record<PlayerId, ClassicTokenDraft>>>({})
  const [activePrivilegeIndex, setActivePrivilegeIndex] = useState<number>()
  const [privilegeTargetCellId, setPrivilegeTargetCellId] = useState<string>()
  const [flyingTokens, setFlyingTokens] = useState<FlyingToken[]>([])
  const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([])
  const [flyingPrivileges, setFlyingPrivileges] = useState<FlyingPrivilege[]>([])
  const [takingCellIds, setTakingCellIds] = useState<string[]>([])
  const [spendingTokenSlotKeys, setSpendingTokenSlotKeys] = useState<string[]>([])
  const [classicDraftMotionSlotKeys, setClassicDraftMotionSlotKeys] = useState<string[]>([])
  const [classicBankMotionTokenTypes, setClassicBankMotionTokenTypes] = useState<GemType[]>([])
  const [purchasePreviewSlotKeys, setPurchasePreviewSlotKeys] = useState<string[]>([])
  const [purchaseTarget, setPurchaseTarget] = useState<PurchaseTargetPreview>()
  const [movingPrivilegeSupplyIndexes, setMovingPrivilegeSupplyIndexes] = useState<number[]>([])
  const [movingPrivilegeSlotKeys, setMovingPrivilegeSlotKeys] = useState<string[]>([])
  const [reservingCardSources, setReservingCardSources] = useState<string[]>([])
  const [revealingReserveKeys, setRevealingReserveKeys] = useState<string[]>([])
  const [purchasingCardSources, setPurchasingCardSources] = useState<string[]>([])
  const [movingPurchasedCardKeys, setMovingPurchasedCardKeys] = useState<string[]>([])
  const [returningCardSources, setReturningCardSources] = useState<string[]>([])
  const [marketReplacingCardSources, setMarketReplacingCardSources] = useState<string[]>([])
  const [marketReplacementCards, setMarketReplacementCards] = useState<IntroCardFlight[]>([])
  const [remoteHoverCellId, setRemoteHoverCellId] = useState<string>()
  const [remoteTokenSelection, setRemoteTokenSelection] = useState<TokenDragSelection>()
  const [replenishPreviewActive, setReplenishPreviewActive] = useState(false)
  const [remoteHoverReplenish, setRemoteHoverReplenish] = useState(false)
  const [remoteHoverCardSourceKey, setRemoteHoverCardSourceKey] = useState<string>()
  const [remoteHoverBankTokenType, setRemoteHoverBankTokenType] = useState<TokenType>()
  const [remotePurchaseTarget, setRemotePurchaseTarget] = useState<RemotePurchaseTarget>()
  const [goldTargetCardSourceKey, setGoldTargetCardSourceKey] = useState<string>()
  const [remotePrivilegeTargetCellId, setRemotePrivilegeTargetCellId] = useState<string>()
  const [remoteGoldAnchor, setRemoteGoldAnchorState] = useState<RemoteGoldAnchor>()
  const [remoteClassicTokenAnchor, setRemoteClassicTokenAnchorState] = useState<RemoteClassicTokenAnchor>()
  const [remotePrivilegeAnchor, setRemotePrivilegeAnchorState] = useState<RemotePrivilegeAnchor>()
  const [pendingIntroSeq, setPendingIntroSeq] = useState<number>()
  const [introAnimation, setIntroAnimation] = useState<IntroAnimation>()
  const [classicIntroBankCounts, setClassicIntroBankCounts] = useState<Record<TokenType, number>>()
  const [remoteCursors, setRemoteCursors] = useState<Partial<Record<PlayerId, RemoteCursorState>>>({})
  const [remoteCursorClicks, setRemoteCursorClicks] = useState<RemoteCursorClickEffect[]>([])
  const [cursorMapRect, setCursorMapRect] = useState<DOMRect | null>(null)
  const [chatOpen, setChatOpen] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [turnSoundEnabled, setTurnSoundEnabled] = useState(true)
  const [turnNotificationEnabled, setTurnNotificationEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const cursorPathBufferRef = useRef<RemoteCursorIntentPoint[]>([])
  const cursorLastCaptureAtRef = useRef(0)
  const cursorLastPathPublishAtRef = useRef(0)
  const cursorIdleEndTimerRef = useRef<number | null>(null)
  const remoteCursorClickTimersRef = useRef<Record<string, number>>({})
  const turnAudioContextRef = useRef<AudioContext | undefined>(undefined)
  const lastTurnReminderKeyRef = useRef<string | undefined>(undefined)
  const turnReminderInitializedRef = useRef(false)

  function roomApiPath(path: string): string {
    return appPath(withRoomMachine(path, roomMachineRef.current))
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    function syncShellRect(): void {
      const next = resolveCursorMapRect()
      if (!next) return
      setCursorMapRect((current) => (sameRect(current, next) ? current : next))
    }
    syncShellRect()
    window.addEventListener('resize', syncShellRect)
    window.addEventListener('scroll', syncShellRect, { passive: true })
    window.visualViewport?.addEventListener('resize', syncShellRect)
    window.visualViewport?.addEventListener('scroll', syncShellRect, { passive: true })
    const cursorNodes = collectCursorMapNodes()
    const observer =
      cursorNodes.length > 0 && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncShellRect()
          })
        : null
    if (observer) {
      for (const node of cursorNodes) observer.observe(node)
    }
    return () => {
      window.removeEventListener('resize', syncShellRect)
      window.removeEventListener('scroll', syncShellRect)
      window.visualViewport?.removeEventListener('resize', syncShellRect)
      window.visualViewport?.removeEventListener('scroll', syncShellRect)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!secret || !state) return
    const timer = window.setTimeout(() => {
      const next = resolveCursorMapRect()
      if (!next) return
      setCursorMapRect((current) => (sameRect(current, next) ? current : next))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [secret, state])

  function resolveCursorMapRect(): DOMRect | null {
    const nodes = collectCursorMapNodes()
    const rects = nodes.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0)
    if (rects.length === 0) {
      const shell = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.gameShell')
      if (!(shell instanceof HTMLElement) || !shell.isConnected) return null
      return shell.getBoundingClientRect()
    }
    let left = Number.POSITIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (const rect of rects) {
      left = Math.min(left, rect.left)
      top = Math.min(top, rect.top)
      right = Math.max(right, rect.right)
      bottom = Math.max(bottom, rect.bottom)
    }
    return new DOMRect(left, top, right - left, bottom - top)
  }

  function collectCursorMapNodes(): HTMLElement[] {
    if (typeof document === 'undefined') return []
    const candidates = new Set<HTMLElement>()
    const addNode = (node: Element | null | undefined): void => {
      if (node instanceof HTMLElement && node.isConnected) candidates.add(node)
    }
    const addNodes = (nodes: NodeListOf<HTMLElement>): void => {
      for (const node of nodes) addNode(node)
    }
    addNodes(document.querySelectorAll('.tableArea'))
    addNodes(document.querySelectorAll('.playersArea [data-player-panel]'))
    addNodes(document.querySelectorAll('.splendorCenterTable'))
    addNodes(document.querySelectorAll('.splendorSeat'))
    addNode(document.querySelector('.gameShell'))
    return [...candidates]
  }


  function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
    if (!a || !b) return false
    return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
  }

  function rememberRoomMachine(machineId: string | null): void {
    if (!machineId || roomMachineRef.current || typeof window === 'undefined') return
    roomMachineRef.current = machineId
    const url = new URL(window.location.href)
    url.searchParams.set(ROOM_MACHINE_PARAM, machineId)
    window.history.replaceState(null, '', url)
  }

  function currentRoomLink(): string {
    if (typeof window === 'undefined') return roomInvitePath(roomId, roomMachineRef.current)
    const url = new URL(roomInvitePath(roomId, roomMachineRef.current), window.location.origin)
    if (roomMachineRef.current) url.searchParams.set(ROOM_MACHINE_PARAM, roomMachineRef.current)
    return url.href
  }

  function readNormalizedCursorPoint(clientX: number, clientY: number): RemoteCursorIntentPoint | undefined {
    const shellRect = cursorMapRect ?? resolveCursorMapRect()
    if (!shellRect || shellRect.width <= 0 || shellRect.height <= 0) return undefined
    if (!cursorMapRect) setCursorMapRect(shellRect)
    const normalizedX = clamp01((clientX - shellRect.left) / shellRect.width)
    const normalizedY = clamp01((clientY - shellRect.top) / shellRect.height)
    return {
      x: normalizedX,
      y: normalizedY,
      at: Date.now(),
      visible: clientX >= shellRect.left && clientX <= shellRect.right && clientY >= shellRect.top && clientY <= shellRect.bottom,
    }
  }

  useEffect(() => {
    setTutorialEnabled(localStorage.getItem(TUTORIAL_ENABLED_STORAGE_KEY) === 'true')
  }, [])

  useEffect(() => {
    setChatOpen(localStorage.getItem(CHAT_OPEN_STORAGE_KEY) !== 'false')
    setTurnSoundEnabled(localStorage.getItem(TURN_SOUND_STORAGE_KEY) !== 'false')
    const notificationSupported = typeof window !== 'undefined' && 'Notification' in window
    if (notificationSupported) {
      setNotificationPermission(Notification.permission)
      setTurnNotificationEnabled(localStorage.getItem(TURN_NOTIFICATION_STORAGE_KEY) === 'true' && Notification.permission === 'granted')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(CHAT_OPEN_STORAGE_KEY, chatOpen ? 'true' : 'false')
  }, [chatOpen])

  useEffect(() => {
    localStorage.setItem(TURN_SOUND_STORAGE_KEY, turnSoundEnabled ? 'true' : 'false')
  }, [turnSoundEnabled])

  useEffect(() => {
    localStorage.setItem(TURN_NOTIFICATION_STORAGE_KEY, turnNotificationEnabled ? 'true' : 'false')
  }, [turnNotificationEnabled])

  useEffect(() => {
    if (!turnSoundEnabled || typeof window === 'undefined') return
    const unlockAudio = () => {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) return
      turnAudioContextRef.current ??= new AudioContextCtor()
      void turnAudioContextRef.current.resume().catch(() => undefined)
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [turnSoundEnabled])

  useEffect(() => {
    boardFocusOpenRef.current = boardFocusOpen
  }, [boardFocusOpen])

  useEffect(() => {
    isMobileBoardLayoutRef.current = isMobileBoardLayout
  }, [isMobileBoardLayout])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobileBoardLayout(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!playerId) return
    const stored = readTutorialCounts(roomId, playerId)
    tutorialCountsRef.current = stored
    countedTutorialKeyRef.current = ''
    setTutorialCounts(stored)
  }, [roomId, playerId])

  useEffect(() => {
    const pending = pendingDeckReserveRevealRef.current
    if (!state || !playerId || !pending || pending.playerId !== playerId) return
    if (state.players[pending.playerId].reserve.length <= pending.index) return
    pendingDeckReserveRevealRef.current = undefined
    const key = reserveRevealKey(pending.playerId, pending.index)
    setRevealingReserveKeys((current) => (current.includes(key) ? current : [...current, key]))
    window.setTimeout(() => {
      setRevealingReserveKeys((current) => current.filter((item) => item !== key))
    }, RESERVE_REVEAL_ANIMATION_MS + 120)
  }, [state, playerId])

  useEffect(() => {
    if (!tutorialEnabled || !state || state.gameType !== 'duel' || !playerId || introAnimation || pendingIntroSeq !== undefined || deferredStateRef.current || pendingDeferredSubmitRef.current) {
      setTutorialStep(undefined)
      return
    }
    const nextStep = selectTutorialStep(state, playerId, tutorialCountsRef.current)
    setTutorialStep(nextStep)
    if (!nextStep || countedTutorialKeyRef.current === nextStep.key) return
    countedTutorialKeyRef.current = nextStep.key
    const nextCounts = {
      ...tutorialCountsRef.current,
      [nextStep.kind]: (tutorialCountsRef.current[nextStep.kind] ?? 0) + 1,
    }
    tutorialCountsRef.current = nextCounts
    setTutorialCounts(nextCounts)
    writeTutorialCounts(roomId, playerId, nextCounts)
  }, [tutorialEnabled, state, playerId, introAnimation, pendingIntroSeq, roomId])

  useEffect(() => {
    let closed = false
    async function join() {
      setError('')
      setBusy(true)
      const storageKey = `splendor:${roomId}:secret`
      const tabStorageKey = `splendor:${roomId}:tabSecret`
      const joinAsNew = shouldJoinAsNewPlayer()
      const storedSecret = joinAsNew ? undefined : sessionStorage.getItem(tabStorageKey) ?? localStorage.getItem(storageKey) ?? undefined
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: storedSecret }),
      })
      rememberRoomMachine(response.headers.get(ROOM_MACHINE_HEADER))
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '加入房间失败')
      if (closed) return
      const shouldPlayIntro = !storedSecret && shouldAnimateInitialStart(undefined, data.state)
      sessionStorage.setItem(tabStorageKey, data.playerSecret)
      localStorage.setItem(storageKey, data.playerSecret)
      if (joinAsNew && typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete(JOIN_AS_NEW_PARAM)
        window.history.replaceState(null, '', url)
      }
      setSecret(data.playerSecret)
      setPlayerId(data.playerId)
      if (!roomPlayer(data.state, data.playerId)?.seated) setPlayerNameInput(localStorage.getItem('splendor:playerName') ?? '')
      stateRef.current = data.state
      setState(data.state)
      setSeq(data.seq)
      if (shouldPlayIntro) queueIntroAnimation(data.seq)
      setBusy(false)
    }
    join().catch((err) => {
      sessionStorage.removeItem(`splendor:${roomId}:tabSecret`)
      localStorage.removeItem(`splendor:${roomId}:secret`)
      setError(err instanceof Error ? err.message : '加入房间失败')
      setBusy(false)
    })
    return () => {
      closed = true
    }
  }, [roomId])

  function toggleTutorialMode() {
    const next = !tutorialEnabled
    setTutorialEnabled(next)
    localStorage.setItem(TUTORIAL_ENABLED_STORAGE_KEY, String(next))
    if (!next) setTutorialStep(undefined)
  }

  async function createReplacementRoom() {
    setError('')
    setBusy(true)
    try {
      const response = await fetch(appPath('/api/rooms'), { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '创建房间失败')
      localStorage.setItem(`splendor:${data.roomId}:secret`, data.playerSecret)
      sessionStorage.setItem(`splendor:${data.roomId}:tabSecret`, data.playerSecret)
      location.href = roomPath(data.roomId, response.headers.get(ROOM_MACHINE_HEADER))
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建房间失败')
      setBusy(false)
    }
  }

  async function addAiOpponent() {
    if (!secret || aiBusy) return
    setError('')
    setAiBusy(true)
    try {
      const difficulty = AI_DIFFICULTY_OPTIONS[aiDifficultyIndex]?.id ?? 'standard'
      const secondDifficulty = AI_DIFFICULTY_OPTIONS[secondAiDifficultyIndex]?.id ?? 'standard'
      const classicAiOpponent = stateRef.current ? isSplendorRoomState(stateRef.current) : false
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, aiOpponent: true, difficulty, secondAi: classicAiOpponent ? false : secondAiEnabled, secondDifficulty }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '加入 AI 对手失败')
      const shouldPlayIntro = shouldAnimateInitialStart(stateRef.current, data.state)
      applyImmediateState(data.seq, data.state)
      if (shouldPlayIntro) queueIntroAnimation(data.seq)
      setAiDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入 AI 对手失败')
    } finally {
      setAiBusy(false)
    }
  }

  async function setHostAiPlayer() {
    if (!secret || aiBusy) return
    setError('')
    setAiBusy(true)
    try {
      const difficulty = AI_DIFFICULTY_OPTIONS[secondAiDifficultyIndex]?.id ?? 'standard'
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, setHostAi: true, difficulty }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '设置 AI 失败')
      applyImmediateState(data.seq, data.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置 AI 失败')
    } finally {
      setAiBusy(false)
    }
  }

  function openAiDialogOrSetHostAi() {
    if (state && isSplendorRoomState(state) && state.status === 'waiting' && playerId === 'p1') {
      const nonHost = state.playerOrder.filter((id) => id !== 'p1')
      const canSetHostAi = !state.players.p1.isAi && nonHost.length > 0 && nonHost.every((id) => state.players[id].isAi)
      if (canSetHostAi) {
        void setHostAiPlayer()
      } else {
        void addAiOpponent()
      }
      return
    }
    setAiDialogOpen(true)
  }

  async function updateAiPlayerDifficulty(targetPlayerId: PlayerId, difficulty: DifficultyId) {
    if (!secret || aiBusy) return
    setError('')
    setAiBusy(true)
    try {
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, updateAiDifficulty: true, targetPlayerId, difficulty }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '修改 AI 难度失败')
      applyImmediateState(data.seq, data.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改 AI 难度失败')
    } finally {
      setAiBusy(false)
    }
  }

  async function removeAiPlayer(targetPlayerId: PlayerId) {
    if (!secret || aiBusy) return
    setError('')
    setAiBusy(true)
    try {
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, removeAi: true, targetPlayerId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '移除 AI 失败')
      applyImmediateState(data.seq, data.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除 AI 失败')
    } finally {
      setAiBusy(false)
    }
  }

  async function confirmSeat() {
    if (!secret || nameBusy) return
    const playerName = playerNameInput.trim()
    setError('')
    setNameBusy(true)
    try {
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, confirmSeat: true, playerName }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '入座失败')
      if (playerName) localStorage.setItem('splendor:playerName', playerName)
      applyImmediateState(data.seq, data.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : '入座失败')
    } finally {
      setNameBusy(false)
    }
  }

  async function moveMultiplayerSeat(targetPlayerId: string) {
    if (!secret || nameBusy) return
    setError('')
    setNameBusy(true)
    try {
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, moveSeat: true, targetPlayerId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '换座失败')
      setPlayerId(data.playerId)
      applyImmediateState(data.seq, data.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : '换座失败')
    } finally {
      setNameBusy(false)
    }
  }

  async function restartCurrentRoom() {
    if (!secret || restartBusy) return
    setError('')
    setRestartBusy(true)
    try {
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, restart: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '开启新一局失败')
      clearLocalInteractionState()
      applyImmediateState(data.seq, data.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : '开启新一局失败')
    } finally {
      setRestartBusy(false)
    }
  }

  async function sendChatMessage() {
    const message = chatInput.trim()
    if (!secret || !message || chatBusy) return
    setChatBusy(true)
    setError('')
    try {
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/chat`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerSecret: secret, message }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? '发送聊天失败')
      setChatInput('')
      receiveStateUpdate({ seq: data.seq, state: data.state })
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送聊天失败')
    } finally {
      setChatBusy(false)
    }
  }

  async function requestTurnNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    const enabled = permission === 'granted'
    setTurnNotificationEnabled(enabled)
  }

  function playTurnReminderSound() {
    if (!turnSoundEnabled || typeof window === 'undefined') return
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const context = turnAudioContextRef.current ?? new AudioContextCtor()
    turnAudioContextRef.current = context
    void context.resume().catch(() => undefined)
    const now = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)
    gain.connect(context.destination)
    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.11)
      oscillator.connect(gain)
      oscillator.start(now + index * 0.11)
      oscillator.stop(now + index * 0.11 + 0.18)
    }
  }

  function showTurnNotification() {
    if (!turnNotificationEnabled || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
    if (!document.hidden && document.hasFocus()) return
    const player = playerId && stateRef.current ? roomPlayer(stateRef.current, playerId) : undefined
    const notification = new Notification('轮到你了', {
      body: player ? `${displayPlayerName(player)}，现在到你的回合。` : '现在到你的回合。',
      tag: `splendor-turn-${roomId}`,
      silent: true,
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }

  useEffect(() => {
    if (!state || !secret) return
    seqRef.current = Math.max(seqRef.current, seq)
    committedSeqRef.current = seq
    stateRef.current = state
  }, [seq, state])

  function clearRemoteActionHints() {
    setRemoteHoverCellId(undefined)
    setRemoteTokenSelection(undefined)
    setReplenishPreviewActive(false)
    setRemoteHoverReplenish(false)
    setRemoteHoverCardSourceKey(undefined)
    setRemoteHoverBankTokenType(undefined)
    setRemotePurchaseTarget(undefined)
    setRemotePrivilegeTargetCellId(undefined)
  }

  function enqueueStateUpdate(update: QueuedStateUpdate) {
    const queue = queuedStateUpdatesRef.current
    const existingIndex = queue.findIndex((item) => item.seq === update.seq)
    if (existingIndex >= 0) {
      queue[existingIndex] = update
    } else {
      queue.push(update)
      queue.sort((left, right) => left.seq - right.seq)
    }
    seqRef.current = Math.max(seqRef.current, update.seq)
  }

  function receiveStateUpdate(update: QueuedStateUpdate) {
    if (update.seq <= committedSeqRef.current) {
      seqRef.current = Math.max(seqRef.current, update.seq)
      return
    }
    if (deferredStateRef.current || queuedStateUpdatesRef.current.length > 0) {
      if (!deferredStateRef.current || update.seq > deferredStateRef.current.seq) enqueueStateUpdate(update)
      else seqRef.current = Math.max(seqRef.current, update.seq)
      if (!deferredStateRef.current) processQueuedStateUpdates()
      return
    }
    processStateUpdate(update)
  }

  function processQueuedStateUpdates() {
    if (processingQueuedStateRef.current || deferredStateRef.current) return
    processingQueuedStateRef.current = true
    try {
      const nextIndex = queuedStateUpdatesRef.current.findIndex((item) => item.seq > committedSeqRef.current)
      if (nextIndex < 0) {
        queuedStateUpdatesRef.current = []
        return
      }
      const [next] = queuedStateUpdatesRef.current.splice(nextIndex, 1)
      processStateUpdate(next)
    } finally {
      processingQueuedStateRef.current = false
    }
    if (!deferredStateRef.current && queuedStateUpdatesRef.current.some((item) => item.seq > committedSeqRef.current)) {
      window.setTimeout(() => processQueuedStateUpdates(), 0)
    }
  }

  function processStateUpdate(update: QueuedStateUpdate) {
    if (update.seq <= committedSeqRef.current) {
      seqRef.current = Math.max(seqRef.current, update.seq)
      return
    }
    if (consumePendingDeferredState(update.seq, update.state)) return
    const currentState = stateRef.current
    if (currentState && playerId && currentState.gameType === update.state.gameType && (currentState.gameType === 'duel' || isClassicShellGame(currentState))) {
      const transitionViewerId = update.action?.playerId === playerId ? undefined : playerId
      if (shouldAnimateInitialStart(currentState, update.state)) {
        applyImmediateState(update.seq, update.state)
        queueIntroAnimation(update.seq)
        return
      }
      const enableDuelBoardAnimations = currentState.gameType === 'duel'
      const privilegeGainAnimation = enableDuelBoardAnimations ? createPrivilegeGainTransitionAnimation(currentState, update.state) : undefined
      const startedPrivilegeGainAnimation = Boolean(privilegeGainAnimation && startPrivilegeGainAnimation(privilegeGainAnimation))
      const localPrivilegeCarry = pendingPrivilegeCarryRef.current
      const privilegeAnimation = enableDuelBoardAnimations ? createPrivilegeTransitionAnimation(currentState, update.state, { sourceCarry: localPrivilegeCarry, remoteAnchor: localPrivilegeCarry ? undefined : remotePrivilegeAnchorRef.current }) : undefined
      if (privilegeAnimation && startPrivilegeUseAnimation(privilegeAnimation)) {
        pendingPrivilegeCarryRef.current = undefined
        if (privilegeAnimation.clearRemotePrivilegeAnchor) setRemotePrivilegeAnchor(undefined)
        scheduleDeferredState(update.seq, update.state, Math.max(privilegeAnimation.duration, privilegeGainAnimation?.duration ?? 0))
        return
      }
      const replenishAnimation = enableDuelBoardAnimations ? createReplenishTransitionAnimation(currentState, update.state) : undefined
      if (replenishAnimation && startReplenishAnimation(replenishAnimation)) {
        scheduleDeferredState(update.seq, update.state, Math.max(replenishAnimation.duration, privilegeGainAnimation?.duration ?? 0))
        return
      }
      const takeTokensAnimation = enableDuelBoardAnimations ? createTakeTokensTransitionAnimation(currentState, update.state, transitionViewerId) : undefined
      if (takeTokensAnimation && startBoardTokenTakeAnimation(takeTokensAnimation)) {
        scheduleDeferredState(update.seq, update.state, Math.max(takeTokensAnimation.duration, privilegeGainAnimation?.duration ?? 0))
        return
      }
      const classicDiscardAnimation = isClassicShellGame(currentState) && update.action?.type === 'discardToken' ? createClassicDiscardTransitionAnimation(currentState, update.action, transitionViewerId) : undefined
      if (classicDiscardAnimation && startTokenSpendAnimation(classicDiscardAnimation)) {
        scheduleDeferredState(update.seq, update.state, classicDiscardAnimation.duration)
        return
      }
      const skipClassicTakeAnimation = update.action?.type === 'takeClassicBankTokens' ? consumeClassicDraftCommitted(update.action.playerId) : false
      const classicTakeAnimation =
        isClassicShellGame(currentState) && update.action?.type === 'takeClassicBankTokens' && !skipClassicTakeAnimation
          ? createClassicBankTakeTransitionAnimation(currentState, update.state, update.action)
          : undefined
      if (classicTakeAnimation && startClassicBankTakeAnimation(classicTakeAnimation)) {
        scheduleDeferredState(update.seq, update.state, classicTakeAnimation.duration)
        return
      }
      const pokemonEvolutionTransition =
        isClassicShellGame(currentState) && update.action?.type === 'evolvePokemon'
          ? createPokemonEvolutionTransitionAnimation(currentState, update.state, update.action, transitionViewerId)
          : undefined
      if (pokemonEvolutionTransition && startPurchaseCardAnimation(pokemonEvolutionTransition)) {
        scheduleDeferredState(update.seq, update.state, pokemonEvolutionTransition.duration)
        return
      }
      const purchaseTransition = findPurchaseTransition(currentState, update.state)
      const purchaseAnimation = purchaseTransition ? createPurchaseTransitionAnimation(currentState, update.state, transitionViewerId) : undefined
      const purchaseCardAnimation = purchaseTransition ? createPurchaseCardTransitionAnimation(currentState, update.state, transitionViewerId) : undefined
      const purchaseAbilityAnimation = purchaseTransition && enableDuelBoardAnimations ? createCardAbilityTokenAnimation(currentState, update.state) : undefined
      const purchaseDelay = Math.max(purchaseAnimation?.duration ?? 0, purchaseCardAnimation?.duration ?? 0)
      const purchaseReplacement = purchaseTransition ? createMarketReplacementAnimation(currentState, update.state, purchaseDelay) : undefined
      const startedPurchaseAnimation = Boolean(purchaseAnimation && startTokenSpendAnimation(purchaseAnimation))
      const startedPurchaseCardAnimation = Boolean(purchaseCardAnimation && startPurchaseCardAnimation(purchaseCardAnimation))
      const startedPurchaseAbilityAnimation = Boolean(purchaseAbilityAnimation && startBoardTokenTakeAnimation(purchaseAbilityAnimation))
      const startedPurchaseReplacement = Boolean(purchaseReplacement && startMarketReplacementAnimation(purchaseReplacement))
      if (startedPurchaseAnimation || startedPurchaseCardAnimation || startedPurchaseAbilityAnimation || startedPurchaseReplacement || startedPrivilegeGainAnimation) {
        const primaryDuration = Math.max(purchaseAnimation?.duration ?? 0, purchaseCardAnimation?.duration ?? 0, purchaseAbilityAnimation?.duration ?? 0)
        scheduleDeferredState(update.seq, update.state, Math.max(startedPurchaseReplacement && primaryDuration === 0 ? 0 : primaryDuration, privilegeGainAnimation?.duration ?? 0))
        return
      }
      const reserveTransition = findReserveTransition(currentState, update.state)
      const reserveAnimation = reserveTransition ? createReserveTransitionAnimation(currentState, update.state, transitionViewerId, remoteGoldAnchorRef.current, playerId) : undefined
      const reserveReplacement = reserveTransition ? createMarketReplacementAnimation(currentState, update.state, reserveAnimation?.duration ?? 0) : undefined
      const startedReserveAnimation = Boolean(reserveAnimation && startReserveAnimation(reserveAnimation))
      const startedReserveReplacement = Boolean(reserveReplacement && startMarketReplacementAnimation(reserveReplacement))
      if (startedReserveAnimation && reserveAnimation?.clearRemoteGoldAnchor) setRemoteGoldAnchor(undefined)
      if (startedReserveAnimation || startedReserveReplacement) {
        scheduleDeferredState(update.seq, update.state, startedReserveAnimation ? (reserveAnimation?.duration ?? 0) : 0)
        return
      }
      if (startedPrivilegeGainAnimation) {
        scheduleDeferredState(update.seq, update.state, privilegeGainAnimation?.duration ?? 0)
        return
      }
    }
    applyImmediateState(update.seq, update.state)
  }

  useEffect(() => {
    if (!state) return
    let stopped = false
    let stream: EventSource | undefined
    let reconnectTimer: number | undefined

    async function refreshSnapshot() {
      const params = new URLSearchParams({ playerSecret: secret })
      const response = await fetch(roomApiPath(`/api/rooms/${roomId}/snapshot?${params}`))
      rememberRoomMachine(response.headers.get(ROOM_MACHINE_HEADER))
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? '同步房间失败')
      if (stopped) return
      receiveStateUpdate({ seq: data.seq, state: data.state })
    }

    function connect(delay = 0) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = window.setTimeout(() => {
        if (stopped) return
        stream?.close()
        const params = new URLSearchParams({ after: String(seqRef.current), playerSecret: secret })
        stream = new EventSource(roomApiPath(`/api/rooms/${roomId}/events?${params}`))
        stream.addEventListener('open', () => {
          void refreshSnapshot().catch((err) => {
            setError(err instanceof Error ? err.message : '同步房间失败')
          })
        })
        stream.addEventListener('room', (message) => {
          const event = JSON.parse((message as MessageEvent).data) as PublicRoomEvent
          if (event.type === 'intent') {
            seqRef.current = Math.max(seqRef.current, event.seq)
            handleRoomIntent(event)
            return
          }
          if (event.type === 'action') clearRemoteActionHints()
          receiveStateUpdate({ seq: event.seq, state: event.state, action: event.action })
        })
        stream.onerror = () => {
          stream?.close()
          if (!stopped) connect(navigator.onLine ? 1200 : 3000)
        }
      }, delay)
    }

    function handleOnline() {
      void refreshSnapshot().catch(() => undefined)
      connect()
    }

    function handleOffline() {
      stream?.close()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    connect()
    return () => {
      stopped = true
      window.clearTimeout(reconnectTimer)
      stream?.close()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [roomId, secret, Boolean(state)])

  function isInteractionLocked(): boolean {
    return Boolean(
        pendingIntroSeq !== undefined ||
        introAnimation ||
        deferredStateRef.current ||
        pendingDeferredSubmitRef.current,
    )
  }

  const nameRequired = Boolean(state && playerId && state.status === 'waiting' && !state.players[playerId].seated)
  const interactionLocked = isInteractionLocked()
  const isViewerTurn = Boolean(state && playerId && !nameRequired && state.currentPlayer === playerId && state.status === 'playing' && !state.winner)
  const isMyTurn = Boolean(state && playerId && !nameRequired && !state.players[playerId].isAi && state.currentPlayer === playerId && state.status === 'playing' && !state.winner && !interactionLocked)
  const roomPending = state && typeof state === 'object' && 'pending' in state ? state.pending : undefined
  const currentPending = playerId && roomPending?.playerId === playerId ? roomPending : undefined
  const turnReminderKey =
    state && playerId && !nameRequired && state.status === 'playing' && !state.winner && !state.players[playerId].isAi && !state.players[playerId].aiControlled
      ? currentPending
        ? `pending:${state.turnNumber}:${currentPending.type}:${playerId}`
        : state.currentPlayer === playerId
          ? `turn:${state.turnNumber}:${playerId}`
          : undefined
      : undefined
  const toastError = roomToastError(error)

  useEffect(() => {
    if (!turnReminderInitializedRef.current) {
      turnReminderInitializedRef.current = true
      lastTurnReminderKeyRef.current = turnReminderKey
      return
    }
    if (!turnReminderKey) {
      lastTurnReminderKeyRef.current = undefined
      return
    }
    if (lastTurnReminderKeyRef.current === turnReminderKey) return
    lastTurnReminderKeyRef.current = turnReminderKey
    playTurnReminderSound()
    showTurnNotification()
  }, [turnReminderKey, turnSoundEnabled, turnNotificationEnabled])

  useEffect(() => {
    if (!error || !state || !playerId) return
    if (!toastError) {
      setError('')
      return
    }
    const timer = window.setTimeout(() => {
      setError((current) => (current === error ? '' : current))
    }, ROOM_TOAST_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [error, Boolean(state), Boolean(playerId), toastError])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setRemoteCursors((current) => {
        let changed = false
        const next: Partial<Record<PlayerId, RemoteCursorState>> = {}
        for (const id of Object.keys(current) as PlayerId[]) {
          const cursor = current[id]
          if (!cursor) continue
          if (!cursor.visible && now - cursor.lastSeenAt > CURSOR_TRACK_FADE_MS) continue
          if (now - cursor.lastSeenAt > CURSOR_TRACK_STALE_MS) continue
          next[id] = {
            ...cursor,
            visible: now - cursor.lastSeenAt <= CURSOR_TRACK_FADE_MS,
          }
          if (next[id].visible !== cursor.visible) changed = true
        }
        return changed || Object.keys(next).length !== Object.keys(current).length ? next : current
      })
    }, CURSOR_LAYER_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  function appendCursorPoint(point: RemoteCursorIntentPoint, force = false): void {
    const next = { ...point, x: clamp01(point.x), y: clamp01(point.y), visible: point.visible === true }
    const now = Date.now()
    const last = cursorPathBufferRef.current[cursorPathBufferRef.current.length - 1]
    if (!force && last && now - cursorLastCaptureAtRef.current < CURSOR_TRACE_THROTTLE_MS && next.visible === last.visible && next.x === last.x && next.y === last.y) return
    cursorPathBufferRef.current = [...cursorPathBufferRef.current, next]
    if (cursorPathBufferRef.current.length > CURSOR_TRAIL_BUFFER_MAX_POINTS) {
      cursorPathBufferRef.current = cursorPathBufferRef.current.slice(-Math.ceil(CURSOR_TRAIL_BUFFER_MAX_POINTS / 2))
    }
    cursorLastCaptureAtRef.current = now
  }

  function queueCursorPoint(clientX: number, clientY: number, force = false): void {
    const next = readNormalizedCursorPoint(clientX, clientY)
    if (!next) return
    appendCursorPoint(next, force)
  }

  function latestCursorFallbackPoint(visible = false): RemoteCursorIntentPoint {
    const last = cursorPathBufferRef.current[cursorPathBufferRef.current.length - 1]
    return {
      x: last?.x ?? 0.5,
      y: last?.y ?? 0.5,
      at: Date.now(),
      visible,
    }
  }

  function publishCursorPath(force = false, options?: { click?: boolean }): void {
    const path = cursorPathBufferRef.current
    if (path.length === 0) {
      if (!options?.click) return
      cursorPathBufferRef.current = [latestCursorFallbackPoint(true)]
    }
    const currentPath = cursorPathBufferRef.current
    const now = Date.now()
    if (!force && !options?.click && now - cursorLastPathPublishAtRef.current < CURSOR_SEND_INTERVAL_MS) return
    cursorLastPathPublishAtRef.current = now
    const compactPath = currentPath.filter(
      (point, index) =>
        index === 0
        || point.visible !== currentPath[index - 1].visible
        || point.at - currentPath[index - 1].at > CURSOR_TRACE_THROTTLE_MS
        || point.x !== currentPath[index - 1].x
        || point.y !== currentPath[index - 1].y,
    )
    const baseAt = compactPath[0]?.at ?? now
    const sample = compactPath[compactPath.length - 1]
    const pathPayload = compactPath.map((point) => ({ x: point.x, y: point.y, visible: point.visible, at: point.at - baseAt }))
    const sendPath = pathPayload.length <= CURSOR_SEND_MAX_PATH_POINTS
      ? pathPayload
      : (() => {
          const step = Math.ceil(pathPayload.length / CURSOR_SEND_MAX_PATH_POINTS)
          const sampled = pathPayload.filter((point, index) => index % step === 0)
          const last = pathPayload[pathPayload.length - 1]
          if (sampled[sampled.length - 1] !== last) {
            sampled.push(last)
          }
          return sampled
        })()
    publishCursorIntent({
      type: 'cursorMove',
      x: sample.x,
      y: sample.y,
      visible: sample.visible,
      path: sendPath,
      ...(options?.click ? { click: true } : {}),
    })
    cursorPathBufferRef.current = []
  }

  useEffect(() => {
    if (!secret) return
    function handlePointerMove(event: PointerEvent) {
      queueCursorPoint(event.clientX, event.clientY)
      if (cursorIdleEndTimerRef.current !== null) {
        window.clearTimeout(cursorIdleEndTimerRef.current)
      }
      cursorIdleEndTimerRef.current = window.setTimeout(() => publishCursorPath(true), CURSOR_IDLE_END_MS)
    }
    function hideCursorSample(event: PointerEvent) {
      if (event.relatedTarget) return
      const next = readNormalizedCursorPoint(event.clientX, event.clientY) ?? latestCursorFallbackPoint()
      appendCursorPoint({ ...next, visible: false, at: Date.now() }, true)
      publishCursorPath(true)
    }
    function handleVisibility() {
      appendCursorPoint(latestCursorFallbackPoint(false), true)
      publishCursorPath(true)
    }
    function handleClick(event: MouseEvent) {
      const next = readNormalizedCursorPoint(event.clientX, event.clientY)
      if (!next) return
      appendCursorPoint({ ...next, visible: true, at: Date.now() }, true)
      publishCursorPath(true, { click: true })
    }
    window.addEventListener('pointermove', handlePointerMove)
    // pointerdown is intentionally ignored to avoid duplicate bursts when clicking/dragging.
    window.addEventListener('click', handleClick, { capture: true, passive: true })
    window.addEventListener('pointerout', hideCursorSample)
    window.addEventListener('pointercancel', hideCursorSample)
    window.addEventListener('blur', handleVisibility)
    const interval = window.setInterval(() => publishCursorPath(), CURSOR_SEND_INTERVAL_MS)
    return () => {
      publishCursorPath(true)
      window.clearInterval(interval)
      if (cursorIdleEndTimerRef.current !== null) {
        window.clearTimeout(cursorIdleEndTimerRef.current)
        cursorIdleEndTimerRef.current = null
      }
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('click', handleClick, true)
      window.removeEventListener('pointerout', hideCursorSample)
      window.removeEventListener('pointercancel', hideCursorSample)
      window.removeEventListener('blur', handleVisibility)
    }
  }, [secret, cursorMapRect])

  useEffect(() => {
    if (!state || state.status !== 'playing' || pendingIntroSeq === undefined) return
    const timers: number[] = []
    const frame = window.requestAnimationFrame(() => {
      const animation = createInitialAnimation(state)
      if (!animation) {
        setPendingIntroSeq(undefined)
        return
      }
      if (isClassicShellGame(state)) {
        const counts = emptyRouteBankCounts()
        setClassicIntroBankCounts({ ...counts })
        const finalCounts = fullClassicBankCounts(state)
        for (const tokenType of CLASSIC_BANK_INTRO_ORDER) {
          const timing = classicBankIntroSequenceTiming(tokenType)
          for (let index = 0; index < finalCounts[tokenType]; index += 1) {
            timers.push(window.setTimeout(() => {
              counts[tokenType] += 1
              setClassicIntroBankCounts({ ...counts })
            }, timing.delay + (index + 1) * timing.duration))
          }
        }
      }
      setIntroAnimation(animation)
      timers.push(window.setTimeout(() => {
        setIntroAnimation(undefined)
        setPendingIntroSeq(undefined)
        setClassicIntroBankCounts(undefined)
      }, animation.duration + 80))
    })
    return () => {
      window.cancelAnimationFrame(frame)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [pendingIntroSeq, state])

  useEffect(() => {
    if (!tokenCarry && !classicTokenCarry && !tokenSlotCarry && !cardCarry && !privilegeCarry) return
    function handlePointerMove(event: globalThis.PointerEvent) {
      moveTokenCarryTo(event.clientX, event.clientY)
      moveClassicTokenCarryTo(event.clientX, event.clientY)
      moveTokenSlotCarryTo(event.clientX, event.clientY)
      moveCardCarryTo(event.clientX, event.clientY)
      movePrivilegeCarryTo(event.clientX, event.clientY)
    }
    function handlePointerUp(event: globalThis.PointerEvent) {
      finishTokenCarryAt(event.clientX, event.clientY)
      finishClassicTokenCarryAt(event.clientX, event.clientY)
      finishTokenSlotCarryAt(event.clientX, event.clientY)
      finishCardCarryAt(event.clientX, event.clientY)
      finishPrivilegeCarryAt(event.clientX, event.clientY)
    }
    function handlePointerCancel() {
      clearIntent()
      cancelTokenCarryWithReturn()
      cancelClassicTokenCarryWithReturn()
      cancelTokenSlotCarry()
      cancelCardCarryWithReturn()
      cancelPrivilegeCarryWithReturn()
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [Boolean(tokenCarry), Boolean(classicTokenCarry), Boolean(tokenSlotCarry), Boolean(cardCarry), Boolean(privilegeCarry), playerId])

  useEffect(() => {
    return () => {
      window.clearTimeout(remoteGoldSettleTimerRef.current)
      if (remoteGoldFrameRef.current !== undefined) window.cancelAnimationFrame(remoteGoldFrameRef.current)
      window.clearTimeout(remotePrivilegeSettleTimerRef.current)
      if (remotePrivilegeFrameRef.current !== undefined) window.cancelAnimationFrame(remotePrivilegeFrameRef.current)
      Object.values(remoteCursorClickTimersRef.current).forEach((timer) => window.clearTimeout(timer))
      remoteCursorClickTimersRef.current = {}
    }
  }, [])

  useEffect(() => {
    if (activePrivilegeIndex === undefined) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setActivePrivilegeIndex(undefined)
      setPrivilegeTargetCellId(undefined)
      clearIntent()
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : undefined
      if (target?.closest('[data-cell-id], [data-privilege-slot-player]')) return
      setActivePrivilegeIndex(undefined)
      setPrivilegeTargetCellId(undefined)
      clearIntent()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [activePrivilegeIndex])

  function scheduleDeferredState(nextSeq: number, nextState: GameState, deferStateMs: number) {
    window.clearTimeout(deferredStateRef.current?.timer)
    seqRef.current = Math.max(seqRef.current, nextSeq)
    const delay = Math.max(0, deferStateMs)
    const commitAtMs = performance.now() + delay
    deferredStateRef.current = {
      seq: nextSeq,
      state: nextState,
      commitAtMs,
      timer: window.setTimeout(() => {
        if (!deferredStateRef.current || deferredStateRef.current.seq !== nextSeq) return
        setSeq(nextSeq)
        committedSeqRef.current = nextSeq
        stateRef.current = nextState
        setState(nextState)
        setTokenDrag(undefined)
        setTokenSelection(undefined)
        setPurchasePreviewSlotKeys([])
        setPurchaseTarget(undefined)
        setActiveTokenCarry(undefined)
        setActiveCardCarry(undefined)
        setActivePrivilegeCarry(undefined)
        setGoldTargetCardSourceKey(undefined)
        setActivePrivilegeIndex(undefined)
        setPrivilegeTargetCellId(undefined)
        deferredStateRef.current = undefined
        window.setTimeout(() => processQueuedStateUpdates(), 0)
      }, delay),
    }
  }

  function markPendingDeferredSubmit(deferStateMs: number) {
    window.clearTimeout(pendingDeferredSubmitRef.current?.timer)
    pendingDeferredSubmitRef.current = {
      deferStateMs,
      deadlineMs: performance.now() + deferStateMs,
      timer: window.setTimeout(() => {
        pendingDeferredSubmitRef.current = undefined
      }, Math.max(2200, deferStateMs + 1200)),
    }
  }

  function pendingDeferredDelay(fallbackMs: number): number {
    const pending = pendingDeferredSubmitRef.current
    if (!pending) return fallbackMs
    return Math.max(0, pending.deadlineMs - performance.now())
  }

  function clearPendingDeferredSubmit() {
    window.clearTimeout(pendingDeferredSubmitRef.current?.timer)
    pendingDeferredSubmitRef.current = undefined
  }

  function consumePendingDeferredState(nextSeq: number, nextState: GameState): boolean {
    const pending = pendingDeferredSubmitRef.current
    if (!pending || nextSeq <= committedSeqRef.current) return false
    const remainingMs = pendingDeferredDelay(pending.deferStateMs)
    clearPendingDeferredSubmit()
    scheduleDeferredState(nextSeq, nextState, remainingMs)
    return true
  }

  function applyImmediateState(nextSeq: number, nextState: GameState) {
    setSeq(nextSeq)
    seqRef.current = Math.max(seqRef.current, nextSeq)
    committedSeqRef.current = nextSeq
    stateRef.current = nextState
    if (isSplendorRoomState(nextState) && nextState.myPlayerId) setPlayerId(nextState.myPlayerId)
    setState(nextState)
  }

  function clearLocalInteractionState() {
    window.clearTimeout(deferredStateRef.current?.timer)
    deferredStateRef.current = undefined
    queuedStateUpdatesRef.current = []
    processingQueuedStateRef.current = false
    clearPendingDeferredSubmit()
    setTokenDrag(undefined)
    setTokenSelection(undefined)
    setTokenCarry(undefined)
    tokenCarryRef.current = undefined
    setClassicTokenCarry(undefined)
    classicTokenCarryRef.current = undefined
    setTokenSlotCarry(undefined)
    tokenSlotCarryRef.current = undefined
    setCardCarry(undefined)
    cardCarryRef.current = undefined
    setPrivilegeCarry(undefined)
    privilegeCarryRef.current = undefined
    pendingPrivilegeCarryRef.current = undefined
    setClassicTokenDraft(undefined)
    setRemoteClassicTokenDrafts({})
    setActivePrivilegeIndex(undefined)
    setPrivilegeTargetCellId(undefined)
    setFlyingTokens([])
    setFlyingCards([])
    setFlyingPrivileges([])
    setTakingCellIds([])
    setSpendingTokenSlotKeys([])
    setClassicDraftMotionSlotKeys([])
    setClassicBankMotionTokenTypes([])
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    setMovingPrivilegeSupplyIndexes([])
    setMovingPrivilegeSlotKeys([])
    setReservingCardSources([])
    setRevealingReserveKeys([])
    setPurchasingCardSources([])
    setMovingPurchasedCardKeys([])
    setReturningCardSources([])
    setMarketReplacingCardSources([])
    setMarketReplacementCards([])
    setRemoteHoverCellId(undefined)
    setRemoteTokenSelection(undefined)
    setReplenishPreviewActive(false)
    setRemoteHoverReplenish(false)
    setRemoteHoverCardSourceKey(undefined)
    setRemotePurchaseTarget(undefined)
    setGoldTargetCardSourceKey(undefined)
    setRemotePrivilegeTargetCellId(undefined)
    window.clearTimeout(remoteGoldSettleTimerRef.current)
    window.clearTimeout(remoteClassicTokenSettleTimerRef.current)
    window.clearTimeout(remotePrivilegeSettleTimerRef.current)
    if (remoteGoldFrameRef.current !== undefined) window.cancelAnimationFrame(remoteGoldFrameRef.current)
    if (remoteClassicTokenFrameRef.current !== undefined) window.cancelAnimationFrame(remoteClassicTokenFrameRef.current)
    if (remotePrivilegeFrameRef.current !== undefined) window.cancelAnimationFrame(remotePrivilegeFrameRef.current)
    remoteGoldSettleTimerRef.current = undefined
    remoteClassicTokenSettleTimerRef.current = undefined
    remotePrivilegeSettleTimerRef.current = undefined
    remoteGoldFrameRef.current = undefined
    remoteClassicTokenFrameRef.current = undefined
    remotePrivilegeFrameRef.current = undefined
    remoteClassicTokenAnchorRef.current = undefined
    setRemoteClassicTokenAnchorState(undefined)
    pendingDeckReserveRevealRef.current = undefined
    classicCommittedDraftPlayersRef.current.clear()
    for (const timer of Object.values(classicCommittedDraftTimersRef.current)) window.clearTimeout(timer)
    classicCommittedDraftTimersRef.current = {}
    setRemoteGoldAnchor(undefined)
    setRemotePrivilegeAnchor(undefined)
    setPendingIntroSeq(undefined)
    setIntroAnimation(undefined)
    setClassicIntroBankCounts(undefined)
    startedIntroRef.current = false
  }

  function queueIntroAnimation(nextSeq: number) {
    if (startedIntroRef.current) return
    startedIntroRef.current = true
    setPendingIntroSeq(nextSeq)
  }

  function runAnimationCleanup(durationMs: number, bufferMs: number, cleanup: () => void) {
    const run = () => {
      const deferred = deferredStateRef.current
      if (deferred) {
        const remainingMs = deferred.commitAtMs + 50 - performance.now()
        if (remainingMs > 0) {
          window.setTimeout(run, remainingMs)
          return
        }
      }
      cleanup()
    }
    window.setTimeout(run, durationMs + bufferMs)
  }

  function startReserveAnimation(animation: ReserveAnimation): boolean {
    if (animation.tokens.length === 0 && animation.cards.length === 0) return false
    setTakingCellIds((current) => [...new Set([...current, ...animation.hiddenCellIds])])
    setReservingCardSources((current) => [...new Set([...current, ...animation.hiddenCardSources])])
    setFlyingTokens((current) => [...current, ...animation.tokens])
    setFlyingCards((current) => [...current, ...animation.cards])
    runAnimationCleanup(animation.duration, 90, () => {
      setFlyingTokens((current) => current.filter((flight) => !animation.tokens.some((item) => item.id === flight.id)))
      setFlyingCards((current) => current.filter((flight) => !animation.cards.some((item) => item.id === flight.id)))
      setTakingCellIds((current) => current.filter((id) => !animation.hiddenCellIds.includes(id)))
      setReservingCardSources((current) => current.filter((key) => !animation.hiddenCardSources.includes(key)))
    })
    return true
  }

  function startTokenSpendAnimation(animation: TokenSpendAnimation): boolean {
    if (animation.tokens.length === 0) return false
    setSpendingTokenSlotKeys((current) => [...new Set([...current, ...animation.hiddenSlotKeys])])
    setFlyingTokens((current) => [...current, ...animation.tokens])
    runAnimationCleanup(animation.duration, 90, () => {
      setFlyingTokens((current) => current.filter((flight) => !animation.tokens.some((item) => item.id === flight.id)))
      setSpendingTokenSlotKeys((current) => current.filter((key) => !animation.hiddenSlotKeys.includes(key)))
    })
    return true
  }

  function startPurchaseCardAnimation(animation: PurchaseCardAnimation): boolean {
    if (animation.cards.length === 0) return false
    setPurchasingCardSources((current) => [...new Set([...current, ...animation.hiddenCardSources])])
    setMovingPurchasedCardKeys((current) => [...new Set([...current, ...(animation.hiddenPurchasedCardKeys ?? [])])])
    setFlyingCards((current) => [...current, ...animation.cards])
    runAnimationCleanup(animation.duration, 90, () => {
      setFlyingCards((current) => current.filter((flight) => !animation.cards.some((item) => item.id === flight.id)))
      setPurchasingCardSources((current) => current.filter((key) => !animation.hiddenCardSources.includes(key)))
      setMovingPurchasedCardKeys((current) => current.filter((key) => !(animation.hiddenPurchasedCardKeys ?? []).includes(key)))
    })
    return true
  }

  function startReplenishAnimation(animation: ReplenishAnimation): boolean {
    if (animation.tokens.length === 0) return false
    setFlyingTokens((current) => [...current, ...animation.tokens])
    runAnimationCleanup(animation.duration, 90, () => {
      setFlyingTokens((current) => current.filter((flight) => !animation.tokens.some((item) => item.id === flight.id)))
    })
    return true
  }

  function startMarketReplacementAnimation(animation: MarketReplacementAnimation): boolean {
    if (animation.cards.length === 0) return false
    setMarketReplacingCardSources((current) => [...new Set([...current, ...animation.hiddenCardSources])])
    setMarketReplacementCards((current) => [...current, ...animation.cards])
    runAnimationCleanup(animation.duration, 90, () => {
      setMarketReplacementCards((current) => current.filter((flight) => !animation.cards.some((item) => item.id === flight.id)))
      setMarketReplacingCardSources((current) => current.filter((key) => !animation.hiddenCardSources.includes(key)))
    })
    return true
  }

  function startBoardTokenTakeAnimation(animation: BoardTokenTakeAnimation): boolean {
    if (animation.tokens.length === 0) return false
    setTakingCellIds((current) => [...new Set([...current, ...animation.hiddenCellIds])])
    setFlyingTokens((current) => [...current, ...animation.tokens])
    runAnimationCleanup(animation.duration, 90, () => {
      setFlyingTokens((current) => current.filter((flight) => !animation.tokens.some((item) => item.id === flight.id)))
      setTakingCellIds((current) => current.filter((id) => !animation.hiddenCellIds.includes(id)))
    })
    return true
  }

  function startClassicBankTakeAnimation(animation: ClassicBankTakeAnimation): boolean {
    if (animation.tokens.length === 0) return false
    setClassicBankMotionTokenTypes((current) => [...current, ...animation.bankTokenTypes])
    setClassicDraftMotionSlotKeys((current) => [...new Set([...current, ...animation.hiddenSlotKeys])])
    setFlyingTokens((current) => [...current, ...animation.tokens])
    runAnimationCleanup(animation.duration, 90, () => {
      setFlyingTokens((current) => current.filter((flight) => !animation.tokens.some((item) => item.id === flight.id)))
      setClassicBankMotionTokenTypes((current) => removeTokenTypeOccurrences(current, animation.bankTokenTypes))
      setClassicDraftMotionSlotKeys((current) => current.filter((key) => !animation.hiddenSlotKeys.includes(key)))
    })
    return true
  }

  function startPrivilegeGainAnimation(animation: PrivilegeGainAnimation): boolean {
    if (animation.scrolls.length === 0) return false
    setMovingPrivilegeSupplyIndexes((current) => [...new Set([...current, ...animation.hiddenSupplyIndexes])])
    setFlyingPrivileges((current) => [...current, ...animation.scrolls])
    runAnimationCleanup(animation.duration, 80, () => {
      setFlyingPrivileges((current) => current.filter((flight) => !animation.scrolls.some((item) => item.id === flight.id)))
      setMovingPrivilegeSupplyIndexes((current) => current.filter((index) => !animation.hiddenSupplyIndexes.includes(index)))
    })
    return true
  }

  function startPrivilegeUseAnimation(animation: PrivilegeUseAnimation): boolean {
    if (animation.scrolls.length === 0 && animation.tokens.length === 0) return false
    setTakingCellIds((current) => [...new Set([...current, ...animation.hiddenCellIds])])
    setMovingPrivilegeSlotKeys((current) => [...new Set([...current, ...animation.hiddenPrivilegeSlotKeys])])
    setFlyingTokens((current) => [...current, ...animation.tokens])
    setFlyingPrivileges((current) => [...current, ...animation.scrolls])
    runAnimationCleanup(animation.duration, 90, () => {
      setFlyingTokens((current) => current.filter((flight) => !animation.tokens.some((item) => item.id === flight.id)))
      setFlyingPrivileges((current) => current.filter((flight) => !animation.scrolls.some((item) => item.id === flight.id)))
      setTakingCellIds((current) => current.filter((id) => !animation.hiddenCellIds.includes(id)))
      setMovingPrivilegeSlotKeys((current) => current.filter((key) => !animation.hiddenPrivilegeSlotKeys.includes(key)))
    })
    return true
  }

  async function submit(action: any, options?: { deferStateMs?: number; privilegeCarry?: PrivilegeCarry }) {
    setError('')
    if (options?.deferStateMs) markPendingDeferredSubmit(options.deferStateMs)
    const response = await fetch(roomApiPath(`/api/rooms/${roomId}/actions`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSecret: secret, action }),
    })
    const data = await response.json()
    if (!response.ok) {
      clearPendingDeferredSubmit()
      if (action.type === 'reserveCard') pendingDeckReserveRevealRef.current = undefined
      if (options?.privilegeCarry) pendingPrivilegeCarryRef.current = undefined
      if (options?.privilegeCarry && playerId) {
        const key = privilegeSlotKey(playerId, options.privilegeCarry.index)
        setMovingPrivilegeSlotKeys((current) => current.filter((item) => item !== key))
      }
      setError(data.error ?? '行动失败')
      return
    }
    if (action.type === 'startGame') {
      const shouldPlayIntro = shouldAnimateInitialStart(stateRef.current, data.state)
      applyImmediateState(data.seq, data.state)
      if (shouldPlayIntro) queueIntroAnimation(data.seq)
      return
    }
    const enableDuelBoardAnimations = stateRef.current?.gameType === 'duel'
    const privilegeGainAnimation = enableDuelBoardAnimations && stateRef.current ? createPrivilegeGainTransitionAnimation(stateRef.current, data.state) : undefined
    const startedPrivilegeGainAnimation = Boolean(privilegeGainAnimation && startPrivilegeGainAnimation(privilegeGainAnimation))
    if (action.type === 'usePrivilege' && enableDuelBoardAnimations && stateRef.current) {
        const privilegeAnimation = createPrivilegeTransitionAnimation(stateRef.current, data.state, { sourceCarry: options?.privilegeCarry })
      if (privilegeAnimation && startPrivilegeUseAnimation(privilegeAnimation)) {
        if (options?.privilegeCarry) pendingPrivilegeCarryRef.current = undefined
        clearPendingDeferredSubmit()
        scheduleDeferredState(data.seq, data.state, Math.max(privilegeAnimation.duration, privilegeGainAnimation?.duration ?? 0))
        return
      }
    }
    if (action.type === 'replenishBoard' && enableDuelBoardAnimations && stateRef.current) {
      const replenishAnimation = createReplenishTransitionAnimation(stateRef.current, data.state)
      if (replenishAnimation && startReplenishAnimation(replenishAnimation)) {
        clearPendingDeferredSubmit()
        scheduleDeferredState(data.seq, data.state, Math.max(replenishAnimation.duration, privilegeGainAnimation?.duration ?? 0))
        return
      }
    }
    if ((action.type === 'purchaseCard' || action.type === 'chooseRoyal') && stateRef.current) {
      const remainingDeferMs = options?.deferStateMs ? pendingDeferredDelay(options.deferStateMs) : 0
      const abilityAnimation = enableDuelBoardAnimations ? createCardAbilityTokenAnimation(stateRef.current, data.state) : undefined
      const marketReplacement = action.type === 'purchaseCard' ? createMarketReplacementAnimation(stateRef.current, data.state, remainingDeferMs) : undefined
      const startedAbilityAnimation = Boolean(abilityAnimation && startBoardTokenTakeAnimation(abilityAnimation))
      const startedMarketReplacement = Boolean(marketReplacement && startMarketReplacementAnimation(marketReplacement))
      if (startedAbilityAnimation || startedMarketReplacement || startedPrivilegeGainAnimation) {
        clearPendingDeferredSubmit()
        if (deferredStateRef.current?.seq !== data.seq) {
          scheduleDeferredState(data.seq, data.state, Math.max(remainingDeferMs, abilityAnimation?.duration ?? 0, privilegeGainAnimation?.duration ?? 0))
        }
        return
      }
    }
    if (action.type === 'reserveCard' && stateRef.current) {
      const remainingDeferMs = options?.deferStateMs ? pendingDeferredDelay(options.deferStateMs) : 0
      const marketReplacement = createMarketReplacementAnimation(stateRef.current, data.state, remainingDeferMs)
      if (marketReplacement && startMarketReplacementAnimation(marketReplacement)) {
        clearPendingDeferredSubmit()
        if (deferredStateRef.current?.seq !== data.seq) scheduleDeferredState(data.seq, data.state, remainingDeferMs)
        return
      }
    }
    if (action.type === 'takeBoardToken' && enableDuelBoardAnimations && stateRef.current) {
      const takeTokenAnimation = createBoardTokenTakeTransitionAnimation(stateRef.current, data.state, action.playerId)
      if (takeTokenAnimation && startBoardTokenTakeAnimation(takeTokenAnimation)) {
        clearPendingDeferredSubmit()
        scheduleDeferredState(data.seq, data.state, Math.max(takeTokenAnimation.duration, privilegeGainAnimation?.duration ?? 0))
        return
      }
    }
    if (options?.deferStateMs) {
      const remainingDeferMs = pendingDeferredDelay(options.deferStateMs)
      clearPendingDeferredSubmit()
      if (deferredStateRef.current?.seq === data.seq) return
      scheduleDeferredState(data.seq, data.state, Math.max(remainingDeferMs, privilegeGainAnimation?.duration ?? 0))
      return
    }
    if (startedPrivilegeGainAnimation) {
      scheduleDeferredState(data.seq, data.state, privilegeGainAnimation?.duration ?? 0)
      return
    }
    setSeq(data.seq)
    stateRef.current = data.state
    setState(data.state)
    setTokenDrag(undefined)
    setTokenSelection(undefined)
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    setClassicDraftMotionSlotKeys([])
    setActiveTokenCarry(undefined)
    setActiveTokenSlotCarry(undefined)
    setActiveCardCarry(undefined)
    setActivePrivilegeCarry(undefined)
    pendingPrivilegeCarryRef.current = undefined
    setGoldTargetCardSourceKey(undefined)
    setActivePrivilegeIndex(undefined)
    setPrivilegeTargetCellId(undefined)
  }

  function setRemoteGoldAnchor(next: RemoteGoldAnchor | undefined) {
    window.clearTimeout(remoteGoldSettleTimerRef.current)
    if (remoteGoldFrameRef.current !== undefined) window.cancelAnimationFrame(remoteGoldFrameRef.current)
    const previousCellId = remoteGoldAnchorRef.current?.cellId
    remoteGoldAnchorRef.current = next
    setRemoteGoldAnchorState(next)
    if (!next && previousCellId) {
      setTakingCellIds((current) => current.filter((id) => id !== previousCellId))
    }
  }

  function setRemoteClassicTokenAnchor(next: RemoteClassicTokenAnchor | undefined) {
    window.clearTimeout(remoteClassicTokenSettleTimerRef.current)
    if (remoteClassicTokenFrameRef.current !== undefined) window.cancelAnimationFrame(remoteClassicTokenFrameRef.current)
    remoteClassicTokenAnchorRef.current = next
    setRemoteClassicTokenAnchorState(next)
  }

  function setRemotePrivilegeAnchor(next: RemotePrivilegeAnchor | undefined) {
    window.clearTimeout(remotePrivilegeSettleTimerRef.current)
    if (remotePrivilegeFrameRef.current !== undefined) window.cancelAnimationFrame(remotePrivilegeFrameRef.current)
    remotePrivilegeAnchorRef.current = next
    setRemotePrivilegeAnchorState(next)
  }

  function setClassicTokenDraft(next: ClassicTokenDraft | undefined) {
    classicTokenDraftRef.current = next
    setClassicTokenDraftState(next)
  }

  function markClassicDraftCommitted(playerId: PlayerId) {
    classicCommittedDraftPlayersRef.current.add(playerId)
    window.clearTimeout(classicCommittedDraftTimersRef.current[playerId])
    classicCommittedDraftTimersRef.current[playerId] = window.setTimeout(() => {
      classicCommittedDraftPlayersRef.current.delete(playerId)
      classicCommittedDraftTimersRef.current[playerId] = undefined
    }, 3500)
  }

  function consumeClassicDraftCommitted(playerId: PlayerId): boolean {
    if (!classicCommittedDraftPlayersRef.current.has(playerId)) return false
    classicCommittedDraftPlayersRef.current.delete(playerId)
    window.clearTimeout(classicCommittedDraftTimersRef.current[playerId])
    classicCommittedDraftTimersRef.current[playerId] = undefined
    return true
  }

  function setRemoteClassicTokenDrafts(next: Partial<Record<PlayerId, ClassicTokenDraft>>) {
    remoteClassicTokenDraftsRef.current = next
    setRemoteClassicTokenDraftsState(next)
  }

  function handleRoomIntent(event: Extract<PublicRoomEvent, { type: 'intent' }>) {
    if (!playerId || event.playerId === playerId) return
    if (event.intent.type === 'cursorMove') {
      appendRemoteCursorIntent(event.playerId, event.intent)
      return
    }
    if (event.intent.type === 'classicTokenDraft') {
      const previous = remoteClassicTokenDraftsRef.current[event.playerId]
      const initialCounts = previous?.initialCounts ?? classicGemBankCounts(stateRef.current)
      const hasHover = event.intent.hoverTokenType !== undefined && event.intent.hoverSlotIndex !== undefined
      const hoverOnlyClear = Boolean(event.intent.hoverOnly && event.intent.tokenTypes.length === 0 && !hasHover)
      const committedClear = Boolean(event.intent.committed && event.intent.tokenTypes.length === 0 && !hasHover)
      if (committedClear) {
        if ((previous?.tokenTypes.length ?? 0) > 0) markClassicDraftCommitted(event.playerId)
        setRemoteClassicTokenDrafts({ ...remoteClassicTokenDraftsRef.current, [event.playerId]: undefined })
        setRemoteClassicTokenAnchor(undefined)
        setRemoteHoverCellId(undefined)
        setRemoteTokenSelection(undefined)
        setRemoteHoverBankTokenType(undefined)
        return
      }
      if (hoverOnlyClear && (previous?.tokenTypes.length ?? 0) > 0) {
        setRemoteClassicTokenDrafts({
          ...remoteClassicTokenDraftsRef.current,
          [event.playerId]: { ...previous!, hoverTokenType: undefined, hoverSlotIndex: undefined },
        })
        setRemoteHoverCellId(undefined)
        setRemoteTokenSelection(undefined)
        setRemoteHoverBankTokenType(undefined)
        return
      }
      const nextDraft = event.intent.tokenTypes.length > 0 || hasHover
        ? {
            playerId: event.playerId,
            tokenTypes: event.intent.tokenTypes,
            initialCounts,
            hoverTokenType: event.intent.hoverTokenType,
            hoverSlotIndex: event.intent.hoverSlotIndex,
          }
        : undefined
      setRemoteClassicTokenDrafts({ ...remoteClassicTokenDraftsRef.current, [event.playerId]: nextDraft })
      if (nextDraft && nextDraft.tokenTypes.length > (previous?.tokenTypes.length ?? 0)) {
        const draftIndex = nextDraft.tokenTypes.length - 1
        const tokenType = nextDraft.tokenTypes[draftIndex]
        const anchor = remoteClassicTokenAnchorRef.current
        const anchorRect = anchor && anchor.playerId === event.playerId && anchor.tokenType === tokenType
          ? { left: anchor.left, top: anchor.top, width: anchor.size, height: anchor.size }
          : undefined
        scheduleClassicDraftFlight(event.playerId, tokenType, draftIndex, 'take', undefined, anchorRect)
        if (anchorRect) setRemoteClassicTokenAnchor(undefined)
      } else if (previous && (!nextDraft || nextDraft.tokenTypes.length < previous.tokenTypes.length)) {
        const draftIndex = nextDraft ? nextDraft.tokenTypes.length : 0
        const returnedType = previous.tokenTypes[draftIndex] ?? previous.tokenTypes.at(-1)
        const sourceRect = returnedType ? classicDraftTokenElement(event.playerId, draftIndex)?.getBoundingClientRect() : undefined
        if (returnedType) scheduleClassicDraftFlight(event.playerId, returnedType, draftIndex, 'return', undefined, sourceRect)
        else if (previous.hoverTokenType) startRemoteClassicTokenReturnAnimation()
      } else if (hasHover && event.intent.hoverTokenType) {
        startRemoteClassicTokenTarget(event.playerId, event.intent.hoverTokenType)
      } else if (previous?.hoverTokenType) {
        startRemoteClassicTokenReturnAnimation()
      }
      setRemoteHoverCellId(undefined)
      setRemoteTokenSelection(undefined)
      setRemoteHoverBankTokenType(undefined)
      return
    }
    if (event.intent.type === 'hoverToken') {
      setRemoteHoverCellId(event.intent.cellId)
      setRemoteHoverReplenish(false)
      setRemoteHoverBankTokenType(undefined)
      return
    }
    if (event.intent.type === 'hoverReplenish') {
      setRemoteHoverCellId(undefined)
      setRemoteTokenSelection(undefined)
      setRemoteHoverCardSourceKey(undefined)
      setRemoteHoverBankTokenType(undefined)
      setRemotePurchaseTarget(undefined)
      setRemoteHoverReplenish(Boolean(event.intent.active))
      return
    }
    if (event.intent.type === 'tokenSelection') {
      setRemoteHoverCellId(undefined)
      setRemoteHoverReplenish(false)
      setRemoteHoverBankTokenType(undefined)
      setRemoteTokenSelection(event.intent)
      return
    }
    if (event.intent.type === 'classicHoverBankToken') {
      setRemoteHoverCellId(undefined)
      setRemoteTokenSelection(undefined)
      setRemoteHoverReplenish(false)
      setRemoteHoverCardSourceKey(undefined)
      setRemotePurchaseTarget(undefined)
      setRemoteHoverBankTokenType(event.intent.tokenType)
      return
    }
    if (event.intent.type === 'hoverCard') {
      setRemoteHoverReplenish(false)
      setRemoteHoverBankTokenType(undefined)
      setRemoteHoverCardSourceKey(event.intent.source ? sourceKey(event.intent.source) : undefined)
      setRemotePurchaseTarget(undefined)
      return
    }
    if (event.intent.type === 'purchaseTarget') {
      setRemoteHoverReplenish(false)
      setRemoteHoverBankTokenType(undefined)
      setRemoteHoverCardSourceKey(sourceKey(event.intent.source))
      setRemotePurchaseTarget({ playerId: event.playerId, source: event.intent.source, gem: event.intent.gem, colorless: isColorlessPurchaseSource(stateRef.current, event.playerId, event.intent.source), valid: event.intent.valid })
      return
    }
    if (event.intent.type === 'goldTarget') {
      setRemoteHoverReplenish(false)
      setRemoteHoverBankTokenType(undefined)
      setRemotePurchaseTarget(undefined)
      startRemoteGoldTarget(event.intent)
      return
    }
    if (event.intent.type === 'privilegeTarget') {
      setRemoteHoverCellId(undefined)
      setRemoteTokenSelection(undefined)
      setRemoteHoverReplenish(false)
      setRemoteHoverBankTokenType(undefined)
      setRemotePurchaseTarget(undefined)
      setRemotePrivilegeTargetCellId(event.intent.cellId)
      startRemotePrivilegeTarget(event.playerId, event.intent)
      return
    }
    setRemoteHoverCellId(undefined)
    setRemoteTokenSelection(undefined)
    setRemoteHoverReplenish(false)
    setRemoteHoverCardSourceKey(undefined)
    setRemoteHoverBankTokenType(undefined)
    setRemotePurchaseTarget(undefined)
    setRemoteClassicTokenDrafts({})
    startRemoteClassicTokenReturnAnimation()
    startRemoteGoldReturnAnimation()
    startRemotePrivilegeReturnAnimation()
    setRemotePrivilegeTargetCellId(undefined)
  }

  function appendRemoteCursorIntent(playerId: PlayerId, intent: Extract<RoomIntent, { type: 'cursorMove' }>) {
    const now = Date.now()
    const path = intent.path
    const senderEndAt = path && path.length > 0 ? path[path.length - 1]?.at ?? 0 : 0
    const normalizedPath = path && path.length > 0
      ? path.map((point) => ({
          x: clamp01(point.x),
          y: clamp01(point.y),
          visible: point.visible === true,
          at: now - (senderEndAt - (point.at ?? 0)),
        }))
      : [{ x: clamp01(intent.x), y: clamp01(intent.y), visible: intent.visible === true, at: now }]

    setRemoteCursors((current) => {
      const previous = current[playerId]
      const merged = previous ? [...previous.points, ...normalizedPath] : [...normalizedPath]
      const trimmed = merged.length > CURSOR_TRAIL_MAX_POINTS ? merged.slice(-CURSOR_TRAIL_MAX_POINTS) : merged
      const latestPoint = merged[merged.length - 1] ?? { visible: intent.visible, at: now }
      return {
        ...current,
        [playerId]: {
          playerId,
          points: trimmed,
          visible: latestPoint.visible,
          lastSeenAt: now,
        },
      }
    })

    if (intent.click) {
      const latest = normalizedPath[normalizedPath.length - 1]
      if (!latest?.visible) return
      const clickId = `${playerId}:${now}:${Math.random().toString(36).slice(2, 7)}`
      setRemoteCursorClicks((current) => [
        ...current,
        { id: clickId, playerId, x: latest.x, y: latest.y, at: now },
      ].slice(-REMOTE_CURSOR_CLICK_LIMIT))
      remoteCursorClickTimersRef.current[clickId] = window.setTimeout(() => {
        setRemoteCursorClicks((current) => current.filter((effect) => effect.id !== clickId))
        delete remoteCursorClickTimersRef.current[clickId]
      }, REMOTE_CURSOR_CLICK_MS)
    }
  }

  function sendRoomIntent(intent: RoomIntent, options: { dedupe: boolean }) {
    if (!secret || !isMyTurn || currentPending || pendingDeferredSubmitRef.current) return
    if (options?.dedupe && intent.type !== 'cursorMove') {
      const key = JSON.stringify(intent)
      if (key === lastIntentKeyRef.current) return
      lastIntentKeyRef.current = key
    }
    void fetch(roomApiPath(`/api/rooms/${roomId}/intents`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSecret: secret, intent }),
    }).catch(() => undefined)
  }

  function publishIntent(intent: RoomIntent) {
    sendRoomIntent(intent, { dedupe: true })
  }

  function publishCursorIntent(intent: Extract<RoomIntent, { type: 'cursorMove' }>) {
    if (!secret) return
    void fetch(roomApiPath(`/api/rooms/${roomId}/intents`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSecret: secret, intent }),
    }).catch(() => undefined)
  }

  function hoverTokenIntent(cell: BoardCell | undefined) {
    if (!cell?.token) {
      publishIntent({ type: 'hoverToken' })
      return
    }
    publishIntent({ type: 'hoverToken', cellId: cell.id })
  }

  function hoverCardIntent(source: CardSource | undefined) {
    publishIntent(source ? { type: 'hoverCard', source } : { type: 'hoverCard' })
  }

  function hoverReplenishIntent(active: boolean) {
    setReplenishPreviewActive(active)
    publishIntent(active ? { type: 'hoverReplenish', active: true } : { type: 'hoverReplenish' })
  }

  function tokenSelectionIntent(selection: TokenDragSelection | undefined) {
    if (!selection) {
      publishIntent({ type: 'hoverToken' })
      return
    }
    publishIntent({ type: 'tokenSelection', originId: selection.originId, cellIds: selection.cellIds, valid: selection.valid, invalidPoint: selection.invalidPoint })
  }

  function classicHoverBankTokenIntent(tokenType: TokenType | undefined) {
    publishIntent(tokenType ? { type: 'classicHoverBankToken', tokenType } : { type: 'classicHoverBankToken' })
  }

  function classicTokenDraftIntent(draft: ClassicTokenDraft | undefined, options: { hoverOnly?: boolean; committed?: boolean } = {}) {
    if (!draft) {
      publishIntent({ type: 'classicTokenDraft', tokenTypes: [], confirmable: false, hoverOnly: options.hoverOnly, committed: options.committed })
      return
    }
    publishIntent({
      type: 'classicTokenDraft',
      tokenTypes: draft.tokenTypes,
      confirmable: isClassicDraftConfirmable(draft),
      hoverTokenType: draft.hoverTokenType,
      hoverSlotIndex: draft.hoverSlotIndex,
      hoverOnly: options.hoverOnly,
      committed: options.committed,
    })
  }

  function updateGoldTargetIntent(carry: TokenCarry, clientX: number, clientY: number) {
    const source = cardSourceAtPoint(clientX, clientY)
    setGoldTargetCardSourceKey(source ? sourceKey(source) : undefined)
    publishIntent(source ? { type: 'goldTarget', cellId: carry.cellId, source } : { type: 'goldTarget', cellId: carry.cellId })
  }

  function privilegeTargetIntent(cellId: string | undefined, index?: number) {
    publishIntent(cellId ? { type: 'privilegeTarget', cellId, index } : { type: 'privilegeTarget', index })
  }

  function clearIntent() {
    lastIntentKeyRef.current = ''
    setReplenishPreviewActive(false)
    publishIntent({ type: 'clear' })
  }

  function canUsePrivilegeNow(index: number): boolean {
    if (!state || !playerId || !isMyTurn || currentPending || isInteractionLocked()) return false
    return index >= 0 && index < state.players[playerId].privileges && !state.turnActions?.replenished
  }

  function privilegeTargetAtPoint(clientX: number, clientY: number): BoardCell | undefined {
    if (!state) return undefined
    const target = document.elementFromPoint(clientX, clientY)
    const cellElement = target?.closest<HTMLElement>('[data-cell-id]')
    const cellId = cellElement?.dataset.cellId
    const cell = cellId ? state.board.find((item: BoardCell) => item.id === cellId) : undefined
    return cell?.token && cell.token.type !== 'gold' ? cell : undefined
  }

  function startRemoteGoldTarget(intent: Extract<RoomIntent, { type: 'goldTarget' }>) {
    if (!intent.source) {
      if (!remoteGoldAnchorRef.current) {
        setRemoteGoldAnchor(undefined)
      }
      return
    }
    const targetElement = cardSourceElement(intent.source)
    if (!targetElement) return
    const target = targetElement.getBoundingClientRect()
    const sourceAnchor = remoteGoldAnchorRef.current?.cellId === intent.cellId ? remoteGoldAnchorRef.current : undefined
    if (sourceAnchor?.source && isSameCardSource(sourceAnchor.source, intent.source)) return
    window.clearTimeout(remoteGoldSettleTimerRef.current)
    if (remoteGoldFrameRef.current !== undefined) window.cancelAnimationFrame(remoteGoldFrameRef.current)
    const visibleGold = document.querySelector<HTMLElement>('[data-remote-gold-token]')
    const sourceToken = sourceAnchor || visibleGold ? undefined : tokenElementForCell(intent.cellId)
    if (!sourceAnchor && !visibleGold && !sourceToken) return
    const visibleRect = visibleGold?.getBoundingClientRect()
    const sourceRect = sourceToken?.getBoundingClientRect()
    const size = sourceAnchor?.size ?? visibleRect?.width ?? sourceRect!.width
    const from = visibleRect ?? (sourceAnchor ? { left: sourceAnchor.left, top: sourceAnchor.top, width: sourceAnchor.size, height: sourceAnchor.size } : sourceRect!)
    const toX = target.left + (target.width - size) / 2
    const toY = target.top + (target.height - size) / 2
    const current = stateRef.current
    const nextAnchor: RemoteGoldAnchor = { cellId: intent.cellId, classic: isClassicShellGame(current), variant: shellVariant(current), left: toX, top: toY, size, source: intent.source }
    remoteGoldAnchorRef.current = nextAnchor
    setTakingCellIds((current) => (current.includes(intent.cellId) ? current : [...current, intent.cellId]))
    if (visibleGold || sourceAnchor) {
      setRemoteGoldAnchorState(nextAnchor)
    } else {
      setRemoteGoldAnchorState({ cellId: intent.cellId, classic: isClassicShellGame(current), variant: shellVariant(current), left: from.left, top: from.top, size, source: intent.source })
      remoteGoldFrameRef.current = window.requestAnimationFrame(() => {
        remoteGoldFrameRef.current = window.requestAnimationFrame(() => {
          remoteGoldFrameRef.current = undefined
          setRemoteGoldAnchorState(nextAnchor)
        })
      })
    }
    remoteGoldSettleTimerRef.current = window.setTimeout(() => {
      remoteGoldSettleTimerRef.current = undefined
      setTakingCellIds((current) => current.filter((id) => id !== intent.cellId))
      if (remoteGoldAnchorRef.current === nextAnchor) {
        setRemoteGoldAnchorState(nextAnchor)
      }
    }, GOLD_INTENT_ANIMATION_MS + 40)
  }

  function startRemoteGoldReturnAnimation() {
    const anchor = remoteGoldAnchorRef.current
    if (!anchor) {
      setRemoteGoldAnchor(undefined)
      return
    }
    window.clearTimeout(remoteGoldSettleTimerRef.current)
    if (remoteGoldFrameRef.current !== undefined) window.cancelAnimationFrame(remoteGoldFrameRef.current)
    const target = document.querySelector<HTMLElement>(`[data-cell-id="${anchor.cellId}"]`)?.getBoundingClientRect()
    if (!target) {
      setRemoteGoldAnchor(undefined)
      return
    }
    const nextAnchor: RemoteGoldAnchor = {
      cellId: anchor.cellId,
      classic: anchor.classic,
      left: target.left + (target.width - anchor.size) / 2,
      top: target.top + (target.height - anchor.size) / 2,
      size: anchor.size,
    }
    remoteGoldAnchorRef.current = nextAnchor
    setRemoteGoldAnchorState(nextAnchor)
    remoteGoldSettleTimerRef.current = window.setTimeout(() => {
      remoteGoldSettleTimerRef.current = undefined
      setTakingCellIds((current) => current.filter((id) => id !== anchor.cellId))
      if (remoteGoldAnchorRef.current === nextAnchor) setRemoteGoldAnchor(undefined)
    }, RETURN_ANIMATION_MS + 50)
  }

  function startRemoteClassicTokenTarget(playerId: PlayerId, tokenType: GemType) {
    const target = tokenSlotsZoneRect(playerId)
    if (!target) return
    const sourceAnchor = remoteClassicTokenAnchorRef.current?.playerId === playerId && remoteClassicTokenAnchorRef.current.tokenType === tokenType
      ? remoteClassicTokenAnchorRef.current
      : undefined
    const visibleToken = document.querySelector<HTMLElement>('[data-remote-classic-token]')
    const sourceToken = sourceAnchor || visibleToken ? undefined : classicBankTokenElement(tokenType)
    if (!sourceAnchor && !visibleToken && !sourceToken) return
    window.clearTimeout(remoteClassicTokenSettleTimerRef.current)
    if (remoteClassicTokenFrameRef.current !== undefined) window.cancelAnimationFrame(remoteClassicTokenFrameRef.current)
    const visibleRect = visibleToken?.getBoundingClientRect()
    const sourceRect = sourceToken?.getBoundingClientRect()
    const size = sourceAnchor?.size ?? visibleRect?.width ?? sourceRect!.width
    const from = visibleRect ?? (sourceAnchor ? { left: sourceAnchor.left, top: sourceAnchor.top, width: sourceAnchor.size, height: sourceAnchor.size } : sourceRect!)
    const nextAnchor: RemoteClassicTokenAnchor = {
      playerId,
      tokenType,
      variant: shellVariant(stateRef.current),
      left: target.left + (target.width - size) / 2,
      top: target.top + (target.height - size) / 2,
      size,
    }
    remoteClassicTokenAnchorRef.current = nextAnchor
    if (visibleToken || sourceAnchor) {
      setRemoteClassicTokenAnchorState(nextAnchor)
    } else {
      setRemoteClassicTokenAnchorState({ ...nextAnchor, left: from.left, top: from.top })
      remoteClassicTokenFrameRef.current = window.requestAnimationFrame(() => {
        remoteClassicTokenFrameRef.current = window.requestAnimationFrame(() => {
          remoteClassicTokenFrameRef.current = undefined
          setRemoteClassicTokenAnchorState(nextAnchor)
        })
      })
    }
  }

  function startRemoteClassicTokenReturnAnimation() {
    const anchor = remoteClassicTokenAnchorRef.current
    if (!anchor) {
      setRemoteClassicTokenAnchor(undefined)
      return
    }
    const target = classicBankTokenElement(anchor.tokenType)?.getBoundingClientRect()
    if (!target) {
      setRemoteClassicTokenAnchor(undefined)
      return
    }
    window.clearTimeout(remoteClassicTokenSettleTimerRef.current)
    if (remoteClassicTokenFrameRef.current !== undefined) window.cancelAnimationFrame(remoteClassicTokenFrameRef.current)
    const nextAnchor: RemoteClassicTokenAnchor = {
      playerId: anchor.playerId,
      tokenType: anchor.tokenType,
      left: target.left + (target.width - anchor.size) / 2,
      top: target.top + (target.height - anchor.size) / 2,
      size: anchor.size,
    }
    remoteClassicTokenAnchorRef.current = nextAnchor
    setRemoteClassicTokenAnchorState(nextAnchor)
    remoteClassicTokenSettleTimerRef.current = window.setTimeout(() => {
      remoteClassicTokenSettleTimerRef.current = undefined
      if (remoteClassicTokenAnchorRef.current === nextAnchor) setRemoteClassicTokenAnchor(undefined)
    }, RETURN_ANIMATION_MS + 50)
  }

  function startRemotePrivilegeTarget(playerId: PlayerId, intent: Extract<RoomIntent, { type: 'privilegeTarget' }>) {
    if (!intent.cellId) {
      if (!remotePrivilegeAnchorRef.current) setRemotePrivilegeAnchor(undefined)
      return
    }
    const state = stateRef.current
    const sourceIndex = intent.index ?? (state ? state.players[playerId].privileges - 1 : 0)
    if (sourceIndex < 0) return
    const targetElement = document.querySelector<HTMLElement>(`[data-cell-id="${intent.cellId}"] .token`) ?? document.querySelector<HTMLElement>(`[data-cell-id="${intent.cellId}"]`)
    if (!targetElement) return
    const target = targetElement.getBoundingClientRect()
    const sourceAnchor = remotePrivilegeAnchorRef.current?.playerId === playerId ? remotePrivilegeAnchorRef.current : undefined
    if (sourceAnchor?.cellId === intent.cellId) return
    window.clearTimeout(remotePrivilegeSettleTimerRef.current)
    if (remotePrivilegeFrameRef.current !== undefined) window.cancelAnimationFrame(remotePrivilegeFrameRef.current)
    const visibleScroll = document.querySelector<HTMLElement>('[data-remote-privilege-scroll]')
    const sourceElement = sourceAnchor || visibleScroll ? undefined : privilegeSlotElement(playerId, sourceIndex)
    if (!sourceAnchor && !visibleScroll && !sourceElement) return
    const visibleRect = visibleScroll?.getBoundingClientRect()
    const sourceRect = sourceElement?.getBoundingClientRect()
    const width = sourceAnchor?.width ?? visibleRect?.width ?? sourceRect!.width
    const height = sourceAnchor?.height ?? visibleRect?.height ?? sourceRect!.height
    const from = visibleRect ?? (sourceAnchor ? { left: sourceAnchor.left, top: sourceAnchor.top, width: sourceAnchor.width, height: sourceAnchor.height } : sourceRect!)
    const toX = target.left + (target.width - width) / 2
    const toY = target.top + (target.height - height) / 2
    const nextAnchor: RemotePrivilegeAnchor = { playerId, index: sourceIndex, cellId: intent.cellId, left: toX, top: toY, width, height }
    remotePrivilegeAnchorRef.current = nextAnchor
    if (visibleScroll || sourceAnchor) {
      setRemotePrivilegeAnchorState(nextAnchor)
    } else {
      setRemotePrivilegeAnchorState({ ...nextAnchor, left: from.left, top: from.top })
      remotePrivilegeFrameRef.current = window.requestAnimationFrame(() => {
        remotePrivilegeFrameRef.current = window.requestAnimationFrame(() => {
          remotePrivilegeFrameRef.current = undefined
          setRemotePrivilegeAnchorState(nextAnchor)
        })
      })
    }
    remotePrivilegeSettleTimerRef.current = window.setTimeout(() => {
      remotePrivilegeSettleTimerRef.current = undefined
      if (remotePrivilegeAnchorRef.current === nextAnchor) setRemotePrivilegeAnchorState(nextAnchor)
    }, GOLD_INTENT_ANIMATION_MS + 40)
  }

  function startRemotePrivilegeReturnAnimation() {
    const anchor = remotePrivilegeAnchorRef.current
    if (!anchor) {
      setRemotePrivilegeAnchor(undefined)
      return
    }
    window.clearTimeout(remotePrivilegeSettleTimerRef.current)
    if (remotePrivilegeFrameRef.current !== undefined) window.cancelAnimationFrame(remotePrivilegeFrameRef.current)
    const target = privilegeSlotElement(anchor.playerId, anchor.index)?.getBoundingClientRect()
    if (!target) {
      setRemotePrivilegeAnchor(undefined)
      return
    }
    const nextAnchor: RemotePrivilegeAnchor = {
      ...anchor,
      cellId: anchor.cellId,
      left: target.left + (target.width - anchor.width) / 2,
      top: target.top + (target.height - anchor.height) / 2,
    }
    remotePrivilegeAnchorRef.current = nextAnchor
    setRemotePrivilegeAnchorState(nextAnchor)
    remotePrivilegeSettleTimerRef.current = window.setTimeout(() => {
      remotePrivilegeSettleTimerRef.current = undefined
      if (remotePrivilegeAnchorRef.current === nextAnchor) setRemotePrivilegeAnchor(undefined)
    }, RETURN_ANIMATION_MS + 50)
  }

  async function copyRoomLink() {
    await navigator.clipboard.writeText(currentRoomLink())
    setCopiedLink(true)
    window.setTimeout(() => setCopiedLink(false), 1200)
  }

  function openBoardFocus() {
    boardFocusOpenRef.current = true
    setBoardFocusOpen(true)
  }

  function closeBoardFocus(options?: { clearSelection?: boolean }) {
    boardFocusOpenRef.current = false
    setBoardFocusOpen(false)
    if (options?.clearSelection) {
      setTokenDrag(undefined)
      setTokenSelection(undefined)
      tokenSelectionIntent(undefined)
    }
  }

  function shouldOpenBoardFocusBeforeBoardAction() {
    return isMobileBoardLayoutRef.current && !boardFocusOpenRef.current
  }

  function beginTokenDrag(event: ReactPointerEvent<HTMLButtonElement>, cell: BoardCell) {
    if (isInteractionLocked()) return
    if (shouldOpenBoardFocusBeforeBoardAction()) {
      event.preventDefault()
      openBoardFocus()
      return
    }
    if (currentPending?.type === 'takeBoardToken') {
      event.preventDefault()
      if (cell.token?.type === currentPending.tokenType) takeBoardTokenFromCell(cell.id)
      return
    }
    if (activePrivilegeIndex !== undefined) {
      event.preventDefault()
      if (cell.token && cell.token.type !== 'gold') usePrivilegeOnCell(cell.id)
      else {
        setActivePrivilegeIndex(undefined)
        setPrivilegeTargetCellId(undefined)
        clearIntent()
      }
      return
    }
    if (!isMyTurn || currentPending || !cell.token || !state) return
    if (cell.token.type === 'gold') {
      beginGoldCarry(event, cell)
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveTokenCarry(undefined)
    setTokenSelection(undefined)
    const selection = { originId: cell.id, cellIds: [cell.id], valid: true }
    setTokenDrag(selection)
    tokenSelectionIntent(selection)
  }

  function beginPrivilegeCarry(event: ReactPointerEvent<HTMLElement>, index: number) {
    if (isInteractionLocked() || !playerId || !canUsePrivilegeNow(index)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    setTokenDrag(undefined)
    setTokenSelection(undefined)
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    setActiveTokenCarry(undefined)
    setActiveCardCarry(undefined)
    setActivePrivilegeIndex(undefined)
    setPrivilegeTargetCellId(undefined)
    setActivePrivilegeCarry({
      index,
      playerId,
      x: rect.left,
      y: rect.top,
      originX: rect.left,
      originY: rect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  function beginCardCarry(event: ReactPointerEvent<HTMLElement>, cardId: number, source: CardSource) {
    if (isInteractionLocked() || !isMyTurn || currentPending || !state || !playerId) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    setTokenDrag(undefined)
    setTokenSelection(undefined)
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    setActiveTokenCarry(undefined)
    setActiveCardCarry({
      cardId,
      source,
      horizontal: source.type === 'reserve',
      x: rect.left,
      y: rect.top,
      originX: rect.left,
      originY: rect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      originWidth: rect.width,
      originHeight: rect.height,
      classic: isClassicShellGame(state),
      variant: shellVariant(state),
    })
  }

  function beginTokenSlotCarry(event: ReactPointerEvent<HTMLElement>, index: number) {
    if (!state || !playerId || currentPending || state.winner || isInteractionLocked()) return
    const token = state.players[playerId].tokenSlots[index]
    if (!token || spendingTokenSlotKeys.includes(tokenSlotKey(playerId, index))) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const tokenElement = event.currentTarget.querySelector<HTMLElement>('.tokenImage') ?? event.currentTarget
    const rect = tokenElement.getBoundingClientRect()
    setTokenDrag(undefined)
    setTokenSelection(undefined)
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    setActiveTokenCarry(undefined)
    setActiveCardCarry(undefined)
    setActivePrivilegeCarry(undefined)
    setActiveTokenSlotCarry({
      playerId,
      tokenId: token.id,
      tokenType: token.type,
      sourceIndex: index,
      targetIndex: index,
      x: rect.left,
      y: rect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  function updateBoardPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (tokenCarryRef.current?.kind === 'gold') {
      updateTokenCarry(event)
      return
    }
    if (!tokenDrag || !state || !tokenBoardRef.current) return
    event.preventDefault()
    const selection = computeDraggedTokenSelection(state, tokenDrag.originId, event.clientX, event.clientY, tokenBoardRef.current)
    setTokenDrag(selection)
    tokenSelectionIntent(selection)
  }

  function finishBoardPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (tokenCarryRef.current?.kind === 'gold') {
      finishTokenCarry(event)
      return
    }
    if (!tokenDrag || !state || !tokenBoardRef.current) return
    event.preventDefault()
    const selection = computeDraggedTokenSelection(state, tokenDrag.originId, event.clientX, event.clientY, tokenBoardRef.current)
    setTokenDrag(undefined)
    if (!selection.valid) {
      setTokenSelection(undefined)
      tokenSelectionIntent(undefined)
      return
    }
    setTokenSelection({ originId: selection.originId, cellIds: selection.cellIds, valid: selection.valid, invalidPoint: selection.invalidPoint })
    tokenSelectionIntent(selection)
  }

  function beginGoldCarry(event: ReactPointerEvent<HTMLElement>, cell: Pick<BoardCell, 'id'> & { token?: Token }) {
    if (!cell.token || cell.token.type !== 'gold') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const target = event.currentTarget.querySelector<HTMLElement>('.token, .splendorStackedToken') ?? event.currentTarget
    const rect = target.getBoundingClientRect()
    setTokenDrag(undefined)
    setTokenSelection(undefined)
    setActiveTokenCarry({
      kind: 'gold',
      cellId: cell.id,
      classic: isClassicShellGame(stateRef.current),
      variant: shellVariant(stateRef.current),
      x: rect.left,
      y: rect.top,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  function beginClassicBankTokenCarry(event: ReactPointerEvent<HTMLElement>, tokenType: GemType) {
    if (!state || !playerId || !canTakeClassicDraftToken(state, playerId, classicTokenDraftRef.current, tokenType) || isInteractionLocked()) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const target = event.currentTarget.querySelector<HTMLElement>('.splendorStackedToken:last-of-type, .tokenImage') ?? event.currentTarget
    const rect = target.getBoundingClientRect()
    setTokenDrag(undefined)
    setTokenSelection(undefined)
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    setActiveTokenCarry(undefined)
    setActiveClassicTokenCarry({
      mode: 'bank',
      tokenType,
      x: rect.left,
      y: rect.top,
      originX: rect.left,
      originY: rect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  function beginClassicDraftTokenReturn(event: ReactPointerEvent<HTMLElement>, panelPlayerId: PlayerId, draftIndex: number) {
    if (!state || !playerId || panelPlayerId !== playerId || !classicTokenDraftRef.current || isInteractionLocked()) return
    const tokenType = classicTokenDraftRef.current.tokenTypes[draftIndex]
    if (!tokenType) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const target = event.currentTarget.querySelector<HTMLElement>('.tokenImage') ?? event.currentTarget
    const rect = target.getBoundingClientRect()
    setActiveClassicTokenCarry({
      mode: 'draft',
      tokenType,
      draftIndex,
      x: rect.left,
      y: rect.top,
      originX: rect.left,
      originY: rect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  function updateTokenCarry(event: ReactPointerEvent<HTMLElement>) {
    if (!tokenCarryRef.current) return
    event.preventDefault()
    moveTokenCarryTo(event.clientX, event.clientY)
  }

  function updateCardCarry(event: ReactPointerEvent<HTMLElement>) {
    if (!cardCarryRef.current) return
    event.preventDefault()
    moveCardCarryTo(event.clientX, event.clientY)
  }

  function moveTokenCarryTo(clientX: number, clientY: number) {
    const carry = tokenCarryRef.current
    if (!carry) return
    setActiveTokenCarry({
      ...carry,
      x: clientX - carry.offsetX,
      y: clientY - carry.offsetY,
    })
    collapseFocusedBoardAfterGoldLeavesBoard(clientX, clientY)
    updateGoldTargetIntent(carry, clientX, clientY)
  }

  function moveClassicTokenCarryTo(clientX: number, clientY: number) {
    const carry = classicTokenCarryRef.current
    if (!carry) return
    setActiveClassicTokenCarry({
      ...carry,
      x: clientX - carry.offsetX,
      y: clientY - carry.offsetY,
    })
    updateClassicTokenSlotPreview(carry, clientX, clientY)
  }

  function updateClassicTokenSlotPreview(carry: ClassicTokenCarry, clientX: number, clientY: number) {
    if (carry.mode !== 'bank' || !state || !playerId) return
    const hoverSlotIndex = tokenSlotTargetIndexAtPoint(playerId, clientX, clientY)
    const currentDraft = classicTokenDraftRef.current
    const nextDraft: ClassicTokenDraft | undefined = hoverSlotIndex !== undefined
      ? {
          playerId,
          tokenTypes: currentDraft?.tokenTypes ?? [],
          initialCounts: currentDraft?.initialCounts ?? classicGemBankCounts(state),
          hoverTokenType: carry.tokenType,
          hoverSlotIndex,
        }
      : currentDraft && currentDraft.tokenTypes.length > 0
        ? { playerId, tokenTypes: currentDraft.tokenTypes, initialCounts: currentDraft.initialCounts }
        : undefined
    const sameIntent =
      (!currentDraft || !nextDraft)
        ? currentDraft === nextDraft
        : currentDraft.hoverTokenType === nextDraft.hoverTokenType
          && currentDraft.hoverSlotIndex === nextDraft.hoverSlotIndex
          && currentDraft.tokenTypes.length === nextDraft.tokenTypes.length
          && currentDraft.tokenTypes.every((tokenType, index) => tokenType === nextDraft.tokenTypes[index])
    if (sameIntent) return
    setClassicTokenDraft(nextDraft)
    classicTokenDraftIntent(nextDraft, { hoverOnly: !nextDraft })
  }

  function clearClassicTokenSlotPreview() {
    const currentDraft = classicTokenDraftRef.current
    if (!currentDraft?.hoverTokenType && currentDraft?.hoverSlotIndex === undefined) return
    const nextDraft = currentDraft.tokenTypes.length > 0
      ? { playerId: currentDraft.playerId, tokenTypes: currentDraft.tokenTypes, initialCounts: currentDraft.initialCounts }
      : undefined
    setClassicTokenDraft(nextDraft)
    classicTokenDraftIntent(nextDraft, { hoverOnly: !nextDraft })
  }

  function collapseFocusedBoardAfterGoldLeavesBoard(clientX: number, clientY: number) {
    if (!isMobileBoardLayoutRef.current || !boardFocusOpenRef.current || tokenCarryRef.current?.kind !== 'gold') return
    const board = tokenBoardRef.current?.getBoundingClientRect()
    if (!board) return
    const margin = 8
    const insideBoard = clientX >= board.left - margin && clientX <= board.right + margin && clientY >= board.top - margin && clientY <= board.bottom + margin
    if (!insideBoard) closeBoardFocus()
  }

  function moveTokenSlotCarryTo(clientX: number, clientY: number) {
    const carry = tokenSlotCarryRef.current
    if (!carry) return
    setActiveTokenSlotCarry({
      ...carry,
      x: clientX - carry.offsetX,
      y: clientY - carry.offsetY,
      targetIndex: tokenSlotTargetIndexAtPoint(carry.playerId, clientX, clientY) ?? carry.targetIndex,
    })
  }

  function movePrivilegeCarryTo(clientX: number, clientY: number) {
    const carry = privilegeCarryRef.current
    if (!carry) return
    setActivePrivilegeCarry({
      ...carry,
      x: clientX - carry.offsetX,
      y: clientY - carry.offsetY,
    })
    const target = privilegeTargetAtPoint(clientX, clientY)
    setPrivilegeTargetCellId(target?.id)
    privilegeTargetIntent(target?.id, carry.index)
  }

  function finishTokenCarry(event: ReactPointerEvent<HTMLElement>) {
    if (!tokenCarryRef.current) return
    event.preventDefault()
    finishTokenCarryAt(event.clientX, event.clientY)
  }

  function finishTokenCarryAt(clientX: number, clientY: number) {
    const carry = tokenCarryRef.current
    if (!carry || !playerId) return
    if (isMobileBoardLayoutRef.current && boardFocusOpenRef.current) closeBoardFocus()
    const source = cardSourceAtPoint(clientX, clientY)
    setActiveTokenCarry(undefined)
    setGoldTargetCardSourceKey(undefined)
    if (source) {
      reserveWithGold(source, carry.cellId, carry)
    } else {
      clearIntent()
      startGoldReturnAnimation(carry)
    }
  }

  function finishClassicTokenCarryAt(clientX: number, clientY: number) {
    const carry = classicTokenCarryRef.current
    if (!carry || !state || !playerId) return
    const dragDistance = Math.hypot(clientX - carry.startClientX, clientY - carry.startClientY)
    const overOwnTokenSlots = tokenSlotTargetIndexAtPoint(playerId, clientX, clientY) !== undefined
    setActiveClassicTokenCarry(undefined)
    if (carry.mode === 'bank') {
      if (dragDistance < 8 || overOwnTokenSlots) {
        takeClassicDraftToken(carry.tokenType, carry)
        return
      }
      clearClassicTokenSlotPreview()
      startClassicTokenReturnAnimation(carry)
      return
    }
    clearClassicTokenSlotPreview()
    if (dragDistance < 8 || !overOwnTokenSlots) {
      if (carry.draftIndex !== undefined) returnClassicDraftToken(carry.draftIndex, carry)
      return
    }
  }

  function finishTokenSlotCarryAt(clientX: number, clientY: number) {
    const carry = tokenSlotCarryRef.current
    if (!carry || !state || !playerId) return
    const targetIndex = tokenSlotTargetIndexAtPoint(carry.playerId, clientX, clientY)
    setActiveTokenSlotCarry(undefined)
    if (targetIndex === undefined || carry.playerId !== playerId) return
    const tokenIds = reorderedTokenSlotIds(state, carry.playerId, carry.sourceIndex, targetIndex)
    if (!tokenIds) return
    void submit({ type: 'reorderTokenSlots', playerId: carry.playerId, tokenIds })
  }

  function finishCardCarry(event: ReactPointerEvent<HTMLElement>) {
    if (!cardCarryRef.current) return
    event.preventDefault()
    finishCardCarryAt(event.clientX, event.clientY)
  }

  function moveCardCarryTo(clientX: number, clientY: number) {
    const carry = cardCarryRef.current
    if (!carry) return
    setActiveCardCarry({
      ...carry,
      x: clientX - carry.offsetX,
      y: clientY - carry.offsetY,
    })
    updatePurchasePreview(carry, clientX, clientY)
  }

  function finishCardCarryAt(clientX: number, clientY: number) {
    const carry = cardCarryRef.current
    if (!carry || !playerId) return
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    clearIntent()
    const dragDistance = Math.hypot(clientX - carry.startClientX, clientY - carry.startClientY)
    setActiveCardCarry(undefined)
    if (carry.source.type === 'reserve' && dragDistance < 12) return
    if (state?.gameType === 'pokemon' && state.turnActions?.mandatoryDone) {
      if (pokemonEvolutionTargetForCarry(state, playerId, carry, clientX, clientY)) {
        const evolutionAnimation = createLocalPokemonEvolutionAnimation(state, playerId, carry)
        if (evolutionAnimation) startPurchaseCardAnimation(evolutionAnimation)
        void submit(
          { type: 'evolvePokemon', playerId, source: carry.source },
          evolutionAnimation ? { deferStateMs: evolutionAnimation.duration } : undefined,
        )
        return
      }
      startCardReturnAnimation(carry)
      return
    }
    const target = state ? purchaseTargetForCarry(state, playerId, carry, clientX, clientY) : undefined
    if (target) {
      if (target.valid && purchaseCarriedCard(carry, clientX, clientY)) return
      setError(invalidPurchaseMessage(carry, target))
      startCardReturnAnimation(carry)
      return
    }
    startCardReturnAnimation(carry)
  }

  function finishPrivilegeCarryAt(clientX: number, clientY: number) {
    const carry = privilegeCarryRef.current
    if (!carry) return
    const dragDistance = Math.hypot(clientX - carry.startClientX, clientY - carry.startClientY)
    const target = privilegeTargetAtPoint(clientX, clientY)
    setActivePrivilegeCarry(undefined)
    setPrivilegeTargetCellId(undefined)
    if (dragDistance < 8) {
      setActivePrivilegeIndex(carry.index)
      privilegeTargetIntent(undefined, carry.index)
      return
    }
    setActivePrivilegeIndex(undefined)
    if (target) {
      usePrivilegeOnCell(target.id, carry)
      return
    }
    clearIntent()
    startPrivilegeReturnAnimation(carry)
  }

  function setActiveTokenCarry(next: TokenCarry | undefined) {
    tokenCarryRef.current = next
    setTokenCarry(next)
  }

  function setActiveClassicTokenCarry(next: ClassicTokenCarry | undefined) {
    classicTokenCarryRef.current = next
    setClassicTokenCarry(next)
  }

  function setActiveTokenSlotCarry(next: TokenSlotCarry | undefined) {
    tokenSlotCarryRef.current = next
    setTokenSlotCarry(next)
  }

  function setActiveCardCarry(next: CardCarry | undefined) {
    cardCarryRef.current = next
    setCardCarry(next)
  }

  function setActivePrivilegeCarry(next: PrivilegeCarry | undefined) {
    privilegeCarryRef.current = next
    setPrivilegeCarry(next)
  }

  function usePrivilegeOnCell(cellId: string, carry?: PrivilegeCarry) {
    if (!playerId || isInteractionLocked()) return
    setActivePrivilegeIndex(undefined)
    setPrivilegeTargetCellId(undefined)
    if (carry) {
      pendingPrivilegeCarryRef.current = carry
      const key = privilegeSlotKey(playerId, carry.index)
      setMovingPrivilegeSlotKeys((current) => (current.includes(key) ? current : [...current, key]))
    }
    void submit({ type: 'usePrivilege', playerId, cellId }, carry ? { privilegeCarry: carry } : undefined)
  }

  function takeBoardTokenFromCell(cellId: string) {
    if (!playerId || isInteractionLocked()) return
    clearIntent()
    void submit({ type: 'takeBoardToken', playerId, cellId })
  }

  function reserveWithGold(source: CardSource, cellId: string, carry?: TokenCarry) {
    if (!playerId || !state || isInteractionLocked()) return
    if (classicTokenDraftRef.current) cancelClassicTokenDraft()
    if (source.type === 'deck') pendingDeckReserveRevealRef.current = { playerId, index: state.players[playerId].reserve.length }
    const reserveAnimation = createLocalReserveAnimation(state, playerId, source, cellId, carry)
    if (reserveAnimation) startReserveAnimation(reserveAnimation)
    void submit({ type: 'reserveCard', playerId, source, goldCellId: cellId }, reserveAnimation ? { deferStateMs: reserveAnimation.duration } : undefined)
  }

  function takeClassicDraftToken(tokenType: GemType, carry?: ClassicTokenCarry) {
    if (!state || !playerId || !canTakeClassicDraftToken(state, playerId, classicTokenDraftRef.current, tokenType)) return
    const currentDraft = classicTokenDraftRef.current
    const nextDraft: ClassicTokenDraft = currentDraft
      ? { playerId, tokenTypes: [...currentDraft.tokenTypes, tokenType], initialCounts: currentDraft.initialCounts }
      : { playerId, tokenTypes: [tokenType], initialCounts: classicGemBankCounts(state) }
    const draftIndex = nextDraft.tokenTypes.length - 1
    setClassicTokenDraft(nextDraft)
    classicTokenDraftIntent(nextDraft)
    scheduleClassicDraftFlight(playerId, tokenType, draftIndex, 'take', carry)
  }

  function returnClassicDraftToken(draftIndex: number, carry?: ClassicTokenCarry) {
    if (!playerId) return
    const currentDraft = classicTokenDraftRef.current
    if (!currentDraft) return
    const tokenType = currentDraft.tokenTypes[draftIndex]
    if (!tokenType) return
    const nextTokenTypes = currentDraft.tokenTypes.filter((_, index) => index !== draftIndex)
    const nextDraft = nextTokenTypes.length > 0 ? { playerId, tokenTypes: nextTokenTypes, initialCounts: currentDraft.initialCounts } : undefined
    scheduleClassicDraftFlight(playerId, tokenType, draftIndex, 'return', carry)
    setClassicTokenDraft(nextDraft)
    classicTokenDraftIntent(nextDraft)
  }

  function confirmClassicTokenDraft() {
    if (!playerId) return
    const draft = classicTokenDraftRef.current
    if (!draft || !isClassicDraftConfirmable(draft) || isInteractionLocked()) return
    const tokenTypes = draft.tokenTypes
    markClassicDraftCommitted(playerId)
    setClassicTokenDraft(undefined)
    classicTokenDraftIntent(undefined, { committed: true })
    void submit({ type: 'takeClassicBankTokens', playerId, tokenTypes })
  }

  function cancelClassicTokenDraft() {
    const draft = classicTokenDraftRef.current
    if (!draft || !playerId) return
    draft.tokenTypes.forEach((tokenType, index) => scheduleClassicDraftFlight(playerId, tokenType, index, 'return'))
    setClassicTokenDraft(undefined)
    classicTokenDraftIntent(undefined)
  }

  function updatePurchasePreview(carry: CardCarry, clientX: number, clientY: number) {
    if (!state || !playerId) {
      setPurchasePreviewSlotKeys([])
      setPurchaseTarget(undefined)
      return
    }
    const target = purchaseTargetForCarry(state, playerId, carry, clientX, clientY)
    if (state.gameType === 'pokemon' && state.turnActions?.mandatoryDone) {
      setPurchaseTarget(undefined)
      setPurchasePreviewSlotKeys([])
      hoverCardIntent(carry.source)
      return
    }
    setPurchaseTarget(target)
    if (!target) {
      setPurchasePreviewSlotKeys([])
      hoverCardIntent(carry.source)
      return
    }
    publishIntent({ type: 'purchaseTarget', source: carry.source, gem: target.gem, valid: target.valid })
    if (!target.valid) {
      setPurchasePreviewSlotKeys([])
      return
    }
    const payment = computePayment(state, playerId, carry.cardId)
    const slots = payment ? paymentSlotsForPayment(state, playerId, payment) : []
    setPurchasePreviewSlotKeys(slots.map((slot) => tokenSlotKey(playerId, slot.index)))
  }

  function purchaseCarriedCard(carry: CardCarry, clientX: number, clientY: number): boolean {
    if (!state || !playerId) return false
    const target = purchaseTargetForCarry(state, playerId, carry, clientX, clientY)
    if (!target?.valid) return false
    const spendAnimation = createLocalPurchaseSpendAnimation(state, playerId, carry.cardId)
    const cardAnimation = createLocalPurchaseCardAnimation(state, playerId, carry, target.gem)
    if (spendAnimation) startTokenSpendAnimation(spendAnimation)
    if (cardAnimation) startPurchaseCardAnimation(cardAnimation)
    const deferStateMs = Math.max(spendAnimation?.duration ?? 0, cardAnimation?.duration ?? 0)
    void submit(
      { type: 'purchaseCard', playerId, source: carry.source, wildColor: cardNeedsWildChoice(carry.cardId) ? target.gem : undefined },
      deferStateMs > 0 ? { deferStateMs } : undefined,
    )
    return true
  }

  function cancelTokenCarryWithReturn() {
    const carry = tokenCarryRef.current
    if (!carry) return
    setActiveTokenCarry(undefined)
    setGoldTargetCardSourceKey(undefined)
    clearIntent()
    startGoldReturnAnimation(carry)
  }

  function cancelClassicTokenCarryWithReturn() {
    const carry = classicTokenCarryRef.current
    if (!carry) return
    setActiveClassicTokenCarry(undefined)
    clearClassicTokenSlotPreview()
    startClassicTokenReturnAnimation(carry)
  }

  function cancelTokenSlotCarry() {
    if (!tokenSlotCarryRef.current) return
    setActiveTokenSlotCarry(undefined)
  }

  function cancelCardCarryWithReturn() {
    const carry = cardCarryRef.current
    if (!carry) return
    setActiveCardCarry(undefined)
    setPurchasePreviewSlotKeys([])
    setPurchaseTarget(undefined)
    clearIntent()
    startCardReturnAnimation(carry)
  }

  function cancelPrivilegeCarryWithReturn() {
    const carry = privilegeCarryRef.current
    if (!carry) return
    setActivePrivilegeCarry(undefined)
    setPrivilegeTargetCellId(undefined)
    clearIntent()
    startPrivilegeReturnAnimation(carry)
  }

  function startGoldReturnAnimation(carry: TokenCarry) {
    const target = document.querySelector<HTMLElement>(`[data-cell-id="${carry.cellId}"]`)?.getBoundingClientRect()
    if (!target) return
    const size = carry.width
    const flight: FlyingToken = {
      id: `return-gold-${carry.cellId}-${performance.now()}`,
      type: 'gold',
      classic: carry.classic,
      variant: carry.variant,
      fromX: carry.x,
      fromY: carry.y,
      toX: target.left + (target.width - size) / 2,
      toY: target.top + (target.height - size) / 2,
      size,
      duration: RETURN_ANIMATION_MS,
    }
    setTakingCellIds((current) => (current.includes(carry.cellId) ? current : [...current, carry.cellId]))
    setFlyingTokens((current) => [...current, flight])
    window.setTimeout(() => {
      setFlyingTokens((current) => current.filter((item) => item.id !== flight.id))
      setTakingCellIds((current) => current.filter((id) => id !== carry.cellId))
    }, RETURN_ANIMATION_MS + 80)
  }

  function startClassicTokenReturnAnimation(carry: ClassicTokenCarry) {
    const target = carry.mode === 'bank'
      ? new DOMRect(carry.originX, carry.originY, carry.width, carry.height)
      : classicBankTokenElement(carry.tokenType)?.getBoundingClientRect()
    if (!target) return
    const flight: FlyingToken = {
      id: `classic-token-return-${carry.tokenType}-${performance.now()}`,
      type: carry.tokenType,
      classic: true,
      variant: carry.variant,
      fromX: carry.x,
      fromY: carry.y,
      toX: target.left + (target.width - carry.width) / 2,
      toY: target.top + (target.height - carry.height) / 2,
      size: carry.width,
      duration: RETURN_ANIMATION_MS,
    }
    setFlyingTokens((current) => [...current, flight])
    window.setTimeout(() => {
      setFlyingTokens((current) => current.filter((item) => item.id !== flight.id))
    }, RETURN_ANIMATION_MS + 80)
  }

  function scheduleClassicDraftFlight(
    playerId: PlayerId,
    tokenType: GemType,
    draftIndex: number,
    direction: 'take' | 'return',
    carry?: ClassicTokenCarry,
    sourceOverride?: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  ) {
    const sourceRect = carry
      ? new DOMRect(carry.x, carry.y, carry.width, carry.height)
      : sourceOverride ?? (
          direction === 'return'
            ? classicDraftTokenElement(playerId, draftIndex)?.getBoundingClientRect()
            : classicBankTokenElement(tokenType)?.getBoundingClientRect()
        )
    const draftPlayer = stateRef.current?.players[playerId]
    const visibleTokenCount = draftPlayer?.tokenSlots.slice(0, 10).length ?? 0
    const draftOverflowStart = Math.max(0, 10 - visibleTokenCount)
    const overflowTokenCount = Math.max(0, (draftPlayer?.tokenSlots.length ?? 0) - 10)
    const motionSlotIndex = visibleTokenCount + draftIndex < 10
      ? visibleTokenCount + draftIndex
      : 10 + overflowTokenCount + draftIndex - draftOverflowStart
    const motionSlotKey = tokenSlotKey(playerId, motionSlotIndex)
    setClassicDraftMotionSlotKeys((current) => (current.includes(motionSlotKey) ? current : [...current, motionSlotKey]))
    window.requestAnimationFrame(() => {
      const fallbackSize = 26
      const bankRect = classicBankTokenElement(tokenType)?.getBoundingClientRect()
      const slotRect = classicDraftTokenElement(playerId, draftIndex)?.getBoundingClientRect()
      const slotFallbackRect = classicTokenSlotElement(playerId, motionSlotIndex)?.getBoundingClientRect()
      const from = direction === 'take' ? (sourceRect ?? bankRect) : (sourceRect ?? slotRect)
      const to = direction === 'take' ? (slotRect ?? slotFallbackRect) : bankRect
      if (!from || !to) {
        setClassicDraftMotionSlotKeys((current) => current.filter((key) => key !== motionSlotKey))
        return
      }
      const size = Math.min(from.width || fallbackSize, from.height || fallbackSize, fallbackSize)
      const flight: FlyingToken = {
        id: `classic-draft-${direction}-${playerId}-${draftIndex}-${performance.now()}`,
        type: tokenType,
        classic: true,
        variant: shellVariant(stateRef.current),
        fromX: from.left + (from.width - size) / 2,
        fromY: from.top + (from.height - size) / 2,
        toX: to.left + (to.width - size) / 2,
        toY: to.top + (to.height - size) / 2,
        size,
        duration: TAKE_TOKEN_ANIMATION_MS,
      }
      setFlyingTokens((current) => [...current, flight])
      window.setTimeout(() => {
        setFlyingTokens((current) => current.filter((item) => item.id !== flight.id))
        setClassicDraftMotionSlotKeys((current) => current.filter((key) => key !== motionSlotKey))
      }, TAKE_TOKEN_ANIMATION_MS + 80)
    })
  }

  function discardClassicTokenWithAnimation(token: Token) {
    if (!state || !playerId || isInteractionLocked()) return
    const slot = classicTokenSlotElementByToken(state, playerId, token)
    const bank = classicBankTokenElement(token.type)
    const slotRect = slot?.getBoundingClientRect()
    const bankRect = bank?.getBoundingClientRect()
    if (slot && slotRect && bankRect) {
      const size = Math.min(slotRect.width, slotRect.height)
      const slotKey = slot.dataset.tokenSlotKey
      const flight: FlyingToken = {
        id: `classic-discard-${token.id}-${performance.now()}`,
        type: token.type,
        classic: true,
        variant: shellVariant(state),
        fromX: slotRect.left + (slotRect.width - size) / 2,
        fromY: slotRect.top + (slotRect.height - size) / 2,
        toX: bankRect.left + (bankRect.width - size) / 2,
        toY: bankRect.top + (bankRect.height - size) / 2,
        size,
        duration: RETURN_ANIMATION_MS,
      }
      if (slotKey) setSpendingTokenSlotKeys((current) => (current.includes(slotKey) ? current : [...current, slotKey]))
      setFlyingTokens((current) => [...current, flight])
      window.setTimeout(() => {
        setFlyingTokens((current) => current.filter((item) => item.id !== flight.id))
        if (slotKey) setSpendingTokenSlotKeys((current) => current.filter((item) => item !== slotKey))
      }, RETURN_ANIMATION_MS + 80)
      void submit({ type: 'discardToken', playerId, tokenType: token.type, tokenId: token.id }, { deferStateMs: RETURN_ANIMATION_MS })
      return
    }
    discardTokenFromSlot(token)
  }

  function startCardReturnAnimation(carry: CardCarry) {
    const hiddenSource = sourceKey(carry.source)
    const flight: FlyingCard = {
      id: `return-card-${hiddenSource}-${performance.now()}`,
      cardId: carry.cardId,
      classic: carry.classic,
      variant: carry.variant,
      fromX: carry.x,
      fromY: carry.y,
      toX: carry.originX,
      toY: carry.originY,
      width: carry.width,
      height: carry.height,
      targetWidth: carry.originWidth,
      targetHeight: carry.originHeight,
      duration: RETURN_ANIMATION_MS,
      horizontal: carry.horizontal,
      returning: true,
    }
    setReturningCardSources((current) => (current.includes(hiddenSource) ? current : [...current, hiddenSource]))
    setFlyingCards((current) => [...current, flight])
    window.setTimeout(() => {
      setFlyingCards((current) => current.filter((item) => item.id !== flight.id))
      setReturningCardSources((current) => current.filter((key) => key !== hiddenSource))
    }, RETURN_ANIMATION_MS + 80)
  }

  function startPrivilegeReturnAnimation(carry: PrivilegeCarry) {
    const flight: FlyingPrivilege = {
      id: `return-privilege-${carry.index}-${performance.now()}`,
      fromX: carry.x,
      fromY: carry.y,
      toX: carry.originX,
      toY: carry.originY,
      width: carry.width,
      height: carry.height,
      targetWidth: carry.width,
      targetHeight: carry.height,
      targetTilt: privilegeTilt(playerId ?? 'p1', carry.index),
      duration: RETURN_ANIMATION_MS,
    }
    const sourceKey = playerId ? privilegeSlotKey(playerId, carry.index) : undefined
    if (sourceKey) setMovingPrivilegeSlotKeys((current) => (current.includes(sourceKey) ? current : [...current, sourceKey]))
    setFlyingPrivileges((current) => [...current, flight])
    window.setTimeout(() => {
      setFlyingPrivileges((current) => current.filter((item) => item.id !== flight.id))
      if (sourceKey) setMovingPrivilegeSlotKeys((current) => current.filter((key) => key !== sourceKey))
    }, RETURN_ANIMATION_MS + 80)
  }

  function reserveIndexFromRemoteHover(panelPlayerId: PlayerId): number | undefined {
    if (!playerId || panelPlayerId === playerId || !remoteHoverCardSourceKey?.startsWith('reserve:')) return undefined
    const index = Number(remoteHoverCardSourceKey.split(':')[1])
    return Number.isFinite(index) ? index : undefined
  }

  function hiddenReserveIndicesForCardMotion(panelPlayerId: PlayerId): number[] {
    return [...returningCardSources, ...purchasingCardSources].flatMap((key) => {
      const parts = key.split(':')
      const scoped = parts.length === 3
      if (scoped && parts[0] !== panelPlayerId) return []
      if (scoped && parts[1] !== 'reserve') return []
      if (!scoped && (panelPlayerId !== playerId || parts[0] !== 'reserve')) return []
      const index = Number(scoped ? parts[2] : parts[1])
      return Number.isFinite(index) ? [index] : []
    })
  }

  function revealingReserveIndicesFor(panelPlayerId: PlayerId): number[] {
    if (panelPlayerId !== playerId) return []
    return revealingReserveKeys.flatMap((key) => {
      const [keyPlayerId, indexText] = key.split(':')
      const index = Number(indexText)
      return keyPlayerId === panelPlayerId && Number.isFinite(index) ? [index] : []
    })
  }

  function hiddenPrivilegeIndexesFor(panelPlayerId: PlayerId): number[] {
    const hidden = movingPrivilegeSlotKeys.flatMap((key) => {
      const [keyPlayerId, keyIndex] = key.split(':')
      const index = Number(keyIndex)
      return keyPlayerId === panelPlayerId && Number.isFinite(index) ? [index] : []
    })
    if (playerId === panelPlayerId && privilegeCarry) hidden.push(privilegeCarry.index)
    if (remotePrivilegeAnchor?.playerId === panelPlayerId) hidden.push(remotePrivilegeAnchor.index)
    return [...new Set(hidden)]
  }

  function takeSelectedTokens(selection: TokenDragSelection) {
    if (!state || !playerId || isInteractionLocked()) return
    if (isMobileBoardLayoutRef.current && !boardFocusOpenRef.current) {
      openBoardFocus()
      return
    }
    const flights = createTakeTokenFlights(state, playerId, selection)
    setTokenSelection(undefined)
    clearIntent()
    if (flights.length > 0) {
      setTakingCellIds(selection.cellIds)
      setFlyingTokens((current) => [...current, ...flights])
      window.setTimeout(() => {
        setFlyingTokens((current) => current.filter((flight) => !flights.some((item) => item.id === flight.id)))
        setTakingCellIds([])
      }, TAKE_TOKEN_ANIMATION_MS + 80)
    }
    void submit({ type: 'takeTokens', playerId, cellIds: selection.cellIds }, flights.length > 0 ? { deferStateMs: TAKE_TOKEN_ANIMATION_MS } : undefined)
  }

  function discardTokenFromSlot(token: Token) {
    if (!playerId || isInteractionLocked()) return
    void submit({ type: 'discardToken', playerId, tokenType: token.type, tokenId: token.id })
  }

  function stealTokenFromSlot(token: Token) {
    if (!playerId || token.type === 'gold' || isInteractionLocked()) return
    void submit({ type: 'stealToken', playerId, tokenType: token.type, tokenId: token.id })
  }

  if (!busy && error && (!state || !playerId)) {
    return (
      <main className="roomErrorScreen">
        <section className="roomErrorPanel">
          <strong>房间不可用</strong>
          <p>{error}</p>
          <div>
            <button className="primaryButton" onClick={createReplacementRoom}>
              创建新房间
            </button>
            <button className="ghostButton" onClick={() => (location.href = appPath('/'))}>
              返回首页
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (busy || !state || !playerId) {
    return (
      <main className="loadingScreen">
        <Loader2 className="spin" />
        正在加入房间...
      </main>
    )
  }

  const aiDifficulty = AI_DIFFICULTY_OPTIONS[aiDifficultyIndex] ?? AI_DIFFICULTY_OPTIONS[DEFAULT_AI_DIFFICULTY_INDEX]
  const secondAiDifficulty = AI_DIFFICULTY_OPTIONS[secondAiDifficultyIndex] ?? AI_DIFFICULTY_OPTIONS[DEFAULT_AI_DIFFICULTY_INDEX]
  const classicAiDialog = isSplendorRoomState(state)
  const aiDialog = aiDialogOpen && !classicAiDialog && state.status === 'waiting' && playerId === 'p1' ? (
    <div className="modalScrim" role="presentation" onMouseDown={() => !aiBusy && setAiDialogOpen(false)}>
      <form
        className="aiSetupDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-setup-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          void addAiOpponent()
        }}
      >
        <header>
          <strong id="ai-setup-title">AI 对局设置</strong>
          <button type="button" className="dialogIconButton" onClick={() => !aiBusy && setAiDialogOpen(false)} disabled={aiBusy} aria-label="取消 AI 设置">
            <X size={17} />
          </button>
        </header>
        <label className="aiDifficultyControl dialogDifficultyControl" title={`对手 AI 难度：${aiDifficulty.label}`}>
          <span>对手 {aiDifficulty.label}</span>
          <input
            type="range"
            min={0}
            max={AI_DIFFICULTY_OPTIONS.length - 1}
            step={1}
            value={aiDifficultyIndex}
            onChange={(event) => setAiDifficultyIndex(Number(event.currentTarget.value))}
            aria-label="对手 AI 难度"
          />
        </label>
        {!classicAiDialog && (
          <label className="dialogCheckbox">
            <input type="checkbox" checked={secondAiEnabled} onChange={(event) => setSecondAiEnabled(event.currentTarget.checked)} />
            <span>房主位也交给 AI</span>
          </label>
        )}
        {!classicAiDialog && secondAiEnabled && (
          <label className="aiDifficultyControl dialogDifficultyControl" title={`房主位 AI 难度：${secondAiDifficulty.label}`}>
            <span>房主 {secondAiDifficulty.label}</span>
            <input
              type="range"
              min={0}
              max={AI_DIFFICULTY_OPTIONS.length - 1}
              step={1}
              value={secondAiDifficultyIndex}
              onChange={(event) => setSecondAiDifficultyIndex(Number(event.currentTarget.value))}
              aria-label="房主位 AI 难度"
            />
          </label>
        )}
        <footer>
          <button type="button" className="ghostButton" onClick={() => setAiDialogOpen(false)} disabled={aiBusy}>
            取消
          </button>
          <button type="submit" className="primaryButton" disabled={aiBusy}>
            {aiBusy ? '加入中...' : !classicAiDialog && secondAiEnabled ? '开始双 AI' : '确定'}
          </button>
        </footer>
      </form>
    </div>
  ) : null
  const roomChatPanel = (
    <RoomChatPanel
      state={state}
      playerId={playerId}
      feed={state.feed ?? []}
      open={chatOpen}
      value={chatInput}
      busy={chatBusy}
      soundEnabled={turnSoundEnabled}
      notificationEnabled={turnNotificationEnabled}
      notificationPermission={notificationPermission}
      notificationSupported={typeof window !== 'undefined' && 'Notification' in window}
      onToggleOpen={() => setChatOpen((current) => !current)}
      onValueChange={setChatInput}
      onSend={() => void sendChatMessage()}
      onToggleSound={() => setTurnSoundEnabled((current) => !current)}
      onRequestNotification={() => void requestTurnNotificationPermission()}
      onDisableNotification={() => setTurnNotificationEnabled(false)}
    />
  )

  if (isSplendorRoomState(state)) {
    const goldCellId = classicGoldCellId(state)
    const carriedClassicMarketSourceKey = cardCarry?.classic && cardCarry.source.type !== 'reserve' ? sourceKey(cardCarry.source) : undefined
    const classicHiddenReserveIndices = Object.fromEntries(state.playerOrder.map((id) => {
      const indices = hiddenReserveIndicesForCardMotion(id)
      if (cardCarry?.classic && id === playerId && cardCarry.source.type === 'reserve') indices.push(cardCarry.source.index)
      return [id, [...new Set(indices)]]
    })) as Partial<Record<PlayerId, number[]>>
    const remotePurchasePreviewSlotKeys =
      remotePurchaseTarget?.valid
        ? (() => {
            const cardId = findPlayerSourceCard(state, remotePurchaseTarget.playerId, remotePurchaseTarget.source)
            const payment = cardId ? computePayment(state, remotePurchaseTarget.playerId, cardId) : undefined
            return payment ? paymentSlotsForPayment(state, remotePurchaseTarget.playerId, payment).map((slot) => tokenSlotKey(remotePurchaseTarget.playerId, slot.index)) : []
          })()
        : []
    const classicDraftViews: Partial<Record<PlayerId, ClassicTokenDraftView>> = {}
    for (const id of ALL_PLAYER_IDS) {
      const remoteDraft = remoteClassicTokenDrafts[id]
      if (remoteDraft) {
        classicDraftViews[id] = {
          tokenTypes: remoteDraft.tokenTypes,
          confirmable: isClassicDraftConfirmable(remoteDraft),
          controllable: false,
          hoverTokenType: remoteDraft.hoverTokenType,
          hoverSlotIndex: remoteDraft.hoverSlotIndex,
        }
      }
    }
    if (classicTokenDraft && isPlayerId(playerId)) {
      classicDraftViews[playerId] = {
        tokenTypes: classicTokenDraft.tokenTypes,
        confirmable: isClassicDraftConfirmable(classicTokenDraft),
        controllable: true,
        hoverTokenType: classicTokenDraft.hoverTokenType,
        hoverSlotIndex: classicTokenDraft.hoverSlotIndex,
      }
    }
    const bankDraftTokenTypes = [
      ...(classicTokenDraft?.tokenTypes ?? []),
      ...ALL_PLAYER_IDS.flatMap((id) => remoteClassicTokenDrafts[id]?.tokenTypes ?? []),
      ...classicBankMotionTokenTypes,
    ]
    const aiSeatControls =
      state.status === 'waiting' && playerId === 'p1'
        ? Object.fromEntries(
            state.playerOrder.flatMap((id) => {
              if (!state.players[id].isAi) return []
              return [
                [
                  id,
                  {
                    difficulty: state.players[id].aiDifficulty ?? 'standard',
                    options: AI_DIFFICULTY_OPTIONS,
                    busy: aiBusy,
                    onDifficultyChange: (difficulty: string) => void updateAiPlayerDifficulty(id, difficulty as DifficultyId),
                    onRemove: () => void removeAiPlayer(id),
                  },
                ],
              ]
            }),
          )
        : undefined
    return (
      <>
        <RemoteCursorLayer
          state={state}
          remoteCursors={remoteCursors}
          clickEffects={remoteCursorClicks}
          shellRect={cursorMapRect}
        />
        <SplendorRoom
          state={state}
          roomId={roomId}
          playerId={playerId}
          error={toastError}
          busy={nameBusy}
          copiedLink={copiedLink}
          playerNameInput={playerNameInput}
          onPlayerNameInput={setPlayerNameInput}
          onConfirmSeat={confirmSeat}
          onMoveSeat={(targetPlayerId) => void moveMultiplayerSeat(targetPlayerId)}
          onCopyRoomLink={copyRoomLink}
          onReturnHome={() => (location.href = appPath('/'))}
          onRestart={restartCurrentRoom}
          onOpenAiDialog={openAiDialogOrSetHostAi}
          aiSeatControls={aiSeatControls}
          onAction={(action) => void submit(action)}
          aiBusy={aiBusy}
          interactionLocked={interactionLocked}
          remoteHoverCardSourceKey={remoteHoverCardSourceKey}
          goldTargetCardSourceKey={goldTargetCardSourceKey}
          reservingCardSourceKeys={reservingCardSources}
          motionCardSourceKeys={[...reservingCardSources, ...purchasingCardSources, ...returningCardSources, ...marketReplacingCardSources, ...(carriedClassicMarketSourceKey ? [carriedClassicMarketSourceKey] : [])]}
          takingCellIds={takingCellIds}
          goldCellId={goldCellId}
          classicDrafts={classicDraftViews}
          purchaseTarget={purchaseTarget}
          remotePurchaseTarget={remotePurchaseTarget}
          remoteHoverBankTokenType={remoteHoverBankTokenType}
          revealingReserveIndices={Object.fromEntries(state.playerOrder.map((id) => [id, revealingReserveIndicesFor(id)])) as Partial<Record<PlayerId, number[]>>}
          hiddenReserveIndices={classicHiddenReserveIndices}
          bankDraftTokenTypes={bankDraftTokenTypes}
          disabledBankTokenTypes={disabledClassicBankTokenTypes(state, playerId, classicTokenDraft)}
          hiddenBankTokenType={classicTokenCarry?.mode === 'bank' ? classicTokenCarry.tokenType : remoteClassicTokenAnchor?.tokenType ?? (tokenCarry?.classic || remoteGoldAnchor?.classic ? 'gold' : undefined)}
          introBankCounts={state.status === 'waiting' || pendingIntroSeq !== undefined || introAnimation ? (classicIntroBankCounts ?? emptyRouteBankCounts()) : undefined}
          hiddenTokenSlotKeys={[...spendingTokenSlotKeys, ...classicDraftMotionSlotKeys]}
          highlightedTokenSlotKeys={[...purchasePreviewSlotKeys, ...remotePurchasePreviewSlotKeys]}
          hiddenPurchasedCardKeys={movingPurchasedCardKeys}
          onGoldPointerDown={(event, cellId) => beginGoldCarry(event, { id: cellId, token: { id: cellId, type: 'gold' } })}
          onBankTokenPointerDown={beginClassicBankTokenCarry}
          onBankTokenPointerEnter={classicHoverBankTokenIntent}
          onBankTokenPointerLeave={() => classicHoverBankTokenIntent(undefined)}
          onDraftTokenPointerDown={beginClassicDraftTokenReturn}
          onDiscardToken={discardClassicTokenWithAnimation}
          onConfirmTokenDraft={confirmClassicTokenDraft}
          onCancelTokenDraft={cancelClassicTokenDraft}
          onEndTurn={() => void submit({ type: 'endTurn', playerId })}
          onCardPointerEnter={hoverCardIntent}
          onCardPointerLeave={() => hoverCardIntent(undefined)}
          onCardPointerDown={beginCardCarry}
          onCardPointerMove={updateCardCarry}
          onCardPointerUp={finishCardCarry}
          onCardPointerCancel={() => {
            clearIntent()
            setPurchasePreviewSlotKeys([])
            setPurchaseTarget(undefined)
            cancelCardCarryWithReturn()
        }}
          introAnimating={pendingIntroSeq !== undefined || Boolean(introAnimation)}
        />
        {roomChatPanel}
        <TurnNameGlow playerId={state.currentPlayer} active={state.status === 'playing' && !state.winner} ownTurn={isViewerTurn} />
        {tokenCarry?.kind === 'gold' && <FloatingGoldToken carry={tokenCarry} />}
        {classicTokenCarry && <FloatingClassicToken carry={classicTokenCarry} />}
        {cardCarry && <FloatingCardCarry carry={cardCarry} />}
        {remoteClassicTokenAnchor && <RemoteClassicToken anchor={remoteClassicTokenAnchor} />}
        {flyingTokens.map((flight) => (
          <FlyingTakenToken flight={flight} key={flight.id} />
        ))}
        {flyingCards.map((flight) => (
          <FlyingReservedCard flight={flight} key={flight.id} />
        ))}
        {marketReplacementCards.map((flight) => (
          <MarketReplacementCardFlightView flight={flight} key={flight.id} />
        ))}
        {introAnimation && <InitialAnimationLayer animation={introAnimation} />}
        {remoteGoldAnchor && <RemoteGoldToken anchor={remoteGoldAnchor} />}
        {aiDialog}
      </>
    )
  }

  const allPlayersSeated = state.players.p1.seated && state.players.p2.seated
  const allPlayersOnline = state.players.p1.connected && state.players.p2.connected
  const turnLabels = turnHudLabels(state)
  const turnLabel =
    state.status === 'waiting'
      ? allPlayersSeated
        ? playerId === 'p1'
          ? '等待开始'
          : '等待房主'
        : '等待入座'
        : state.status === 'finished'
          ? '已结束'
          : isViewerTurn
            ? '你的回合'
          : `${displayPlayerName(state.players[state.currentPlayer])} 行动中`
  const canReplenishBoard = !state.turnActions?.replenished && state.board.some((cell: BoardCell) => !cell.token) && state.bag.length > 0
  const selectionPrivilegeAwardHighlight = playerId ? privilegeAwardHighlightForSelection(state, playerId, tokenDrag ?? tokenSelection) : undefined
  const replenishPrivilegeAwardHighlight = playerId && replenishPreviewActive && canReplenishBoard ? privilegeAwardHighlightForReplenish(state, playerId) : undefined
  const remoteReplenishPrivilegeAwardHighlight = playerId && remoteHoverReplenish ? privilegeAwardHighlightForReplenish(state, otherPlayer(playerId)) : undefined
  const privilegeAwardHighlight = selectionPrivilegeAwardHighlight ?? replenishPrivilegeAwardHighlight ?? remoteReplenishPrivilegeAwardHighlight
  const discardPending = currentPending?.type === 'discard' ? currentPending : undefined
  const stealPending = currentPending?.type === 'stealToken' ? currentPending : undefined
  const takeBoardTokenPending = currentPending?.type === 'takeBoardToken' ? currentPending : undefined
  const royalChoicePending = currentPending?.type === 'chooseRoyal' ? currentPending : undefined
  const discardHighlightKeys = discardPending ? discardTokenSlotKeys(state, playerId) : []
  const introLayout = state.status === 'waiting' || pendingIntroSeq !== undefined || Boolean(introAnimation)
  const introAnimating = Boolean(introAnimation)
  const canStartGame = state.status === 'waiting' && playerId === 'p1' && allPlayersSeated && allPlayersOnline && !nameRequired
  const startGameTitle = !allPlayersSeated ? '等待所有玩家输入名字并入座' : !allPlayersOnline ? '等待所有玩家在线' : '开始游戏'
  const renderedTutorialStep = playerId
    ? tutorialStepForInteraction({ baseStep: tutorialStep, tokenSelection, tokenCarry, cardCarry, privilegeCarry, activePrivilegeIndex, playerId, isMobileBoardLayout, boardFocusOpen })
    : tutorialStep
  return (
      <main
        className={`gameShell ${isMyTurn ? 'myTurn' : 'notMyTurn'} ${isViewerTurn ? 'viewerTurn' : ''} ${introLayout ? 'introLayout' : ''} ${introAnimating ? 'introAnimating' : ''} ${boardFocusOpen ? 'boardFocusOpen' : ''}`}
        style={{ '--table-surface-image': `url(${assetPath('duel-splendor/tabletops/birch-boardgame-table.png')})` } as CSSProperties}
      >
      {state.winner && (
        <div className="winBanner">
          <strong>{displayPlayerName(state.players[state.winner.playerId])} 获胜</strong>
          <span>{winnerReasonLabel(state.winner.reason)}</span>
        </div>
      )}
      {toastError && <div className="toast">{toastError}</div>}
      <TurnNameGlow playerId={state.currentPlayer} active={state.status === 'playing' && !state.winner} ownTurn={isViewerTurn} />
      <RemoteCursorLayer
        state={state}
        remoteCursors={remoteCursors}
        clickEffects={remoteCursorClicks}
        shellRect={cursorMapRect}
      />
      <aside className="gameHud" aria-label="房间信息">
        <span>房间 {roomId}</span>
        <span>{displayPlayerName(state.players[playerId])}</span>
        {turnLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
        <strong>{turnLabel}</strong>
      </aside>
      <nav className="roomOps" aria-label="房间操作">
        <button
          className={`hudIconButton ${tutorialEnabled ? 'activeHudIconButton' : ''}`}
          onClick={toggleTutorialMode}
          title={tutorialEnabled ? '关闭指导模式' : '开启指导模式'}
          aria-label={tutorialEnabled ? '关闭指导模式' : '开启指导模式'}
          aria-pressed={tutorialEnabled}
          data-tutorial-toggle
        >
          <BookOpen size={17} />
        </button>
        {state.status === 'waiting' && playerId === 'p1' && (
          <button className="hudIconButton" onClick={() => setAiDialogOpen(true)} disabled={aiBusy || nameRequired} title="配置 AI 对手" aria-label="配置 AI 对手">
            {aiBusy ? <Loader2 className="spin" size={17} /> : <Bot size={17} />}
          </button>
        )}
        {state.status === 'waiting' && playerId === 'p1' && (
          <button
            className="hudIconButton startHudIconButton"
            onClick={() => void submit({ type: 'startGame', playerId })}
            disabled={!canStartGame}
            title={startGameTitle}
            aria-label={startGameTitle}
          >
            <Play size={17} />
          </button>
        )}
        {state.status === 'finished' && playerId === 'p1' && (
          <button className="hudIconButton" onClick={restartCurrentRoom} disabled={restartBusy} title="同房间开启新一局" aria-label="同房间开启新一局">
            {restartBusy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          </button>
        )}
        <button className="hudIconButton" onClick={copyRoomLink} title={copiedLink ? '已复制' : '复制邀请链接'} aria-label={copiedLink ? '已复制邀请链接' : '复制邀请链接'}>
          {copiedLink ? <Check size={17} /> : <Copy size={17} />}
        </button>
        <button className="hudIconButton" onClick={() => (location.href = appPath('/'))} title="返回首页" aria-label="返回首页">
          <Home size={17} />
        </button>
      </nav>
      {roomChatPanel}
      {nameRequired && (
        <div className="modalScrim playerNameScrim" role="presentation">
          <form
            className="aiSetupDialog playerNameDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-name-title"
            onSubmit={(event) => {
              event.preventDefault()
              void confirmSeat()
            }}
          >
            <header>
              <strong id="player-name-title">输入你的名字</strong>
              <UserRound size={18} />
            </header>
            <label className="playerNameField">
              <span>玩家名字</span>
              <input
                autoFocus
                maxLength={16}
                value={playerNameInput}
                onChange={(event) => setPlayerNameInput(event.currentTarget.value)}
                placeholder="最多 16 个字符"
                aria-label="玩家名字"
              />
            </label>
            <footer>
              <button type="submit" className="primaryButton" disabled={nameBusy}>
                {nameBusy ? '入座中...' : '确认入座'}
              </button>
            </footer>
          </form>
        </div>
      )}
      {aiDialog}

      <section className="gameLayout">
        <section className="tableArea">
          <section className="boardPanel">
            {boardFocusOpen && (
              <button className="mobileBoardCloseButton" type="button" onClick={() => closeBoardFocus({ clearSelection: true })} aria-label="关闭放大棋盘" title="关闭放大棋盘">
                <X size={18} />
              </button>
            )}
            <div className="boardStage">
              <div className="boardPlayArea">
                <GemBagPanel
                  state={state}
                  displayTotal={introLayout ? 25 : undefined}
                  movingPrivilegeSupplyIndexes={movingPrivilegeSupplyIndexes}
                  highlightedPrivilegeSupplyIndex={privilegeAwardHighlight?.type === 'supply' ? privilegeAwardHighlight.index : undefined}
                  canReplenish={canReplenishBoard}
                  canAct={isMyTurn && !Boolean(currentPending)}
                  remoteHovered={remoteHoverReplenish}
                  tutorialTarget
                  canOpenBoardFocus={!introLayout && !introAnimating}
                  onOpenBoardFocus={openBoardFocus}
                  onReplenish={() => {
                    if (isInteractionLocked()) return
                    clearIntent()
                    void submit({ type: 'replenishBoard', playerId })
                  }}
                  onReplenishPointerEnter={() => hoverReplenishIntent(true)}
                  onReplenishPointerLeave={() => hoverReplenishIntent(false)}
                />
                <div className="boardWithPrivilegeHints">
                  <BoardPrivilegeHints activeKind={privilegeAwardHighlight?.rule} />
                  <div className={`tokenBoard ${takeBoardTokenPending ? 'abilityTokenChoiceMode' : ''}`} ref={tokenBoardRef}>
              <div className="boardSpaces" aria-hidden="true">
                {Array.from({ length: 25 }).map((_, index) => (
                  <span className={index === 12 ? 'boardSpace centerSpace' : 'boardSpace'} key={index} />
                ))}
              </div>
              <BoardArrowLayer />
              {(tokenDrag ?? tokenSelection) && <TokenTakeSelectionLayer state={state} selection={(tokenDrag ?? tokenSelection)!} />}
              {remoteTokenSelection && <TokenTakeSelectionLayer state={state} selection={remoteTokenSelection} remote />}
              {state.board.map((cell: BoardCell) => (
                <button
                  key={cell.id}
                  style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 } as CSSProperties}
                  data-cell-id={cell.id}
                  onPointerDown={(event) => beginTokenDrag(event, cell)}
                  onPointerEnter={() => {
                    if (activePrivilegeIndex !== undefined && cell.token?.type !== 'gold') {
                      setPrivilegeTargetCellId(cell.id)
                      privilegeTargetIntent(cell.id, activePrivilegeIndex)
                    } else hoverTokenIntent(cell)
                  }}
                  onPointerLeave={() => {
                    if (activePrivilegeIndex !== undefined) {
                      setPrivilegeTargetCellId(undefined)
                      privilegeTargetIntent(undefined, activePrivilegeIndex)
                    } else hoverTokenIntent(undefined)
                  }}
                  onPointerMove={updateBoardPointer}
                  onPointerUp={finishBoardPointer}
                  onPointerCancel={() => {
                    clearIntent()
                    setTokenDrag(undefined)
                    setTokenSelection(undefined)
                    cancelTokenCarryWithReturn()
                    cancelPrivilegeCarryWithReturn()
                  }}
		                  className={`boardCell ${cell.token ? 'filled' : ''} ${cell.token?.type === 'gold' ? 'goldDraggable' : ''} ${(tokenDrag ?? tokenSelection)?.cellIds.includes(cell.id) ? 'takeSelected' : ''} ${takeBoardTokenPending && cell.token?.type === takeBoardTokenPending.tokenType ? 'abilityTokenTarget' : ''} ${privilegeCarry && cell.token && cell.token.type !== 'gold' ? 'privilegeEligible' : ''} ${privilegeTargetCellId === cell.id ? 'privilegeTarget' : ''} ${remotePrivilegeTargetCellId === cell.id ? 'remotePrivilegeTarget' : ''} ${remoteHoverCellId === cell.id ? 'remoteHover' : ''} ${isCarriedTokenCell(tokenCarry, cell.id) || remoteGoldAnchor?.cellId === cell.id || takingCellIds.includes(cell.id) ? 'carryHidden' : ''}`}
                >
                  {cell.token && (
	                    <span className="token" title={TOKEN_LABELS[cell.token.type as TokenType]}>
                      <TokenImage token={cell.token.type} />
                    </span>
                  )}
                </button>
              ))}
              {tokenSelection?.valid && (
                <SelectedTokenActions
	                  selection={tokenSelection}
	                  state={state}
	                  disabled={!isMyTurn || Boolean(currentPending) || (isMobileBoardLayout && !boardFocusOpen)}
	                  onTake={() => takeSelectedTokens(tokenSelection)}
	                  onCancel={() => {
                      setTokenSelection(undefined)
                      clearIntent()
                    }}
	                />
              )}
                </div>
                </div>
              </div>
            </div>
          </section>

          <section className="market">
            <div className="marketPool">
              {[3, 2, 1].map((tier) => (
                <div className={`marketRow marketTier${tier}`} key={tier}>
                  {(() => {
                    const typedTier = tier as 1 | 2 | 3
                    const deckSource: CardSource = { type: 'deck', tier: typedTier }
                    const deckSourceKey = sourceKey(deckSource)
                    const canReserveDeck = Boolean(
                      playerId &&
                        isMyTurn &&
                        !currentPending &&
                        state.players[playerId].reserve.length < 3 &&
                        state.decks[typedTier].length > 0 &&
                        state.board.some((cell: BoardCell) => cell.token?.type === 'gold'),
                    )
                    return (
                      <DeckStack
                        tier={typedTier}
                        count={state.decks[typedTier].length}
                        reservable={canReserveDeck}
                        isCarried={reservingCardSources.includes(deckSourceKey)}
                        goldTargeted={goldTargetCardSourceKey === deckSourceKey}
                      />
                    )
                  })()}
                  <div className="marketCards">
                    {state.market[tier as 1 | 2 | 3].map((cardId: number | null, index: number) =>
                      cardId ? (
                        <MarketCard
                          cardId={cardId}
                          key={`${tier}-${index}-${cardId}`}
                          source={{ type: 'market', tier: tier as 1 | 2 | 3, index }}
                          isMyTurn={isMyTurn && !currentPending}
	                          goldCellId={state.board.find((cell: BoardCell) => cell.token?.type === 'gold')?.id}
                          isCarried={Boolean(
                            (cardCarry && isSameCardSource(cardCarry.source, { type: 'market', tier: tier as 1 | 2 | 3, index })) ||
                              reservingCardSources.includes(sourceKey({ type: 'market', tier: tier as 1 | 2 | 3, index })) ||
                              purchasingCardSources.includes(sourceKey({ type: 'market', tier: tier as 1 | 2 | 3, index })) ||
                              returningCardSources.includes(sourceKey({ type: 'market', tier: tier as 1 | 2 | 3, index })) ||
                              marketReplacingCardSources.includes(sourceKey({ type: 'market', tier: tier as 1 | 2 | 3, index })) ||
                              marketReplacementCards.some((flight) => flight.sourceKey === sourceKey({ type: 'market', tier: tier as 1 | 2 | 3, index })),
                          )}
                          remoteHovered={remoteHoverCardSourceKey === sourceKey({ type: 'market', tier: tier as 1 | 2 | 3, index })}
                          goldTargeted={goldTargetCardSourceKey === sourceKey({ type: 'market', tier: tier as 1 | 2 | 3, index })}
                          onPointerDown={(event) => beginCardCarry(event, cardId, { type: 'market', tier: tier as 1 | 2 | 3, index })}
                          onPointerEnter={() => hoverCardIntent({ type: 'market', tier: tier as 1 | 2 | 3, index })}
                          onPointerLeave={() => hoverCardIntent(undefined)}
                          onPointerMove={updateCardCarry}
                          onPointerUp={finishCardCarry}
                          onPointerCancel={() => {
                            clearIntent()
                            setPurchasePreviewSlotKeys([])
                            setPurchaseTarget(undefined)
                            cancelCardCarryWithReturn()
                          }}
                        />
                      ) : (
                        <div className="emptyMarket" key={`${tier}-${index}`}>空</div>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className={`royals ${introLayout ? 'royalStack' : ''}`}>
              {state.royalCards.map((cardId: number) => {
                const owner = royalCardOwner(state, cardId)
                const selectable = Boolean(royalChoicePending?.options.includes(cardId) && !owner && !interactionLocked)
                return (
                  <button
                    className={`royalCardSlot ${selectable ? 'selectableRoyalCard' : ''} ${owner ? `claimedRoyalCard claimedBy-${owner}` : ''}`}
                    data-tutorial-royal-card={cardId}
                    disabled={!selectable}
                    key={cardId}
                    onClick={() => {
                      if (selectable) void submit({ type: 'chooseRoyal', playerId, cardId })
                    }}
                    type="button"
                  >
                    <CardView cardId={cardId} />
                    {owner && <span className="royalClaimBadge">{displayPlayerName(state.players[owner])}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        </section>
        <section className="playersArea">
          <PlayerPanel
            state={state}
            playerId="p1"
            viewerId={playerId}
            highlightedTokenSlotKeys={discardPending ? discardHighlightKeys : purchasePreviewSlotKeys}
            spendingTokenSlotKeys={spendingTokenSlotKeys}
            carriedTokenSlotIndex={tokenSlotCarry?.playerId === 'p1' ? tokenSlotCarry.sourceIndex : undefined}
            tokenSlotDropIndex={tokenSlotCarry?.playerId === 'p1' ? tokenSlotCarry.targetIndex : undefined}
            carriedReserveIndex={playerId === 'p1' && cardCarry?.source.type === 'reserve' ? cardCarry.source.index : undefined}
            hiddenReserveIndices={hiddenReserveIndicesForCardMotion('p1')}
            revealingReserveIndices={revealingReserveIndicesFor('p1')}
            hiddenPrivilegeIndexes={hiddenPrivilegeIndexesFor('p1')}
            highlightedPrivilegeIndexes={privilegeAwardHighlight?.type === 'player' && privilegeAwardHighlight.playerId === 'p1' ? [privilegeAwardHighlight.index] : []}
            interactivePrivileges={playerId === 'p1' && isMyTurn && !Boolean(currentPending) && !state.turnActions?.replenished}
            activePrivilegeIndex={playerId === 'p1' ? activePrivilegeIndex : undefined}
            remoteHoveredReserveIndex={reserveIndexFromRemoteHover('p1')}
            eligiblePurchaseGems={playerId === 'p1' ? (purchaseTarget?.eligibleGems ?? []) : []}
            activePurchaseGem={playerId === 'p1' ? purchaseTarget?.gem : undefined}
            activeColorlessPurchase={playerId === 'p1' && Boolean(purchaseTarget?.colorless)}
            invalidPurchaseTarget={playerId === 'p1' && Boolean(purchaseTarget && !purchaseTarget.colorless && !purchaseTarget.valid)}
            invalidColorlessPurchase={playerId === 'p1' && Boolean(purchaseTarget?.colorless && !purchaseTarget.valid)}
            remotePurchaseGem={remotePurchaseTarget?.playerId === 'p1' ? remotePurchaseTarget.gem : undefined}
            remoteColorlessPurchase={remotePurchaseTarget?.playerId === 'p1' && Boolean(remotePurchaseTarget.colorless)}
            remotePurchaseInvalid={remotePurchaseTarget?.playerId === 'p1' && !remotePurchaseTarget.colorless && !remotePurchaseTarget.valid}
            remoteColorlessInvalid={remotePurchaseTarget?.playerId === 'p1' && Boolean(remotePurchaseTarget.colorless) && !remotePurchaseTarget.valid}
            discardCount={playerId === 'p1' ? discardPending?.count : undefined}
            stealMode={playerId !== 'p1' && Boolean(stealPending)}
            onPrivilegePointerDown={beginPrivilegeCarry}
            onTokenSlotPointerDown={beginTokenSlotCarry}
            onDiscardToken={discardTokenFromSlot}
            onStealToken={stealTokenFromSlot}
            onReservePointerDown={(event, cardId, index) => beginCardCarry(event, cardId, { type: 'reserve', index })}
            onReservePointerEnter={(_, index) => hoverCardIntent({ type: 'reserve', index })}
            onReservePointerLeave={() => hoverCardIntent(undefined)}
            onReservePointerMove={updateCardCarry}
            onReservePointerUp={finishCardCarry}
            onReservePointerCancel={() => {
              clearIntent()
              setPurchasePreviewSlotKeys([])
              setPurchaseTarget(undefined)
              cancelCardCarryWithReturn()
            }}
          />
          <PlayerPanel
            state={state}
            playerId="p2"
            viewerId={playerId}
            highlightedTokenSlotKeys={discardPending ? discardHighlightKeys : purchasePreviewSlotKeys}
            spendingTokenSlotKeys={spendingTokenSlotKeys}
            carriedTokenSlotIndex={tokenSlotCarry?.playerId === 'p2' ? tokenSlotCarry.sourceIndex : undefined}
            tokenSlotDropIndex={tokenSlotCarry?.playerId === 'p2' ? tokenSlotCarry.targetIndex : undefined}
            carriedReserveIndex={playerId === 'p2' && cardCarry?.source.type === 'reserve' ? cardCarry.source.index : undefined}
            hiddenReserveIndices={hiddenReserveIndicesForCardMotion('p2')}
            revealingReserveIndices={revealingReserveIndicesFor('p2')}
            hiddenPrivilegeIndexes={hiddenPrivilegeIndexesFor('p2')}
            highlightedPrivilegeIndexes={privilegeAwardHighlight?.type === 'player' && privilegeAwardHighlight.playerId === 'p2' ? [privilegeAwardHighlight.index] : []}
            interactivePrivileges={playerId === 'p2' && isMyTurn && !Boolean(currentPending) && !state.turnActions?.replenished}
            activePrivilegeIndex={playerId === 'p2' ? activePrivilegeIndex : undefined}
            remoteHoveredReserveIndex={reserveIndexFromRemoteHover('p2')}
            eligiblePurchaseGems={playerId === 'p2' ? (purchaseTarget?.eligibleGems ?? []) : []}
            activePurchaseGem={playerId === 'p2' ? purchaseTarget?.gem : undefined}
            activeColorlessPurchase={playerId === 'p2' && Boolean(purchaseTarget?.colorless)}
            invalidPurchaseTarget={playerId === 'p2' && Boolean(purchaseTarget && !purchaseTarget.colorless && !purchaseTarget.valid)}
            invalidColorlessPurchase={playerId === 'p2' && Boolean(purchaseTarget?.colorless && !purchaseTarget.valid)}
            remotePurchaseGem={remotePurchaseTarget?.playerId === 'p2' ? remotePurchaseTarget.gem : undefined}
            remoteColorlessPurchase={remotePurchaseTarget?.playerId === 'p2' && Boolean(remotePurchaseTarget.colorless)}
            remotePurchaseInvalid={remotePurchaseTarget?.playerId === 'p2' && !remotePurchaseTarget.colorless && !remotePurchaseTarget.valid}
            remoteColorlessInvalid={remotePurchaseTarget?.playerId === 'p2' && Boolean(remotePurchaseTarget.colorless) && !remotePurchaseTarget.valid}
            discardCount={playerId === 'p2' ? discardPending?.count : undefined}
            stealMode={playerId !== 'p2' && Boolean(stealPending)}
            onPrivilegePointerDown={beginPrivilegeCarry}
            onTokenSlotPointerDown={beginTokenSlotCarry}
            onDiscardToken={discardTokenFromSlot}
            onStealToken={stealTokenFromSlot}
            onReservePointerDown={(event, cardId, index) => beginCardCarry(event, cardId, { type: 'reserve', index })}
            onReservePointerEnter={(_, index) => hoverCardIntent({ type: 'reserve', index })}
            onReservePointerLeave={() => hoverCardIntent(undefined)}
            onReservePointerMove={updateCardCarry}
            onReservePointerUp={finishCardCarry}
            onReservePointerCancel={() => {
              clearIntent()
              setPurchasePreviewSlotKeys([])
              setPurchaseTarget(undefined)
              cancelCardCarryWithReturn()
            }}
          />
        </section>
	      </section>
	      {tokenCarry?.kind === 'gold' && <FloatingGoldToken carry={tokenCarry} />}
	      {tokenSlotCarry && <FloatingTokenSlotCarry carry={tokenSlotCarry} />}
	      {cardCarry && <FloatingCardCarry carry={cardCarry} />}
	      {privilegeCarry && <FloatingPrivilegeCarry carry={privilegeCarry} />}
	      {flyingTokens.map((flight) => (
	        <FlyingTakenToken flight={flight} key={flight.id} />
	      ))}
	      {flyingCards.map((flight) => (
	        <FlyingReservedCard flight={flight} key={flight.id} />
	      ))}
	      {flyingPrivileges.map((flight) => (
	        <FlyingPrivilegeScroll flight={flight} key={flight.id} />
	      ))}
	      {introAnimation && <InitialAnimationLayer animation={introAnimation} />}
	      {marketReplacementCards.map((flight) => (
	        <MarketReplacementCardFlightView flight={flight} key={flight.id} />
	      ))}
	      {remoteGoldAnchor && <RemoteGoldToken anchor={remoteGoldAnchor} />}
	      {remotePrivilegeAnchor && <RemotePrivilegeScroll anchor={remotePrivilegeAnchor} />}
        {renderedTutorialStep && <TutorialOverlay step={renderedTutorialStep} />}
	    </main>
	  )
	}

type TutorialRect = {
  left: number
  top: number
  width: number
  height: number
}

function tutorialStepForInteraction({
  baseStep,
  tokenSelection,
  tokenCarry,
  cardCarry,
  privilegeCarry,
  activePrivilegeIndex,
  playerId,
  isMobileBoardLayout,
  boardFocusOpen,
}: {
  baseStep?: TutorialStep
  tokenSelection?: TokenDragSelection
  tokenCarry?: TokenCarry
  cardCarry?: CardCarry
  privilegeCarry?: PrivilegeCarry
  activePrivilegeIndex?: number
  playerId: PlayerId
  isMobileBoardLayout: boolean
  boardFocusOpen: boolean
}): TutorialStep | undefined {
  if (!baseStep) return undefined
  const mobileBoardCollapsed = isMobileBoardLayout && !boardFocusOpen
  const boardStepKinds: TutorialStep['kind'][] = ['takeTokens', 'reserveCard', 'usePrivilege', 'takeBoardToken', 'turnOverview']
  if (tokenSelection?.valid) {
    return {
      ...baseStep,
      kind: 'takeTokens',
      key: `${baseStep.key}:confirmTake`,
      targetSelector: '[data-tutorial-token-take]',
      targetSelectors: ['[data-tutorial-token-take]'],
      text: '点击“拿取”确认，把选中的宝石收入你的 token 区；如果框到 3 个同色或 2 个珍珠，对手会获得特权卷轴。',
    }
  }
  if (tokenCarry?.kind === 'gold') {
    return {
      ...baseStep,
      kind: 'reserveCard',
      key: `${baseStep.key}:goldToReserve`,
      targetSelector: '.marketPool',
      targetSelectors: ['.marketPool'],
      text: '正在保留牌。把黄金 token 拖到任意高亮市场牌上，这张牌会进入保留区，黄金也会收入你的 token 区。',
    }
  }
  if (cardCarry) {
    return {
      ...baseStep,
      kind: cardNeedsWildChoice(cardCarry.cardId) ? 'wildColor' : 'purchaseCard',
      key: `${baseStep.key}:cardToPurchased:${sourceKey(cardCarry.source)}`,
      targetSelector: `[data-player-purchased-pool="${playerId}"]`,
      targetSelectors: [`[data-player-purchased-pool="${playerId}"]`],
      text: cardNeedsWildChoice(cardCarry.cardId)
        ? '这张万能牌需要选择颜色。把牌拖到自己的一个已有颜色列上完成购买。'
        : '正在购买牌。把牌拖到自己的已购牌区，支付会自动计算并把牌放入对应颜色列。',
    }
  }
  if (privilegeCarry) {
    return {
      ...baseStep,
      kind: 'usePrivilege',
      key: `${baseStep.key}:privilegeToToken`,
      targetSelector: '.tokenBoard',
      targetSelectors: ['.tokenBoard'],
      text: '正在使用特权卷轴。把卷轴拖到棋盘上的任意非黄金 token，可以额外拿 1 枚宝石，然后继续本回合主要行动。',
    }
  }
  if (mobileBoardCollapsed && boardStepKinds.includes(baseStep.kind)) {
    const text =
      baseStep.kind === 'reserveCard'
        ? '手机视图下需要先放大棋盘。点击棋盘或放大按钮，然后把黄金 token 从放大的棋盘拖到高亮卡牌上。'
        : baseStep.kind === 'usePrivilege'
          ? '手机视图下需要先放大棋盘。点击棋盘或放大按钮，再选择要拿取的非黄金 token。'
          : baseStep.kind === 'takeTokens'
            ? '手机视图下需要先放大棋盘。点击棋盘或放大按钮，再框选 1-3 个连续宝石。'
            : baseStep.kind === 'takeBoardToken'
              ? '手机视图下需要先放大棋盘。点击棋盘或放大按钮，再点高亮 token 完成奖励。'
              : '手机视图下点击棋盘会先放大。放大后可以拿宝石、保留牌或使用特权。'
    return {
      ...baseStep,
      key: `${baseStep.key}:mobileBoardFocus`,
      targetSelector: '.tokenBoard',
      targetSelectors: ['.tokenBoard', '.mobileBoardFocusButton'],
      allowedSelectors: [...(baseStep.allowedSelectors ?? []), '.mobileBoardFocusButton'],
      text,
    }
  }
  if (activePrivilegeIndex !== undefined) {
    return {
      ...baseStep,
      kind: 'usePrivilege',
      key: `${baseStep.key}:privilegeToToken`,
      targetSelector: '.tokenBoard',
      targetSelectors: ['.tokenBoard'],
      text: '正在使用特权卷轴。把卷轴拖到棋盘上的任意非黄金 token，可以额外拿 1 枚宝石，然后继续本回合主要行动。',
    }
  }
  return baseStep
}

function TutorialOverlay({ step }: { step: TutorialStep }) {
  const [rects, setRects] = useState<TutorialRect[]>([])
  const gestureAllowedRef = useRef(false)

  useEffect(() => {
    function measure() {
      const pad = 8
      const nextRects = tutorialTargetElements(step)
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
        .map((box) => ({
          left: Math.max(6, box.left - pad),
          top: Math.max(6, box.top - pad),
          width: Math.min(window.innerWidth - 12, box.width + pad * 2),
          height: Math.min(window.innerHeight - 12, box.height + pad * 2),
        }))
      setRects(nextRects)
    }

    measure()
    const interval = window.setInterval(measure, 180)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step.key, step.targetSelector, step.targetSelectors])

  useEffect(() => {
    function isAllowedTarget(target: EventTarget | null) {
      if (!(target instanceof Node)) return false
      const targets = tutorialTargetElements(step)
      if (targets.length === 0) return true
      const allowed = [...targets, ...allowedTutorialElements(step), ...document.querySelectorAll<HTMLElement>('[data-tutorial-toggle]')]
      return allowed.some((element) => element.contains(target))
    }

    function blockNonTarget(event: Event) {
      if (event.type === 'pointerdown') gestureAllowedRef.current = isAllowedTarget(event.target)
      const allowed = gestureAllowedRef.current || isAllowedTarget(event.target)
      if (!allowed) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
      if (event.type === 'pointerup' || event.type === 'pointercancel') gestureAllowedRef.current = false
    }

    window.addEventListener('pointerdown', blockNonTarget, true)
    window.addEventListener('pointermove', blockNonTarget, true)
    window.addEventListener('pointerup', blockNonTarget, true)
    window.addEventListener('pointercancel', blockNonTarget, true)
    window.addEventListener('click', blockNonTarget, true)
    return () => {
      window.removeEventListener('pointerdown', blockNonTarget, true)
      window.removeEventListener('pointermove', blockNonTarget, true)
      window.removeEventListener('pointerup', blockNonTarget, true)
      window.removeEventListener('pointercancel', blockNonTarget, true)
      window.removeEventListener('click', blockNonTarget, true)
    }
  }, [step])

  if (rects.length === 0) return null

  const anchor = rects[0]
  const tooltipWidth = Math.min(280, window.innerWidth - 24)
  const isMobileViewport = window.innerWidth <= 760
  const useBottomSheet =
    isMobileViewport && (rects.length > 2 || anchor.width > window.innerWidth * 0.72 || anchor.height > window.innerHeight * 0.34)
  const placeBelow = anchor.top + anchor.height + 112 < window.innerHeight
  const tooltipLeft = clamp(anchor.left + anchor.width / 2 - tooltipWidth / 2, 12, window.innerWidth - tooltipWidth - 12)
  const tooltipTop = clamp(placeBelow ? anchor.top + anchor.height + 12 : anchor.top - 104, 12, window.innerHeight - 132)
  const tooltipStyle = useBottomSheet
    ? ({ left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 12px)' } as CSSProperties)
    : ({ left: tooltipLeft, top: tooltipTop, width: tooltipWidth } as CSSProperties)
  const maskId = `tutorial-mask-${step.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  return (
    <div className="tutorialLayer" aria-live="polite">
      <svg className="tutorialScrim" width={window.innerWidth} height={window.innerHeight} aria-hidden="true">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width={window.innerWidth} height={window.innerHeight} fill="white" />
            {rects.map((rect, index) => (
              <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx="10" ry="10" fill="black" key={index} />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width={window.innerWidth} height={window.innerHeight} fill="rgba(0, 0, 0, 0.7)" mask={`url(#${maskId})`} />
      </svg>
      {rects.map((rect, index) => (
        <div className="tutorialSpotlight" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height } as CSSProperties} key={index} />
      ))}
      <div className={`tutorialBubble ${placeBelow ? 'belowTarget' : 'aboveTarget'} ${useBottomSheet ? 'mobileBottomSheet' : ''}`} style={tooltipStyle}>
        <strong>{step.frequency === 'rare' ? '特殊操作' : '指导模式'}</strong>
        <span>{step.text}</span>
      </div>
    </div>
  )
}

function tutorialTargetElements(step: TutorialStep): HTMLElement[] {
  const selectors = step.targetSelectors?.length ? step.targetSelectors : [step.targetSelector]
  const elements = selectors.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
  return [...new Set(elements)]
}

function allowedTutorialElements(step: TutorialStep): HTMLElement[] {
  return (step.allowedSelectors ?? []).flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function RoomChatPanel({
  state,
  playerId,
  feed,
  open,
  value,
  busy,
  soundEnabled,
  notificationEnabled,
  notificationPermission,
  notificationSupported,
  onToggleOpen,
  onValueChange,
  onSend,
  onToggleSound,
  onRequestNotification,
  onDisableNotification,
}: {
  state: GameState
  playerId: PlayerId
  feed: RoomFeedItem[]
  open: boolean
  value: string
  busy: boolean
  soundEnabled: boolean
  notificationEnabled: boolean
  notificationPermission: NotificationPermission
  notificationSupported: boolean
  onToggleOpen: () => void
  onValueChange: (value: string) => void
  onSend: () => void
  onToggleSound: () => void
  onRequestNotification: () => void
  onDisableNotification: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const feedListRef = useRef<HTMLOListElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number; width: number; height: number; moved: boolean } | undefined>(undefined)
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; left: number; top: number } | undefined>(undefined)
  const suppressToggleClickRef = useRef(false)
  const [position, setPosition] = useState<ChatPanelPosition>()
  const [size, setSize] = useState<ChatPanelSize>()
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const latestFeedId = feed.at(-1)?.id

  useEffect(() => {
    const stored = readStoredChatPosition()
    const storedSize = readStoredChatSize()
    const frame = window.requestAnimationFrame(() => {
      const rect = panelRef.current?.getBoundingClientRect()
      const nextSize = storedSize ? constrainChatPanelSize(storedSize.width, storedSize.height, stored?.left ?? rect?.left ?? 36, stored?.top ?? rect?.top ?? 124) : undefined
      if (nextSize) setSize(nextSize)
      if (stored) setPosition(constrainChatPanelPosition(stored.left, stored.top, nextSize?.width ?? rect?.width ?? 320, nextSize?.height ?? rect?.height ?? 360))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!position) return
    localStorage.setItem(CHAT_POSITION_STORAGE_KEY, JSON.stringify(position))
  }, [position])

  useEffect(() => {
    if (!size) return
    localStorage.setItem(CHAT_SIZE_STORAGE_KEY, JSON.stringify(size))
  }, [size])

  useEffect(() => {
    function keepPanelInViewport() {
      if (!position && !size) return
      const rect = panelRef.current?.getBoundingClientRect()
      if (!rect) return
      const nextSize = size ? constrainChatPanelSize(size.width, size.height, position?.left ?? rect.left, position?.top ?? rect.top) : undefined
      if (nextSize) setSize(nextSize)
      if (position) setPosition(constrainChatPanelPosition(position.left, position.top, nextSize?.width ?? rect.width, nextSize?.height ?? rect.height))
    }
    window.addEventListener('resize', keepPanelInViewport)
    window.visualViewport?.addEventListener('resize', keepPanelInViewport)
    return () => {
      window.removeEventListener('resize', keepPanelInViewport)
      window.visualViewport?.removeEventListener('resize', keepPanelInViewport)
    }
  }, [position, size])

  useEffect(() => {
    if (!open) return
    const list = feedListRef.current
    if (!list) return
    const frame = window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, latestFeedId])

  function startPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    if ((event.target as Element | null)?.closest('button,input,textarea,a')) return
    beginPanelDrag(event)
  }

  function startCollapsedPanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    beginPanelDrag(event)
  }

  function beginPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function movePanelDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    const moved = Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3
    drag.moved = drag.moved || moved
    const next = constrainChatPanelPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY, drag.width, drag.height)
    setPosition(next)
    event.preventDefault()
  }

  function stopPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.moved) suppressToggleClickRef.current = true
    dragRef.current = undefined
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function handleToggleClick() {
    if (suppressToggleClickRef.current) {
      suppressToggleClickRef.current = false
      return
    }
    onToggleOpen()
  }

  function startPanelResize(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      left: rect.left,
      top: rect.top,
    }
    setResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  function movePanelResize(event: ReactPointerEvent<HTMLSpanElement>) {
    const resize = resizeRef.current
    if (!resize) return
    const nextSize = constrainChatPanelSize(resize.startWidth + event.clientX - resize.startX, resize.startHeight + event.clientY - resize.startY, resize.left, resize.top)
    setSize(nextSize)
    setPosition(constrainChatPanelPosition(resize.left, resize.top, nextSize.width, nextSize.height))
    event.preventDefault()
    event.stopPropagation()
  }

  function stopPanelResize(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!resizeRef.current) return
    resizeRef.current = undefined
    setResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.stopPropagation()
  }

  const orderedPlayers = state.playerOrder.filter((id) => state.players[id]?.seated || state.players[id]?.connected || state.players[id]?.isAi)
  const unread = !open && feed.length > 0
  const panelStyle = {
    ...(position ? { left: position.left, top: position.top, bottom: 'auto' } : {}),
    ...(open && size ? { width: size.width, height: size.height, maxHeight: 'none' } : {}),
  } as CSSProperties
  return (
    <aside className={`roomChatPanel ${open ? 'open' : 'collapsed'} ${position ? 'positioned' : ''} ${size && open ? 'sized' : ''} ${dragging ? 'dragging' : ''} ${resizing ? 'resizing' : ''}`} aria-label="房间聊天和事件" ref={panelRef} style={panelStyle}>
      <button
        className="roomChatToggle"
        type="button"
        onClick={handleToggleClick}
        onPointerDown={startCollapsedPanelDrag}
        onPointerMove={movePanelDrag}
        onPointerUp={stopPanelDrag}
        onPointerCancel={stopPanelDrag}
        aria-label={open ? '收起聊天' : '展开聊天'}
        title={open ? '收起聊天' : '展开聊天；按住可拖动'}
      >
        <MessageSquare size={18} />
        {unread && <span aria-hidden="true" />}
      </button>
      {open && (
        <div className="roomChatBody">
          <header
            className="roomChatHeader"
            onPointerDown={startPanelDrag}
            onPointerMove={movePanelDrag}
            onPointerUp={stopPanelDrag}
            onPointerCancel={stopPanelDrag}
            title="拖动移动聊天框"
          >
            <strong>房间动态</strong>
            <div className="roomChatActions">
              <button type="button" onClick={onToggleSound} className={soundEnabled ? 'activeChatIconButton' : ''} title={soundEnabled ? '关闭声音提醒' : '开启声音提醒'} aria-label={soundEnabled ? '关闭声音提醒' : '开启声音提醒'}>
                {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
              {notificationSupported && (
                <button
                  type="button"
                  onClick={notificationEnabled ? onDisableNotification : onRequestNotification}
                  className={notificationEnabled ? 'activeChatIconButton' : ''}
                  title={notificationEnabled ? '关闭浏览器提醒' : notificationPermission === 'denied' ? '浏览器提醒已被拒绝' : '开启浏览器提醒'}
                  aria-label={notificationEnabled ? '关闭浏览器提醒' : '开启浏览器提醒'}
                  disabled={!notificationEnabled && notificationPermission === 'denied'}
                >
                  {notificationEnabled ? <Bell size={15} /> : <BellOff size={15} />}
                </button>
              )}
              <button type="button" onClick={onToggleOpen} title="收起聊天" aria-label="收起聊天">
                <X size={15} />
              </button>
            </div>
          </header>
          <div className="roomChatPresence" aria-label="玩家在线状态">
            {orderedPlayers.map((id) => {
              const player = state.players[id]
              const status = player.isAi ? 'AI' : player.aiControlled ? '托管' : player.connected ? '在线' : '离线'
              return (
                <span className={`roomPresencePill ${player.connected || player.isAi || player.aiControlled ? 'online' : 'offline'} ${id === playerId ? 'self' : ''}`} key={id} title={`${displayPlayerName(player)}：${status}`}>
                  <i aria-hidden="true" />
                  {displayPlayerName(player)}
                  <b>{status}</b>
                </span>
              )
            })}
          </div>
          <ol className="roomFeedList" aria-label="聊天和事件列表" ref={feedListRef}>
            {feed.length === 0 ? (
              <li className="roomFeedEmpty">暂无动态</li>
            ) : (
              feed.map((item) => (
                <li className={`roomFeedItem ${item.kind}`} key={item.id}>
                  <time>{formatFeedTime(item.at)}</time>
                  <span>{item.kind === 'chat' && item.playerName ? `${item.playerName}：` : ''}{item.message}</span>
                </li>
              ))
            )}
          </ol>
          <form
            className="roomChatComposer"
            onSubmit={(event) => {
              event.preventDefault()
              onSend()
            }}
          >
            <input
              value={value}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              onChange={(event) => onValueChange(event.currentTarget.value)}
              placeholder="输入消息"
              aria-label="输入聊天消息"
            />
            <button type="submit" disabled={busy || value.trim().length === 0} aria-label="发送消息" title="发送消息">
              {busy ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
            </button>
          </form>
          <span
            className="roomChatResizeHandle"
            aria-hidden="true"
            onPointerDown={startPanelResize}
            onPointerMove={movePanelResize}
            onPointerUp={stopPanelResize}
            onPointerCancel={stopPanelResize}
          />
        </div>
      )}
    </aside>
  )
}

function formatFeedTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function readStoredChatPosition(): ChatPanelPosition | undefined {
  try {
    const raw = localStorage.getItem(CHAT_POSITION_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<ChatPanelPosition>
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return undefined
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return undefined
    return parsed as ChatPanelPosition
  } catch {
    return undefined
  }
}

function readStoredChatSize(): ChatPanelSize | undefined {
  try {
    const raw = localStorage.getItem(CHAT_SIZE_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<ChatPanelSize>
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return undefined
    if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return undefined
    return parsed as ChatPanelSize
  } catch {
    return undefined
  }
}

function constrainChatPanelPosition(left: number, top: number, width: number, height: number): ChatPanelPosition {
  const margin = 8
  const maxLeft = Math.max(margin, window.innerWidth - Math.min(width, window.innerWidth - margin * 2) - margin)
  const maxTop = Math.max(margin, window.innerHeight - Math.min(height, window.innerHeight - margin * 2) - margin)
  return {
    left: clamp(left, margin, maxLeft),
    top: clamp(top, margin, maxTop),
  }
}

function constrainChatPanelSize(width: number, height: number, left: number, top: number): ChatPanelSize {
  const margin = 8
  const minWidth = Math.min(260, window.innerWidth - margin * 2)
  const minHeight = Math.min(240, window.innerHeight - margin * 2)
  const maxWidth = Math.max(minWidth, window.innerWidth - left - margin)
  const maxHeight = Math.max(minHeight, window.innerHeight - top - margin)
  return {
    width: clamp(width, minWidth, maxWidth),
    height: clamp(height, minHeight, maxHeight),
  }
}

function RemoteCursorLayer({
  state,
  remoteCursors,
  clickEffects,
  shellRect,
}: {
  state?: any
  remoteCursors: Partial<Record<PlayerId, RemoteCursorState>>
  clickEffects: RemoteCursorClickEffect[]
  shellRect: DOMRect | null
}) {
  if (!state || !shellRect) return null
  const now = Date.now()
  const tracks = Object.entries(remoteCursors).flatMap(([id, cursor]) => {
    if (!cursor) return []
    const visiblePoints = cursor.points.filter((point) => point.visible)
    if (visiblePoints.length === 0) return []
    const trailPoints = visiblePoints.length > CURSOR_TRAIL_MAX_POINTS ? visiblePoints.slice(-CURSOR_TRAIL_MAX_POINTS) : visiblePoints
    const current = trailPoints[trailPoints.length - 1]
    if (!current) return []
    const currentPlayer = roomPlayer(state, id)
    const color = REMOTE_CURSOR_COLORS[id as PlayerId] ?? '#999'
    const playerName = currentPlayer ? displayPlayerName(currentPlayer) : id
    const stale = now - cursor.lastSeenAt > CURSOR_TRACK_FADE_MS
    if (stale && !cursor.visible) return []
    const pointerOpacity = Math.max(0.08, 1 - (now - cursor.lastSeenAt) / CURSOR_TRACK_STALE_MS)

    const trackStyle: CSSProperties & {
      '--trace-color': string
      '--trace-x': string
      '--trace-y': string
    } = {
      '--trace-color': color,
      '--trace-x': `${current.x * 100}%`,
      '--trace-y': `${current.y * 100}%`,
      left: `${shellRect.left}px`,
      top: `${shellRect.top}px`,
      width: `${shellRect.width}px`,
      height: `${shellRect.height}px`,
      opacity: 1 - (now - cursor.lastSeenAt) / CURSOR_TRACK_STALE_MS,
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: 90,
    }

    return [
      <div
        className="remote-trace"
        key={id}
        aria-hidden="true"
        style={trackStyle}
      >
        <div
          className="remote-cursor-pointer"
          style={{
            opacity: pointerOpacity,
            color,
            transform: 'translate(-16px, -4px)',
          }}
        >
          <svg className="remote-cursor-glyph" viewBox="0 0 28 34" aria-hidden="true">
            <path d="M5 3.5v25.2l6.8-6.2 4 8.4 4.5-2.1-4.2-8.2h8.8L5 3.5Z" />
          </svg>
          <strong>{playerName}</strong>
        </div>
      </div>,
    ]
  })
  const clicks = clickEffects.map((effect) => {
    const color = REMOTE_CURSOR_COLORS[effect.playerId] ?? '#999'
    return (
      <div
        key={effect.id}
        style={
          {
            left: `${shellRect.left}px`,
            top: `${shellRect.top}px`,
            width: `${shellRect.width}px`,
            height: `${shellRect.height}px`,
            position: 'absolute',
          } as CSSProperties
        }
      >
        <span
          className="remote-click-effect"
          style={
            {
              '--trace-color': color,
              '--trace-x': `${effect.x * 100}%`,
              '--trace-y': `${effect.y * 100}%`,
            } as CSSProperties
          }
        />
      </div>
    )
  })
  if (tracks.length === 0 && clicks.length === 0) return null
  return <div className="remoteCursorLayer remote-trace-layer">{tracks}{clicks}</div>
}

function TurnNameGlow({ playerId, active, ownTurn }: { playerId: PlayerId; active: boolean; ownTurn: boolean }) {
  const [rect, setRect] = useState<TurnNameGlowRect>()

  useEffect(() => {
    if (!active) {
      setRect((current) => current ? { ...current, visible: false } : current)
      return
    }
    let frame = 0
    const measure = () => {
      const target = document.querySelector<HTMLElement>(`[data-turn-name-player="${playerId}"]`)
      const targetRect = target?.getBoundingClientRect()
      if (!target || !targetRect || targetRect.width <= 0 || targetRect.height <= 0) return
      const rotation = turnNameGlowRotation(target)
      const rotatedSideSeat = Math.abs(rotation) === 90
      const width = rotatedSideSeat ? targetRect.height : targetRect.width
      const height = rotatedSideSeat ? targetRect.width : targetRect.height
      const centerX = targetRect.left + targetRect.width / 2
      const centerY = targetRect.top + targetRect.height / 2
      setRect({
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
        rotation,
        visible: true,
      })
    }
    frame = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
    }
  }, [active, playerId])

  if (!rect) return null
  return (
    <div
      className={`turnNameGlow ${ownTurn ? 'ownTurnNameGlow' : 'opponentTurnNameGlow'} ${rect.visible ? 'visible' : ''}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        '--turn-name-rotation': `${rect.rotation}deg`,
      } as CSSProperties}
      aria-hidden="true"
    />
  )
}

function turnNameGlowRotation(target: HTMLElement): number {
  const seat = target.closest<HTMLElement>('.splendorSeat')
  if (seat?.classList.contains('splendorSeatLeft')) return 90
  if (seat?.classList.contains('splendorSeatRight')) return -90
  return 0
}

const TUTORIAL_ENABLED_STORAGE_KEY = 'splendor:tutorial:enabled'

function tutorialCountsStorageKey(roomId: string, playerId: PlayerId): string {
  return `splendor:${roomId}:${playerId}:tutorialCounts`
}

function readTutorialCounts(roomId: string, playerId: PlayerId): TutorialCounts {
  const raw = localStorage.getItem(tutorialCountsStorageKey(roomId, playerId))
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as TutorialCounts
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeTutorialCounts(roomId: string, playerId: PlayerId, counts: TutorialCounts) {
  localStorage.setItem(tutorialCountsStorageKey(roomId, playerId), JSON.stringify(counts))
}
	
const ANIMATION_TIME_SCALE = 1.35
const animationMs = (ms: number) => Math.round(ms * ANIMATION_TIME_SCALE)
const TAKE_TOKEN_ANIMATION_MS = animationMs(380)
const CLASSIC_TAKE_TOKEN_STAGGER_MS = animationMs(72)
const PURCHASE_TOKEN_ANIMATION_MS = animationMs(460)
const PURCHASE_CARD_ANIMATION_MS = animationMs(560)
const PURCHASE_TOKEN_JOIN_ANIMATION_MS = animationMs(220)
const RESERVE_ANIMATION_MS = animationMs(680)
const RESERVE_REVEAL_ANIMATION_MS = animationMs(520)
const GOLD_INTENT_ANIMATION_MS = animationMs(260)
const RESERVE_GOLD_JOIN_ANIMATION_MS = GOLD_INTENT_ANIMATION_MS
const RETURN_ANIMATION_MS = animationMs(320)
const PRIVILEGE_GAIN_ANIMATION_MS = animationMs(520)
const REPLENISH_TOKEN_ANIMATION_MS = animationMs(360)
const REPLENISH_TOKEN_STAGGER_MS = animationMs(58)
const MARKET_REPLACEMENT_CARD_ANIMATION_MS = animationMs(620)
const INTRO_TOKEN_ANIMATION_MS = animationMs(420)
const INTRO_CARD_ANIMATION_MS = animationMs(620)
const INTRO_ROYAL_ANIMATION_MS = animationMs(420)
const INTRO_TOKEN_STAGGER_MS = animationMs(42)
const INTRO_CARD_STAGGER_MS = animationMs(88)
const INTRO_ROYAL_STAGGER_MS = animationMs(320)
const CLASSIC_BANK_INTRO_DURATION_MS = animationMs(233)
const CLASSIC_BANK_INTRO_DELAY_JITTER_MS = animationMs(54)
const CLASSIC_BANK_INTRO_DURATION_JITTER_MS = animationMs(43)
const CLASSIC_BANK_INTRO_ORDER = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx', 'gold'] as const satisfies readonly TokenType[]
const BOARD_DIRECTIONS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const

type TokenDragSelection = {
  originId: string
  cellIds: string[]
  valid: boolean
  invalidPoint?: { x: number; y: number }
}

type ActiveTokenDrag = TokenDragSelection

type DeferredStateUpdate = {
  seq: number
  state: GameState
  commitAtMs: number
  timer: number
}

type PendingDeferredSubmit = {
  deferStateMs: number
  deadlineMs: number
  timer: number
}

type QueuedStateUpdate = {
  seq: number
  state: GameState
  action?: AnyGameAction
}

type RemoteCursorPoint = {
  x: number
  y: number
  at: number
  visible: boolean
}

type RemoteCursorState = {
  playerId: PlayerId
  points: RemoteCursorPoint[]
  visible: boolean
  lastSeenAt: number
}

type RemoteCursorClickEffect = {
  id: string
  playerId: PlayerId
  x: number
  y: number
  at: number
}

type FlyingToken = {
  id: string
  type: TokenType
  classic?: boolean
  variant?: GameType
  fromX: number
  fromY: number
  toX: number
  toY: number
  size: number
  viaX?: number
  viaY?: number
  duration?: number
  delay?: number
}

type FlyingPrivilege = {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  width: number
  height: number
  targetWidth: number
  targetHeight: number
  targetTilt: number
  duration: number
}

type FlyingCard = {
  id: string
  cardId: number
  classic?: boolean
  variant?: GameType
  fromX: number
  fromY: number
  toX: number
  toY: number
  width: number
  height: number
  targetWidth: number
  targetHeight: number
  duration: number
  delay?: number
  horizontal?: boolean
  targetRotation?: number
  targetInnerWidth?: number
  targetInnerHeight?: number
  reservePurchase?: boolean
  revealBeforeFlight?: boolean
  colorlessPurchase?: boolean
  returning?: boolean
  faceDown?: boolean
  backOnly?: boolean
  evolutionBase?: boolean
}

type RemoteGoldAnchor = {
  cellId: string
  classic?: boolean
  variant?: GameType
  left: number
  top: number
  size: number
  source?: CardSource
}

type RemoteClassicTokenAnchor = {
  playerId: PlayerId
  tokenType: GemType
  variant?: GameType
  left: number
  top: number
  size: number
}

type RemotePrivilegeAnchor = {
  playerId: PlayerId
  index: number
  cellId: string
  left: number
  top: number
  width: number
  height: number
}

type IntroTokenFlight = FlyingToken & {
  delay: number
  repeatCount?: number
}

type IntroCardFlight = {
  id: string
  cardId: number
  classic?: boolean
  variant?: GameType
  tier: 1 | 2 | 3
  deckKind?: 'common' | 'rare' | 'legendary'
  sourceKey?: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  width: number
  height: number
  delay: number
  duration: number
}

type IntroRoyalFlight = {
  id: string
  cardId: number
  classic?: boolean
  variant?: GameType
  fromX: number
  fromY: number
  toX: number
  toY: number
  width: number
  height: number
  delay: number
  duration: number
}

type IntroAnimation = {
  tokens: IntroTokenFlight[]
  cards: IntroCardFlight[]
  royals: IntroRoyalFlight[]
  duration: number
}

type ReserveAnimation = {
  tokens: FlyingToken[]
  cards: FlyingCard[]
  hiddenCellIds: string[]
  hiddenCardSources: string[]
  duration: number
  clearRemoteGoldAnchor?: boolean
}

type TokenSpendAnimation = {
  tokens: FlyingToken[]
  hiddenSlotKeys: string[]
  duration: number
}

type PurchaseCardAnimation = {
  cards: FlyingCard[]
  hiddenCardSources: string[]
  hiddenPurchasedCardKeys?: string[]
  duration: number
}

type ReplenishAnimation = {
  tokens: FlyingToken[]
  duration: number
}

type BoardTokenTakeAnimation = {
  tokens: FlyingToken[]
  hiddenCellIds: string[]
  duration: number
}

type ClassicBankTakeAnimation = {
  tokens: FlyingToken[]
  bankTokenTypes: GemType[]
  hiddenSlotKeys: string[]
  duration: number
}

type PrivilegeGainAnimation = {
  scrolls: FlyingPrivilege[]
  hiddenSupplyIndexes: number[]
  duration: number
}

type PrivilegeUseAnimation = BoardTokenTakeAnimation & {
  scrolls: FlyingPrivilege[]
  hiddenPrivilegeSlotKeys: string[]
  clearRemotePrivilegeAnchor?: boolean
}

type MarketReplacementAnimation = {
  cards: IntroCardFlight[]
  hiddenCardSources: string[]
  duration: number
}

type BoardPathLayout = {
  width: number
  height: number
  points: Array<{ x: number; y: number }>
}

type PaymentSlot = {
  index: number
  type: TokenType
}

type PrivilegeHintKind = 'pearls' | 'replenish' | 'sameColor'

type PrivilegeAwardHighlight = ({ type: 'supply'; index: number } | { type: 'player'; playerId: PlayerId; index: number }) & {
  rule: PrivilegeHintKind
}

type PurchaseTargetPreview = {
  gem?: GemType
  colorless?: boolean
  valid: boolean
  eligibleGems: GemType[]
}

type RemotePurchaseTarget = {
  playerId: PlayerId
  source: CardSource
  gem?: GemType
  colorless?: boolean
  valid: boolean
}

type TurnNameGlowRect = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  visible: boolean
}

type TokenCarryBase = {
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  variant?: GameType
}

type TokenCarry =
  TokenCarryBase & {
    kind: 'gold'
    cellId: string
    classic?: boolean
  }

type ClassicTokenDraft = {
  playerId: PlayerId
  tokenTypes: GemType[]
  initialCounts: Record<GemType, number>
  hoverTokenType?: GemType
  hoverSlotIndex?: number
}

type ClassicTokenCarry = TokenCarryBase & {
  mode: 'bank' | 'draft'
  tokenType: GemType
  draftIndex?: number
  originX: number
  originY: number
  startClientX: number
  startClientY: number
}

type TokenSlotCarry = TokenCarryBase & {
  playerId: PlayerId
  tokenId: string
  tokenType: TokenType
  sourceIndex: number
  targetIndex: number
  startClientX: number
  startClientY: number
}

type CardCarry = {
  cardId: number
  source: CardSource
  classic?: boolean
  variant?: GameType
  horizontal: boolean
  x: number
  y: number
  originX: number
  originY: number
  startClientX: number
  startClientY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  originWidth: number
  originHeight: number
}

type PrivilegeCarry = TokenCarryBase & {
  index: number
  playerId: PlayerId
  originX: number
  originY: number
  startClientX: number
  startClientY: number
}

function shouldAnimateInitialStart(before: GameState | undefined, after: GameState): boolean {
  if (after.gameType !== 'duel' && !isClassicShellGame(after)) return false
  if (after.status !== 'playing' || after.turnNumber !== 1) return false
  const players = isClassicShellGame(after) ? after.playerOrder : (['p1', 'p2'] as const)
  const freshPlayers = players.every((playerId) => {
    const player = after.players[playerId]
    return player.tokenSlots.length === 0 && player.reserve.length === 0 && player.purchased.length === 0
  })
  if (!freshPlayers) return false
  return !before || before.status === 'waiting'
}

function createInitialAnimation(state: GameState): IntroAnimation | undefined {
  if (isClassicShellGame(state)) return createClassicInitialAnimation(state)
  const center = document.querySelector<HTMLElement>('[data-cell-id="2:2"]')?.getBoundingClientRect()
  const board = document.querySelector<HTMLElement>('.tokenBoard')?.getBoundingClientRect()
  const fromCenter = center ?? board
  if (!fromCenter) return undefined
  const tokenCenterX = fromCenter.left + fromCenter.width / 2
  const tokenCenterY = fromCenter.top + fromCenter.height / 2
  const cellsById = new Map(state.board.map((cell) => [cell.id, cell]))
  const tokens = SPIRAL_CELL_IDS.flatMap((cellId, order) => {
    const cell = cellsById.get(cellId)
    if (!cell?.token) return []
    const element = document.querySelector<HTMLElement>(`[data-cell-id="${cellId}"] .token`)
    const rect = element?.getBoundingClientRect()
    if (!rect) return []
    const size = rect.width
    return [
      {
        id: `intro-token-${cell.token.id}-${order}`,
        type: cell.token.type,
        fromX: tokenCenterX - size / 2,
        fromY: tokenCenterY - size / 2,
        toX: rect.left,
        toY: rect.top,
        size,
        delay: order * INTRO_TOKEN_STAGGER_MS,
        duration: INTRO_TOKEN_ANIMATION_MS,
      },
    ]
  })

  let cardOrder = 0
  const cards = ([3, 2, 1] as const).flatMap((tier) =>
    state.market[tier].flatMap((cardId, index) => {
      if (!cardId) return []
      const source = document.querySelector<HTMLElement>(`[data-deck-tier="${tier}"]`)?.getBoundingClientRect()
      const target = cardSourceElement({ type: 'market', tier, index })?.getBoundingClientRect()
      if (!source || !target) return []
      const delay = cardOrder * INTRO_CARD_STAGGER_MS
      cardOrder += 1
      return [
        {
          id: `intro-card-${tier}-${index}-${cardId}`,
          cardId,
          tier,
          fromX: source.left,
          fromY: source.top,
          toX: target.left,
          toY: target.top,
          width: target.width,
          height: target.height,
          delay,
          duration: INTRO_CARD_ANIMATION_MS,
        },
      ]
    }),
  )

  const royals = state.royalCards.slice(1, 4).flatMap((cardId, index) => {
    const from = royalTargetRect(index)
    const to = royalTargetRect(index + 1)
    if (!from || !to) return []
    return [
      {
        id: `intro-royal-${index + 1}-${cardId}`,
        cardId,
        fromX: from.left,
        fromY: from.top,
        toX: to.left,
        toY: to.top,
        width: to.width,
        height: to.height,
        delay: index * INTRO_ROYAL_STAGGER_MS,
        duration: INTRO_ROYAL_ANIMATION_MS,
      },
    ]
  })

  const duration = Math.max(
    ...tokens.map((flight) => flight.delay + flight.duration),
    ...cards.map((flight) => flight.delay + flight.duration),
    ...royals.map((flight) => flight.delay + flight.duration),
    0,
  )
  return { tokens, cards, royals, duration }
}

function createClassicInitialAnimation(state: GameState): IntroAnimation | undefined {
  const tokens = createClassicBankIntroFlights(state)
  let cardOrder = 0
  const cards = ([3, 2, 1] as const).flatMap((tier) =>
    state.market[tier].flatMap((cardId, index) => {
      if (!cardId) return []
      const source = document.querySelector<HTMLElement>(`[data-deck-tier="${tier}"]`)?.getBoundingClientRect()
      const target = cardSourceElement({ type: 'market', tier, index })?.getBoundingClientRect()
      if (!source || !target) return []
      const delay = cardOrder * INTRO_CARD_STAGGER_MS
      cardOrder += 1
      return [
        {
          id: `classic-intro-card-${tier}-${index}-${cardId}`,
          cardId,
          classic: true,
          variant: shellVariant(state),
          tier,
          fromX: source.left,
          fromY: source.top,
          toX: target.left,
          toY: target.top,
          width: target.width,
          height: target.height,
          delay,
          duration: INTRO_CARD_ANIMATION_MS,
        },
      ]
    }),
  )

  const pokemonSpecials = state.gameType === 'pokemon' && state.pokemonSpecial
    ? ([
        { deck: 'rare' as const, cardId: state.pokemonSpecial.rareFaceUp },
        { deck: 'legendary' as const, cardId: state.pokemonSpecial.legendaryFaceUp },
      ]).flatMap(({ deck, cardId }, index) => {
        if (!cardId) return []
        const source = document.querySelector<HTMLElement>(`[data-card-source-key="pokemon:${deck}:deck"]`)?.getBoundingClientRect()
        const target = cardSourceElement({ type: 'pokemonSpecial', deck })?.getBoundingClientRect()
        if (!source || !target) return []
        return [
          {
            id: `pokemon-intro-special-${deck}-${cardId}`,
            cardId,
            classic: true,
            variant: 'pokemon' as GameType,
            tier: 3 as const,
            deckKind: deck,
            fromX: source.left,
            fromY: source.top,
            toX: target.left,
            toY: target.top,
            width: target.width,
            height: target.height,
            delay: (cardOrder + index) * INTRO_CARD_STAGGER_MS,
            duration: INTRO_CARD_ANIMATION_MS,
          },
        ]
      })
    : []

  const royalTargets = state.royalCards.flatMap((cardId, index) => {
    const target = classicRoyalTargetRect(cardId)
    return target ? [{ cardId, index, target }] : []
  })
  const royalSource = classicRoyalBackStackRect()
  const royals = royalTargets.map(({ cardId, index, target }) => {
    return {
      id: `classic-intro-royal-${index}-${cardId}`,
      cardId,
      classic: true,
      variant: shellVariant(state),
      fromX: royalSource?.left ?? target.left,
      fromY: royalSource?.top ?? target.top,
      toX: target.left,
      toY: target.top,
      width: target.width,
      height: target.height,
      delay: index * INTRO_ROYAL_STAGGER_MS,
      duration: INTRO_ROYAL_ANIMATION_MS,
    }
  })

  const duration = Math.max(
    ...tokens.map((flight) => flight.delay + (flight.duration ?? INTRO_TOKEN_ANIMATION_MS) * (flight.repeatCount ?? 1)),
    ...cards.map((flight) => flight.delay + flight.duration),
    ...pokemonSpecials.map((flight) => flight.delay + flight.duration),
    ...royals.map((flight) => flight.delay + flight.duration),
    0,
  )
  return { tokens, cards: [...cards, ...pokemonSpecials], royals, duration }
}

function createClassicBankIntroFlights(state: GameState): IntroTokenFlight[] {
  const counts = fullClassicBankCounts(state)
  return CLASSIC_BANK_INTRO_ORDER.flatMap((tokenType) => {
    const stack = document.querySelector<HTMLElement>(`[data-classic-bank-token="${tokenType}"] .splendorTokenStack`)
    const rect = stack?.getBoundingClientRect()
    if (!rect) return []
    const size = classicBankTokenSize(rect)
    const x = rect.left + (rect.width - size) / 2
    const count = counts[tokenType]
    if (count <= 0) return []
    const visibleIndex = Math.min(count - 1, 2)
    const timing = classicBankIntroSequenceTiming(tokenType)
    return [
      {
        id: `classic-intro-bank-${tokenType}`,
        type: tokenType,
        classic: true,
        variant: shellVariant(state),
        fromX: x,
        fromY: rect.top - size - 54 + timing.startHeightJitter,
        toX: x,
        toY: rect.bottom - size - visibleIndex * visibleIndex * 0.9,
        size,
        delay: timing.delay,
        duration: timing.duration,
        repeatCount: count,
      },
    ]
  })
}

function classicBankIntroSequenceTiming(tokenType: TokenType): { delay: number; duration: number; startHeightJitter: number } {
  const delayJitter = classicIntroJitter(`${tokenType}:sequence:delay`, -CLASSIC_BANK_INTRO_DELAY_JITTER_MS, CLASSIC_BANK_INTRO_DELAY_JITTER_MS)
  const stackJitter = classicIntroJitter(`${tokenType}:stack`, -CLASSIC_BANK_INTRO_DELAY_JITTER_MS * 0.55, CLASSIC_BANK_INTRO_DELAY_JITTER_MS * 0.55)
  const durationJitter = classicIntroJitter(`${tokenType}:sequence:duration`, -CLASSIC_BANK_INTRO_DURATION_JITTER_MS, CLASSIC_BANK_INTRO_DURATION_JITTER_MS)
  return {
    delay: Math.max(0, Math.round(stackJitter + delayJitter)),
    duration: Math.max(1, Math.round(CLASSIC_BANK_INTRO_DURATION_MS + durationJitter)),
    startHeightJitter: classicIntroJitter(`${tokenType}:sequence:height`, -16, 10),
  }
}

function classicIntroJitter(key: string, min: number, max: number): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const unit = (hash >>> 0) / 0xffffffff
  return min + unit * (max - min)
}

function classicBankTokenSize(stackRect: DOMRect): number {
  const sample = document.querySelector<HTMLElement>('.splendorStackedToken .tokenImage')
  const sampleRect = sample?.getBoundingClientRect()
  if (sampleRect && sampleRect.width > 0) return sampleRect.width
  return Math.min(26, stackRect.width, stackRect.height)
}

function fullClassicBankCounts(state: GameState): Record<TokenType, number> {
  const counts = emptyRouteBankCounts()
  for (const token of state.bag) counts[token.type] += 1
  for (const cell of state.board) {
    if (cell.token) counts[cell.token.type] += 1
  }
  return counts
}

function emptyRouteBankCounts(): Record<TokenType, number> {
  return {
    ruby: 0,
    sapphire: 0,
    onyx: 0,
    diamond: 0,
    emerald: 0,
    pearl: 0,
    gold: 0,
  }
}

function classicRoyalTargetRect(cardId: number): DOMRect | undefined {
  const element = document.querySelector<HTMLElement>(`.splendorRoyals [data-classic-royal-card="${cardId}"] .classicNobleCard`)
    ?? document.querySelector<HTMLElement>(`.splendorRoyals [data-classic-royal-card="${cardId}"]`)
  return element?.getBoundingClientRect()
}

function classicRoyalBackStackRect(): DOMRect | undefined {
  const element = document.querySelector<HTMLElement>('.splendorRoyals .splendorRoyalBackStack .reserveCardBack')
    ?? document.querySelector<HTMLElement>('.splendorRoyals .splendorRoyalBackStack')
  return element?.getBoundingClientRect()
}

function royalTargetRect(index: number): DOMRect | undefined {
  const containerElement = document.querySelector<HTMLElement>('.royals')
  const firstCard = containerElement?.querySelector<HTMLElement>('.card')
  if (!containerElement || !firstCard) return undefined
  const container = containerElement.getBoundingClientRect()
  const card = firstCard.getBoundingClientRect()
  const style = getComputedStyle(containerElement)
  const columnGap = Number.parseFloat(style.columnGap) || 0
  const rowGap = Number.parseFloat(style.rowGap) || 0
  const gridWidth = card.width * 2 + columnGap
  const gridHeight = card.height * 2 + rowGap
  const originX = container.left + Math.max(0, (container.width - gridWidth) / 2)
  const originY = container.top + Math.max(0, (container.height - gridHeight) / 2)
  const column = index % 2
  const row = Math.floor(index / 2)
  return new DOMRect(originX + column * (card.width + columnGap), originY + row * (card.height + rowGap), card.width, card.height)
}

function cardSourceAtPoint(clientX: number, clientY: number): CardSource | undefined {
  const target = document.elementFromPoint(clientX, clientY)
  const source = target?.closest<HTMLElement>('[data-card-drop-source]')?.dataset.cardDropSource
  if (!source) return undefined
  try {
    return JSON.parse(source) as CardSource
  } catch {
    return undefined
  }
}

function isPointerOverPurchasedPanel(state: GameState, clientX: number, clientY: number, playerId: PlayerId): boolean {
  const target = document.elementFromPoint(clientX, clientY)
  if (target?.closest(`[data-player-purchased-pool="${playerId}"]`)) return true
  const panel = document.querySelector<HTMLElement>(`[data-player-purchased-pool="${playerId}"]`)
  if (panel && rectContainsPoint(panel.getBoundingClientRect(), clientX, clientY, 14)) return true
  if (!isClassicShellGame(state)) return false
  if (target?.closest(`[data-player-purchase-drop-zone="${playerId}"]`)) return true
  const cardArea = document.querySelector<HTMLElement>(`[data-player-purchase-drop-zone="${playerId}"]`)
  return Boolean(cardArea && rectContainsPoint(cardArea.getBoundingClientRect(), clientX, clientY, 18))
}

function purchasedColumnAtPoint(clientX: number, clientY: number): { playerId: PlayerId; gem: GemType } | undefined {
  const columns = document.querySelectorAll<HTMLElement>('[data-purchased-column-player][data-purchased-column-gem]')
  const column = Array.from(columns).find((item) => rectContainsPoint(item.getBoundingClientRect(), clientX, clientY))
  const columnPlayerId = column?.dataset.purchasedColumnPlayer
  const gem = column?.dataset.purchasedColumnGem
  if (!isPlayerId(columnPlayerId) || !GEM_TYPES.includes(gem as GemType)) return undefined
  return { playerId: columnPlayerId, gem: gem as GemType }
}

function rectContainsPoint(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, clientX: number, clientY: number, margin = 0): boolean {
  return clientX >= rect.left - margin && clientX <= rect.right + margin && clientY >= rect.top - margin && clientY <= rect.bottom + margin
}

function invalidPurchaseMessage(carry: CardCarry, target: PurchaseTargetPreview): string {
  if (target.colorless) return 'token 不足，无法购买这张牌。'
  if (cardNeedsWildChoice(carry.cardId) && !target.gem) return '万能牌需要拖到一个已有颜色列。'
  return 'token 不足，无法购买这张牌。'
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'p1' || value === 'p2' || value === 'p3' || value === 'p4'
}

function isSameCardSource(left: CardSource, right: CardSource): boolean {
  if (left.type !== right.type) return false
  if (left.type === 'market' && right.type === 'market') return left.tier === right.tier && left.index === right.index
  if (left.type === 'reserve' && right.type === 'reserve') return left.index === right.index
  if (left.type === 'deck' && right.type === 'deck') return left.tier === right.tier
  if (left.type === 'pokemonSpecial' && right.type === 'pokemonSpecial') return left.deck === right.deck
  return false
}

function sourceKey(source: CardSource): string {
  if (source.type === 'market') return `market:${source.tier}:${source.index}`
  if (source.type === 'deck') return `deck:${source.tier}`
  if (source.type === 'pokemonSpecial') return `pokemon:${source.deck}`
  return `reserve:${source.index}`
}

function sourceMotionKey(source: CardSource, playerId?: PlayerId): string {
  if (source.type === 'reserve' && playerId) return `${playerId}:reserve:${source.index}`
  return sourceKey(source)
}

function purchasedCardKey(playerId: PlayerId, index: number): string {
  return `${playerId}:purchased:${index}`
}

function findSourceCard(state: GameState, source: CardSource): number | undefined {
  if (source.type === 'market') return state.market[source.tier][source.index] ?? undefined
  if (source.type === 'deck') return state.decks[source.tier][0]
  if (source.type === 'pokemonSpecial') return source.deck === 'rare' ? state.pokemonSpecial?.rareFaceUp ?? undefined : state.pokemonSpecial?.legendaryFaceUp ?? undefined
  return undefined
}

function findPlayerSourceCard(state: GameState | undefined, playerId: PlayerId, source: CardSource): number | undefined {
  if (!state) return undefined
  if (source.type === 'reserve') return state.players[playerId].reserve[source.index]
  return findSourceCard(state, source)
}

function isColorlessPurchaseSource(state: GameState | undefined, playerId: PlayerId, source: CardSource): boolean {
  const cardId = findPlayerSourceCard(state, playerId, source)
  if (!cardId) return false
  return isColorlessCardId(cardId)
}

function isColorlessCardId(cardId: number): boolean {
  const card = getCard(cardId)
  return !card.wild && !card.color
}

function sourceForReservedCard(before: GameState, after: GameState, cardId: number): CardSource | undefined {
  for (const tier of [1, 2, 3] as const) {
    for (let index = 0; index < before.market[tier].length; index += 1) {
      if (before.market[tier][index] === cardId && after.market[tier][index] !== cardId) return { type: 'market', tier, index }
    }
    if (before.decks[tier][0] === cardId && after.decks[tier][0] !== cardId) return { type: 'deck', tier }
  }
  return undefined
}

function findReserveTransition(before: GameState, after: GameState): { playerId: PlayerId; cardId: number; source: CardSource; goldCellId: string } | undefined {
  for (const playerId of before.playerOrder) {
    const beforeReserve = before.players[playerId].reserve
    const afterReserve = after.players[playerId].reserve
    if (afterReserve.length !== beforeReserve.length + 1) continue
    if (after.players[playerId].tokens.gold !== before.players[playerId].tokens.gold + 1) continue
    const cardId = afterReserve.find((id, index) => beforeReserve[index] !== id) ?? afterReserve[afterReserve.length - 1]
    const source = sourceForReservedCard(before, after, cardId)
    const goldCell = before.board.find((cell) => cell.token?.type === 'gold' && !after.board.find((next) => next.id === cell.id)?.token)
    if (source) return { playerId, cardId, source, goldCellId: goldCell?.id ?? classicGoldCellId(before) ?? 'bank:gold' }
  }
  return undefined
}

function sourceForPurchasedCard(before: GameState, after: GameState, playerId: PlayerId, cardId: number): CardSource | undefined {
  for (const tier of [1, 2, 3] as const) {
    for (let index = 0; index < before.market[tier].length; index += 1) {
      if (before.market[tier][index] === cardId && after.market[tier][index] !== cardId) return { type: 'market', tier, index }
    }
  }
  for (let index = 0; index < before.players[playerId].reserve.length; index += 1) {
    if (before.players[playerId].reserve[index] === cardId && after.players[playerId].reserve[index] !== cardId) return { type: 'reserve', index }
  }
  if (before.gameType === 'pokemon') {
    if (before.pokemonSpecial?.rareFaceUp === cardId && after.pokemonSpecial?.rareFaceUp !== cardId) return { type: 'pokemonSpecial', deck: 'rare' }
    if (before.pokemonSpecial?.legendaryFaceUp === cardId && after.pokemonSpecial?.legendaryFaceUp !== cardId) return { type: 'pokemonSpecial', deck: 'legendary' }
  }
  return undefined
}

function findPurchaseTransition(before: GameState, after: GameState): { playerId: PlayerId; cardId: number; wildColor?: GemType; source?: CardSource } | undefined {
  for (const playerId of before.playerOrder) {
    if (after.players[playerId].purchased.length !== before.players[playerId].purchased.length + 1) continue
    const purchased = after.players[playerId].purchased.find((card, index) => {
      const previous = before.players[playerId].purchased[index]
      return !previous || previous.cardId !== card.cardId || previous.wildColor !== card.wildColor
    }) ?? after.players[playerId].purchased[after.players[playerId].purchased.length - 1]
    if (!purchased) continue
    return {
      playerId,
      cardId: purchased.cardId,
      wildColor: purchased.wildColor,
      source: sourceForPurchasedCard(before, after, playerId, purchased.cardId),
    }
  }
  return undefined
}

function purchaseSpentSlots(before: GameState, after: GameState, playerId: PlayerId): PaymentSlot[] {
  const afterSlotIds = new Set(after.players[playerId].tokenSlots.map((token) => token.id))
  return before.players[playerId].tokenSlots
    .map((token, index) => ({ index, type: token.type, tokenId: token.id }))
    .filter((slot) => !afterSlotIds.has(slot.tokenId))
    .map(({ index, type }) => ({ index, type }))
}

function cardSourceElement(source: CardSource, playerId?: PlayerId): HTMLElement | undefined {
  const key = sourceKey(source)
  if (source.type === 'reserve' && playerId) {
    return (
      document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"] .splendorReserveCardItem[data-card-source-key="${key}"]`)
      ?? document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"] .reserveCardItem[data-card-source-key="${key}"]`)
      ?? document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"] [data-card-source-key="${key}"]`)
      ?? undefined
    )
  }
  return document.querySelector<HTMLElement>(`[data-card-source-key="${key}"]`) ?? undefined
}

type ReserveTargetRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> & {
  rotation: number
  innerWidth: number
  innerHeight: number
}

function reserveTargetRect(playerId: PlayerId, reserveIndex: number): ReserveTargetRect | undefined {
  const rotation = reserveTargetRotation(playerId)
  const splendorTarget = document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"] [data-splendor-reserve-target="${reserveIndex}"]`)
  const splendorTargetRect = splendorTarget?.getBoundingClientRect()
  if (splendorTargetRect && splendorTargetRect.width > 0 && splendorTargetRect.height > 0) return reserveTargetWithInnerSize(splendorTargetRect, rotation)

  const existingSlot = document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"] [data-card-source-key="reserve:${reserveIndex}"]`)
  const existingRect = existingSlot?.getBoundingClientRect()
  if (existingRect && existingRect.width > 0 && existingRect.height > 0) return reserveTargetWithInnerSize(existingRect, rotation)

  const splendorSlot = document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"] [data-splendor-reserve-slot="${reserveIndex}"]`)
  const splendorRect = splendorSlot?.getBoundingClientRect()
  if (splendorRect && splendorRect.width > 0 && splendorRect.height > 0) return reserveTargetWithInnerSize(splendorRect, rotation)

  const list = document.querySelector<HTMLElement>(`[data-player-reserve-list="${playerId}"]`)
  const listRect = list?.getBoundingClientRect()
  if (!list || !listRect || listRect.width <= 0 || listRect.height <= 0) return undefined
  const style = getComputedStyle(list)
  const gap = Number.parseFloat(style.rowGap || style.gap) || 0
  const width = Math.max(1, listRect.width - 8)
  const height = width * 0.66
  return reserveTargetWithInnerSize({
    left: listRect.left,
    top: listRect.top + reserveIndex * (height + gap),
    width,
    height,
  }, rotation)
}

function reserveTargetRotation(playerId: PlayerId): number {
  const panel = document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"]`)
  const splendorSeat = panel?.closest<HTMLElement>('.splendorSeat')
  if (splendorSeat?.classList.contains('splendorSeatLeft')) return 180
  if (splendorSeat?.classList.contains('splendorSeatRight')) return 0
  return 90
}

function reserveTargetWithInnerSize(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, rotation: number): ReserveTargetRect {
  const normalized = Math.abs(((rotation % 180) + 180) % 180)
  const sideways = normalized === 90
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    rotation,
    innerWidth: sideways ? rect.height : rect.width,
    innerHeight: sideways ? rect.width : rect.height,
  }
}

function purchasedColumnTargetRect(
  state: GameState,
  playerId: PlayerId,
  cardId: number,
  gem: GemType | undefined,
): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | undefined {
  const card = getCard(cardId)
  const targetGem = gem ?? card.color
  if (!targetGem) return undefined
  const column = document.querySelector<HTMLElement>(`[data-purchased-column-player="${playerId}"][data-purchased-column-gem="${targetGem}"]`)
  const stack = column?.querySelector<HTMLElement>('.purchasedCardStack')
  const stackRect = stack?.getBoundingClientRect()
  if (!column || !stack || !stackRect || stackRect.width <= 0 || stackRect.height <= 0) return undefined
  const existingCards = Array.from(stack.querySelectorAll<HTMLElement>('.purchasedCardItem'))
  const sourceSize = document.querySelector<HTMLElement>('.marketCard .card')?.getBoundingClientRect()
  const width = Math.min(sourceSize?.width ?? stackRect.width, stackRect.width)
  const sourceRatio = sourceSize && sourceSize.width > 0 ? sourceSize.height / sourceSize.width : undefined
  const fallbackRatio = state.gameType === 'duel' ? 1 / 0.66 : 1 / (state.gameType === 'pokemon' ? 0.75 : 0.7142857)
  const height = width * (sourceRatio ?? fallbackRatio)
  const lastCard = existingCards.at(-1)?.getBoundingClientRect()
  const step = Number.parseFloat(getComputedStyle(stack).getPropertyValue('--purchased-stack-step')) || Math.max(18, width * 0.32)
  const playerExistingCount = state.players[playerId].purchased.filter((item) => (item.wildColor ?? getCard(item.cardId).color) === targetGem).length
  const rotation = purchaseTargetRotation(playerId)
  if (isSidewaysRotation(rotation)) {
    const vector = rotatedLocalDownVector(rotation)
    const baseCenterX = lastCard ? lastCard.left + lastCard.width / 2 : stackRect.left + stackRect.width / 2 + vector.x * playerExistingCount * step
    const baseCenterY = lastCard ? lastCard.top + lastCard.height / 2 : stackRect.top + stackRect.height / 2 + vector.y * playerExistingCount * step
    const centerX = baseCenterX + (lastCard ? vector.x * step : 0)
    const centerY = baseCenterY + (lastCard ? vector.y * step : 0)
    return rectFromCenter(centerX, centerY, width, height)
  }
  const rawTop = lastCard ? lastCard.top + step : stackRect.top + playerExistingCount * step
  const panelRect = column.closest<HTMLElement>('.purchasedPanel')?.getBoundingClientRect()
  const maxTop = panelRect ? panelRect.bottom - height - 4 : rawTop
  const top = Math.max(stackRect.top, Math.min(rawTop, maxTop))
  return {
    left: stackRect.left + Math.max(0, (stackRect.width - width) / 2),
    top,
    width,
    height,
  }
}

function colorlessPurchasedTargetRect(playerId: PlayerId): DOMRect | undefined {
  return document.querySelector<HTMLElement>(`[data-colorless-purchased-player="${playerId}"]`)?.getBoundingClientRect()
}

function purchaseCardTargetRect(
  state: GameState,
  playerId: PlayerId,
  cardId: number,
  gem: GemType | undefined,
): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | undefined {
  const card = getCard(cardId)
  if (!card.wild && !card.color) return colorlessPurchasedTargetRect(playerId)
  return purchasedColumnTargetRect(state, playerId, cardId, gem)
}

function purchaseTargetRotation(playerId: PlayerId): number {
  const panel = document.querySelector<HTMLElement>(`[data-player-panel="${playerId}"]`)
  const splendorSeat = panel?.closest<HTMLElement>('.splendorSeat')
  if (splendorSeat?.classList.contains('splendorSeatLeft')) return 90
  if (splendorSeat?.classList.contains('splendorSeatRight')) return -90
  return 0
}

function isSidewaysRotation(rotation: number): boolean {
  return Math.abs(((rotation % 180) + 180) % 180) === 90
}

function rotatedLocalDownVector(rotation: number): { x: number; y: number } {
  const radians = rotation * Math.PI / 180
  return {
    x: -Math.sin(radians),
    y: Math.cos(radians),
  }
}

function rectFromCenter(centerX: number, centerY: number, width: number, height: number): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> {
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
  }
}

function colorlessPurchaseFlightRect(target: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, sourceWidth: number, sourceHeight: number): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> {
  return {
    left: target.left + (target.width - sourceWidth) / 2,
    top: target.top + (target.height - sourceHeight) / 2,
    width: sourceWidth,
    height: sourceHeight,
  }
}

function purchaseFlightTarget(
  target: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  source: CardSource,
  sourceWidth: number,
  sourceHeight: number,
  colorlessPurchase: boolean,
): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> {
  if (!colorlessPurchase) return target
  const centered = colorlessPurchaseFlightRect(target, sourceWidth, sourceHeight)
  return source.type === 'reserve' ? { ...centered, width: sourceHeight, height: sourceWidth } : centered
}

function tokenSlotRect(state: GameState, playerId: PlayerId): DOMRect | undefined {
  const playerTokenCount = state.players[playerId].tokenSlots.length || Object.values(state.players[playerId].tokens).reduce((sum, count) => sum + count, 0)
  return document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-token-slot-index="${Math.min(playerTokenCount, 9)}"]`)?.getBoundingClientRect()
}

function tokenSlotsZoneRect(playerId: PlayerId): DOMRect | undefined {
  return document.querySelector<HTMLElement>(`[data-token-slots-player="${playerId}"]`)?.getBoundingClientRect()
}

function tokenSlotKey(playerId: PlayerId, index: number): string {
  return `${playerId}:${index}`
}

function discardTokenSlotKeys(state: GameState, playerId: PlayerId): string[] {
  return state.players[playerId].tokenSlots.slice(0, 10).map((_, index) => tokenSlotKey(playerId, index))
}

function tokenSlotTargetIndexAtPoint(playerId: PlayerId, clientX: number, clientY: number): number | undefined {
  const element = document.elementFromPoint(clientX, clientY)
  const slot = element?.closest<HTMLElement>(`[data-token-slot-player="${playerId}"]`)
  const fallbackSlot = slot ?? [...document.querySelectorAll<HTMLElement>(`[data-token-slot-player="${playerId}"]`)].find((candidate) => {
    const rect = candidate.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  })
  if (!fallbackSlot) return tokenSlotTargetIndexInsidePanel(playerId, clientX, clientY)
  const index = Number(fallbackSlot.dataset.tokenSlotIndex)
  return Number.isFinite(index) ? index : undefined
}

function tokenSlotTargetIndexInsidePanel(playerId: PlayerId, clientX: number, clientY: number): number | undefined {
  const panel = document.querySelector<HTMLElement>(`[data-token-slots-player="${playerId}"]`)
  if (!panel) return undefined
  const rect = panel.getBoundingClientRect()
  const margin = 10
  const insidePanel = clientX >= rect.left - margin && clientX <= rect.right + margin && clientY >= rect.top - margin && clientY <= rect.bottom + margin
  if (!insidePanel) return undefined
  const slots = [...panel.querySelectorAll<HTMLElement>(`[data-token-slot-player="${playerId}"]`)]
  if (slots.length === 0) return undefined
  let closestIndex: number | undefined
  let closestDistance = Number.POSITIVE_INFINITY
  for (const candidate of slots) {
    const slotRect = candidate.getBoundingClientRect()
    const centerX = slotRect.left + slotRect.width / 2
    const centerY = slotRect.top + slotRect.height / 2
    const distance = Math.hypot(clientX - centerX, clientY - centerY)
    if (distance < closestDistance) {
      const index = Number(candidate.dataset.tokenSlotIndex)
      if (Number.isFinite(index)) {
        closestIndex = index
        closestDistance = distance
      }
    }
  }
  return closestIndex
}

function classicGemBankCounts(state: GameState | undefined): Record<GemType, number> {
  const counts = Object.fromEntries(GEM_TYPES.map((tokenType) => [tokenType, 0])) as Record<GemType, number>
  if (!state) return counts
  for (const token of state.bag) {
    if (GEM_TYPES.includes(token.type as GemType)) counts[token.type as GemType] += 1
  }
  for (const cell of state.board) {
    const tokenType = cell.token?.type
    if (GEM_TYPES.includes(tokenType as GemType)) counts[tokenType as GemType] += 1
  }
  return counts
}

function classicDraftCount(draft: ClassicTokenDraft | undefined, tokenType: GemType): number {
  return draft?.tokenTypes.filter((item) => item === tokenType).length ?? 0
}

function isClassicDraftConfirmable(draft: ClassicTokenDraft | undefined): boolean {
  if (!draft) return false
  const uniqueTypes = [...new Set(draft.tokenTypes)]
  if (draft.tokenTypes.length === 2) return uniqueTypes.length === 1 && draft.initialCounts[draft.tokenTypes[0]] >= 4
  if (draft.tokenTypes.length === 3) return uniqueTypes.length === 3
  return false
}

function canTakeClassicDraftToken(state: GameState, playerId: PlayerId, draft: ClassicTokenDraft | undefined, tokenType: GemType): boolean {
  if (!isClassicShellGame(state) || state.status !== 'playing' || state.currentPlayer !== playerId || state.pending || state.winner) return false
  const currentDraft = draft?.playerId === playerId ? draft : undefined
  const initialCounts = currentDraft?.initialCounts ?? classicGemBankCounts(state)
  const availableNow = classicGemBankCounts(state)[tokenType] - classicDraftCount(currentDraft, tokenType)
  if (availableNow <= 0) return false
  const tokenTypes = currentDraft?.tokenTypes ?? []
  if (tokenTypes.length === 0) return true
  if (tokenTypes.length === 1) {
    if (tokenTypes[0] === tokenType) return initialCounts[tokenType] >= 4
    return true
  }
  if (tokenTypes.length === 2) {
    const uniqueTypes = [...new Set(tokenTypes)]
    return uniqueTypes.length === 2 && !uniqueTypes.includes(tokenType)
  }
  return false
}

function disabledClassicBankTokenTypes(state: GameState | undefined, playerId: PlayerId | undefined, draft: ClassicTokenDraft | undefined): GemType[] {
  if (!state || !playerId || !draft || draft.tokenTypes.length === 0) return []
  return GEM_TYPES.filter((tokenType) => !canTakeClassicDraftToken(state, playerId, draft, tokenType))
}

function classicBankTokenElement(tokenType: TokenType): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[data-classic-bank-token="${tokenType}"] .splendorStackedToken:last-of-type`)
    ?? document.querySelector<HTMLElement>(`[data-classic-bank-token="${tokenType}"] .tokenImage`)
    ?? document.querySelector<HTMLElement>(`[data-classic-bank-token="${tokenType}"]`)
    ?? undefined
}

function classicDraftTokenElement(playerId: PlayerId, draftIndex: number): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-splendor-draft-token-index="${draftIndex}"] .tokenImage`)
    ?? document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-splendor-draft-token-index="${draftIndex}"]`)
    ?? undefined
}

function classicTokenSlotElement(playerId: PlayerId, slotIndex: number): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-token-slot-index="${slotIndex}"]`) ?? undefined
}

function classicTokenTakeTargetElement(playerId: PlayerId, slotIndex: number): HTMLElement | undefined {
  return classicTokenSlotElement(playerId, Math.min(Math.max(slotIndex, 0), 9))
    ?? document.querySelector<HTMLElement>(`[data-token-slots-player="${playerId}"]`)
    ?? undefined
}

function classicTokenSlotElementByToken(state: GameState | undefined, playerId: PlayerId, token: Token): HTMLElement | undefined {
  const index = state?.players[playerId].tokenSlots.findIndex((slotToken) => slotToken.id === token.id) ?? -1
  if (index < 0) return undefined
  return document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-token-slot-index="${index}"] .tokenImage`)
    ?? document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-token-slot-index="${index}"]`)
    ?? undefined
}

function removeTokenTypeOccurrences(current: GemType[], removed: GemType[]): GemType[] {
  const remainingToRemove = new Map<GemType, number>()
  for (const tokenType of removed) remainingToRemove.set(tokenType, (remainingToRemove.get(tokenType) ?? 0) + 1)
  return current.filter((tokenType) => {
    const count = remainingToRemove.get(tokenType) ?? 0
    if (count <= 0) return true
    remainingToRemove.set(tokenType, count - 1)
    return false
  })
}

function reorderedTokenSlotIds(state: GameState, playerId: PlayerId, sourceIndex: number, rawTargetIndex: number): string[] | undefined {
  const tokenIds = state.players[playerId].tokenSlots.map((token) => token.id)
  if (sourceIndex < 0 || sourceIndex >= tokenIds.length || tokenIds.length <= 1) return undefined
  const targetIndex = Math.max(0, Math.min(rawTargetIndex, tokenIds.length - 1))
  if (sourceIndex === targetIndex) return undefined
  const [moved] = tokenIds.splice(sourceIndex, 1)
  if (!moved) return undefined
  tokenIds.splice(targetIndex, 0, moved)
  return tokenIds
}

function privilegeSlotKey(playerId: PlayerId, index: number): string {
  return `${playerId}:${index}`
}

function purchaseEligibleGems(state: GameState, playerId: PlayerId, cardId: number): GemType[] {
  if (!canAfford(state, playerId, cardId)) return []
  const card = getCard(cardId)
  if (card.wild) {
    const bonuses = playerStats(state, playerId).bonuses
    return GEM_TYPES.filter((gem) => bonuses[gem] > 0)
  }
  return card.color ? [card.color] : []
}

function canPurchaseCard(state: GameState, playerId: PlayerId, cardId: number, targetGem?: GemType): boolean {
  if (!canAfford(state, playerId, cardId)) return false
  const card = getCard(cardId)
  if (!card.wild) return true
  return Boolean(targetGem && playerStats(state, playerId).bonuses[targetGem] > 0)
}

function purchaseTargetForCarry(state: GameState, playerId: PlayerId, carry: CardCarry, clientX: number, clientY: number): PurchaseTargetPreview | undefined {
  if (!isPointerOverPurchasedPanel(state, clientX, clientY, playerId)) return undefined
  if (isColorlessCardId(carry.cardId)) {
    return {
      colorless: true,
      valid: canPurchaseCard(state, playerId, carry.cardId),
      eligibleGems: [],
    }
  }
  const card = getCard(carry.cardId)
  const column = purchasedColumnAtPoint(clientX, clientY)
  const eligibleGems = purchaseEligibleGems(state, playerId, carry.cardId)
  const gem = card.wild ? (column?.playerId === playerId ? column.gem : undefined) : card.color
  return {
    gem,
    valid: canPurchaseCard(state, playerId, carry.cardId, gem),
    eligibleGems,
  }
}

function pokemonEvolutionTargetForCarry(state: GameState, playerId: PlayerId, carry: CardCarry, clientX: number, clientY: number): boolean {
  if (!isPointerOverPurchasedPanel(state, clientX, clientY, playerId)) return false
  if (carry.source.type === 'deck' || carry.source.type === 'pokemonSpecial') return false
  const card = getCard(carry.cardId)
  if (card.deckKind !== 'common' || !card.evolvesFrom) return false
  return pokemonEvolutionBaseIndex(state, playerId, carry.cardId) >= 0
}

function pokemonEvolutionBaseIndex(state: GameState, playerId: PlayerId, targetCardId: number): number {
  const target = getCard(targetCardId)
  if (!target.evolvesFrom) return -1
  const bonuses = playerStats(state, playerId).bonuses
  return state.players[playerId].purchased.findIndex((purchased) => {
    const base = getCard(purchased.cardId)
    if (base.name !== target.evolvesFrom || !base.evolutionCost) return false
    return GEM_TYPES.every((gem) => bonuses[gem] >= base.evolutionCost![gem])
  })
}

function privilegeAwardHighlightForSelection(state: GameState, playerId: PlayerId, selection: TokenDragSelection | undefined): PrivilegeAwardHighlight | undefined {
  if (!selection?.valid) return undefined
  const tokens = selection.cellIds.flatMap((cellId) => {
    const token = state.board.find((cell) => cell.id === cellId)?.token
    return token ? [token] : []
  })
  if (tokens.length !== selection.cellIds.length) return undefined
  const sameThree = tokens.length === 3 && tokens.every((token) => token.type === tokens[0].type)
  const twoPearls = tokens.filter((token) => token.type === 'pearl').length === 2
  if (!sameThree && !twoPearls) return undefined
  const rule: Exclude<PrivilegeHintKind, 'replenish'> = twoPearls ? 'pearls' : 'sameColor'
  if (state.availablePrivileges > 0) return { type: 'supply', index: state.availablePrivileges - 1, rule }
  const sourceIndex = state.players[playerId].privileges - 1
  return sourceIndex >= 0 ? { type: 'player', playerId, index: sourceIndex, rule } : undefined
}

function privilegeAwardHighlightForReplenish(state: GameState, currentPlayerId: PlayerId): PrivilegeAwardHighlight | undefined {
  if (state.availablePrivileges > 0) return { type: 'supply', index: state.availablePrivileges - 1, rule: 'replenish' }
  const sourceIndex = state.players[currentPlayerId].privileges - 1
  return sourceIndex >= 0 ? { type: 'player', playerId: currentPlayerId, index: sourceIndex, rule: 'replenish' } : undefined
}

function winnerReasonLabel(reason: NonNullable<GameState['winner']>['reason']): string {
  if (reason === 'points') return '总声望达到 20'
  if (reason === 'crowns') return '皇冠达到 10'
  return '同一颜色声望达到 10'
}

function paymentSlotsForPayment(state: GameState, playerId: PlayerId, payment: Partial<Record<TokenType, number>>): PaymentSlot[] {
  const player = state.players[playerId]
  const tokens = player.tokenSlots.length ? player.tokenSlots : rebuildDisplayTokenSlots(player.tokens)
  const used = new Set<number>()
  const slots: PaymentSlot[] = []
  for (const type of [...GEM_TYPES, 'pearl', 'gold'] as const) {
    let remaining = payment[type] ?? 0
    for (let index = 0; index < tokens.length && remaining > 0; index += 1) {
      if (used.has(index) || tokens[index]?.type !== type) continue
      used.add(index)
      slots.push({ index, type })
      remaining -= 1
    }
  }
  return slots
}

function rebuildDisplayTokenSlots(counts: Record<TokenType, number>) {
  return ([...GEM_TYPES, 'pearl', 'gold'] as const).flatMap((type) => Array.from({ length: counts[type] }, (_, index) => ({ id: `${type}-${index}`, type })))
}

function tokenSlotElement(playerId: PlayerId, index: number): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-token-slot-index="${index}"]`) ?? undefined
}

function tokenElementForCell(cellId: string): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[data-cell-id="${cellId}"] .token`) ?? document.querySelector<HTMLElement>(`[data-cell-id="${cellId}"] .splendorStackedToken`) ?? undefined
}

function classicGoldCellId(state: GameState): string | undefined {
  if (!isClassicShellGame(state)) return state.board.find((cell) => cell.token?.type === 'gold')?.id
  return state.board.find((cell) => cell.token?.type === 'gold')?.id ?? (state.bag.some((token) => token.type === 'gold') ? 'bank:gold' : undefined)
}

function classicColorForRouteToken(token: TokenType): 'white' | 'blue' | 'green' | 'red' | 'brown' | 'gold' {
  if (token === 'gold') return 'gold'
  if (token === 'diamond') return 'white'
  if (token === 'sapphire') return 'blue'
  if (token === 'emerald') return 'green'
  if (token === 'ruby') return 'red'
  if (token === 'onyx') return 'brown'
  return 'white'
}

function privilegeSlotElement(playerId: PlayerId, index: number): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[data-privilege-slot-player="${playerId}"][data-privilege-slot-index="${index}"]`) ?? undefined
}

function gemBagTargetRect(): DOMRect | undefined {
  const bag = document.querySelector<HTMLElement>('[data-gem-bag-target]')
  return bag?.getBoundingClientRect()
}

function tokenSpendTargetRect(state: GameState, tokenType: TokenType): DOMRect | undefined {
  if (isClassicShellGame(state)) return classicBankTokenElement(tokenType)?.getBoundingClientRect()
  return gemBagTargetRect()
}

function tokenSpendFlights(state: GameState, playerId: PlayerId, slots: PaymentSlot[], duration: number, via?: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): TokenSpendAnimation | undefined {
  const tokens = slots.flatMap((slot) => {
    const element = tokenSlotElement(playerId, slot.index)?.querySelector<HTMLElement>('.tokenImage')
    const target = tokenSpendTargetRect(state, slot.type)
    if (!element || !target) return []
    const from = element.getBoundingClientRect()
    const size = from.width
    return [
      {
        id: `spend-${playerId}-${slot.index}-${performance.now()}`,
        type: slot.type,
        classic: isClassicShellGame(state),
        variant: shellVariant(state),
        fromX: from.left,
        fromY: from.top,
        toX: target.left + (target.width - size) / 2,
        toY: target.top + (target.height - size) / 2,
        viaX: via ? via.left + (via.width - size) / 2 : undefined,
        viaY: via ? via.top + (via.height - size) / 2 : undefined,
        size,
        duration,
      },
    ]
  })
  if (tokens.length === 0) return undefined
  return {
    tokens,
    hiddenSlotKeys: slots.map((slot) => tokenSlotKey(playerId, slot.index)),
    duration,
  }
}

function createClassicBankTakeTransitionAnimation(before: GameState, after: GameState, action: Extract<GameAction, { type: 'takeClassicBankTokens' }>): ClassicBankTakeAnimation | undefined {
  if (!isClassicShellGame(before) || !isClassicShellGame(after)) return undefined
  const beforeIds = new Set(before.players[action.playerId].tokenSlots.map((token) => token.id))
  const addedTokens = after.players[action.playerId].tokenSlots
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => !beforeIds.has(token.id) && GEM_TYPES.includes(token.type as GemType))
  if (addedTokens.length !== action.tokenTypes.length) return undefined
  const tokens = addedTokens.flatMap(({ token, index }, flightIndex) => {
    const source = classicBankTokenElement(token.type as GemType)
    const target = classicTokenTakeTargetElement(action.playerId, index)
    if (!source || !target) return []
    const from = source.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    const size = Math.min(from.width || 26, from.height || 26, 28)
    return [
      {
        id: `classic-bank-take-${action.playerId}-${token.id}-${performance.now()}`,
        type: token.type,
        classic: true,
        variant: shellVariant(before),
        fromX: from.left + (from.width - size) / 2,
        fromY: from.top + (from.height - size) / 2,
        toX: to.left + (to.width - size) / 2,
        toY: to.top + (to.height - size) / 2,
        size,
        duration: TAKE_TOKEN_ANIMATION_MS,
        delay: flightIndex * CLASSIC_TAKE_TOKEN_STAGGER_MS,
      },
    ]
  })
  if (tokens.length === 0) return undefined
  const duration = Math.max(...tokens.map((flight) => (flight.delay ?? 0) + (flight.duration ?? TAKE_TOKEN_ANIMATION_MS)))
  return {
    tokens,
    bankTokenTypes: addedTokens.map(({ token }) => token.type as GemType),
    hiddenSlotKeys: addedTokens.map(({ index }) => tokenSlotKey(action.playerId, index)),
    duration,
  }
}

function createClassicDiscardTransitionAnimation(before: GameState, action: Extract<GameAction, { type: 'discardToken' }>, viewerId?: PlayerId): TokenSpendAnimation | undefined {
  if (viewerId && action.playerId === viewerId) return undefined
  const player = before.players[action.playerId]
  const index = player.tokenSlots.findIndex((token) => (action.tokenId ? token.id === action.tokenId : token.type === action.tokenType))
  if (index < 0) return undefined
  const source = tokenSlotElement(action.playerId, index)?.querySelector<HTMLElement>('.tokenImage')
  const target = classicBankTokenElement(action.tokenType)
  if (!source || !target) return undefined
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const size = from.width
  return {
    tokens: [
      {
        id: `classic-discard-remote-${action.playerId}-${index}-${performance.now()}`,
        type: action.tokenType,
        classic: true,
        variant: shellVariant(before),
        fromX: from.left,
        fromY: from.top,
        toX: to.left + (to.width - size) / 2,
        toY: to.top + (to.height - size) / 2,
        size,
        duration: RETURN_ANIMATION_MS,
      },
    ],
    hiddenSlotKeys: [tokenSlotKey(action.playerId, index)],
    duration: RETURN_ANIMATION_MS,
  }
}

function reserveCardFlight(cardId: number, source: CardSource, playerId: PlayerId, reserveIndex: number, duration: number, faceDown = false, delay = 0, backOnly = false, classic = false, variant?: GameType): FlyingCard | undefined {
  const sourceElement = cardSourceElement(source, playerId)
  const target = reserveTargetRect(playerId, reserveIndex)
  if (!sourceElement || !target) return undefined
  const from = sourceElement.getBoundingClientRect()
  return {
    id: `reserve-card-${cardId}-${performance.now()}`,
    cardId,
    classic,
    variant,
    fromX: from.left,
    fromY: from.top,
    toX: target.left,
    toY: target.top,
    width: from.width,
    height: from.height,
    targetWidth: target.width,
    targetHeight: target.height,
    duration,
    delay,
    horizontal: true,
    targetRotation: target.rotation,
    targetInnerWidth: target.innerWidth,
    targetInnerHeight: target.innerHeight,
    faceDown,
    backOnly,
  }
}

function goldFlightToSlot(state: GameState, playerId: PlayerId, from: DOMRect | Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, duration: number, via?: DOMRect): FlyingToken | undefined {
  const slot = tokenSlotRect(state, playerId)
  if (!slot) return undefined
  const size = from.width
  const flight: FlyingToken = {
    id: `reserve-gold-${performance.now()}`,
    type: 'gold',
    classic: isClassicShellGame(state),
    variant: shellVariant(state),
    fromX: from.left,
    fromY: from.top,
    toX: slot.left + (slot.width - size) / 2,
    toY: slot.top + (slot.height - size) / 2,
    size,
    duration,
  }
  if (via) {
    flight.viaX = via.left + (via.width - size) / 2
    flight.viaY = via.top + (via.height - size) / 2
  }
  return flight
}

function createLocalReserveAnimation(state: GameState, playerId: PlayerId, source: CardSource, goldCellId: string, carry?: TokenCarry): ReserveAnimation | undefined {
  const cardId = findSourceCard(state, source)
  if (!cardId || !carry) return undefined
  const duration = RESERVE_ANIMATION_MS
  const token = goldFlightToSlot(state, playerId, { left: carry.x, top: carry.y, width: carry.width, height: carry.height }, duration)
  const card = reserveCardFlight(cardId, source, playerId, state.players[playerId].reserve.length, duration, source.type === 'deck', 0, source.type === 'deck', isClassicShellGame(state), shellVariant(state))
  if (!token && !card) return undefined
  return {
    tokens: token ? [token] : [],
    cards: card ? [card] : [],
    hiddenCellIds: [goldCellId],
    hiddenCardSources: [sourceMotionKey(source, playerId)],
    duration,
  }
}

function createReserveTransitionAnimation(before: GameState, after: GameState, skipPlayerId?: PlayerId, remoteGoldAnchor?: RemoteGoldAnchor, perspectivePlayerId?: PlayerId): ReserveAnimation | undefined {
  const transition = findReserveTransition(before, after)
  if (!transition || (skipPlayerId && transition.playerId === skipPlayerId)) return undefined
  const sourceElement = cardSourceElement(transition.source, transition.playerId)
  const sourceAnchor = remoteGoldAnchor?.cellId === transition.goldCellId ? remoteGoldAnchor : undefined
  const goldElement = tokenElementForCell(transition.goldCellId)
  const visibleGold = document.querySelector<HTMLElement>('[data-remote-gold-token]')
  if (!sourceElement && !goldElement && !sourceAnchor && !visibleGold) return undefined
  const cardRect = sourceElement?.getBoundingClientRect()
  const visibleGoldRect = visibleGold?.getBoundingClientRect()
  const anchoredGoldRect = sourceAnchor ? { left: sourceAnchor.left, top: sourceAnchor.top, width: sourceAnchor.size, height: sourceAnchor.size } : undefined
  const anchoredGoldAtCard = Boolean(anchoredGoldRect && cardRect && rectsShareCenter(anchoredGoldRect, cardRect, 6))
  const tokenSource = anchoredGoldAtCard ? anchoredGoldRect : visibleGoldRect ?? anchoredGoldRect ?? goldElement?.getBoundingClientRect()
  const tokenVia = tokenSource && cardRect && !anchoredGoldAtCard ? cardRect : undefined
  const cardDelay = tokenVia ? RESERVE_GOLD_JOIN_ANIMATION_MS : 0
  const tokenDuration = RESERVE_ANIMATION_MS + cardDelay
  const token = tokenSource ? goldFlightToSlot(before, transition.playerId, tokenSource, tokenDuration, tokenVia) : undefined
  const faceDown = shouldReserveFlightBeFaceDown(transition.source, transition.playerId, perspectivePlayerId)
  const card = reserveCardFlight(transition.cardId, transition.source, transition.playerId, before.players[transition.playerId].reserve.length, RESERVE_ANIMATION_MS, faceDown, cardDelay, transition.source.type === 'deck', isClassicShellGame(before), shellVariant(before))
  if (!token && !card) return undefined
  return {
    tokens: token ? [token] : [],
    cards: card ? [card] : [],
    hiddenCellIds: [transition.goldCellId],
    hiddenCardSources: [sourceMotionKey(transition.source, transition.playerId)],
    duration: Math.max(tokenDuration, RESERVE_ANIMATION_MS + cardDelay),
    clearRemoteGoldAnchor: Boolean(sourceAnchor),
  }
}

function shouldReserveFlightBeFaceDown(source: CardSource, ownerId: PlayerId, perspectivePlayerId?: PlayerId): boolean {
  if (source.type === 'deck') return true
  return Boolean(perspectivePlayerId && perspectivePlayerId !== ownerId)
}

function rectsShareCenter(
  first: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  second: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  tolerance: number,
): boolean {
  const firstCenterX = first.left + first.width / 2
  const firstCenterY = first.top + first.height / 2
  const secondCenterX = second.left + second.width / 2
  const secondCenterY = second.top + second.height / 2
  return Math.hypot(firstCenterX - secondCenterX, firstCenterY - secondCenterY) <= tolerance
}

function createLocalPurchaseSpendAnimation(state: GameState, playerId: PlayerId, cardId: number): TokenSpendAnimation | undefined {
  const payment = computePayment(state, playerId, cardId)
  if (!payment) return undefined
  const slots = paymentSlotsForPayment(state, playerId, payment)
  return tokenSpendFlights(state, playerId, slots, PURCHASE_TOKEN_ANIMATION_MS)
}

function createLocalPurchaseCardAnimation(state: GameState, playerId: PlayerId, carry: CardCarry, gem?: GemType): PurchaseCardAnimation | undefined {
  const target = purchaseCardTargetRect(state, playerId, carry.cardId, gem)
  if (!target) return undefined
  const reservePurchase = carry.source.type === 'reserve'
  const colorlessPurchase = isColorlessCardId(carry.cardId)
  const flightTarget = purchaseFlightTarget(target, carry.source, carry.width, carry.height, colorlessPurchase)
  const targetRotation = isClassicShellGame(state) ? purchaseTargetRotation(playerId) : 0
  return {
    cards: [
      {
        id: `purchase-card-${carry.cardId}-${performance.now()}`,
        cardId: carry.cardId,
        classic: isClassicShellGame(state),
        variant: shellVariant(state),
        fromX: carry.x,
        fromY: carry.y,
        toX: flightTarget.left,
        toY: flightTarget.top,
        width: carry.width,
        height: carry.height,
        targetWidth: flightTarget.width,
        targetHeight: flightTarget.height,
        duration: PURCHASE_CARD_ANIMATION_MS,
        reservePurchase,
        colorlessPurchase,
        targetRotation,
      },
    ],
    hiddenCardSources: [sourceMotionKey(carry.source, playerId)],
    duration: PURCHASE_CARD_ANIMATION_MS,
  }
}

function createLocalPokemonEvolutionAnimation(state: GameState, playerId: PlayerId, carry: CardCarry): PurchaseCardAnimation | undefined {
  const targetCard = getCard(carry.cardId)
  const evolvedTarget = purchaseCardTargetRect(state, playerId, carry.cardId, targetCard.color)
  const cards: FlyingCard[] = []
  if (evolvedTarget) {
    const flightTarget = purchaseFlightTarget(evolvedTarget, carry.source, carry.width, carry.height, false)
    cards.push({
      id: `pokemon-evolution-target-${carry.cardId}-${performance.now()}`,
      cardId: carry.cardId,
      classic: true,
      variant: 'pokemon',
      fromX: carry.x,
      fromY: carry.y,
      toX: flightTarget.left,
      toY: flightTarget.top,
      width: carry.width,
      height: carry.height,
      targetWidth: flightTarget.width,
      targetHeight: flightTarget.height,
      duration: PURCHASE_CARD_ANIMATION_MS,
      targetRotation: purchaseTargetRotation(playerId),
      reservePurchase: carry.source.type === 'reserve',
    })
  }

  const player = state.players[playerId]
  const baseIndex = pokemonEvolutionBaseIndex(state, playerId, carry.cardId)
  const base = baseIndex >= 0 ? player.purchased[baseIndex] : undefined
  const baseKey = baseIndex >= 0 ? purchasedCardKey(playerId, baseIndex) : undefined
  const baseElement = baseKey ? document.querySelector<HTMLElement>(`[data-purchased-card-key="${baseKey}"]`) : undefined
  const pileElement = document.querySelector<HTMLElement>('[data-pokemon-evolution-pile]')
  const baseRect = baseElement?.getBoundingClientRect()
  const pileRect = pileElement?.getBoundingClientRect()
  if (base && baseRect && pileRect && pileRect.width > 0 && pileRect.height > 0) {
    cards.push({
      id: `pokemon-evolution-base-${base.cardId}-${performance.now()}`,
      cardId: base.cardId,
      classic: true,
      variant: 'pokemon',
      fromX: baseRect.left,
      fromY: baseRect.top,
      toX: pileRect.left,
      toY: pileRect.top,
      width: baseRect.width,
      height: baseRect.height,
      targetWidth: pileRect.width,
      targetHeight: pileRect.height,
      duration: RESERVE_ANIMATION_MS,
      faceDown: true,
      evolutionBase: true,
    })
  }
  if (cards.length === 0) return undefined
  return {
    cards,
    hiddenCardSources: [sourceMotionKey(carry.source, playerId)],
    hiddenPurchasedCardKeys: baseKey ? [baseKey] : [],
    duration: Math.max(...cards.map((card) => card.duration + (card.delay ?? 0))),
  }
}

function createPokemonEvolutionTransitionAnimation(
  before: GameState,
  after: GameState,
  action: Extract<GameAction, { type: 'evolvePokemon' }>,
  viewerId?: PlayerId,
): PurchaseCardAnimation | undefined {
  if (viewerId && action.playerId === viewerId) return undefined
  if (before.gameType !== 'pokemon' || after.gameType !== 'pokemon') return undefined
  const targetCardId = findSourceCard(before, action.source)
  if (!targetCardId) return undefined
  const targetCard = getCard(targetCardId)
  const player = before.players[action.playerId]
  const baseIndex = pokemonEvolutionBaseIndex(before, action.playerId, targetCardId)
  const base = baseIndex >= 0 ? player.purchased[baseIndex] : undefined
  const sourceElement = cardSourceElement(action.source, action.playerId)
  const targetRect = purchaseCardTargetRect(before, action.playerId, targetCardId, targetCard.color)
  const sourceRect = sourceElement?.getBoundingClientRect()
  const cards: FlyingCard[] = []
  if (sourceRect && targetRect) {
    const flightTarget = purchaseFlightTarget(targetRect, action.source, sourceRect.width, sourceRect.height, false)
    cards.push({
      id: `remote-pokemon-evolution-target-${action.playerId}-${targetCardId}-${performance.now()}`,
      cardId: targetCardId,
      classic: true,
      variant: 'pokemon',
      fromX: sourceRect.left,
      fromY: sourceRect.top,
      toX: flightTarget.left,
      toY: flightTarget.top,
      width: sourceRect.width,
      height: sourceRect.height,
      targetWidth: flightTarget.width,
      targetHeight: flightTarget.height,
      duration: PURCHASE_CARD_ANIMATION_MS,
      targetRotation: purchaseTargetRotation(action.playerId),
      reservePurchase: action.source.type === 'reserve',
    })
  }

  const baseKey = baseIndex >= 0 ? purchasedCardKey(action.playerId, baseIndex) : undefined
  const baseElement = baseKey ? document.querySelector<HTMLElement>(`[data-purchased-card-key="${baseKey}"]`) : undefined
  const pileElement = document.querySelector<HTMLElement>('[data-pokemon-evolution-pile]')
  const baseRect = baseElement?.getBoundingClientRect()
  const pileRect = pileElement?.getBoundingClientRect()
  if (base && baseRect && pileRect && pileRect.width > 0 && pileRect.height > 0) {
    cards.push({
      id: `remote-pokemon-evolution-base-${action.playerId}-${base.cardId}-${performance.now()}`,
      cardId: base.cardId,
      classic: true,
      variant: 'pokemon',
      fromX: baseRect.left,
      fromY: baseRect.top,
      toX: pileRect.left,
      toY: pileRect.top,
      width: baseRect.width,
      height: baseRect.height,
      targetWidth: pileRect.width,
      targetHeight: pileRect.height,
      duration: RESERVE_ANIMATION_MS,
      faceDown: true,
      evolutionBase: true,
    })
  }
  if (cards.length === 0) return undefined
  return {
    cards,
    hiddenCardSources: [sourceMotionKey(action.source, action.playerId)],
    hiddenPurchasedCardKeys: baseKey ? [baseKey] : [],
    duration: Math.max(...cards.map((card) => card.duration + (card.delay ?? 0))),
  }
}

function createPurchaseCardTransitionAnimation(before: GameState, after: GameState, viewerId?: PlayerId): PurchaseCardAnimation | undefined {
  const transition = findPurchaseTransition(before, after)
  if (!transition || (viewerId && transition.playerId === viewerId) || !transition.source) return undefined
  const sourceElement = cardSourceElement(transition.source, transition.playerId)
  const target = purchaseCardTargetRect(before, transition.playerId, transition.cardId, transition.wildColor)
  if (!sourceElement || !target) return undefined
  const from = sourceElement.getBoundingClientRect()
  const slots = purchaseSpentSlots(before, after, transition.playerId)
  const delay = slots.length > 0 ? PURCHASE_TOKEN_JOIN_ANIMATION_MS : 0
  const reservePurchase = transition.source.type === 'reserve'
  const colorlessPurchase = isColorlessCardId(transition.cardId)
  const flightTarget = purchaseFlightTarget(target, transition.source, from.width, from.height, colorlessPurchase)
  const targetRotation = isClassicShellGame(before) ? purchaseTargetRotation(transition.playerId) : 0
  return {
    cards: [
      {
        id: `remote-purchase-card-${transition.playerId}-${transition.cardId}-${performance.now()}`,
        cardId: transition.cardId,
        classic: isClassicShellGame(before),
        variant: shellVariant(before),
        fromX: from.left,
        fromY: from.top,
        toX: flightTarget.left,
        toY: flightTarget.top,
        width: from.width,
        height: from.height,
        targetWidth: flightTarget.width,
        targetHeight: flightTarget.height,
        duration: PURCHASE_CARD_ANIMATION_MS,
        delay,
        reservePurchase,
        revealBeforeFlight: reservePurchase && Boolean(viewerId && transition.playerId !== viewerId),
        colorlessPurchase,
        targetRotation,
      },
    ],
    hiddenCardSources: [sourceMotionKey(transition.source, transition.playerId)],
    duration: PURCHASE_CARD_ANIMATION_MS + delay,
  }
}

function createPurchaseTransitionAnimation(before: GameState, after: GameState, viewerId?: PlayerId): TokenSpendAnimation | undefined {
  const transition = findPurchaseTransition(before, after)
  if (!transition || (viewerId && transition.playerId === viewerId)) return undefined
  const slots = purchaseSpentSlots(before, after, transition.playerId)
  if (slots.length === 0) return undefined
  const sourceElement = transition.source ? cardSourceElement(transition.source, transition.playerId) : undefined
  const via = sourceElement?.getBoundingClientRect()
  const duration = via ? PURCHASE_CARD_ANIMATION_MS + PURCHASE_TOKEN_JOIN_ANIMATION_MS : PURCHASE_TOKEN_ANIMATION_MS
  return tokenSpendFlights(before, transition.playerId, slots, duration, via)
}

function createTakeTokensTransitionAnimation(before: GameState, after: GameState, viewerId?: PlayerId): BoardTokenTakeAnimation | undefined {
  for (const playerId of before.playerOrder) {
    if (viewerId && playerId === viewerId) continue
    if (after.players[playerId].purchased.length !== before.players[playerId].purchased.length) continue
    if (after.players[playerId].reserve.length !== before.players[playerId].reserve.length) continue
    if (after.players[playerId].privileges < before.players[playerId].privileges) continue
    const beforeTokenIds = new Set(before.players[playerId].tokenSlots.map((token) => token.id))
    const addedTokens = after.players[playerId].tokenSlots
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => !beforeTokenIds.has(token.id))
    const beforeCellsByTokenId = new Map(before.board.flatMap((cell) => (cell.token ? [[cell.token.id, cell] as const] : [])))
    const cells = addedTokens.flatMap(({ token }) => {
      const cell = beforeCellsByTokenId.get(token.id)
      if (!cell || after.board.find((next) => next.id === cell.id)?.token) return []
      return [cell]
    })
    if (cells.length < 1 || cells.length > 3) continue
    if (cells.some((cell) => cell.token?.type === 'gold')) continue
    const targetIndexByTokenId = new Map(addedTokens.map(({ token, index }) => [token.id, index]))
    const selection: TokenDragSelection = { originId: cells[0].id, cellIds: cells.map((cell) => cell.id), valid: true }
    const tokens = createTakeTokenFlights(before, playerId, selection, targetIndexByTokenId).map((token) => ({ ...token, duration: TAKE_TOKEN_ANIMATION_MS }))
    if (tokens.length === 0) continue
    return { tokens, hiddenCellIds: selection.cellIds, duration: TAKE_TOKEN_ANIMATION_MS }
  }
  return undefined
}

function createBoardTokenTakeTransitionAnimation(before: GameState, after: GameState, playerId: PlayerId): BoardTokenTakeAnimation | undefined {
  if (after.players[playerId].tokenSlots.length !== before.players[playerId].tokenSlots.length + 1) return undefined
  const beforeTokenIds = new Set(before.players[playerId].tokenSlots.map((token) => token.id))
  const addedToken = after.players[playerId].tokenSlots.map((token, index) => ({ token, index })).find(({ token }) => !beforeTokenIds.has(token.id))
  if (!addedToken) return undefined
  const cell = before.board.find((item) => item.token?.id === addedToken.token.id)
  if (!cell || after.board.find((item) => item.id === cell.id)?.token) return undefined
  const selection: TokenDragSelection = { originId: cell.id, cellIds: [cell.id], valid: true }
  const targetIndexByTokenId = new Map([[addedToken.token.id, addedToken.index]])
  const tokens = createTakeTokenFlights(before, playerId, selection, targetIndexByTokenId).map((token) => ({ ...token, duration: TAKE_TOKEN_ANIMATION_MS }))
  if (tokens.length === 0) return undefined
  return { tokens, hiddenCellIds: [cell.id], duration: TAKE_TOKEN_ANIMATION_MS }
}

function createCardAbilityTokenAnimation(before: GameState, after: GameState): BoardTokenTakeAnimation | undefined {
  for (const playerId of before.playerOrder) {
    if (after.players[playerId].purchased.length !== before.players[playerId].purchased.length + 1) continue
    const afterTokenIds = new Set(after.players[playerId].tokenSlots.map((token) => token.id))
    const afterBoardTokens = new Set(after.board.flatMap((cell) => (cell.token ? [cell.token.id] : [])))
    const hiddenCellIds: string[] = []
    const flights = before.board.flatMap((cell) => {
      if (!cell.token || !afterTokenIds.has(cell.token.id) || afterBoardTokens.has(cell.token.id)) return []
      const tokenElement = document.querySelector<HTMLElement>(`[data-cell-id="${cell.id}"] .token`)
      const targetIndex = after.players[playerId].tokenSlots.findIndex((token) => token.id === cell.token?.id)
      const targetSlot = document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-token-slot-index="${Math.min(Math.max(targetIndex, 0), 9)}"]`)
      if (!tokenElement || !targetSlot) return []
      const from = tokenElement.getBoundingClientRect()
      const to = targetSlot.getBoundingClientRect()
      const size = from.width
      hiddenCellIds.push(cell.id)
      return [
        {
          id: `card-ability-${cell.id}-${cell.token.id}-${performance.now()}`,
          type: cell.token.type,
          fromX: from.left,
          fromY: from.top,
          toX: to.left + (to.width - size) / 2,
          toY: to.top + (to.height - size) / 2,
          size,
          duration: TAKE_TOKEN_ANIMATION_MS,
        },
      ]
    })
    if (flights.length === 0) continue
    return {
      tokens: flights,
      hiddenCellIds,
      duration: TAKE_TOKEN_ANIMATION_MS,
    }
  }
  return undefined
}

function createPrivilegeTransitionAnimation(
  before: GameState,
  after: GameState,
  options: { sourceCarry?: PrivilegeCarry; remoteAnchor?: RemotePrivilegeAnchor } = {},
): PrivilegeUseAnimation | undefined {
  for (const playerId of before.playerOrder) {
    if (after.players[playerId].privileges !== before.players[playerId].privileges - 1) continue
    if (after.availablePrivileges !== before.availablePrivileges + 1) continue
    if (after.players[playerId].tokenSlots.length !== before.players[playerId].tokenSlots.length + 1) continue
    const beforeTokenIds = new Set(before.players[playerId].tokenSlots.map((token) => token.id))
    const addedToken = after.players[playerId].tokenSlots.map((token, index) => ({ token, index })).find(({ token }) => !beforeTokenIds.has(token.id))
    const addedTokenId = addedToken?.token.id
    const cell = before.board.find((item) => item.token?.id === addedTokenId)
    if (!cell) continue
    const tokenSelection = { originId: cell.id, cellIds: [cell.id], valid: true }
    const targetIndexByTokenId = addedToken ? new Map([[addedToken.token.id, addedToken.index]]) : undefined
    const tokenFlights = createTakeTokenFlights(before, playerId, tokenSelection, targetIndexByTokenId).map((token) => ({ ...token, duration: TAKE_TOKEN_ANIMATION_MS }))

    const sourceIndex = before.players[playerId].privileges - 1
    const sourceOverride =
      options.sourceCarry && options.sourceCarry.index >= 0
        ? { left: options.sourceCarry.x, top: options.sourceCarry.y, width: options.sourceCarry.width, height: options.sourceCarry.height }
        : options.remoteAnchor?.playerId === playerId
          ? { left: options.remoteAnchor.left, top: options.remoteAnchor.top, width: options.remoteAnchor.width, height: options.remoteAnchor.height }
          : undefined
    const sourceElement = sourceOverride ? undefined : privilegeSlotElement(playerId, sourceIndex)
    const targetElement = document.querySelector<HTMLElement>(`[data-privilege-supply-index="${before.availablePrivileges}"]`)
    const source = sourceOverride ?? sourceElement?.getBoundingClientRect()
    const target = targetElement?.getBoundingClientRect()
    const scrolls =
      source && target
        ? [
            {
              id: `privilege-use-${playerId}-${sourceIndex}-${performance.now()}`,
              fromX: source.left,
              fromY: source.top,
              toX: target.left + (target.width - source.width) / 2,
              toY: target.top + (target.height - source.height) / 2,
              width: source.width,
              height: source.height,
              targetWidth: source.width,
              targetHeight: source.height,
              targetTilt: 0,
              duration: PRIVILEGE_GAIN_ANIMATION_MS,
            },
          ]
        : []
    const hiddenPrivilegeSlotKeys = [
      sourceIndex,
      options.sourceCarry?.index,
      options.remoteAnchor?.playerId === playerId ? options.remoteAnchor.index : undefined,
    ].flatMap((index) => (index === undefined ? [] : [privilegeSlotKey(playerId, index)]))
    if (tokenFlights.length === 0 && scrolls.length === 0) continue
    return {
      tokens: tokenFlights,
      scrolls,
      hiddenCellIds: [cell.id],
      hiddenPrivilegeSlotKeys: [...new Set(hiddenPrivilegeSlotKeys)],
      clearRemotePrivilegeAnchor: options.remoteAnchor?.playerId === playerId,
      duration: Math.max(TAKE_TOKEN_ANIMATION_MS, scrolls[0]?.duration ?? 0),
    }
  }
  return undefined
}

function createPrivilegeGainTransitionAnimation(before: GameState, after: GameState): PrivilegeGainAnimation | undefined {
  for (const playerId of before.playerOrder) {
    if (after.players[playerId].privileges !== before.players[playerId].privileges + 1) continue
    const targetIndex = before.players[playerId].privileges
    const target = privilegeSlotElement(playerId, targetIndex)?.getBoundingClientRect()
    if (!target) continue

    const publicSourceIndex = before.availablePrivileges > after.availablePrivileges ? before.availablePrivileges - 1 : undefined
    const sourceElement =
      publicSourceIndex !== undefined
        ? document.querySelector<HTMLElement>(`[data-privilege-supply-index="${publicSourceIndex}"] img`)
        : privilegeSlotElement(playerId === 'p1' ? 'p2' : 'p1', before.players[playerId === 'p1' ? 'p2' : 'p1'].privileges - 1)
    const source = sourceElement?.getBoundingClientRect()
    if (!source) continue

    const targetHeight = target.height * 1.12
    const targetWidth = targetHeight * (276 / 768)
    return {
      scrolls: [
        {
          id: `privilege-gain-${playerId}-${targetIndex}-${performance.now()}`,
          fromX: source.left,
          fromY: source.top,
          toX: target.left + (target.width - targetWidth) / 2,
          toY: target.top + (target.height - targetHeight) / 2,
          width: source.width,
          height: source.height,
          targetWidth,
          targetHeight,
          targetTilt: privilegeTilt(playerId, targetIndex),
          duration: PRIVILEGE_GAIN_ANIMATION_MS,
        },
      ],
      hiddenSupplyIndexes: publicSourceIndex === undefined ? [] : [publicSourceIndex],
      duration: PRIVILEGE_GAIN_ANIMATION_MS,
    }
  }
  return undefined
}

const PRIVILEGE_TILTS = [-13, -7, 4, 9, 15] as const

function privilegeTilt(playerId: PlayerId, index: number): number {
  const seed = playerId === 'p1' ? 3 : 7
  return PRIVILEGE_TILTS[(seed + index * 2) % PRIVILEGE_TILTS.length]
}

function createMarketReplacementAnimation(before: GameState, after: GameState, delay: number): MarketReplacementAnimation | undefined {
  if (before.status !== 'playing' || after.status !== 'playing') return undefined
  const replacements: Array<{ sourceKey: string; flight: IntroCardFlight }> = ([3, 2, 1] as const).flatMap((tier) =>
    before.market[tier].flatMap((beforeCardId, index) => {
      const afterCardId = after.market[tier][index]
      if (!beforeCardId || !afterCardId || beforeCardId === afterCardId) return []
      const deck = document.querySelector<HTMLElement>(`[data-deck-tier="${tier}"]`)?.getBoundingClientRect()
      const target = cardSourceElement({ type: 'market', tier, index })?.getBoundingClientRect()
      if (!deck || !target) return []
      return [
        {
          sourceKey: sourceKey({ type: 'market', tier, index }),
          flight: {
            id: `market-replace-${tier}-${index}-${afterCardId}-${performance.now()}`,
            cardId: afterCardId,
            classic: isClassicShellGame(before),
            variant: shellVariant(before),
            tier,
            sourceKey: sourceKey({ type: 'market', tier, index }),
            fromX: deck.left,
            fromY: deck.top,
            toX: target.left,
            toY: target.top,
            width: target.width,
            height: target.height,
            delay,
            duration: MARKET_REPLACEMENT_CARD_ANIMATION_MS,
          },
        },
      ]
    }),
  )
  if (before.gameType === 'pokemon' && after.gameType === 'pokemon') {
    for (const deck of ['rare', 'legendary'] as const) {
      const beforeCardId = deck === 'rare' ? before.pokemonSpecial?.rareFaceUp : before.pokemonSpecial?.legendaryFaceUp
      const afterCardId = deck === 'rare' ? after.pokemonSpecial?.rareFaceUp : after.pokemonSpecial?.legendaryFaceUp
      if (!beforeCardId || !afterCardId || beforeCardId === afterCardId) continue
      const source: CardSource = { type: 'pokemonSpecial', deck }
      const deckRect = document.querySelector<HTMLElement>(`[data-card-source-key="${sourceKey(source)}:deck"]`)?.getBoundingClientRect()
      const target = cardSourceElement(source)?.getBoundingClientRect()
      if (!deckRect || !target) continue
      replacements.push({
        sourceKey: sourceKey(source),
        flight: {
          id: `pokemon-special-replace-${deck}-${afterCardId}-${performance.now()}`,
          cardId: afterCardId,
          classic: true,
          variant: 'pokemon',
          tier: 3,
          deckKind: deck,
          sourceKey: sourceKey(source),
          fromX: deckRect.left,
          fromY: deckRect.top,
          toX: target.left,
          toY: target.top,
          width: target.width,
          height: target.height,
          delay,
          duration: MARKET_REPLACEMENT_CARD_ANIMATION_MS,
        },
      })
    }
  }
  const cards = replacements.map((replacement) => replacement.flight)
  if (cards.length === 0) return undefined
  return {
    cards,
    hiddenCardSources: replacements.map((replacement) => replacement.sourceKey),
    duration: Math.max(...cards.map((card) => card.delay + card.duration)),
  }
}

function createReplenishTransitionAnimation(before: GameState, after: GameState): ReplenishAnimation | undefined {
  if (before.status !== 'playing' || after.status !== 'playing') return undefined
  const beforeCells = new Map(before.board.map((cell) => [cell.id, cell]))
  const afterCells = new Map(after.board.map((cell) => [cell.id, cell]))
  const bag = document.querySelector<HTMLElement>('[data-gem-bag-target]')?.getBoundingClientRect()
  if (!bag) return undefined
  const fromCenterX = bag.left + bag.width / 2
  const fromCenterY = bag.top + bag.height / 2
  let order = 0
  const tokens = SPIRAL_CELL_IDS.flatMap((cellId) => {
    const beforeCell = beforeCells.get(cellId)
    const afterCell = afterCells.get(cellId)
    if (beforeCell?.token || !afterCell?.token) return []
    const cellElement = document.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`)
    const cellRect = cellElement?.getBoundingClientRect()
    if (!cellRect) return []
    const size = Math.min(cellRect.width * 0.72, 58)
    const delay = order * REPLENISH_TOKEN_STAGGER_MS
    order += 1
    return [
      {
        id: `replenish-${cellId}-${afterCell.token.id}-${performance.now()}`,
        type: afterCell.token.type,
        fromX: fromCenterX - size / 2,
        fromY: fromCenterY - size / 2,
        toX: cellRect.left + (cellRect.width - size) / 2,
        toY: cellRect.top + (cellRect.height - size) / 2,
        size,
        duration: REPLENISH_TOKEN_ANIMATION_MS,
        delay,
      },
    ]
  })
  if (tokens.length === 0) return undefined
  const duration = Math.max(...tokens.map((flight) => (flight.delay ?? 0) + (flight.duration ?? REPLENISH_TOKEN_ANIMATION_MS)))
  return { tokens, duration }
}

function createTakeTokenFlights(state: GameState, playerId: PlayerId, selection: TokenDragSelection, targetIndexByTokenId?: Map<string, number>): FlyingToken[] {
  const cellsById = new Map(state.board.map((cell) => [cell.id, cell]))
  const playerTokenCount = state.players[playerId].tokenSlots.length || Object.values(state.players[playerId].tokens).reduce((sum, count) => sum + count, 0)
  return selection.cellIds.flatMap((cellId, index) => {
    const cell = cellsById.get(cellId)
    if (!cell?.token) return []
    const tokenElement = document.querySelector<HTMLElement>(`[data-cell-id="${cellId}"] .token`)
    const targetIndex = targetIndexByTokenId?.get(cell.token.id) ?? playerTokenCount + index
    const targetSlot = document.querySelector<HTMLElement>(`[data-token-slot-player="${playerId}"][data-token-slot-index="${Math.min(Math.max(targetIndex, 0), 9)}"]`)
    if (!tokenElement || !targetSlot) return []
    const from = tokenElement.getBoundingClientRect()
    const to = targetSlot.getBoundingClientRect()
    const size = from.width
    return [
      {
        id: `${cellId}-${cell.token.id}-${performance.now()}`,
        type: cell.token.type,
        fromX: from.left,
        fromY: from.top,
        toX: to.left + (to.width - size) / 2,
        toY: to.top + (to.height - size) / 2,
        size,
      },
    ]
  })
}

function isCarriedTokenCell(carry: TokenCarry | undefined, cellId: string): boolean {
  if (!carry) return false
  return carry.cellId === cellId
}

function computeDraggedTokenSelection(state: GameState, originId: string, clientX: number, clientY: number, board: HTMLDivElement): TokenDragSelection {
  const origin = state.board.find((cell) => cell.id === originId)
  if (!origin?.token || origin.token.type === 'gold') return { originId, cellIds: [], valid: false }
  const style = getComputedStyle(board)
  const rect = board.getBoundingClientRect()
  const padX = Number.parseFloat(style.paddingLeft) || 0
  const padY = Number.parseFloat(style.paddingTop) || 0
  const gapX = Number.parseFloat(style.columnGap) || 0
  const gapY = Number.parseFloat(style.rowGap) || 0
  const cellWidth = (rect.width - padX - (Number.parseFloat(style.paddingRight) || padX) - gapX * 4) / 5
  const cellHeight = (rect.height - padY - (Number.parseFloat(style.paddingBottom) || padY) - gapY * 4) / 5
  const strideX = cellWidth + gapX
  const strideY = cellHeight + gapY
  const originCenterX = rect.left + padX + origin.x * strideX + cellWidth / 2
  const originCenterY = rect.top + padY + origin.y * strideY + cellHeight / 2
  const dx = clientX - originCenterX
  const dy = clientY - originCenterY
  const minDragDistance = Math.min(cellWidth, cellHeight) * 0.36
  if (Math.hypot(dx, dy) < minDragDistance) return { originId, cellIds: [origin.id], valid: true }

  let bestDirection: (typeof BOARD_DIRECTIONS)[number] = [0, 1]
  let bestScore = -Infinity
  for (const direction of BOARD_DIRECTIONS) {
    const [dirX, dirY] = direction
    const length = Math.hypot(dirX * strideX, dirY * strideY)
    const score = (dx * dirX * strideX + dy * dirY * strideY) / length
    if (score > bestScore) {
      bestScore = score
      bestDirection = direction
    }
  }

  const stepDistance = Math.hypot(bestDirection[0] * strideX, bestDirection[1] * strideY)
  const count = Math.max(1, Math.min(3, 1 + Math.floor((bestScore + stepDistance * 0.42) / stepDistance)))
  const cellsById = new Map(state.board.map((cell) => [cell.id, cell]))
  const ids = [origin.id]
  for (let step = 1; step < count; step += 1) {
    const nextX = origin.x + bestDirection[0] * step
    const nextY = origin.y + bestDirection[1] * step
    const next = cellsById.get(`${nextX}:${nextY}`)
    if (!next?.token || next.token.type === 'gold') return { originId, cellIds: ids, valid: false, invalidPoint: { x: nextX, y: nextY } }
    ids.push(next.id)
  }
  return { originId, cellIds: ids, valid: true }
}

function BoardArrowLayer() {
  const [layout, setLayout] = useState<BoardPathLayout>()

  useEffect(() => {
    let frame = 0
    const measure = () => {
      const board = document.querySelector<HTMLElement>('.tokenBoard')
      if (!board) return
      const boardRect = board.getBoundingClientRect()
      const points = SPIRAL_CELL_IDS.flatMap((cellId) => {
        const cell = board.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`)
        if (!cell) return []
        const rect = cell.getBoundingClientRect()
        return [
          {
            x: rect.left - boardRect.left + rect.width / 2,
            y: rect.top - boardRect.top + rect.height / 2,
          },
        ]
      })
      if (points.length !== SPIRAL_CELL_IDS.length) return
      setLayout({ width: boardRect.width, height: boardRect.height, points })
    }
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    schedule()
    const board = document.querySelector<HTMLElement>('.tokenBoard')
    const observer = board ? new ResizeObserver(schedule) : undefined
    if (board && observer) observer.observe(board)
    window.addEventListener('resize', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])

  const points = layout?.points ?? []
  const pathPoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const arrows = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]
    return {
      key: `${SPIRAL_CELL_IDS[index]}-${SPIRAL_CELL_IDS[index + 1]}`,
      x: (point.x + next.x) / 2,
      y: (point.y + next.y) / 2,
      rotation: (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI,
    }
  })

  return (
    <svg className="boardPathHints" viewBox={`0 0 ${layout?.width ?? 1} ${layout?.height ?? 1}`} preserveAspectRatio="none" aria-hidden="true">
      {layout && <polyline className="boardPathLine" points={pathPoints} />}
      {arrows.map((arrow) => (
        <path className="boardPathArrow" d="M -6 -4.5 L 0 0 L -6 4.5" transform={`translate(${arrow.x.toFixed(1)} ${arrow.y.toFixed(1)}) rotate(${arrow.rotation.toFixed(1)})`} key={arrow.key} />
      ))}
    </svg>
  )
}

function GemBagPanel({
  state,
  displayTotal,
  movingPrivilegeSupplyIndexes = [],
  highlightedPrivilegeSupplyIndex,
  canReplenish,
  canAct,
  remoteHovered,
  tutorialTarget,
  canOpenBoardFocus,
  onReplenish,
  onOpenBoardFocus,
  onReplenishPointerEnter,
  onReplenishPointerLeave,
}: {
  state: GameState
  displayTotal?: number
  movingPrivilegeSupplyIndexes?: number[]
  highlightedPrivilegeSupplyIndex?: number
  canReplenish?: boolean
  canAct?: boolean
  remoteHovered?: boolean
  tutorialTarget?: boolean
  canOpenBoardFocus?: boolean
  onReplenish?: () => void
  onOpenBoardFocus?: () => void
  onReplenishPointerEnter?: () => void
  onReplenishPointerLeave?: () => void
}) {
  const total = displayTotal ?? state.bag.length
  return (
    <aside className={total > 0 ? 'gemBagPanel' : 'gemBagPanel emptyBag'} aria-label={`宝石袋剩余 ${total} 枚`}>
      {canReplenish && (
        <button
          className={`replenishButton ${remoteHovered ? 'remoteHover' : ''}`}
          disabled={!canAct}
          onClick={onReplenish}
          onPointerEnter={onReplenishPointerEnter}
          onPointerLeave={onReplenishPointerLeave}
          data-tutorial-replenish={tutorialTarget ? '' : undefined}
          title="补棋盘"
          aria-label="补棋盘"
        >
          <RefreshCw size={18} />
        </button>
      )}
      <div className="gemBagShell" data-gem-bag-target>
        <img className="gemBagIcon" src={assetPath('gem-bag.png')} alt="" draggable={false} />
        <strong>{total}</strong>
      </div>
      {canOpenBoardFocus && (
        <button className="mobileBoardFocusButton" type="button" onClick={onOpenBoardFocus} aria-label="放大棋盘" title="放大棋盘">
          <Maximize2 size={16} />
        </button>
      )}
      <div className="privilegeSupply" aria-label={`公共特权卷轴剩余 ${state.availablePrivileges} 张`}>
        {Array.from({ length: 3 }).map((_, index) => (
          <span
            className={`${index < state.availablePrivileges ? 'privilegeScroll available' : 'privilegeScroll'} ${movingPrivilegeSupplyIndexes.includes(index) ? 'privilegeMovingHidden' : ''} ${highlightedPrivilegeSupplyIndex === index ? 'highlightedAwardPrivilege' : ''}`}
            data-privilege-supply-index={index}
            key={index}
          >
            <img src={assetPath('privilege.png')} alt="" draggable={false} />
          </span>
        ))}
      </div>
    </aside>
  )
}

function BoardPrivilegeHints({ activeKind }: { activeKind?: PrivilegeHintKind }) {
  const hints: Array<{ kind: PrivilegeHintKind; src: string; label: string }> = [
    { kind: 'pearls', src: assetPath('privilege-hints/privilege-hint-pearls.png'), label: '拿取两个珍珠时，对手获得特权卷轴' },
    { kind: 'replenish', src: assetPath('privilege-hints/privilege-hint-replenish.png'), label: '补充棋盘时，对手获得特权卷轴' },
    { kind: 'sameColor', src: assetPath('privilege-hints/privilege-hint-same-color.png'), label: '拿取三个同色 token 时，对手获得特权卷轴' },
  ]
  return (
    <div className="boardPrivilegeHints" aria-label="特权卷轴规则提示">
      {hints.map((hint) => (
        <span className={activeKind === hint.kind ? 'boardPrivilegeHint activeRuleHint' : 'boardPrivilegeHint'} title={hint.label} key={hint.kind}>
          <img src={hint.src} alt="" draggable={false} />
        </span>
      ))}
    </div>
  )
}

function TokenTakeSelectionLayer({ state, selection, remote = false }: { state: GameState; selection: TokenDragSelection; remote?: boolean }) {
  const selectedCells = selection.cellIds.map((id) => state.board.find((cell) => cell.id === id)).filter((cell): cell is BoardCell => Boolean(cell))
  if (selectedCells.length === 0) return null
  const invalidPoint = selection.invalidPoint && isBoardPoint(selection.invalidPoint) ? selection.invalidPoint : undefined
  return (
    <div className={`${selection.valid ? 'boardTakeOverlay' : 'boardTakeOverlay invalidTake'} ${remote ? 'remoteTakeOverlay' : ''}`} aria-hidden="true">
      {selectedCells.map((cell) => (
        <span className="boardTakeTile" style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 } as CSSProperties} key={cell.id} />
      ))}
      {invalidPoint && (
        <span className="boardTakeTile invalidTarget" style={{ gridColumn: invalidPoint.x + 1, gridRow: invalidPoint.y + 1 } as CSSProperties}>
          <span className="boardTakeCross" />
        </span>
      )}
    </div>
  )
}

function isBoardPoint(point: { x: number; y: number }) {
  return point.x >= 0 && point.x < 5 && point.y >= 0 && point.y < 5
}

function SelectedTokenActions({
  state,
  selection,
  disabled,
  onTake,
  onCancel,
}: {
  state: GameState
  selection: TokenDragSelection
  disabled: boolean
  onTake: () => void
  onCancel: () => void
}) {
  const tokens = tokenTypesForSelection(state, selection)
  if (tokens.length === 0) return null
  return (
    <div className="selectedTokenActions">
      <div className="selectedTokenPreview" aria-hidden="true">
        {tokens.map((token, index) => (
          <span className="selectedTokenHandleToken" key={`${selection.cellIds[index]}-${token}`}>
            <TokenImage token={token} />
          </span>
        ))}
      </div>
      <button className="selectedTokenActionButton take" disabled={disabled} onClick={onTake} title="拿取" aria-label="拿取选中的宝石" data-tutorial-token-take>
        <Check size={15} />
        <span>拿取</span>
      </button>
      <button className="selectedTokenActionButton cancel" onClick={onCancel} title="取消" aria-label="取消框选">
        <X size={15} />
        <span>取消</span>
      </button>
    </div>
  )
}

function FloatingGoldToken({ carry }: { carry: TokenCarry }) {
  const token = carry.classic ? (
    <span className="splendorFloatingToken">
      <ClassicTokenImage color="gold" variant={carry.variant} />
    </span>
  ) : (
    <span className="token">
      <TokenImage token="gold" />
    </span>
  )
  return (
    <div
      className="floatingTokenCarry"
      style={
        {
          left: carry.x,
          top: carry.y,
          width: carry.width,
          height: carry.height,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {token}
    </div>
  )
}

function FloatingTokenSlotCarry({ carry }: { carry: TokenSlotCarry }) {
  return (
    <div
      className="floatingTokenCarry floatingTokenSlotCarry"
      style={
        {
          left: carry.x,
          top: carry.y,
          width: carry.width,
          height: carry.height,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="token">
        <TokenImage token={carry.tokenType} />
      </span>
    </div>
  )
}

function FloatingPrivilegeCarry({ carry }: { carry: PrivilegeCarry }) {
  return (
    <div
      className="floatingPrivilegeCarry"
      style={
        {
          left: carry.x,
          top: carry.y,
          width: carry.width,
          height: carry.height,
          '--privilege-tilt': `${privilegeTilt(carry.playerId, carry.index)}deg`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <img src={assetPath('privilege.png')} alt="" draggable={false} />
    </div>
  )
}

function FloatingClassicToken({ carry }: { carry: ClassicTokenCarry }) {
  return (
    <div
      className="floatingTokenCarry"
      style={
        {
          left: carry.x,
          top: carry.y,
          width: carry.width,
          height: carry.height,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="splendorFloatingToken">
        <ClassicTokenImage color={classicColorForRouteToken(carry.tokenType)} variant={carry.variant} />
      </span>
    </div>
  )
}

function FlyingTakenToken({ flight }: { flight: FlyingToken }) {
  const token = flight.classic ? (
    <span className="splendorFlyingToken">
      <ClassicTokenImage color={classicColorForRouteToken(flight.type)} variant={flight.variant} />
    </span>
  ) : (
    <span className="token">
      <TokenImage token={flight.type} />
    </span>
  )
  return (
    <div
      className={flight.viaX === undefined ? 'flyingTakenToken' : 'flyingTakenToken tokenFlightVia'}
      style={
        {
          width: flight.size,
          height: flight.size,
          '--from-x': `${flight.fromX}px`,
          '--from-y': `${flight.fromY}px`,
          '--to-x': `${flight.toX}px`,
          '--to-y': `${flight.toY}px`,
          '--via-x': `${flight.viaX ?? flight.toX}px`,
          '--via-y': `${flight.viaY ?? flight.toY}px`,
          '--flight-duration': `${flight.duration ?? TAKE_TOKEN_ANIMATION_MS}ms`,
          '--flight-delay': `${flight.delay ?? 0}ms`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {token}
    </div>
  )
}

function FlyingReservedCard({ flight }: { flight: FlyingCard }) {
  return (
    <div
      className={`flyingReservedCard ${flight.classic ? 'classicReserveFlight' : ''} ${flight.variant === 'pokemon' ? 'pokemonCardFlight' : ''} ${flight.horizontal ? 'horizontalCardFlight' : ''} ${flight.reservePurchase ? 'reservePurchaseCardFlight' : ''} ${flight.targetRotation && (flight.reservePurchase || !flight.horizontal) ? 'rotatedPurchaseCardFlight' : ''} ${flight.revealBeforeFlight ? 'reservePurchaseRevealFlight' : ''} ${flight.colorlessPurchase ? 'colorlessPurchaseCardFlight' : ''} ${flight.returning ? 'returningCardFlight' : ''} ${flight.faceDown ? 'faceDownReserveFlight' : ''} ${flight.backOnly ? 'backOnlyReserveFlight' : ''} ${flight.evolutionBase ? 'evolutionBaseCardFlight' : ''}`}
      style={
        {
          width: flight.width,
          height: flight.height,
          '--from-x': `${flight.fromX}px`,
          '--from-y': `${flight.fromY}px`,
          '--to-x': `${flight.toX}px`,
          '--to-y': `${flight.toY}px`,
          '--from-center-x': `${flight.fromX + flight.width / 2}px`,
          '--from-center-y': `${flight.fromY + flight.height / 2}px`,
          '--to-center-x': `${flight.toX + flight.targetWidth / 2}px`,
          '--to-center-y': `${flight.toY + flight.targetHeight / 2}px`,
          '--source-width': `${flight.width}px`,
          '--source-height': `${flight.height}px`,
          '--source-half-width': `${flight.width / 2}px`,
          '--source-half-height': `${flight.height / 2}px`,
          '--target-width': `${flight.targetWidth}px`,
          '--target-height': `${flight.targetHeight}px`,
          '--flight-duration': `${flight.duration}ms`,
          '--flight-delay': `${flight.delay ?? 0}ms`,
          '--market-card-width': `${flight.width}px`,
          '--market-card-height': `${flight.height}px`,
          '--reserve-card-width': `${flight.targetInnerWidth ?? (flight.horizontal ? flight.targetHeight : flight.targetWidth)}px`,
          '--reserve-card-height': `${flight.targetInnerHeight ?? (flight.horizontal ? flight.targetWidth : flight.targetHeight)}px`,
          '--reserve-target-rotation': `${flight.targetRotation ?? (flight.horizontal ? 90 : 0)}deg`,
          '--reserve-mid-rotation': `${(flight.targetRotation ?? (flight.horizontal ? 90 : 0)) * 0.91}deg`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="flyingReserveCardInner">
        <div className="flyingReserveCardFace flyingReserveCardFront">
          {flight.classic ? <ClassicCardView cardId={flight.cardId} variant={flight.variant} /> : <CardView cardId={flight.cardId} />}
        </div>
        <div className="flyingReserveCardFace flyingReserveCardBack">
          {flight.classic ? <ClassicDeckBack tier={getCard(flight.cardId).tier as 1 | 2 | 3} variant={flight.variant} deckKind={getCard(flight.cardId).deckKind} /> : <FlyingReserveCardBack cardId={flight.cardId} />}
        </div>
      </div>
    </div>
  )
}

function FlyingPrivilegeScroll({ flight }: { flight: FlyingPrivilege }) {
  return (
    <div
      className="flyingPrivilegeScroll"
      style={
        {
          width: flight.width,
          height: flight.height,
          '--from-x': `${flight.fromX}px`,
          '--from-y': `${flight.fromY}px`,
          '--to-x': `${flight.toX}px`,
          '--to-y': `${flight.toY}px`,
          '--source-width': `${flight.width}px`,
          '--source-height': `${flight.height}px`,
          '--target-width': `${flight.targetWidth}px`,
          '--target-height': `${flight.targetHeight}px`,
          '--privilege-tilt': `${flight.targetTilt}deg`,
          '--flight-duration': `${flight.duration}ms`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <img src={assetPath('privilege.png')} alt="" draggable={false} />
    </div>
  )
}

function FlyingReserveCardBack({ cardId }: { cardId: number }) {
  const tier = getCard(cardId).tier
  const className = tier === 'royal' ? 'reserveCardBack royalCardBack' : `reserveCardBack deckTier${tier}`
  return (
    <div className={className} style={deckBackImageStyle(tier)}>
      <div className="deckBack" style={{ '--i': 0 } as CSSProperties} />
    </div>
  )
}

function InitialAnimationLayer({ animation }: { animation: IntroAnimation }) {
  return (
    <>
      {animation.tokens.map((flight) => (
        <IntroTokenFlightView flight={flight} key={flight.id} />
      ))}
      {animation.cards.map((flight) => (
        <IntroCardFlightView flight={flight} key={flight.id} />
      ))}
      {animation.royals.map((flight) => (
        <IntroRoyalFlightView flight={flight} key={flight.id} />
      ))}
    </>
  )
}

function IntroTokenFlightView({ flight }: { flight: IntroTokenFlight }) {
  const token = flight.classic ? (
    <span className="splendorFlyingToken">
      <ClassicTokenImage color={classicColorForRouteToken(flight.type)} variant={flight.variant} />
    </span>
  ) : (
    <span className="token">
      <TokenImage token={flight.type} />
    </span>
  )
  return (
    <div
      className={`introTokenFlight ${flight.classic ? 'classicIntroTokenFlight' : ''}`}
      style={
        {
          width: flight.size,
          height: flight.size,
          '--from-x': `${flight.fromX}px`,
          '--from-y': `${flight.fromY}px`,
          '--to-x': `${flight.toX}px`,
          '--to-y': `${flight.toY}px`,
          '--flight-duration': `${flight.duration ?? INTRO_TOKEN_ANIMATION_MS}ms`,
          '--flight-delay': `${flight.delay}ms`,
          '--flight-repeat-count': flight.repeatCount ?? 1,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {token}
    </div>
  )
}

function IntroCardFlightView({ flight }: { flight: IntroCardFlight }) {
  return <CardDealFlightView flight={flight} className="introCardFlight" />
}

function MarketReplacementCardFlightView({ flight }: { flight: IntroCardFlight }) {
  return <CardDealFlightView flight={flight} className="marketReplacementCardFlight" />
}

function CardDealFlightView({ flight, className }: { flight: IntroCardFlight; className: string }) {
  return (
    <div
      className={`${className} ${flight.classic ? 'classicCardDealFlight' : ''} ${flight.variant === 'pokemon' ? 'pokemonCardFlight' : ''}`}
      style={
        {
          width: flight.width,
          height: flight.height,
          '--from-x': `${flight.fromX}px`,
          '--from-y': `${flight.fromY}px`,
          '--to-x': `${flight.toX}px`,
          '--to-y': `${flight.toY}px`,
          '--flight-duration': `${flight.duration}ms`,
          '--flight-delay': `${flight.delay}ms`,
          '--market-card-width': `${flight.width}px`,
          '--market-card-height': `${flight.height}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="introCardInner">
        <div className={`introCardFace introCardBack deckTier${flight.tier}`} style={deckBackImageStyle(flight.tier)}>
          {flight.classic ? <ClassicDeckBack tier={flight.tier} variant={flight.variant} deckKind={flight.deckKind} /> : <div className="deckBack" style={{ '--i': 1 } as CSSProperties} />}
        </div>
        <div className="introCardFace introCardFront">
          {flight.classic ? <ClassicCardView cardId={flight.cardId} variant={flight.variant} /> : <CardView cardId={flight.cardId} />}
        </div>
      </div>
    </div>
  )
}

function IntroRoyalFlightView({ flight }: { flight: IntroRoyalFlight }) {
  return (
    <div
      className={`introRoyalFlight ${flight.classic ? 'classicRoyalDealFlight' : ''}`}
      style={
        {
          width: flight.width,
          height: flight.height,
          '--from-x': `${flight.fromX}px`,
          '--from-y': `${flight.fromY}px`,
          '--to-x': `${flight.toX}px`,
          '--to-y': `${flight.toY}px`,
          '--flight-duration': `${flight.duration}ms`,
          '--flight-delay': `${flight.delay}ms`,
          '--market-card-width': `${flight.width}px`,
          '--market-card-height': `${flight.height}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {flight.classic ? (
        <div className="introRoyalInner">
          <div className="introRoyalFace introRoyalBack">
            <ClassicDeckBack tier="royal" variant={flight.variant} />
          </div>
          <div className="introRoyalFace introRoyalFront">
            <ClassicNobleView cardId={flight.cardId} />
          </div>
        </div>
      ) : (
        <CardView cardId={flight.cardId} />
      )}
    </div>
  )
}

function RemoteGoldToken({ anchor }: { anchor: RemoteGoldAnchor }) {
  const token = anchor.classic ? (
    <span className="splendorFloatingToken">
      <ClassicTokenImage color="gold" variant={anchor.variant} />
    </span>
  ) : (
    <span className="token">
      <TokenImage token="gold" />
    </span>
  )
  return (
    <div
      className="remoteGoldToken"
      data-remote-gold-token
      style={
        {
          '--remote-gold-x': `${anchor.left}px`,
          '--remote-gold-y': `${anchor.top}px`,
          '--remote-gold-duration': `${GOLD_INTENT_ANIMATION_MS}ms`,
          width: anchor.size,
          height: anchor.size,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {token}
    </div>
  )
}

function RemoteClassicToken({ anchor }: { anchor: RemoteClassicTokenAnchor }) {
  return (
    <div
      className="remoteGoldToken remoteClassicToken"
      data-remote-classic-token
      style={
        {
          '--remote-gold-x': `${anchor.left}px`,
          '--remote-gold-y': `${anchor.top}px`,
          '--remote-gold-duration': `${GOLD_INTENT_ANIMATION_MS}ms`,
          width: anchor.size,
          height: anchor.size,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="splendorFloatingToken">
        <ClassicTokenImage color={classicColorForRouteToken(anchor.tokenType)} variant={anchor.variant} />
      </span>
    </div>
  )
}

function RemotePrivilegeScroll({ anchor }: { anchor: RemotePrivilegeAnchor }) {
  return (
    <div
      className="remotePrivilegeScroll"
      data-remote-privilege-scroll
      style={
        {
          '--remote-privilege-x': `${anchor.left}px`,
          '--remote-privilege-y': `${anchor.top}px`,
          '--remote-privilege-duration': `${GOLD_INTENT_ANIMATION_MS}ms`,
          width: anchor.width,
          height: anchor.height,
          '--privilege-tilt': `${privilegeTilt(anchor.playerId, anchor.index)}deg`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <img src={assetPath('privilege.png')} alt="" draggable={false} />
    </div>
  )
}

function FloatingCardCarry({ carry }: { carry: CardCarry }) {
  return (
    <div
      className={carry.horizontal ? 'floatingCardCarry horizontalCardCarry' : 'floatingCardCarry'}
      style={
        {
          left: carry.x,
          top: carry.y,
          width: carry.width,
          height: carry.height,
          '--market-card-width': `${carry.horizontal ? carry.height : carry.width}px`,
          '--market-card-height': `${carry.horizontal ? carry.width : carry.height}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {carry.classic ? <ClassicCardView cardId={carry.cardId} variant={carry.variant} /> : <CardView cardId={carry.cardId} />}
    </div>
  )
}

function tokenTypesForSelection(state: GameState, selection: TokenDragSelection): TokenType[] {
  const cellsById = new Map(state.board.map((cell) => [cell.id, cell]))
  return selection.cellIds.map((id) => cellsById.get(id)?.token?.type).filter((token): token is TokenType => Boolean(token))
}

function reserveRevealKey(playerId: PlayerId, reserveIndex: number): string {
  return `${playerId}:${reserveIndex}`
}

function DeckStack({
  tier,
  count,
  reservable = false,
  isCarried = false,
  goldTargeted = false,
}: {
  tier: 1 | 2 | 3
  count: number
  reservable?: boolean
  isCarried?: boolean
  goldTargeted?: boolean
}) {
  if (count <= 0) return <div className="deckStack emptyDeck" aria-hidden="true" />
  const source: CardSource = { type: 'deck', tier }
  const visibleCount = Math.min(3, Math.max(0, count - (isCarried ? 1 : 0)))
  const visibleCards = Array.from({ length: visibleCount })
  return (
    <div
      className={`deckStack deckTier${tier} ${reservable ? 'deckReservable' : ''} ${isCarried ? 'deckCarryHidden' : ''} ${goldTargeted ? 'goldTargetedDeck' : ''}`}
      data-deck-tier={tier}
      data-card-source-key={sourceKey(source)}
      data-card-drop-source={reservable ? JSON.stringify(source) : undefined}
      title={`${tier} 级牌堆`}
      style={deckBackImageStyle(tier)}
    >
      {visibleCards.map((_, index) => (
        <div className="deckBack" style={{ '--i': index } as CSSProperties} key={index} />
      ))}
    </div>
  )
}

function deckBackImageStyle(tier: 1 | 2 | 3 | 'royal'): CSSProperties {
  const filename = tier === 'royal' ? 'card-back-royal.png' : `card-back-tier${tier}.png`
  return { '--deck-back-image': `url(${assetPath(filename)})` } as CSSProperties
}

function MarketCard({
  cardId,
  source,
  isMyTurn,
  goldCellId,
  isCarried,
  remoteHovered,
  goldTargeted,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  cardId: number
  source: CardSource
  isMyTurn: boolean
  goldCellId?: string
  isCarried: boolean
  remoteHovered: boolean
  goldTargeted: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: () => void
}) {
  return (
    <article
	      className={`marketCard ${isMyTurn ? 'cardDraggable' : ''} ${isCarried ? 'cardCarryHidden' : ''} ${remoteHovered ? 'remoteHover' : ''} ${goldTargeted ? 'goldTargetedCard' : ''}`}
	      data-card-source-key={sourceKey(source)}
	      data-card-drop-source={isMyTurn && goldCellId ? JSON.stringify(source) : undefined}
      onPointerDown={isMyTurn ? onPointerDown : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <CardView cardId={cardId} />
    </article>
  )
}
