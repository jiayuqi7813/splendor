import { getCard } from '@/game/cards'
import { GEM_TYPES, TOKEN_TYPES, type GameState, type GemType, type PlayerId, type Token, type TokenType } from '@/game/types'
import { playerStats, VICTORY_TARGETS, victoryProgress } from '@/game/rules'
import { TOKEN_IMAGES, TOKEN_LABELS } from '@/game/data/static'
import { displayPlayerName } from '@/game/playerDisplay'
import { CardView } from './CardView'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { assetPath } from '@/utils/paths'
import { HandGrab, Trash2 } from 'lucide-react'

export function PlayerPanel({
  state,
  playerId,
  viewerId,
  highlightedTokenSlotKeys = [],
  spendingTokenSlotKeys = [],
  carriedTokenSlotIndex,
  tokenSlotDropIndex,
  carriedReserveIndex,
  hiddenReserveIndices = [],
  revealingReserveIndices = [],
  hiddenPrivilegeIndexes = [],
  highlightedPrivilegeIndexes = [],
  interactivePrivileges = false,
  activePrivilegeIndex,
  remoteHoveredReserveIndex,
  eligiblePurchaseGems = [],
  activePurchaseGem,
  activeColorlessPurchase = false,
  invalidPurchaseTarget = false,
  invalidColorlessPurchase = false,
  remotePurchaseGem,
  remoteColorlessPurchase = false,
  remotePurchaseInvalid = false,
  remoteColorlessInvalid = false,
  discardCount,
  stealMode = false,
  onPrivilegePointerDown,
  onTokenSlotPointerDown,
  onDiscardToken,
  onStealToken,
  onReservePointerDown,
  onReservePointerEnter,
  onReservePointerLeave,
  onReservePointerMove,
  onReservePointerUp,
  onReservePointerCancel,
}: {
  state: GameState
  playerId: PlayerId
  viewerId?: PlayerId
  highlightedTokenSlotKeys?: string[]
  spendingTokenSlotKeys?: string[]
  carriedTokenSlotIndex?: number
  tokenSlotDropIndex?: number
  carriedReserveIndex?: number
  hiddenReserveIndices?: number[]
  revealingReserveIndices?: number[]
  hiddenPrivilegeIndexes?: number[]
  highlightedPrivilegeIndexes?: number[]
  interactivePrivileges?: boolean
  activePrivilegeIndex?: number
  remoteHoveredReserveIndex?: number
  eligiblePurchaseGems?: GemType[]
  activePurchaseGem?: GemType
  activeColorlessPurchase?: boolean
  invalidPurchaseTarget?: boolean
  invalidColorlessPurchase?: boolean
  remotePurchaseGem?: GemType
  remoteColorlessPurchase?: boolean
  remotePurchaseInvalid?: boolean
  remoteColorlessInvalid?: boolean
  discardCount?: number
  stealMode?: boolean
  onPrivilegePointerDown?: (event: ReactPointerEvent<HTMLElement>, index: number) => void
  onTokenSlotPointerDown?: (event: ReactPointerEvent<HTMLElement>, index: number) => void
  onDiscardToken?: (token: Token) => void
  onStealToken?: (token: Token) => void
  onReservePointerDown?: (event: ReactPointerEvent<HTMLElement>, cardId: number, index: number) => void
  onReservePointerEnter?: (cardId: number, index: number) => void
  onReservePointerLeave?: (cardId: number, index: number) => void
  onReservePointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onReservePointerUp?: (event: ReactPointerEvent<HTMLElement>) => void
  onReservePointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const player = state.players[playerId]
  const isViewer = viewerId === playerId
  const progress = victoryProgress(state, playerId)
  const colorlessPurchased = colorlessPurchasedSummary(player.purchased)
  const playerTokens = orderedTokens(player.tokenSlots, player.tokens)
  const visibleTokens = playerTokens.slice(0, 10)
  const overflowTokens = playerTokens.slice(10)
  const canDiscard = isViewer && Boolean(discardCount)
  const canSteal = !isViewer && stealMode
  const displayName = displayPlayerName(player)
  return (
    <aside
      className={`playerPanel ${isViewer ? 'viewerPanel' : 'opponentPanel'} ${state.currentPlayer === playerId ? 'activePlayer' : ''} ${overflowTokens.length > 0 ? 'overflowMode' : ''} ${discardCount ? 'discardMode' : ''} ${stealMode ? 'stealMode' : ''}`}
      data-player-panel={playerId}
    >
      <header>
        <strong data-turn-name-player={playerId}>{displayName}</strong>
      </header>
      <div className="tokenSlots" data-token-drop-player={playerId} aria-label={`${displayName} token 槽位`}>
	        {Array.from({ length: 10 }).map((_, index) => {
	          const token = visibleTokens[index]
          const slotKey = `${playerId}:${index}`
	          return (
              <TokenSlot
                token={token}
                playerId={playerId}
                index={index}
                interactive={isViewer && !discardCount}
                highlighted={highlightedTokenSlotKeys.includes(slotKey)}
                spending={spendingTokenSlotKeys.includes(slotKey)}
                discardable={canDiscard}
                stealable={canSteal && token?.type !== 'gold'}
                carried={carriedTokenSlotIndex === index}
                dropTarget={tokenSlotDropIndex === index}
                onPointerDown={onTokenSlotPointerDown}
                onDiscardToken={onDiscardToken}
                onStealToken={onStealToken}
                key={index}
              />
            )
	        })}
      </div>
      {overflowTokens.length > 0 && <OverflowTokenTray tokens={overflowTokens} discardable={canDiscard} stealable={canSteal} onDiscardToken={onDiscardToken} onStealToken={onStealToken} />}
      {discardCount && <DiscardTokenPanel count={discardCount} />}
      <section className="victoryPanel" aria-label={`${displayName} 胜利条件进度`}>
        <PrivilegeSlots
          playerId={playerId}
          count={player.privileges}
          hiddenIndexes={hiddenPrivilegeIndexes}
          highlightedIndexes={highlightedPrivilegeIndexes}
          interactive={interactivePrivileges}
          activeIndex={activePrivilegeIndex}
          onPointerDown={onPrivilegePointerDown}
        />
        <div className="victoryTracks">
          <VictoryTrack kind="prestige" label="声望" value={progress.points} target={VICTORY_TARGETS.points} complete={progress.wins.points} />
          <VictoryTrack kind="crown" label="皇冠" value={progress.crowns} target={VICTORY_TARGETS.crowns} complete={progress.wins.crowns} />
          <VictoryTrack
            kind="sameColor"
            label="同色"
            value={progress.bestColorPoints}
            target={VICTORY_TARGETS.colorPoints}
            complete={progress.wins.colorPoints}
          />
          <ColorlessPurchasedTrack
            playerId={playerId}
            count={colorlessPurchased.count}
            points={colorlessPurchased.points}
            active={activeColorlessPurchase}
            invalid={invalidColorlessPurchase}
            remoteActive={remoteColorlessPurchase}
            remoteInvalid={remoteColorlessInvalid}
          />
        </div>
      </section>
      <section className="playerCardArea">
        <div className="reservePanel" data-player-reserve-pool={playerId}>
          <h3 className="panelHeadingSpacer" aria-label="保留牌" />
          <div className="reserveList" data-player-reserve-list={playerId}>
            {player.reserve.map((cardId, index) => (
              <ReserveCardSlot
                cardId={cardId}
                index={index}
                isViewer={isViewer}
                isCarried={carriedReserveIndex === index || hiddenReserveIndices.includes(index)}
                revealing={isViewer && revealingReserveIndices.includes(index)}
                remoteHovered={remoteHoveredReserveIndex === index}
                onPointerDown={onReservePointerDown}
                onPointerEnter={onReservePointerEnter}
                onPointerLeave={onReservePointerLeave}
                onPointerMove={onReservePointerMove}
                onPointerUp={onReservePointerUp}
                onPointerCancel={onReservePointerCancel}
                key={`${cardId}-${index}`}
              />
            ))}
          </div>
        </div>
        <div className="purchasedPanel" data-player-purchased-pool={playerId}>
          <h3 className="panelHeadingSpacer" aria-label="已购牌" />
          <PurchasedStacks
            playerId={playerId}
            purchased={player.purchased}
            eligibleGems={eligiblePurchaseGems}
            activeGem={activePurchaseGem}
            invalidTarget={invalidPurchaseTarget}
            remoteGem={remotePurchaseGem}
            remoteInvalid={remotePurchaseInvalid}
          />
        </div>
      </section>
    </aside>
  )
}

function OverflowTokenTray({
  tokens,
  discardable,
  stealable,
  onDiscardToken,
  onStealToken,
}: {
  tokens: Token[]
  discardable: boolean
  stealable: boolean
  onDiscardToken?: (token: Token) => void
  onStealToken?: (token: Token) => void
}) {
  return (
    <section className="overflowTokenTray" aria-label={`临时宝石区 ${tokens.length} 枚`}>
      {tokens.map((token) => {
        const canStealToken = stealable && token.type !== 'gold'
        return (
          <button
            className={`overflowTokenButton ${discardable ? 'discardableTokenButton' : ''} ${canStealToken ? 'stealableTokenButton' : ''}`}
            type="button"
            title={discardable ? `弃掉 ${TOKEN_LABELS[token.type]}` : canStealToken ? `拿取 ${TOKEN_LABELS[token.type]}` : TOKEN_LABELS[token.type]}
            aria-label={discardable ? `弃掉 ${TOKEN_LABELS[token.type]}` : canStealToken ? `拿取 ${TOKEN_LABELS[token.type]}` : TOKEN_LABELS[token.type]}
            disabled={!discardable && !canStealToken}
            onClick={() => {
              if (discardable) onDiscardToken?.(token)
              else if (canStealToken) onStealToken?.(token)
            }}
            key={token.id}
          >
            <TokenImage token={token.type} />
            {discardable && <Trash2 size={13} strokeWidth={2.4} />}
            {canStealToken && <HandGrab size={13} strokeWidth={2.4} />}
          </button>
        )
      })}
    </section>
  )
}

function DiscardTokenPanel({ count }: { count: number }) {
  return (
    <section className="discardTokenPanel" aria-label={`需要弃掉 ${count} 枚 token`}>
      <Trash2 size={15} strokeWidth={2.4} />
      <span className="discardTokenCount" aria-hidden="true">{count}</span>
    </section>
  )
}

function PurchasedStacks({
  playerId,
  purchased,
  eligibleGems,
  activeGem,
  invalidTarget,
  remoteGem,
  remoteInvalid,
}: {
  playerId: PlayerId
  purchased: GameState['players'][PlayerId]['purchased']
  eligibleGems: GemType[]
  activeGem?: GemType
  invalidTarget: boolean
  remoteGem?: GemType
  remoteInvalid: boolean
}) {
  const cardsByGem = new Map<GemType, Array<{ cardId: number; wildColor?: GemType; purchaseIndex: number }>>(GEM_TYPES.map((gem) => [gem, []]))
  purchased.forEach((card, purchaseIndex) => {
    const definition = getCard(card.cardId)
    const gem = card.wildColor ?? definition.color
    if (gem && definition.tier !== 'royal') cardsByGem.get(gem)?.push({ ...card, purchaseIndex })
  })

  return (
    <div className={`purchasedStacks ${invalidTarget ? 'invalidPurchaseTarget' : ''} ${remoteInvalid ? 'remoteInvalidPurchaseTarget' : ''}`}>
      {GEM_TYPES.map((gem) => {
        const cards = cardsByGem.get(gem) ?? []
        return (
          <div
            className={`purchasedColumn ${eligibleGems.includes(gem) ? 'eligiblePurchaseColumn' : ''} ${activeGem === gem ? 'activePurchaseColumn' : ''} ${remoteGem === gem ? 'remotePurchaseColumn' : ''}`}
            data-purchased-column-player={playerId}
            data-purchased-column-gem={gem}
            key={gem}
            title={TOKEN_LABELS[gem]}
          >
            <div className="purchasedColumnHeader" aria-hidden="true">
              <TokenImage token={gem} />
            </div>
            <div className="purchasedCardStack">
              {cards.map((card, stackIndex) => (
                <div className="purchasedCardItem" style={{ zIndex: stackIndex + 1 } as CSSProperties} key={`${card.cardId}-${card.wildColor ?? 'base'}-${card.purchaseIndex}`}>
                  <CardView cardId={card.cardId} wildColor={card.wildColor} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReserveCardSlot({
  cardId,
  index,
  isViewer,
  isCarried,
  revealing,
  remoteHovered,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  cardId: number
  index: number
  isViewer: boolean
  isCarried: boolean
  revealing: boolean
  remoteHovered: boolean
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>, cardId: number, index: number) => void
  onPointerEnter?: (cardId: number, index: number) => void
  onPointerLeave?: (cardId: number, index: number) => void
  onPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <div
      className={`reserveCardItem ${isViewer ? 'ownReserve' : 'hiddenReserve'} ${isCarried ? 'reserveCarryHidden' : ''} ${remoteHovered ? 'remoteHover' : ''} ${revealing ? 'reserveReveal' : ''}`}
      data-card-source-key={`reserve:${index}`}
      onPointerDown={(event) => isViewer && onPointerDown?.(event, cardId, index)}
      onPointerEnter={() => isViewer && onPointerEnter?.(cardId, index)}
      onPointerLeave={() => isViewer && onPointerLeave?.(cardId, index)}
      onPointerMove={isViewer ? onPointerMove : undefined}
      onPointerUp={isViewer ? onPointerUp : undefined}
      onPointerCancel={isViewer ? onPointerCancel : undefined}
    >
      <div className="reserveCardInner">
        {isViewer ? (
          revealing ? (
            <>
              <div className="reserveRevealFace reserveRevealFront">
                <CardView cardId={cardId} />
              </div>
              <div className="reserveRevealFace reserveRevealBack">
                <ReserveCardBack cardId={cardId} />
              </div>
            </>
          ) : (
            <CardView cardId={cardId} />
          )
        ) : (
          <ReserveCardBack cardId={cardId} />
        )}
      </div>
    </div>
  )
}

function ReserveCardBack({ cardId }: { cardId: number }) {
  const tier = getCard(cardId).tier
  const className = tier === 'royal' ? 'reserveCardBack royalCardBack' : `reserveCardBack deckTier${tier}`
  return (
    <div className={className} title={`${tier} 级牌背`} style={deckBackImageStyle(tier)}>
      <div className="deckBack" style={{ '--i': 0 } as CSSProperties} />
    </div>
  )
}

function deckBackImageStyle(tier: 1 | 2 | 3 | 'royal'): CSSProperties {
  const filename = tier === 'royal' ? 'card-back-royal.png' : `card-back-tier${tier}.png`
  return { '--deck-back-image': `url(${assetPath(filename)})` } as CSSProperties
}

function PrivilegeSlots({
  playerId,
  count,
  hiddenIndexes = [],
  highlightedIndexes = [],
  interactive = false,
  activeIndex,
  onPointerDown,
}: {
  playerId: PlayerId
  count: number
  hiddenIndexes?: number[]
  highlightedIndexes?: number[]
  interactive?: boolean
  activeIndex?: number
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>, index: number) => void
}) {
  return (
    <div className="playerPrivilegeSlots" aria-label={`特权卷轴 ${count} 张`}>
      {Array.from({ length: 3 }).map((_, index) => (
        <span
          className={`${index < count ? 'playerPrivilegeSlot filledPrivilegeSlot' : 'playerPrivilegeSlot'} ${hiddenIndexes.includes(index) ? 'privilegeMovingHidden' : ''} ${highlightedIndexes.includes(index) ? 'highlightedAwardPrivilege' : ''} ${interactive && index < count ? 'interactivePrivilegeSlot' : ''} ${activeIndex === index ? 'activePrivilegeSlot' : ''}`}
          data-privilege-slot-player={playerId}
          data-privilege-slot-index={index}
          onPointerDown={(event) => {
            if (interactive && index < count) onPointerDown?.(event, index)
          }}
          key={index}
        >
          {index < count && <img src={assetPath('privilege.png')} alt="" draggable={false} style={privilegeTiltStyle(playerId, index)} />}
        </span>
      ))}
    </div>
  )
}

const PRIVILEGE_TILTS = [-13, -7, 4, 9, 15] as const

function privilegeTiltStyle(playerId: PlayerId, index: number): CSSProperties {
  const seed = playerId === 'p1' ? 3 : 7
  const tilt = PRIVILEGE_TILTS[(seed + index * 2) % PRIVILEGE_TILTS.length]
  return { '--privilege-tilt': `${tilt}deg` } as CSSProperties
}

function colorlessPurchasedSummary(purchased: GameState['players'][PlayerId]['purchased']): { count: number; points: number } {
  return purchased.reduce(
    (summary, item) => {
      const card = getCard(item.cardId)
      if (item.wildColor || card.color) return summary
      return {
        count: summary.count + 1,
        points: summary.points + card.points,
      }
    },
    { count: 0, points: 0 },
  )
}

function VictoryTrack({
  kind,
  label,
  value,
  target,
  complete,
}: {
  kind: VictoryTrackKind
  label: string
  value: number
  target: number
  complete: boolean
}) {
  const clamped = Math.min(1, value / target)
  return (
    <div className={`victoryTrack ${complete ? 'complete' : ''}`} aria-label={`${label} ${value}/${target}`}>
      <span className="victoryTrackLabel" title={label}>
        <img src={VICTORY_TRACK_ICONS[kind]} alt="" draggable={false} />
      </span>
      <span className="victoryTrackBar">
        <span style={{ transform: `scaleX(${clamped})` }} />
      </span>
      <strong>
        {value}/{target}
      </strong>
    </div>
  )
}

function ColorlessPurchasedTrack({
  playerId,
  count,
  points,
  active,
  invalid,
  remoteActive,
  remoteInvalid,
}: {
  playerId: PlayerId
  count: number
  points: number
  active: boolean
  invalid: boolean
  remoteActive: boolean
  remoteInvalid: boolean
}) {
  return (
    <div
      className={`colorlessPurchasedTrack ${count > 0 ? 'hasCards' : ''} ${active ? 'activeColorlessPurchaseTarget' : ''} ${invalid ? 'invalidColorlessPurchaseTarget' : ''} ${remoteActive ? 'remoteColorlessPurchaseTarget' : ''} ${remoteInvalid ? 'remoteInvalidColorlessPurchaseTarget' : ''}`}
      data-colorless-purchased-player={playerId}
      aria-label={`无宝石卡 ${count} 张，共 ${points} 分`}
      title="无宝石卡"
    >
      <span>{count}张:</span>
      <strong>+{points}分</strong>
    </div>
  )
}

type VictoryTrackKind = 'prestige' | 'crown' | 'sameColor'

const VICTORY_TRACK_ICONS: Record<VictoryTrackKind, string> = {
  prestige: assetPath('victory-icons/victory-prestige.png'),
  crown: assetPath('victory-icons/victory-crown.png'),
  sameColor: assetPath('victory-icons/victory-same-color.png'),
}

export function WildColorSelect({
  value,
  onChange,
  available,
}: {
  value: GemType
  onChange: (value: GemType) => void
  available: Record<GemType, number>
}) {
  return (
    <label className="inlineControl">
      万能颜色
      <select value={value} onChange={(event) => onChange(event.target.value as GemType)}>
        {GEM_TYPES.map((gem) => (
          <option value={gem} key={gem} disabled={available[gem] === 0}>
            {TOKEN_LABELS[gem]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function playableWildColor(state: GameState, playerId: PlayerId): GemType {
  const bonuses = playerStats(state, playerId).bonuses
  return GEM_TYPES.find((gem) => bonuses[gem] > 0) ?? 'ruby'
}

export function cardNeedsWildChoice(cardId: number): boolean {
  return getCard(cardId).wild
}

export function discardableTokens(state: GameState, playerId: PlayerId): TokenType[] {
  return TOKEN_TYPES.filter((token) => state.players[playerId].tokens[token] > 0)
}

export function TokenImage({ token, className = '' }: { token: TokenType; className?: string }) {
  return <img className={`tokenImage ${className}`} src={TOKEN_IMAGES[token]} alt={TOKEN_LABELS[token]} draggable={false} />
}

function TokenSlot({
  token,
  playerId,
  index,
  interactive,
  highlighted,
  spending,
  discardable,
  stealable,
  carried,
  dropTarget,
  onPointerDown,
  onDiscardToken,
  onStealToken,
}: {
  token?: Token
  playerId: PlayerId
  index: number
  interactive: boolean
  highlighted: boolean
  spending: boolean
  discardable: boolean
  stealable: boolean
  carried: boolean
  dropTarget: boolean
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>, index: number) => void
  onDiscardToken?: (token: Token) => void
  onStealToken?: (token: Token) => void
}) {
  return (
    <span
      className={`tokenSlot ${interactive && token ? 'sortableTokenSlot' : ''} ${discardable && token ? 'discardableTokenSlot' : ''} ${stealable && token ? 'stealableTokenSlot' : ''} ${highlighted ? 'tokenSlotSpendPreview' : ''} ${spending ? 'tokenSlotSpending' : ''} ${carried ? 'tokenSlotCarried' : ''} ${dropTarget ? 'tokenSlotDropTarget' : ''}`}
      data-token-slot-player={playerId}
      data-token-slot-index={index}
      onPointerDown={(event) => {
        if (interactive && token && !spending) onPointerDown?.(event, index)
      }}
      onClick={() => {
        if (discardable && token && !spending) onDiscardToken?.(token)
        else if (stealable && token && !spending) onStealToken?.(token)
      }}
    >
      {token && <TokenImage token={token.type} />}
      {discardable && token && <Trash2 size={13} strokeWidth={2.4} />}
      {stealable && token && <HandGrab size={13} strokeWidth={2.4} />}
    </span>
  )
}

function orderedTokens(tokenSlots: Token[] | undefined, counts: Record<TokenType, number>): Token[] {
  if (tokenSlots?.length) return tokenSlots
  const fallback: Token[] = []
  for (const type of TOKEN_TYPES) {
    for (let index = 0; index < counts[type]; index += 1) fallback.push({ id: `${type}-${index}`, type })
  }
  return fallback
}
