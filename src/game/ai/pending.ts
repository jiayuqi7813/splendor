import { applyAction, otherPlayer, playerOrder } from '../rules'
import type { GameAction, GameState, PlayerId, TokenType } from '../types'
import { evaluateState, missingCost } from './evaluate'
import { legalPendingActions } from './legalActions'
import type { AiConfig, AiDecisionTrace, AiMemory, Rng } from './types'

export function choosePendingAction(
  state: GameState,
  playerId: PlayerId,
  config: AiConfig,
  memory: AiMemory | undefined,
  _rng: Rng,
): { action: GameAction | null; updatedMemory?: AiMemory; trace: AiDecisionTrace } {
  const actions = legalPendingActions(state, playerId)
  const ranked = actions
    .map((action) => {
      const next = safeApply(state, action)
      return {
        action,
        score: next ? evaluateState(next, playerId) + pendingTiebreak(state, playerId, action) : -Infinity,
        tags: [action.type, 'pending'],
      }
    })
    .sort((left, right) => right.score - left.score)
  const selected = ranked[0]
  return {
    action: selected?.action ?? null,
    updatedMemory: memory,
    trace: {
      difficulty: config.difficulty,
      effectiveStrength: 1,
      hiddenInfoMode: config.hiddenInfoMode,
      candidateCount: actions.length,
      selectedRank: selected ? 1 : 0,
      selectedTags: selected?.tags ?? [],
      topCandidates: ranked.slice(0, 4).map((item) => ({
        actionSummary: summarizeAction(item.action),
        score: item.score,
        tags: item.tags,
      })),
      stuckPending: actions.length === 0,
    },
  }
}

export function settleForcedPendingsForSimulation(state: GameState, perspective: PlayerId, config: AiConfig): GameState {
  let current = state
  for (let index = 0; index < 10; index += 1) {
    const pending = current.pending
    if (!pending) return current
    const playerId = pending.playerId
    const actions = legalPendingActions(current, playerId)
    if (actions.length === 0) return current
    const sign = playerId === perspective ? 1 : -1
    const best = actions
      .map((action) => ({ action, next: safeApply(current, action) }))
      .filter((item): item is { action: GameAction; next: GameState } => Boolean(item.next))
      .sort((left, right) => sign * (evaluateState(right.next, perspective) - evaluateState(left.next, perspective)))[0]
    if (!best) return current
    current = best.next
  }
  return current
}

export function summarizeAction(action: GameAction): string {
  if (action.type === 'takeTokens') return `takeTokens ${action.cellIds.join(',')}`
  if (action.type === 'takeClassicBankTokens') return `takeClassicBankTokens ${action.tokenTypes.join(',')}`
  if (action.type === 'usePrivilege') return `usePrivilege ${action.cellId}`
  if (action.type === 'reserveCard') return `reserveCard ${action.source.type} gold=${action.goldCellId}`
  if (action.type === 'purchaseCard') return `purchaseCard ${action.source.type}${action.wildColor ? ` wildColor=${action.wildColor}` : ''}`
  if (action.type === 'evolvePokemon') return `evolvePokemon ${action.source.type}`
  if (action.type === 'endTurn') return 'endTurn'
  if (action.type === 'chooseRoyal') return `chooseRoyal ${action.cardId}`
  if (action.type === 'takeBoardToken') return `takeBoardToken ${action.cellId}`
  if (action.type === 'stealToken') return `stealToken ${action.tokenType}`
  if (action.type === 'discardToken') return `discardToken ${action.tokenType}`
  return action.type
}

function pendingTiebreak(state: GameState, playerId: PlayerId, action: GameAction): number {
  if (action.type === 'stealToken') return action.tokenType === 'pearl' ? 4 : 1
  if (action.type === 'discardToken') {
    if (action.tokenType === 'gold') return -20
    if (action.tokenType === 'pearl') return -8
    const opponent = state.gameType === 'classic' || state.gameType === 'pokemon'
      ? playerOrder(state).find((id) => id !== playerId) ?? otherPlayer(playerId)
      : otherPlayer(playerId)
    const ownNeed = Math.min(...missingCostForVisibleCards(state, playerId, action.tokenType))
    const opponentNeed = Math.min(...missingCostForVisibleCards(state, opponent, action.tokenType))
    return ownNeed <= 0 ? -2 : opponentNeed <= 0 ? 1 : 3
  }
  return 0
}

function missingCostForVisibleCards(state: GameState, playerId: PlayerId, tokenType: TokenType): number[] {
  if (tokenType === 'gold') return [0]
  return state.market[1]
    .concat(state.market[2], state.market[3])
    .flatMap((cardId) => (cardId ? [missingCost(state, playerId, cardId)[tokenType] ?? 0] : []))
}

function safeApply(state: GameState, action: GameAction): GameState | undefined {
  try {
    return applyAction(state, action)
  } catch {
    return undefined
  }
}
