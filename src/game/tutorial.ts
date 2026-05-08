import { legalActions } from './ai/legalActions'
import { otherPlayer } from './rules'
import { type CardSource, type GameAction, type GameState, type PlayerId, type TokenType } from './types'

export type TutorialFrequency = 'common' | 'rare'

export type TutorialKind =
  | 'turnOverview'
  | 'takeTokens'
  | 'purchaseCard'
  | 'reserveCard'
  | 'replenishBoard'
  | 'usePrivilege'
  | 'chooseRoyal'
  | 'takeBoardToken'
  | 'stealToken'
  | 'discardToken'
  | 'wildColor'

export type TutorialCounts = Partial<Record<TutorialKind, number>>

export interface TutorialStep {
  kind: TutorialKind
  frequency: TutorialFrequency
  key: string
  targetSelector: string
  targetSelectors?: string[]
  allowedSelectors?: string[]
  text: string
}

const COMMON_LIMIT = 3
const RARE_LIMIT = 1

const COMMON_KINDS = new Set<TutorialKind>(['turnOverview', 'takeTokens', 'purchaseCard', 'reserveCard', 'replenishBoard', 'usePrivilege'])

export function tutorialLimitForKind(kind: TutorialKind): number {
  return COMMON_KINDS.has(kind) ? COMMON_LIMIT : RARE_LIMIT
}

export function tutorialFrequencyForKind(kind: TutorialKind): TutorialFrequency {
  return COMMON_KINDS.has(kind) ? 'common' : 'rare'
}

export function canShowTutorialKind(kind: TutorialKind, counts: TutorialCounts): boolean {
  return (counts[kind] ?? 0) < tutorialLimitForKind(kind)
}

export function selectTutorialStep(state: GameState, playerId: PlayerId, counts: TutorialCounts = {}): TutorialStep | undefined {
  if (state.status !== 'playing' || state.winner) return undefined
  if (state.pending && state.pending.playerId !== playerId) return undefined
  if (!state.pending && state.currentPlayer !== playerId) return undefined

  const actions = legalActions(state, playerId)
  if (actions.length === 0) return undefined

  const candidates = state.pending ? pendingCandidates(state, playerId, actions) : turnCandidates(state, playerId, actions)
  return candidates.find((candidate) => canShowTutorialKind(candidate.kind, counts))
}

function pendingCandidates(state: GameState, playerId: PlayerId, actions: GameAction[]): TutorialStep[] {
  const pending = state.pending
  if (!pending || pending.playerId !== playerId) return []

  if (pending.type === 'chooseRoyal') {
    const action = actions.find((item): item is Extract<GameAction, { type: 'chooseRoyal' }> => item.type === 'chooseRoyal')
    return action
      ? [
          step('chooseRoyal', `chooseRoyal:${state.turnNumber}:${action.cardId}`, `[data-tutorial-royal-card="${action.cardId}"]`, '选择一张高亮皇家牌，它会加入你的已购区并继续结算。'),
        ]
      : []
  }

  if (pending.type === 'takeBoardToken') {
    const action = actions.find((item): item is Extract<GameAction, { type: 'takeBoardToken' }> => item.type === 'takeBoardToken')
    return action ? [step('takeBoardToken', `takeBoardToken:${state.turnNumber}:${action.cellId}`, cellSelector(action.cellId), `点击高亮的 ${tokenLabel(pending.tokenType)} token，完成这张牌的奖励。`)] : []
  }

  if (pending.type === 'stealToken') {
    const action = actions.find((item): item is Extract<GameAction, { type: 'stealToken' }> => item.type === 'stealToken')
    const token = firstOpponentTokenSlot(state, otherPlayer(playerId), action?.tokenType)
    return action && token
      ? [
          step(
            'stealToken',
            `stealToken:${state.turnNumber}:${token.index}`,
            `[data-token-slot-player="${otherPlayer(playerId)}"][data-token-slot-index="${token.index}"]`,
            '点击高亮的对手 token，把它拿到自己的 token 区。',
          ),
        ]
      : []
  }

  if (pending.type === 'discard') {
    const token = firstOwnTokenSlot(state, playerId)
    return token
      ? [
          step(
            'discardToken',
            `discardToken:${state.turnNumber}:${token.index}:${pending.count}`,
            `[data-token-slot-player="${playerId}"][data-token-slot-index="${token.index}"]`,
            `你的 token 超过上限，点击高亮 token 弃掉 ${pending.count} 枚。`,
          ),
        ]
      : []
  }

  return []
}

function turnCandidates(state: GameState, playerId: PlayerId, actions: GameAction[]): TutorialStep[] {
  const candidates: TutorialStep[] = []

  const purchaseActions = actions.filter((action): action is Extract<GameAction, { type: 'purchaseCard' }> => action.type === 'purchaseCard')
  if (purchaseActions.length > 0) {
    const cardSelectors = unique(purchaseActions.map((action) => cardSourceSelector(action.source)))
    candidates.push({
      ...step('purchaseCard', `purchaseCard:${state.turnNumber}:${cardSelectors.join('|')}`, cardSelectors[0], '你现在可以买牌。把高亮卡牌拖到自己的已购牌区，系统会自动计算并支付 token。'),
      targetSelectors: [...cardSelectors, `[data-player-purchased-pool="${playerId}"]`],
    })
  }

  const reserveActions = actions.filter((action): action is Extract<GameAction, { type: 'reserveCard' }> => action.type === 'reserveCard')
  if (reserveActions.length > 0) {
    const goldSelectors = unique(reserveActions.map((action) => cellSelector(action.goldCellId)))
    const cardSelectors = unique(reserveActions.map((action) => cardSourceSelector(action.source)))
    candidates.push({
      ...step('reserveCard', `reserveCard:${state.turnNumber}:${goldSelectors.join('|')}:${cardSelectors.join('|')}`, goldSelectors[0], '你可以保留牌。把高亮黄金 token 拖到一张高亮卡牌上，卡牌会进入保留区。'),
      targetSelectors: [...goldSelectors, ...cardSelectors],
    })
  }

  const takeTokenActions = actions.filter((action): action is Extract<GameAction, { type: 'takeTokens' }> => action.type === 'takeTokens')
  if (takeTokenActions.length > 0) {
    candidates.push({
      ...step('takeTokens', `takeTokens:${state.turnNumber}`, '.tokenBoard', '在棋盘框选 1-3 个连续宝石，然后点击“拿取”。框到 3 个同色或 2 个珍珠会让对手获得特权卷轴。'),
      targetSelectors: ['.tokenBoard'],
      allowedSelectors: ['[data-tutorial-token-take]'],
    })
  }

  const privilegeActions = actions.filter((action): action is Extract<GameAction, { type: 'usePrivilege' }> => action.type === 'usePrivilege')
  if (privilegeActions.length > 0) {
    candidates.push({
      ...step('usePrivilege', `usePrivilege:${state.turnNumber}`, `[data-player-panel="${playerId}"] .playerPrivilegeSlots`, '你可以先用特权卷轴额外拿 1 枚非黄金 token，然后继续本回合主要行动。'),
      targetSelectors: [`[data-player-panel="${playerId}"] .playerPrivilegeSlots`, '.tokenBoard'],
    })
  }

  if (actions.some((action) => action.type === 'replenishBoard')) {
    candidates.push(step('replenishBoard', `replenishBoard:${state.turnNumber}`, '[data-tutorial-replenish]', '棋盘有空位时可以补棋盘；这样会让对手获得 1 张特权卷轴。'))
  }

  if (actions.some((action) => ['takeTokens', 'reserveCard', 'purchaseCard', 'replenishBoard', 'usePrivilege'].includes(action.type))) {
    const overviewTargets = ['.tokenBoard']
    if (purchaseActions.length > 0 || reserveActions.length > 0) overviewTargets.push('.marketPool', `[data-player-panel="${playerId}"] [data-player-reserve-pool="${playerId}"]`)
    if (privilegeActions.length > 0) overviewTargets.push(`[data-player-panel="${playerId}"] .playerPrivilegeSlots`)
    if (actions.some((action) => action.type === 'replenishBoard')) overviewTargets.push('[data-tutorial-replenish]')
    candidates.push({
      ...step(
        'turnOverview',
        `turnOverview:${state.turnNumber}:${state.currentPlayer}`,
        '.tokenBoard',
        '这是你的行动选择总览。当前高亮区域都是可用操作：可以拿宝石，也可能可以买牌、保留牌、使用特权或补棋盘。',
      ),
      targetSelectors: overviewTargets,
    })
  }

  return candidates
}

function step(kind: TutorialKind, key: string, targetSelector: string, text: string): TutorialStep {
  return { kind, frequency: tutorialFrequencyForKind(kind), key, targetSelector, text }
}

function firstOwnTokenSlot(state: GameState, playerId: PlayerId): { index: number; tokenType: TokenType } | undefined {
  return state.players[playerId].tokenSlots.map((token, index) => ({ index, tokenType: token.type })).find((item) => item.index < 10)
}

function firstOpponentTokenSlot(state: GameState, playerId: PlayerId, tokenType?: Exclude<TokenType, 'gold'>): { index: number; tokenType: TokenType } | undefined {
  return state.players[playerId].tokenSlots
    .map((token, index) => ({ index, tokenType: token.type }))
    .find((item) => item.index < 10 && item.tokenType !== 'gold' && (!tokenType || item.tokenType === tokenType))
}

function cellSelector(cellId: string): string {
  return `[data-cell-id="${cellId}"]`
}

function cardSourceSelector(source: CardSource): string {
  return `[data-card-source-key="${sourceKey(source)}"]`
}

function sourceKey(source: CardSource): string {
  if (source.type === 'market') return `market:${source.tier}:${source.index}`
  if (source.type === 'reserve') return `reserve:${source.index}`
  if (source.type === 'pokemonSpecial') return `pokemon:${source.deck}`
  return `deck:${source.tier}`
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function tokenLabel(tokenType: TokenType): string {
  if (tokenType === 'ruby') return '红宝石'
  if (tokenType === 'sapphire') return '蓝宝石'
  if (tokenType === 'onyx') return '玛瑙'
  if (tokenType === 'diamond') return '钻石'
  if (tokenType === 'emerald') return '祖母绿'
  if (tokenType === 'pearl') return '珍珠'
  return '黄金'
}
