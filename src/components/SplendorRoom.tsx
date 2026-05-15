import { ArrowLeftRight, Bot, Check, Copy, Home, Loader2, Play, RefreshCw, Trash2, UserRound, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { CLASSIC_VICTORY_POINTS, playerStats, POKEMON_VICTORY_POINTS, royalCardOwner, VICTORY_TARGETS } from '@/game/rules'
import { DEVELOPMENT_CARDS, NOBLES, POKEMON_DEVELOPMENT_CARDS, POKEMON_LEGACY_SPECIAL_CARD_IDS, POKEMON_LEGENDARY_CARDS, POKEMON_RARE_CARDS, type BasicColor, type Card, type Noble } from '@/game/multiplayerData'
import type { CardSource, GameAction, GameState, GameType, GemType, PlayerId, PokemonSpecialDeck, Token, TokenType, VictoryReason } from '@/game/types'
import { displayPlayerName } from '@/game/playerDisplay'
import { turnHudLabels } from '@/game/turnHud'
import { assetPath } from '@/utils/paths'
import { getCard } from '@/game/cards'
import { CARD_ATLASES } from '@/game/data/cards.generated'

const CLASSIC_CARD_BY_ID = new Map<number, Card>(DEVELOPMENT_CARDS.map((card) => [Number(card.id), card]))
const CLASSIC_NOBLE_BY_ID = new Map<number, Noble>(NOBLES.map((noble) => [Number(noble.id), noble]))
const POKEMON_SPECIAL_CARD_BY_NAME = new Map<string, Card>(
  [...POKEMON_RARE_CARDS, ...POKEMON_LEGENDARY_CARDS].flatMap((card) => (card.name ? [[card.name, card] as const] : [])),
)
const POKEMON_CARD_BY_ID = new Map<number, Card>([
  ...POKEMON_DEVELOPMENT_CARDS.map((card, index) => [30000 + Number(card.id.replace('pk-', '') || index + 1), card] as const),
  ...POKEMON_RARE_CARDS.map((card, index) => [30100 + index + 1, card] as const),
  ...POKEMON_LEGENDARY_CARDS.map((card, index) => [30200 + index + 1, card] as const),
  ...POKEMON_LEGACY_SPECIAL_CARD_IDS.flatMap(([legacyCardId, name]) => {
    const card = POKEMON_SPECIAL_CARD_BY_NAME.get(name)
    return card ? [[legacyCardId, card] as const] : []
  }),
])
type ClassicMappedToken = 'diamond' | 'sapphire' | 'emerald' | 'ruby' | 'onyx'
export type ClassicTokenDraftView = {
  tokenTypes: GemType[]
  confirmable?: boolean
  controllable?: boolean
  hoverTokenType?: GemType
  hoverSlotIndex?: number
}
type ClassicPurchaseTargetView = {
  gem?: GemType
  valid: boolean
  eligibleGems: GemType[]
}
type ClassicRemotePurchaseTargetView = {
  playerId: PlayerId
  source: CardSource
  gem?: GemType
  valid: boolean
}
type AiSeatControlView = {
  difficulty: string
  options: Array<{ id: string; label: string }>
  busy?: boolean
  onDifficultyChange: (difficulty: string) => void
  onRemove: () => void
}

const SPLENDOR_TABLE_BASE_SIZE: Record<Extract<GameType, 'classic' | 'pokemon'>, { width: number; height: number }> = {
  classic: { width: 1140, height: 890 },
  pokemon: { width: 1140, height: 850 },
}

const CLASSIC_COLOR_TO_TOKEN: Record<BasicColor, ClassicMappedToken> = {
  white: 'diamond',
  blue: 'sapphire',
  green: 'emerald',
  red: 'ruby',
  brown: 'onyx',
}
const TOKEN_TO_CLASSIC_COLOR: Partial<Record<TokenType, BasicColor>> = {
  diamond: 'white',
  sapphire: 'blue',
  emerald: 'green',
  ruby: 'red',
  onyx: 'brown',
}
const CLASSIC_COLOR_LABELS: Record<BasicColor | 'gold', string> = {
  white: '钻石',
  blue: '蓝宝石',
  green: '祖母绿',
  red: '红宝石',
  brown: '玛瑙',
  gold: '黄金',
}

export function isSplendorRoomState(value: unknown): value is GameState {
  return Boolean(value && typeof value === 'object' && 'gameType' in value && ((value as { gameType?: unknown }).gameType === 'classic' || (value as { gameType?: unknown }).gameType === 'pokemon'))
}

export function SplendorRoom({
  state,
  roomId,
  playerId,
  error,
  busy,
  copiedLink,
  playerNameInput,
  onPlayerNameInput,
  onConfirmSeat,
  onMoveSeat,
  onCopyRoomLink,
  onReturnHome,
  onRestart,
  onOpenAiDialog,
  aiSeatControls = {},
  onAction,
  aiBusy = false,
  interactionLocked = false,
  canEndTurnOverride,
  remoteHoverCardSourceKey,
  goldTargetCardSourceKey,
  reservingCardSourceKeys = [],
  motionCardSourceKeys = reservingCardSourceKeys,
  takingCellIds = [],
  goldCellId,
  classicDrafts = {},
  purchaseTarget,
  remotePurchaseTarget,
  remoteHoverBankTokenType,
  revealingReserveIndices = {},
  hiddenReserveIndices = {},
  bankDraftTokenTypes = [],
  disabledBankTokenTypes = [],
  hiddenBankTokenType,
  introBankCounts,
  hiddenTokenSlotKeys = [],
  highlightedTokenSlotKeys = [],
  hiddenPurchasedCardKeys = [],
  refundableTokenIds = [],
  refundableReserveSlotKey,
  refundablePurchasedCardKeys = [],
  onGoldPointerDown,
  onBankTokenPointerDown,
  onBankTokenPointerEnter,
  onBankTokenPointerLeave,
  onDraftTokenPointerDown,
  onDiscardToken,
  onRefundPokemonAction,
  onRefundPurchasedCard,
  onConfirmTokenDraft,
  onCancelTokenDraft,
  onEndTurn,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardPointerCancel,
  introAnimating = false,
}: {
  state: GameState
  roomId: string
  playerId: PlayerId
  error: string
  busy: boolean
  copiedLink: boolean
  playerNameInput: string
  onPlayerNameInput: (value: string) => void
  onConfirmSeat: () => void
  onMoveSeat?: (targetPlayerId: string) => void
  onCopyRoomLink: () => void
  onReturnHome: () => void
  onRestart: () => void
  onOpenAiDialog?: () => void
  aiSeatControls?: Partial<Record<PlayerId, AiSeatControlView>>
  onAction: (action: GameAction) => void
  aiBusy?: boolean
  interactionLocked?: boolean
  canEndTurnOverride?: boolean
  remoteHoverCardSourceKey?: string
  goldTargetCardSourceKey?: string
  reservingCardSourceKeys?: string[]
  motionCardSourceKeys?: string[]
  takingCellIds?: string[]
  goldCellId?: string
  classicDrafts?: Partial<Record<PlayerId, ClassicTokenDraftView>>
  purchaseTarget?: ClassicPurchaseTargetView
  remotePurchaseTarget?: ClassicRemotePurchaseTargetView
  remoteHoverBankTokenType?: TokenType
  revealingReserveIndices?: Partial<Record<PlayerId, number[]>>
  hiddenReserveIndices?: Partial<Record<PlayerId, number[]>>
  bankDraftTokenTypes?: GemType[]
  disabledBankTokenTypes?: GemType[]
  hiddenBankTokenType?: TokenType
  introBankCounts?: Record<TokenType, number>
  hiddenTokenSlotKeys?: string[]
  highlightedTokenSlotKeys?: string[]
  hiddenPurchasedCardKeys?: string[]
  refundableTokenIds?: string[]
  refundableReserveSlotKey?: string
  refundablePurchasedCardKeys?: string[]
  onGoldPointerDown?: (event: ReactPointerEvent<HTMLElement>, cellId: string) => void
  onBankTokenPointerDown?: (event: ReactPointerEvent<HTMLElement>, tokenType: GemType) => void
  onBankTokenPointerEnter?: (tokenType: TokenType) => void
  onBankTokenPointerLeave?: () => void
  onDraftTokenPointerDown?: (event: ReactPointerEvent<HTMLElement>, playerId: PlayerId, draftIndex: number) => void
  onDiscardToken?: (token: Token) => void
  onRefundPokemonAction?: (token?: Token) => void
  onRefundPurchasedCard?: (cardId: number, purchaseIndex: number) => void
  onConfirmTokenDraft?: () => void
  onCancelTokenDraft?: () => void
  onEndTurn?: () => void
  onCardPointerEnter?: (source: CardSource) => void
  onCardPointerLeave?: () => void
  onCardPointerDown?: (event: ReactPointerEvent<HTMLElement>, cardId: number, source: CardSource) => void
  onCardPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onCardPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void
  onCardPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void
  introAnimating?: boolean
}) {
  const viewer = state.players[playerId]
  const order = perspectiveOrder(state.playerOrder, playerId)
  const seatedCount = state.playerOrder.filter((id) => state.players[id].seated).length
  const readyCount = state.playerOrder.filter((id) => state.players[id].seated && state.players[id].connected).length
  const canStartWithCurrentPlayers = readyCount >= 2 && readyCount <= 4
  const isHost = state.myIsHost === true
  const nameRequired = state.status === 'waiting' && viewer && !viewer.seated
  const isMyTurn = state.currentPlayer === playerId && state.status === 'playing' && !state.winner
  const canAct = isMyTurn && !interactionLocked && !state.pending
  const pokemonActionDone = state.gameType === 'pokemon' && Boolean(state.turnActions?.mandatoryDone)
  const canReserve = canAct && !pokemonActionDone && state.players[playerId].reserve.length < 3 && Boolean(goldCellId) && bankCounts(state).gold > 0
  const canEndTurn = canEndTurnOverride ?? (state.gameType === 'pokemon' && isMyTurn && !interactionLocked && !state.pending && Boolean(state.turnActions?.mandatoryDone))
  const canStart = state.status === 'waiting' && isHost && canStartWithCurrentPlayers && Boolean(viewer?.seated && viewer.connected) && !nameRequired
  const nonHostSeats = state.playerOrder.filter((id) => id !== 'p1')
  const hasEmptyAiSeat = state.playerOrder.some((id) => id !== playerId && !state.players[id].seated && !state.players[id].connected)
  const canPromoteHostToAi = isHost && playerId === 'p1' && !state.players.p1.isAi && nonHostSeats.length > 0 && nonHostSeats.every((id) => state.players[id].isAi)
  const canAddAi = state.status === 'waiting' && isHost && !nameRequired && Boolean(onOpenAiDialog) && (hasEmptyAiSeat || canPromoteHostToAi)
  const initialLayout = state.status === 'waiting' || introAnimating
  const royalChoicePending = state.pending?.type === 'chooseRoyal' && state.pending.playerId === playerId ? state.pending : undefined
  const splendorGameType = state.gameType === 'pokemon' ? 'pokemon' : 'classic'
  const tableScale = useSplendorTableScale(splendorGameType)
  const startTitle = canStartWithCurrentPlayers ? '开始游戏' : '至少需要 2 位玩家输入名字并在线'
  const turnLabels = turnHudLabels(state)
  const turnLabel =
    state.status === 'waiting'
      ? canStartWithCurrentPlayers
        ? isHost
          ? '等待开始'
          : '等待房主'
        : `等待入座 ${seatedCount}/${state.playerOrder.length}`
      : state.status === 'finished'
        ? '已结束'
        : isMyTurn
          ? '你的回合'
        : `${displayPlayerName(state.players[state.currentPlayer])} 行动中`

  return (
    <main
      className={`gameShell splendorFourShell ${state.gameType === 'pokemon' ? 'pokemonShell' : 'classicShell'} ${isMyTurn ? 'myTurn' : 'notMyTurn'} ${initialLayout ? 'introLayout' : ''} ${introAnimating ? 'introAnimating' : ''}`}
      style={{ '--table-surface-image': `url(${assetPath(state.gameType === 'pokemon' ? 'pokemon-splendor/tabletops/vivid-monster-table.webp' : 'splendor-base/tabletops/jewel-felt.webp')})` } as CSSProperties}
    >
      {state.winner && (
        <div className="winBanner">
          <strong>{displayPlayerName(state.players[state.winner.playerId])} 获胜</strong>
          <span>{winnerReasonLabel(state.winner.reason, state.gameType)}</span>
        </div>
      )}
      {error && <div className="toast">{error}</div>}
      <aside className="gameHud" aria-label="房间信息">
        <span>房间 {roomId}</span>
        <span>{state.gameType === 'pokemon' ? '宝可梦' : '璀璨宝石'}</span>
        {turnLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
        <span>{displayPlayerName(viewer)}</span>
        <strong>{turnLabel}</strong>
      </aside>
      <nav className="roomOps" aria-label="房间操作">
        {canAddAi && (
          <button className="hudIconButton" onClick={onOpenAiDialog} disabled={aiBusy} title="配置 AI 对手" aria-label="配置 AI 对手">
            {aiBusy ? <Loader2 className="spin" size={17} /> : <Bot size={17} />}
          </button>
        )}
        {state.status === 'waiting' && isHost && (
          <button className="hudIconButton startHudIconButton" onClick={() => onAction({ type: 'startGame', playerId })} disabled={!canStart} title={startTitle} aria-label={startTitle}>
            <Play size={17} />
          </button>
        )}
        {state.status === 'finished' && isHost && (
          <button className="hudIconButton" onClick={onRestart} title="同房间开启新一局" aria-label="同房间开启新一局">
            <RefreshCw size={17} />
          </button>
        )}
        <button className="hudIconButton" onClick={onCopyRoomLink} title={copiedLink ? '已复制' : '复制邀请链接'} aria-label={copiedLink ? '已复制邀请链接' : '复制邀请链接'}>
          {copiedLink ? <Check size={17} /> : <Copy size={17} />}
        </button>
        <button className="hudIconButton" onClick={onReturnHome} title="返回首页" aria-label="返回首页">
          <Home size={17} />
        </button>
      </nav>

      {nameRequired && (
        <div className="modalScrim playerNameScrim" role="presentation">
          <form
            className="aiSetupDialog playerNameDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-name-title"
            onSubmit={(event) => {
              event.preventDefault()
              onConfirmSeat()
            }}
          >
            <header>
              <strong id="player-name-title">输入你的名字</strong>
              <UserRound size={18} />
            </header>
            <label className="playerNameField">
              <span>玩家名字</span>
              <input autoFocus maxLength={16} value={playerNameInput} onChange={(event) => onPlayerNameInput(event.currentTarget.value)} placeholder="最多 16 个字符" aria-label="玩家名字" />
            </label>
            <footer>
              <button type="submit" className="primaryButton" disabled={busy}>
                {busy ? '入座中...' : '确认入座'}
              </button>
            </footer>
          </form>
        </div>
      )}

      <section className="splendorTableLayout" aria-label="四人璀璨宝石桌面" style={{ '--splendor-table-scale': tableScale } as CSSProperties}>
        <div className="splendorTableScaler">
          <section className="splendorCenterAnchor">
          <SplendorSeat className="splendorSeatLeft" state={state} playerId={order.left} viewerId={playerId} busy={busy} classicDraft={classicDrafts[order.left]} aiControl={aiSeatControls[order.left]} purchaseTarget={purchaseTargetForPanel(purchaseTarget, order.left, playerId)} remotePurchaseTarget={purchaseTargetForPanel(remotePurchaseTarget, order.left)} canEndTurn={canEndTurn} revealingReserveIndices={revealingReserveIndices[order.left] ?? []} hiddenReserveIndices={hiddenReserveIndices[order.left] ?? []} hiddenTokenSlotKeys={hiddenTokenSlotKeys} highlightedTokenSlotKeys={highlightedTokenSlotKeys} hiddenPurchasedCardKeys={hiddenPurchasedCardKeys} refundableTokenIds={refundableTokenIds} refundableReserveSlotKey={refundableReserveSlotKey} refundablePurchasedCardKeys={refundablePurchasedCardKeys} remoteHoveredReserveIndex={reserveIndexFromRemoteHover(remoteHoverCardSourceKey, order.left, playerId)} onMoveSeat={onMoveSeat} onDraftTokenPointerDown={onDraftTokenPointerDown} onDiscardToken={onDiscardToken} onRefundPokemonAction={onRefundPokemonAction} onRefundPurchasedCard={onRefundPurchasedCard} onConfirmTokenDraft={onConfirmTokenDraft} onCancelTokenDraft={onCancelTokenDraft} onEndTurn={onEndTurn} onReservePointerDown={onCardPointerDown} onReservePointerEnter={(_, index) => onCardPointerEnter?.({ type: 'reserve', index })} onReservePointerLeave={onCardPointerLeave} onReservePointerMove={onCardPointerMove} onReservePointerUp={onCardPointerUp} onReservePointerCancel={onCardPointerCancel} />
          <SplendorSeat className="splendorSeatRight" state={state} playerId={order.right} viewerId={playerId} busy={busy} classicDraft={classicDrafts[order.right]} aiControl={aiSeatControls[order.right]} purchaseTarget={purchaseTargetForPanel(purchaseTarget, order.right, playerId)} remotePurchaseTarget={purchaseTargetForPanel(remotePurchaseTarget, order.right)} canEndTurn={canEndTurn} revealingReserveIndices={revealingReserveIndices[order.right] ?? []} hiddenReserveIndices={hiddenReserveIndices[order.right] ?? []} hiddenTokenSlotKeys={hiddenTokenSlotKeys} highlightedTokenSlotKeys={highlightedTokenSlotKeys} hiddenPurchasedCardKeys={hiddenPurchasedCardKeys} refundableTokenIds={refundableTokenIds} refundableReserveSlotKey={refundableReserveSlotKey} refundablePurchasedCardKeys={refundablePurchasedCardKeys} remoteHoveredReserveIndex={reserveIndexFromRemoteHover(remoteHoverCardSourceKey, order.right, playerId)} onMoveSeat={onMoveSeat} onDraftTokenPointerDown={onDraftTokenPointerDown} onDiscardToken={onDiscardToken} onRefundPokemonAction={onRefundPokemonAction} onRefundPurchasedCard={onRefundPurchasedCard} onConfirmTokenDraft={onConfirmTokenDraft} onCancelTokenDraft={onCancelTokenDraft} onEndTurn={onEndTurn} onReservePointerDown={onCardPointerDown} onReservePointerEnter={(_, index) => onCardPointerEnter?.({ type: 'reserve', index })} onReservePointerLeave={onCardPointerLeave} onReservePointerMove={onCardPointerMove} onReservePointerUp={onCardPointerUp} onReservePointerCancel={onCardPointerCancel} />
          <SplendorSeat className="splendorSeatBottomLeft" state={state} playerId={order.bottomLeft} viewerId={playerId} busy={busy} classicDraft={classicDrafts[order.bottomLeft]} aiControl={aiSeatControls[order.bottomLeft]} purchaseTarget={purchaseTargetForPanel(purchaseTarget, order.bottomLeft, playerId)} remotePurchaseTarget={purchaseTargetForPanel(remotePurchaseTarget, order.bottomLeft)} canEndTurn={canEndTurn} revealingReserveIndices={revealingReserveIndices[order.bottomLeft] ?? []} hiddenReserveIndices={hiddenReserveIndices[order.bottomLeft] ?? []} hiddenTokenSlotKeys={hiddenTokenSlotKeys} highlightedTokenSlotKeys={highlightedTokenSlotKeys} hiddenPurchasedCardKeys={hiddenPurchasedCardKeys} refundableTokenIds={refundableTokenIds} refundableReserveSlotKey={refundableReserveSlotKey} refundablePurchasedCardKeys={refundablePurchasedCardKeys} remoteHoveredReserveIndex={reserveIndexFromRemoteHover(remoteHoverCardSourceKey, order.bottomLeft, playerId)} onMoveSeat={onMoveSeat} onDraftTokenPointerDown={onDraftTokenPointerDown} onDiscardToken={onDiscardToken} onRefundPokemonAction={onRefundPokemonAction} onRefundPurchasedCard={onRefundPurchasedCard} onConfirmTokenDraft={onConfirmTokenDraft} onCancelTokenDraft={onCancelTokenDraft} onEndTurn={onEndTurn} onReservePointerDown={onCardPointerDown} onReservePointerEnter={(_, index) => onCardPointerEnter?.({ type: 'reserve', index })} onReservePointerLeave={onCardPointerLeave} onReservePointerMove={onCardPointerMove} onReservePointerUp={onCardPointerUp} onReservePointerCancel={onCardPointerCancel} />
          <SplendorSeat className="splendorSeatBottomRight" state={state} playerId={order.bottomRight} viewerId={playerId} busy={busy} classicDraft={classicDrafts[order.bottomRight]} aiControl={aiSeatControls[order.bottomRight]} purchaseTarget={purchaseTargetForPanel(purchaseTarget, order.bottomRight, playerId)} remotePurchaseTarget={purchaseTargetForPanel(remotePurchaseTarget, order.bottomRight)} canEndTurn={canEndTurn} revealingReserveIndices={revealingReserveIndices[order.bottomRight] ?? []} hiddenReserveIndices={hiddenReserveIndices[order.bottomRight] ?? []} hiddenTokenSlotKeys={hiddenTokenSlotKeys} highlightedTokenSlotKeys={highlightedTokenSlotKeys} hiddenPurchasedCardKeys={hiddenPurchasedCardKeys} refundableTokenIds={refundableTokenIds} refundableReserveSlotKey={refundableReserveSlotKey} refundablePurchasedCardKeys={refundablePurchasedCardKeys} remoteHoveredReserveIndex={reserveIndexFromRemoteHover(remoteHoverCardSourceKey, order.bottomRight, playerId)} onMoveSeat={onMoveSeat} onDraftTokenPointerDown={onDraftTokenPointerDown} onDiscardToken={onDiscardToken} onRefundPokemonAction={onRefundPokemonAction} onRefundPurchasedCard={onRefundPurchasedCard} onConfirmTokenDraft={onConfirmTokenDraft} onCancelTokenDraft={onCancelTokenDraft} onEndTurn={onEndTurn} onReservePointerDown={onCardPointerDown} onReservePointerEnter={(_, index) => onCardPointerEnter?.({ type: 'reserve', index })} onReservePointerLeave={onCardPointerLeave} onReservePointerMove={onCardPointerMove} onReservePointerUp={onCardPointerUp} onReservePointerCancel={onCardPointerCancel} />

          <section className="splendorCenterTable">
            <SplendorBank state={state} canReserve={canReserve} goldCellId={goldCellId} takingCellIds={takingCellIds} draftTokenTypes={bankDraftTokenTypes} disabledTokenTypes={disabledBankTokenTypes} hiddenTokenType={hiddenBankTokenType} remoteHoverTokenType={remoteHoverBankTokenType} introBankCounts={introBankCounts} onGoldPointerDown={onGoldPointerDown} onBankTokenPointerDown={onBankTokenPointerDown} onBankTokenPointerEnter={onBankTokenPointerEnter} onBankTokenPointerLeave={onBankTokenPointerLeave} />
            <MarketPreview
              state={state}
              canReserve={canReserve}
              canPurchase={canAct}
              remoteHoverCardSourceKey={remoteHoverCardSourceKey}
              goldTargetCardSourceKey={goldTargetCardSourceKey}
              motionCardSourceKeys={motionCardSourceKeys}
              introAnimating={introAnimating}
              royalChoiceOptions={royalChoicePending?.options ?? []}
              interactionLocked={interactionLocked}
              onChooseRoyal={(cardId) => onAction({ type: 'chooseRoyal', playerId, cardId })}
              onCardPointerEnter={onCardPointerEnter}
              onCardPointerLeave={onCardPointerLeave}
              onCardPointerDown={onCardPointerDown}
              onCardPointerMove={onCardPointerMove}
              onCardPointerUp={onCardPointerUp}
              onCardPointerCancel={onCardPointerCancel}
            />
          </section>
          </section>
        </div>
      </section>
    </main>
  )
}

function useSplendorTableScale(gameType: Extract<GameType, 'classic' | 'pokemon'>): number {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const updateScale = () => {
      const viewport = window.visualViewport
      const width = viewport?.width ?? window.innerWidth
      const height = viewport?.height ?? window.innerHeight
      const base = SPLENDOR_TABLE_BASE_SIZE[gameType]
      const safeInset = 16
      const nextScale = Math.max(0.32, Math.min((width - safeInset * 2) / base.width, (height - safeInset * 2) / base.height))
      setScale(Number(nextScale.toFixed(4)))
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    window.visualViewport?.addEventListener('resize', updateScale)
    return () => {
      window.removeEventListener('resize', updateScale)
      window.visualViewport?.removeEventListener('resize', updateScale)
    }
  }, [gameType])

  return scale
}

function SplendorSeat({
  className,
  state,
  playerId,
  viewerId,
  busy,
  classicDraft,
  aiControl,
  purchaseTarget,
  remotePurchaseTarget,
  canEndTurn,
  revealingReserveIndices = [],
  hiddenReserveIndices = [],
  hiddenTokenSlotKeys,
  highlightedTokenSlotKeys,
  hiddenPurchasedCardKeys,
  refundableTokenIds,
  refundableReserveSlotKey,
  refundablePurchasedCardKeys,
  remoteHoveredReserveIndex,
  onMoveSeat,
  onDraftTokenPointerDown,
  onDiscardToken,
  onRefundPokemonAction,
  onRefundPurchasedCard,
  onConfirmTokenDraft,
  onCancelTokenDraft,
  onEndTurn,
  onReservePointerDown,
  onReservePointerEnter,
  onReservePointerLeave,
  onReservePointerMove,
  onReservePointerUp,
  onReservePointerCancel,
}: {
  className: string
  state: GameState
  playerId: PlayerId
  viewerId: PlayerId
  busy: boolean
  classicDraft?: ClassicTokenDraftView
  aiControl?: AiSeatControlView
  purchaseTarget?: ClassicPurchaseTargetView
  remotePurchaseTarget?: ClassicPurchaseTargetView
  canEndTurn?: boolean
  revealingReserveIndices?: number[]
  hiddenReserveIndices?: number[]
  hiddenTokenSlotKeys: string[]
  highlightedTokenSlotKeys: string[]
  hiddenPurchasedCardKeys: string[]
  refundableTokenIds: string[]
  refundableReserveSlotKey?: string
  refundablePurchasedCardKeys: string[]
  remoteHoveredReserveIndex?: number
  onMoveSeat?: (targetPlayerId: string) => void
  onDraftTokenPointerDown?: (event: ReactPointerEvent<HTMLElement>, playerId: PlayerId, draftIndex: number) => void
  onDiscardToken?: (token: Token) => void
  onRefundPokemonAction?: (token?: Token) => void
  onRefundPurchasedCard?: (cardId: number, purchaseIndex: number) => void
  onConfirmTokenDraft?: () => void
  onCancelTokenDraft?: () => void
  onEndTurn?: () => void
  onReservePointerDown?: (event: ReactPointerEvent<HTMLElement>, cardId: number, source: CardSource) => void
  onReservePointerEnter?: (cardId: number, index: number) => void
  onReservePointerLeave?: () => void
  onReservePointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onReservePointerUp?: (event: ReactPointerEvent<HTMLElement>) => void
  onReservePointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const viewer = state.players[viewerId]
  const player = state.players[playerId]
  const displayName = displayPlayerName(player)
  const canMoveHere = state.status === 'waiting' && Boolean(viewer?.seated) && viewerId !== playerId && Boolean(onMoveSeat)
  const hiddenEmptySeat = state.status !== 'waiting' && !player.seated && !player.connected && !player.isAi
  const aiOptionIndex = aiControl ? Math.max(0, aiControl.options.findIndex((option) => option.id === aiControl.difficulty)) : 0
  const showEndTurnButton = state.gameType === 'pokemon' && state.status === 'playing' && playerId === viewerId
  return (
    <div className={`splendorSeat ${className} splendorSeat-${playerId} ${hiddenEmptySeat ? 'splendorEmptySeatHidden' : ''}`}>
      <SplendorPlayerPanel state={state} playerId={playerId} viewerId={viewerId} classicDraft={classicDraft} purchaseTarget={purchaseTarget} remotePurchaseTarget={remotePurchaseTarget} showEndTurnButton={showEndTurnButton} canEndTurn={canEndTurn} revealingReserveIndices={revealingReserveIndices} hiddenReserveIndices={hiddenReserveIndices} hiddenTokenSlotKeys={hiddenTokenSlotKeys} highlightedTokenSlotKeys={highlightedTokenSlotKeys} hiddenPurchasedCardKeys={hiddenPurchasedCardKeys} refundableTokenIds={refundableTokenIds} refundableReserveSlotKey={refundableReserveSlotKey} refundablePurchasedCardKeys={refundablePurchasedCardKeys} remoteHoveredReserveIndex={remoteHoveredReserveIndex} onDraftTokenPointerDown={onDraftTokenPointerDown} onDiscardToken={onDiscardToken} onRefundPokemonAction={onRefundPokemonAction} onRefundPurchasedCard={onRefundPurchasedCard} onConfirmTokenDraft={onConfirmTokenDraft} onCancelTokenDraft={onCancelTokenDraft} onEndTurn={onEndTurn} onReservePointerDown={onReservePointerDown} onReservePointerEnter={onReservePointerEnter} onReservePointerLeave={onReservePointerLeave} onReservePointerMove={onReservePointerMove} onReservePointerUp={onReservePointerUp} onReservePointerCancel={onReservePointerCancel} />
      {canMoveHere && (
        <button className="seatMoveButton splendorSeatMoveButton" type="button" onClick={() => onMoveSeat?.(playerId)} disabled={busy} title={player.seated ? `与 ${displayName} 交换位置` : '移动到此空位'} aria-label={player.seated ? `与 ${displayName} 交换位置` : '移动到此空位'}>
          <ArrowLeftRight size={15} />
          <span>交换</span>
        </button>
      )}
      {aiControl && (
        <div className={`splendorSeatAiControls ${canMoveHere ? '' : 'withoutMoveButton'}`}>
          <label className="splendorSeatAiDifficulty" title={`AI 难度：${aiControl.options[aiOptionIndex]?.label ?? aiControl.difficulty}`}>
            <input
              type="range"
              min={0}
              max={Math.max(0, aiControl.options.length - 1)}
              step={1}
              value={aiOptionIndex}
              disabled={aiControl.busy}
              onChange={(event) => {
                const option = aiControl.options[Number(event.currentTarget.value)]
                if (option) aiControl.onDifficultyChange(option.id)
              }}
              aria-label={`${displayName} AI 难度`}
            />
            <span>{aiControl.options[aiOptionIndex]?.label ?? aiControl.difficulty}</span>
          </label>
          <button className="splendorSeatAiRemove" type="button" onClick={aiControl.onRemove} disabled={aiControl.busy} title={`移除 ${displayName}`} aria-label={`移除 ${displayName}`}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

const SPLENDOR_BANK_ORDER = [
  { color: 'white', token: 'diamond' },
  { color: 'blue', token: 'sapphire' },
  { color: 'green', token: 'emerald' },
  { color: 'red', token: 'ruby' },
  { color: 'brown', token: 'onyx' },
  { color: 'gold', token: 'gold' },
] as const satisfies readonly { color: BasicColor | 'gold'; token: TokenType }[]

function SplendorBank({
  state,
  canReserve,
  goldCellId,
  takingCellIds,
  draftTokenTypes,
  disabledTokenTypes,
  hiddenTokenType,
  remoteHoverTokenType,
  introBankCounts,
  onGoldPointerDown,
  onBankTokenPointerDown,
  onBankTokenPointerEnter,
  onBankTokenPointerLeave,
}: {
  state: GameState
  canReserve: boolean
  goldCellId?: string
  takingCellIds: string[]
  draftTokenTypes: GemType[]
  disabledTokenTypes: GemType[]
  hiddenTokenType?: TokenType
  remoteHoverTokenType?: TokenType
  introBankCounts?: Record<TokenType, number>
  onGoldPointerDown?: (event: ReactPointerEvent<HTMLElement>, cellId: string) => void
  onBankTokenPointerDown?: (event: ReactPointerEvent<HTMLElement>, tokenType: GemType) => void
  onBankTokenPointerEnter?: (tokenType: TokenType) => void
  onBankTokenPointerLeave?: () => void
}) {
  const targetCounts = adjustedBankCounts(bankCounts(state), draftTokenTypes)
  const renderedCounts = introBankCounts ?? targetCounts

  return (
    <section className="splendorBankPanel" aria-label="宝石银行">
      {SPLENDOR_BANK_ORDER.map(({ color, token }) => {
        const count = renderedCounts[token]
        const showEmptyToken = count === 0 && state.status === 'playing' && !introBankCounts
        const isGold = token === 'gold'
        const isGem = token !== 'gold'
        const isDisabled = isGem && disabledTokenTypes.includes(token)
        const canTakeBankToken = isGem && count > 0 && !isDisabled && Boolean(onBankTokenPointerDown)
        const canHoverBankToken = count > 0 && Boolean(onBankTokenPointerEnter)
        const isTopTokenHidden = hiddenTokenType === token || Boolean(isGold && goldCellId && takingCellIds.includes(goldCellId))
        return (
          <div
            className={`splendorBankPile bankPile-${color} ${isGold && canReserve ? 'goldDraggable' : ''} ${canTakeBankToken ? 'bankTokenDraggable' : ''} ${isDisabled ? 'bankTokenDisabled' : ''} ${isTopTokenHidden ? 'bankTopTokenHidden' : ''} ${remoteHoverTokenType === token ? 'remoteHover' : ''}`}
            data-cell-id={isGold ? goldCellId : undefined}
            data-classic-bank-token={token}
            aria-label={`${CLASSIC_COLOR_LABELS[color]} ${count} 枚`}
            title={`${CLASSIC_COLOR_LABELS[color]} ${count} 枚`}
            onPointerDown={isGold && canReserve && goldCellId ? (event) => onGoldPointerDown?.(event, goldCellId) : undefined}
            onPointerEnter={canHoverBankToken ? () => onBankTokenPointerEnter?.(token) : undefined}
            onPointerLeave={canHoverBankToken ? onBankTokenPointerLeave : undefined}
            onClick={canTakeBankToken ? (event) => event.preventDefault() : undefined}
            key={color}
          >
            <div className="splendorTokenStack" aria-hidden="true" onPointerDown={canTakeBankToken ? (event) => onBankTokenPointerDown?.(event, token) : undefined}>
              {showEmptyToken && (
                <span className="splendorStackedToken splendorEmptyBankToken" style={{ '--stack-index': 0 } as CSSProperties}>
                  <ClassicTokenImage color={color} variant={state.gameType} />
                </span>
              )}
              {Array.from({ length: Math.min(3, count) }).map((_, index) => (
                <span
                  className="splendorStackedToken"
                  style={{ '--stack-index': index } as CSSProperties}
                  key={index}
                >
                  <ClassicTokenImage color={color} variant={state.gameType} />
                </span>
              ))}
              <strong>{count}</strong>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function adjustedBankCounts(counts: Record<TokenType, number>, draftTokenTypes: GemType[]): Record<TokenType, number> {
  const adjusted = { ...counts }
  for (const tokenType of draftTokenTypes) adjusted[tokenType] = Math.max(0, adjusted[tokenType] - 1)
  return adjusted
}

function bankCounts(state: GameState): Record<TokenType, number> {
  const counts = emptyBankCounts()
  for (const token of state.bag) counts[token.type] += 1
  for (const cell of state.board) {
    if (cell.token) counts[cell.token.type] += 1
  }
  return counts
}

function emptyBankCounts(): Record<TokenType, number> {
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

function MarketPreview({
  state,
  canReserve,
  canPurchase,
  remoteHoverCardSourceKey,
  goldTargetCardSourceKey,
  motionCardSourceKeys,
  introAnimating,
  royalChoiceOptions,
  interactionLocked,
  onChooseRoyal,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardPointerCancel,
}: {
  state: GameState
  canReserve: boolean
  canPurchase: boolean
  remoteHoverCardSourceKey?: string
  goldTargetCardSourceKey?: string
  motionCardSourceKeys: string[]
  introAnimating: boolean
  royalChoiceOptions: number[]
  interactionLocked: boolean
  onChooseRoyal: (cardId: number) => void
  onCardPointerEnter?: (source: CardSource) => void
  onCardPointerLeave?: () => void
  onCardPointerDown?: (event: ReactPointerEvent<HTMLElement>, cardId: number, source: CardSource) => void
  onCardPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onCardPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void
  onCardPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <section className="splendorMarketPreview" aria-label="发展卡市场">
      <div className="royals splendorRoyals">
        {state.gameType === 'pokemon' ? (
          <PokemonSpecialSlots
            state={state}
            canPurchase={canPurchase}
            remoteHoverCardSourceKey={remoteHoverCardSourceKey}
            goldTargetCardSourceKey={goldTargetCardSourceKey}
            motionCardSourceKeys={motionCardSourceKeys}
            onCardPointerEnter={onCardPointerEnter}
            onCardPointerLeave={onCardPointerLeave}
            onCardPointerDown={onCardPointerDown}
            onCardPointerMove={onCardPointerMove}
            onCardPointerUp={onCardPointerUp}
            onCardPointerCancel={onCardPointerCancel}
          />
        ) : (
          <>
            {state.royalCards.map((cardId, index) => {
              const owner = royalCardOwner(state, cardId)
              const selectable = royalChoiceOptions.includes(cardId) && !owner && !interactionLocked
              return <SplendorRoyalSlot state={state} cardId={cardId} slotColumn={5 - index} owner={owner} selectable={selectable} onChoose={onChooseRoyal} key={cardId} />
            })}
            {state.status !== 'finished' && <SplendorRoyalBackStack count={state.status === 'waiting' || introAnimating ? 5 : Math.max(0, 5 - state.royalCards.length)} />}
          </>
        )}
      </div>
      <div className="marketPool">
        {[3, 2, 1].map((tier) => {
          const typedTier = tier as 1 | 2 | 3
          return (
            <div className={`marketRow marketTier${tier}`} key={tier}>
              <SplendorDeckStack
                tier={typedTier}
                count={state.decks[typedTier].length}
                variant={state.gameType}
                canReserve={canReserve}
                remoteHovered={remoteHoverCardSourceKey === sourceKey({ type: 'deck', tier: typedTier })}
                goldTargeted={goldTargetCardSourceKey === sourceKey({ type: 'deck', tier: typedTier })}
                isCarried={motionCardSourceKeys.includes(sourceKey({ type: 'deck', tier: typedTier }))}
                onCardPointerEnter={onCardPointerEnter}
                onCardPointerLeave={onCardPointerLeave}
              />
              <div className="marketCards">
                {state.market[typedTier].map((cardId, index) => {
                  const source: CardSource = { type: 'market', tier: typedTier, index }
                  const key = sourceKey(source)
                  return cardId ? (
                    <article
                      className={`marketCard ${canReserve || canPurchase ? 'cardDraggable' : ''} ${remoteHoverCardSourceKey === key ? 'remoteHover' : ''} ${goldTargetCardSourceKey === key ? 'goldTargetedCard' : ''} ${motionCardSourceKeys.includes(key) ? 'cardCarryHidden' : ''}`}
                      data-card-source-key={key}
                      data-card-drop-source={canReserve ? JSON.stringify(source) : undefined}
                      onPointerDown={canPurchase ? (event) => onCardPointerDown?.(event, cardId, source) : undefined}
                      onPointerEnter={() => onCardPointerEnter?.(source)}
                      onPointerLeave={() => onCardPointerLeave?.()}
                      onPointerMove={canPurchase ? onCardPointerMove : undefined}
                      onPointerUp={canPurchase ? onCardPointerUp : undefined}
                      onPointerCancel={canPurchase ? onCardPointerCancel : undefined}
                      key={`${tier}-${index}-${cardId}`}
                    >
                      <ClassicCardView cardId={cardId} variant={state.gameType} />
                    </article>
                  ) : (
                    <div className="emptyMarket" key={`${tier}-${index}`} />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PokemonSpecialSlots({
  state,
  canPurchase,
  remoteHoverCardSourceKey,
  goldTargetCardSourceKey,
  motionCardSourceKeys,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardPointerCancel,
}: {
  state: GameState
  canPurchase: boolean
  remoteHoverCardSourceKey?: string
  goldTargetCardSourceKey?: string
  motionCardSourceKeys: string[]
  onCardPointerEnter?: (source: CardSource) => void
  onCardPointerLeave?: () => void
  onCardPointerDown?: (event: ReactPointerEvent<HTMLElement>, cardId: number, source: CardSource) => void
  onCardPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onCardPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void
  onCardPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const special = state.pokemonSpecial
  const rows: Array<{ deck: PokemonSpecialDeck; cardId: number | null | undefined; count: number; column: number }> = [
    { deck: 'rare', cardId: special?.rareFaceUp, count: special?.rareDeck.length ?? 0, column: 1 },
    { deck: 'legendary', cardId: special?.legendaryFaceUp, count: special?.legendaryDeck.length ?? 0, column: 4 },
  ]
  const evolutionTop = special?.evolutionPile.at(-1)
  return (
    <>
      {rows.map(({ deck, cardId, count, column }) => {
        const deckSource: CardSource = { type: 'pokemonSpecial', deck }
        const faceKey = sourceKey(deckSource)
        return (
          <div className="pokemonSpecialGroup" style={{ '--royal-slot-column': column } as CSSProperties} key={deck}>
            <div
              className="pokemonSpecialSlot pokemonSpecialDeckStack"
              data-card-source-key={`${faceKey}:deck`}
              style={{ '--royal-slot-column': column } as CSSProperties}
              aria-hidden="true"
            >
              {Array.from({ length: Math.min(3, count) }).map((_, index) => (
                <div className="pokemonSpecialBackCard" style={{ '--i': index } as CSSProperties} key={index}>
                  <ClassicDeckBack tier={3} variant="pokemon" deckKind={deck} />
                </div>
              ))}
            </div>
            {cardId && (
              <article
                className={`pokemonSpecialSlot pokemonSpecialFace ${canPurchase ? 'cardDraggable' : ''} ${remoteHoverCardSourceKey === faceKey ? 'remoteHover' : ''} ${goldTargetCardSourceKey === faceKey ? 'goldTargetedCard' : ''} ${motionCardSourceKeys.includes(faceKey) ? 'cardCarryHidden' : ''}`}
                data-card-source-key={faceKey}
                onPointerDown={canPurchase ? (event) => onCardPointerDown?.(event, cardId, deckSource) : undefined}
                onPointerEnter={() => onCardPointerEnter?.(deckSource)}
                onPointerLeave={() => onCardPointerLeave?.()}
                onPointerMove={canPurchase ? onCardPointerMove : undefined}
                onPointerUp={canPurchase ? onCardPointerUp : undefined}
                onPointerCancel={canPurchase ? onCardPointerCancel : undefined}
                style={{ '--royal-slot-column': column + 1 } as CSSProperties}
              >
                <ClassicCardView cardId={cardId} variant="pokemon" />
              </article>
            )}
          </div>
        )
      })}
      <div className={`pokemonSpecialSlot pokemonEvolutionPile ${evolutionTop ? 'filledEvolutionPile' : ''}`} data-pokemon-evolution-pile style={{ '--royal-slot-column': 3 } as CSSProperties}>
        {evolutionTop ? <ClassicDeckBack tier={3} variant="pokemon" /> : null}
      </div>
    </>
  )
}

function SplendorDeckStack({
  tier,
  count,
  variant = 'classic',
  canReserve,
  remoteHovered,
  goldTargeted,
  isCarried,
  onCardPointerEnter,
  onCardPointerLeave,
}: {
  tier: 1 | 2 | 3
  count: number
  variant?: GameType
  canReserve: boolean
  remoteHovered: boolean
  goldTargeted: boolean
  isCarried: boolean
  onCardPointerEnter?: (source: CardSource) => void
  onCardPointerLeave?: () => void
}) {
  if (count <= 0) return <div className="deckStack emptyDeck" aria-hidden="true" />
  const visibleCount = Math.min(3, Math.max(0, count - (isCarried ? 1 : 0)))
  const visibleCards = Array.from({ length: visibleCount })
  const source: CardSource = { type: 'deck', tier }
  return (
    <div
      className={`deckStack deckTier${tier} ${canReserve ? 'deckReservable' : ''} ${remoteHovered ? 'remoteHover' : ''} ${goldTargeted ? 'goldTargetedDeck' : ''} ${isCarried ? 'deckCarryHidden' : ''}`}
      data-deck-tier={tier}
      data-card-source-key={sourceKey(source)}
      data-card-drop-source={canReserve ? JSON.stringify(source) : undefined}
      title={`${tier} 级牌堆`}
      style={deckBackImageStyle(tier, variant)}
      onPointerEnter={() => onCardPointerEnter?.(source)}
      onPointerLeave={() => onCardPointerLeave?.()}
    >
      {visibleCards.map((_, index) => (
        <div className="deckBack" style={{ '--i': index } as CSSProperties} key={index} />
      ))}
    </div>
  )
}

function SplendorRoyalSlot({ state, cardId, slotColumn, owner, selectable, onChoose }: { state: GameState; cardId: number; slotColumn: number; owner?: PlayerId; selectable: boolean; onChoose: (cardId: number) => void }) {
  return (
    <button
      className={`royalCardSlot ${selectable ? 'selectableRoyalCard' : ''} ${owner ? `claimedRoyalCard claimedBy-${owner}` : ''}`}
      data-classic-royal-card={cardId}
      data-tutorial-royal-card={cardId}
      disabled={!selectable}
      onClick={() => {
        if (selectable) onChoose(cardId)
      }}
      style={{ '--royal-slot-column': slotColumn } as CSSProperties}
      type="button"
    >
      <ClassicNobleView cardId={cardId} />
      {owner && <span className="royalClaimBadge">{displayPlayerName(state.players[owner])}</span>}
    </button>
  )
}

function SplendorRoyalBackStack({ count }: { count: number }) {
  if (count <= 0) return null
  const visibleCards = Math.min(3, count)
  return (
    <div className="royalCardSlot splendorRoyalBackStack" aria-hidden="true">
      {Array.from({ length: visibleCards }).map((_, index) => (
        <div className="splendorRoyalBackCard" style={{ '--i': index } as CSSProperties} key={index}>
          <ClassicDeckBack tier="royal" />
        </div>
      ))}
    </div>
  )
}

function SplendorPlayerPanel({
  state,
  playerId,
  viewerId,
  classicDraft,
  purchaseTarget,
  remotePurchaseTarget,
  showEndTurnButton,
  canEndTurn,
  revealingReserveIndices,
  hiddenReserveIndices,
  hiddenTokenSlotKeys,
  highlightedTokenSlotKeys,
  hiddenPurchasedCardKeys,
  refundableTokenIds,
  refundableReserveSlotKey,
  refundablePurchasedCardKeys,
  remoteHoveredReserveIndex,
  onDraftTokenPointerDown,
  onDiscardToken,
  onRefundPokemonAction,
  onRefundPurchasedCard,
  onConfirmTokenDraft,
  onCancelTokenDraft,
  onEndTurn,
  onReservePointerDown,
  onReservePointerEnter,
  onReservePointerLeave,
  onReservePointerMove,
  onReservePointerUp,
  onReservePointerCancel,
}: {
  state: GameState
  playerId: PlayerId
  viewerId: PlayerId
  classicDraft?: ClassicTokenDraftView
  purchaseTarget?: ClassicPurchaseTargetView
  remotePurchaseTarget?: ClassicPurchaseTargetView
  showEndTurnButton?: boolean
  canEndTurn?: boolean
  revealingReserveIndices: number[]
  hiddenReserveIndices: number[]
  hiddenTokenSlotKeys: string[]
  highlightedTokenSlotKeys: string[]
  hiddenPurchasedCardKeys: string[]
  refundableTokenIds: string[]
  refundableReserveSlotKey?: string
  refundablePurchasedCardKeys: string[]
  remoteHoveredReserveIndex?: number
  onDraftTokenPointerDown?: (event: ReactPointerEvent<HTMLElement>, playerId: PlayerId, draftIndex: number) => void
  onDiscardToken?: (token: Token) => void
  onRefundPokemonAction?: (token?: Token) => void
  onRefundPurchasedCard?: (cardId: number, purchaseIndex: number) => void
  onConfirmTokenDraft?: () => void
  onCancelTokenDraft?: () => void
  onEndTurn?: () => void
  onReservePointerDown?: (event: ReactPointerEvent<HTMLElement>, cardId: number, source: CardSource) => void
  onReservePointerEnter?: (cardId: number, index: number) => void
  onReservePointerLeave?: () => void
  onReservePointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onReservePointerUp?: (event: ReactPointerEvent<HTMLElement>) => void
  onReservePointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const player = state.players[playerId]
  const isViewer = playerId === viewerId
  const stats = playerStats(state, playerId)
  const visibleTokens = player.tokenSlots.slice(0, 10)
  const overflowTokens = player.tokenSlots.slice(10)
  const draftTokenTypes = classicDraft?.tokenTypes ?? []
  const firstDraftIndex = visibleTokens.length
  const displayTokens: Array<{ tokenType: TokenType; token?: Token; draftIndex?: number }> = [
    ...visibleTokens.map((token) => ({ tokenType: token.type, token, draftIndex: undefined as number | undefined })),
    ...draftTokenTypes.map((tokenType, draftIndex) => ({ tokenType, draftIndex })),
  ].slice(0, 10)
  const overflowDraftTokens = Math.max(0, firstDraftIndex + draftTokenTypes.length - 10)
  const draftOverflowStart = Math.max(0, 10 - firstDraftIndex)
  const overflowDisplayTokens: Array<{ tokenType: TokenType; token?: Token; slotIndex: number; draftIndex?: number }> = [
    ...overflowTokens.map((token, overflowIndex) => ({ tokenType: token.type, token, slotIndex: 10 + overflowIndex, draftIndex: undefined as number | undefined })),
    ...draftTokenTypes.slice(draftOverflowStart, draftOverflowStart + overflowDraftTokens).map((tokenType, index) => ({ tokenType, slotIndex: 10 + overflowTokens.length + index, draftIndex: draftOverflowStart + index })),
  ]
  const canDiscard = state.pending?.type === 'discard' && state.pending.playerId === viewerId && playerId === viewerId
  const displayName = displayPlayerName(player)
  return (
    <aside className={`playerPanel ${isViewer ? 'viewerPanel' : 'opponentPanel'} ${state.currentPlayer === playerId ? 'activePlayer' : ''}`} data-player-panel={playerId}>
      <header className={showEndTurnButton ? 'withEndTurnButton' : undefined}>
        <strong data-turn-name-player={playerId}>{displayName}</strong>
        {showEndTurnButton && (
          <button
            className={`hudTextButton endTurnButton splendorSeatEndTurnButton ${canEndTurn ? 'activeHudTextButton' : ''}`}
            onClick={canEndTurn ? onEndTurn : undefined}
            disabled={!canEndTurn}
            type="button"
          >
            结束回合
          </button>
        )}
        <div className="splendorReserveSlots" data-player-reserve-list={playerId} aria-label={`${displayName} 保留牌`}>
          {Array.from({ length: 3 }).map((_, index) => {
            const cardId = player.reserve[index]
            const card = cardId ? splendorCard(cardId, state.gameType) : undefined
            const revealing = isViewer && cardId && revealingReserveIndices.includes(index)
            const reserveSource: CardSource = { type: 'reserve', index }
            const reserveSlotKey = `${playerId}:reserve:${index}`
            const refundableReserve = refundableReserveSlotKey === reserveSlotKey
            return (
              <div
                className={`splendorReserveSlot ${cardId ? 'filledReserveSlot' : ''} ${cardId && isViewer ? 'ownReserveSlot' : ''} ${refundableReserve ? 'splendorRefundableReserveSlot' : ''}`}
                data-splendor-reserve-slot={index}
                onPointerDown={cardId && isViewer ? (event) => onReservePointerDown?.(event, cardId, reserveSource) : undefined}
                onPointerEnter={cardId && isViewer ? () => onReservePointerEnter?.(cardId, index) : undefined}
                onPointerLeave={cardId && isViewer ? () => onReservePointerLeave?.() : undefined}
                onPointerMove={cardId && isViewer ? onReservePointerMove : undefined}
                onPointerUp={cardId && isViewer ? onReservePointerUp : undefined}
                onPointerCancel={cardId && isViewer ? onReservePointerCancel : undefined}
                key={index}
              >
                <span className="splendorReserveCardTarget" data-splendor-reserve-target={index} aria-hidden="true" />
                {cardId && (
                  <div
                    className={`splendorReserveCardItem ${isViewer ? 'ownReserve' : 'hiddenReserve'} ${revealing ? 'reserveReveal' : ''} ${hiddenReserveIndices.includes(index) ? 'reserveCarryHidden' : ''} ${remoteHoveredReserveIndex === index ? 'remoteHover' : ''} ${refundableReserve ? 'splendorDraftCard' : ''} ${isViewer && refundableReserve ? 'splendorRefundableReserveCard' : ''}`}
                    data-card-source-key={`reserve:${index}`}
                    onPointerDown={isViewer ? (event) => {
                      event.stopPropagation()
                      onReservePointerDown?.(event, cardId, reserveSource)
                    } : undefined}
                    onPointerMove={isViewer ? onReservePointerMove : undefined}
                    onPointerUp={isViewer ? onReservePointerUp : undefined}
                    onPointerCancel={isViewer ? onReservePointerCancel : undefined}
                  >
                    <div className="splendorReserveCardInner">
                      {isViewer ? (
                        revealing ? (
                          <>
                            <div className="reserveRevealFace reserveRevealFront">
                              <ClassicCardView cardId={cardId} variant={state.gameType} />
                            </div>
                            <div className="reserveRevealFace reserveRevealBack">
                              <ClassicDeckBack tier={(card?.tier ?? 1) as 1 | 2 | 3} variant={state.gameType} deckKind={card?.deckKind} />
                            </div>
                          </>
                        ) : (
                          <ClassicCardView cardId={cardId} variant={state.gameType} />
                        )
                      ) : (
                        <ClassicDeckBack tier={(card?.tier ?? 1) as 1 | 2 | 3} variant={state.gameType} deckKind={card?.deckKind} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <span className="splendorPlayerScore" aria-label={`${displayName} 总分 ${stats.points}/${state.gameType === 'pokemon' ? POKEMON_VICTORY_POINTS : CLASSIC_VICTORY_POINTS}`}>
          {stats.points}/{state.gameType === 'pokemon' ? POKEMON_VICTORY_POINTS : CLASSIC_VICTORY_POINTS}
        </span>
      </header>
      <div
        className={`tokenSlots ${classicDraft?.hoverTokenType ? 'splendorTokenZoneDropPreview' : ''} ${draftTokenTypes.length > 0 ? 'splendorDraftZoneActive' : ''}`}
        data-token-slots-player={playerId}
        aria-label={`${displayName} 宝石槽位`}
      >
        {Array.from({ length: 10 }).map((_, index) => {
          const token = displayTokens[index]
          const isDraftToken = token?.draftIndex !== undefined
          const canDiscardToken = canDiscard && token?.token
          const refundableToken = Boolean(token?.token && refundableTokenIds.includes(token.token.id))
          const canRefundToken = isViewer && refundableToken
          const slotKey = `${playerId}:${index}`
          return (
          <span
            className={`tokenSlot ${isDraftToken ? 'splendorDraftTokenSlot' : ''} ${canDiscardToken ? 'splendorDiscardableTokenSlot' : ''} ${refundableToken ? 'splendorRefundableTokenSlot' : ''} ${canRefundToken ? 'splendorRefundableTokenControl' : ''} ${highlightedTokenSlotKeys.includes(slotKey) ? 'tokenSlotSpendPreview' : ''} ${hiddenTokenSlotKeys.includes(slotKey) ? 'tokenSlotSpending' : ''}`}
            data-token-slot-player={playerId}
            data-token-slot-index={index}
            data-token-slot-key={slotKey}
            data-splendor-draft-token-index={isDraftToken ? token.draftIndex : undefined}
            title={canRefundToken ? `退还 ${classicTokenLabel(token.tokenType)}` : undefined}
            onPointerDown={isDraftToken && classicDraft?.controllable ? (event) => onDraftTokenPointerDown?.(event, playerId, token.draftIndex!) : undefined}
            onClick={canDiscardToken ? () => onDiscardToken?.(token.token!) : canRefundToken ? () => onRefundPokemonAction?.(token.token) : undefined}
            key={index}
          >
            {token && <ClassicTokenImage color={classicColorForToken(token.tokenType)} variant={state.gameType} />}
            {canDiscardToken && <Trash2 size={13} strokeWidth={2.4} />}
          </span>
          )
        })}
      </div>
      {state.gameType !== 'pokemon' && draftTokenTypes.length > 0 && classicDraft?.controllable && (
        <div className="splendorDraftActions" aria-label="暂存宝石操作">
          <button type="button" onClick={onConfirmTokenDraft} disabled={!classicDraft.confirmable}>
            <Check size={13} />
            <span>拿取</span>
          </button>
          <button type="button" onClick={onCancelTokenDraft}>
            取消
          </button>
        </div>
      )}
      {overflowDisplayTokens.length > 0 && (
        <section className="overflowTokenTray splendorOverflowTokens" aria-label={`${displayName} 临时宝石区`}>
          {overflowDisplayTokens.map((token, index) => {
            const isDraftToken = token.draftIndex !== undefined
            const canDiscardToken = canDiscard && token.token
            const refundableToken = Boolean(token.token && refundableTokenIds.includes(token.token.id))
            const canRefundToken = isViewer && refundableToken
            const slotKey = `${playerId}:${token.slotIndex}`
            return (
              <button
                className={`overflowTokenButton splendorOverflowTokenButton ${isDraftToken ? 'splendorDraftTokenSlot' : ''} ${canDiscardToken ? 'discardableTokenButton' : ''} ${refundableToken ? 'splendorRefundableTokenSlot' : ''} ${canRefundToken ? 'splendorRefundableTokenControl' : ''} ${highlightedTokenSlotKeys.includes(slotKey) ? 'tokenSlotSpendPreview' : ''} ${hiddenTokenSlotKeys.includes(slotKey) ? 'tokenSlotSpending' : ''}`}
                type="button"
                data-token-slot-player={playerId}
                data-token-slot-index={token.slotIndex}
                data-token-slot-key={slotKey}
                data-splendor-draft-token-index={isDraftToken ? token.draftIndex : undefined}
                title={canDiscardToken ? `弃掉 ${classicTokenLabel(token.tokenType)}` : canRefundToken ? `退还 ${classicTokenLabel(token.tokenType)}` : classicTokenLabel(token.tokenType)}
                aria-label={canDiscardToken ? `弃掉 ${classicTokenLabel(token.tokenType)}` : canRefundToken ? `退还 ${classicTokenLabel(token.tokenType)}` : classicTokenLabel(token.tokenType)}
                disabled={!canDiscardToken && !canRefundToken && !(isDraftToken && classicDraft?.controllable)}
                onPointerDown={isDraftToken && classicDraft?.controllable ? (event) => onDraftTokenPointerDown?.(event, playerId, token.draftIndex!) : undefined}
                onClick={canDiscardToken ? () => onDiscardToken?.(token.token!) : canRefundToken ? () => onRefundPokemonAction?.(token.token) : undefined}
                key={`${token.token?.id ?? `draft-${token.draftIndex}`}-${index}`}
              >
                <ClassicTokenImage color={classicColorForToken(token.tokenType)} variant={state.gameType} />
                {canDiscardToken && <Trash2 size={13} strokeWidth={2.4} />}
              </button>
            )
          })}
        </section>
      )}
      <section className="playerCardArea" data-player-purchase-drop-zone={playerId}>
        <div className="purchasedPanel" data-player-purchased-pool={playerId}>
          <h3 className="panelHeadingSpacer" aria-label="已购牌" />
          <div className={`purchasedStacks ${purchaseTarget && !purchaseTarget.valid ? 'invalidPurchaseTarget' : ''} ${remotePurchaseTarget && !remotePurchaseTarget.valid ? 'remoteInvalidPurchaseTarget' : ''}`}>
            {(['white', 'blue', 'green', 'red', 'brown'] as const).map((color) => (
              <div className={`purchasedColumn ${purchaseTarget?.eligibleGems.includes(CLASSIC_COLOR_TO_TOKEN[color]) ? 'eligiblePurchaseColumn' : ''} ${purchaseTarget?.gem === CLASSIC_COLOR_TO_TOKEN[color] ? 'activePurchaseColumn' : ''} ${remotePurchaseTarget?.gem === CLASSIC_COLOR_TO_TOKEN[color] ? 'remotePurchaseColumn' : ''}`} data-purchased-column-player={playerId} data-purchased-column-gem={CLASSIC_COLOR_TO_TOKEN[color]} key={color}>
                <div className="purchasedColumnHeader">
                  <ClassicTokenImage color={color} variant={state.gameType} />
                </div>
                <div className="purchasedCardStack">
                  {player.purchased
                    .map((card, originalIndex) => ({ card, originalIndex }))
                    .filter(({ card }) => splendorCard(card.cardId, state.gameType)?.color === color)
                    .map(({ card, originalIndex }) => {
                      const purchasedKey = purchasedCardKey(playerId, originalIndex)
                      const refundable = refundablePurchasedCardKeys.includes(purchasedKey)
                      const canRefund = isViewer && refundable
                      return (
                        <div
                          className={`purchasedCardItem ${hiddenPurchasedCardKeys.includes(purchasedKey) ? 'purchasedCardMotionHidden' : ''} ${refundable ? 'splendorDraftCard' : ''} ${canRefund ? 'splendorRefundablePurchasedCard' : ''}`}
                          data-purchased-card-key={purchasedKey}
                          title={canRefund ? '退还这张牌并拿回消费的宝石' : undefined}
                          onClick={canRefund ? () => onRefundPurchasedCard?.(card.cardId, originalIndex) : undefined}
                          key={`${card.cardId}-${originalIndex}`}
                        >
                          <ClassicCardView cardId={card.cardId} variant={state.gameType} />
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </aside>
  )
}

export function ClassicCardView({ cardId, horizontal = false, variant = 'classic' }: { cardId: number; horizontal?: boolean; variant?: GameType }) {
  const card = splendorCard(cardId, variant)
  const definition = getCard(cardId)
  return (
    <div
      className={`card classicCard ${horizontal ? 'classicCardHorizontal' : ''}`}
      data-card-peek-id={cardId}
      data-card-peek-kind="classic"
      data-card-peek-variant={variant}
      title={card ? `${card.prestige} 分` : undefined}
    >
      <ClassicAtlasArt cardId={definition.cardId} />
    </div>
  )
}

export function ClassicNobleView({ cardId }: { cardId: number }) {
  const noble = CLASSIC_NOBLE_BY_ID.get(cardId)
  return (
    <div className="card classicCard classicNobleCard" data-card-peek-id={cardId} data-card-peek-kind="classicNoble" title={noble ? `${noble.prestige} 分贵族` : undefined}>
      <ClassicAtlasArt cardId={cardId} />
    </div>
  )
}

function ClassicAtlasArt({ cardId }: { cardId: number }) {
  const card = getCard(cardId)
  const atlas = CARD_ATLASES[card.atlas]
  const cellWidth = 'cellWidth' in atlas ? atlas.cellWidth : 1
  const cellHeight = 'cellHeight' in atlas ? atlas.cellHeight : 1
  return (
    <div
      className="classicCardAtlasImage"
      style={{
        aspectRatio: `${cellWidth} / ${cellHeight}`,
        backgroundImage: `url(${atlas.url})`,
        backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
        backgroundPosition: `${(card.x / Math.max(1, atlas.columns - 1)) * 100}% ${(card.y / Math.max(1, atlas.rows - 1)) * 100}%`,
      }}
    />
  )
}

export function ClassicTokenImage({ color, variant = 'classic' }: { color: BasicColor | 'gold'; variant?: GameType }) {
  return <img className="tokenImage classicTokenImage" src={assetPath(tokenImagePath(color, variant))} alt={CLASSIC_COLOR_LABELS[color]} draggable={false} />
}

export function ClassicDeckBack({ tier, variant = 'classic', deckKind }: { tier: 1 | 2 | 3 | 'royal'; variant?: GameType; deckKind?: Card['deckKind'] }) {
  return (
    <div className={tier === 'royal' ? 'reserveCardBack royalCardBack' : `reserveCardBack deckTier${tier}`} style={deckBackImageStyle(tier, variant, deckKind)}>
      <div className="deckBack" style={{ '--i': 0 } as CSSProperties} />
    </div>
  )
}

function splendorCard(cardId: number, variant: GameType): Card | undefined {
  return variant === 'pokemon' ? (POKEMON_CARD_BY_ID.get(cardId) ?? CLASSIC_CARD_BY_ID.get(cardId)) : CLASSIC_CARD_BY_ID.get(cardId)
}

function classicColorForToken(token: TokenType): BasicColor | 'gold' {
  return token === 'gold' ? 'gold' : (TOKEN_TO_CLASSIC_COLOR[token] ?? 'white')
}

function classicTokenLabel(token: TokenType): string {
  return CLASSIC_COLOR_LABELS[classicColorForToken(token)]
}

function tokenImagePath(color: BasicColor | 'gold', variant: GameType): string {
  if (variant === 'pokemon') {
    const names: Record<BasicColor | 'gold', string> = {
      white: 'healball-pink',
      blue: 'greatball-blue',
      green: 'quickball-yellow',
      red: 'pokeball-red',
      brown: 'ultraball-black',
      gold: 'masterball-purple',
    }
    return `pokemon-splendor/tokens/${names[color]}.webp`
  }
  return `splendor-base/tokens/${color}.webp`
}

function deckBackImageStyle(tier: 1 | 2 | 3 | 'royal', variant: GameType = 'classic', deckKind?: Card['deckKind']): CSSProperties {
  const filename = variant === 'pokemon'
    ? `pokemon-splendor/card-backs/${deckKind === 'rare' ? 'rare' : deckKind === 'legendary' ? 'legendary' : `stage${tier === 'royal' ? 3 : tier}`}.webp`
    : tier === 'royal' ? 'splendor-base/card-backs/noble.webp' : `splendor-base/card-backs/tier${tier}.jpg`
  return { '--deck-back-image': `url(${assetPath(filename)})` } as CSSProperties
}

function perspectiveOrder(order: PlayerId[], viewerId: PlayerId) {
  const safeOrder = order.length === 4 ? order : (['p1', 'p2', 'p3', 'p4'] as PlayerId[])
  const viewerIndex = Math.max(0, safeOrder.indexOf(viewerId))
  return {
    bottomLeft: safeOrder[viewerIndex],
    bottomRight: safeOrder[(viewerIndex + 1) % safeOrder.length],
    right: safeOrder[(viewerIndex + 2) % safeOrder.length],
    left: safeOrder[(viewerIndex + 3) % safeOrder.length],
  }
}

function winnerReasonLabel(reason: VictoryReason, gameType: GameType): string {
  if (reason === 'points') return `${gameType === 'pokemon' ? POKEMON_VICTORY_POINTS : CLASSIC_VICTORY_POINTS} 声望`
  if (reason === 'crowns') return `${VICTORY_TARGETS.crowns} 皇冠`
  return `${VICTORY_TARGETS.colorPoints} 同色声望`
}

function purchaseTargetForPanel(target: ClassicPurchaseTargetView | ClassicRemotePurchaseTargetView | undefined, panelPlayerId: PlayerId, viewerId?: PlayerId): ClassicPurchaseTargetView | undefined {
  if (!target) return undefined
  if ('playerId' in target && target.playerId !== panelPlayerId) return undefined
  if (!('playerId' in target) && viewerId !== panelPlayerId) return undefined
  return { gem: target.gem, valid: target.valid, eligibleGems: 'eligibleGems' in target ? target.eligibleGems : [] }
}

function reserveIndexFromRemoteHover(remoteHoverCardSourceKey: string | undefined, panelPlayerId: PlayerId, viewerId: PlayerId): number | undefined {
  if (panelPlayerId === viewerId || !remoteHoverCardSourceKey?.startsWith('reserve:')) return undefined
  const index = Number(remoteHoverCardSourceKey.split(':')[1])
  return Number.isFinite(index) ? index : undefined
}

function sourceKey(source: CardSource): string {
  if (source.type === 'market') return `market:${source.tier}:${source.index}`
  if (source.type === 'deck') return `deck:${source.tier}`
  if (source.type === 'pokemonSpecial') return `pokemon:${source.deck}`
  return `reserve:${source.index}`
}

function purchasedCardKey(playerId: PlayerId, index: number): string {
  return `${playerId}:purchased:${index}`
}
