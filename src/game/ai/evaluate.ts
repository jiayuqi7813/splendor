import { getCard } from '../cards'
import { GEM_TYPES, TOKEN_TYPES, type GameAction, type GameState, type PlayerId, type TokenType } from '../types'
import { CLASSIC_VICTORY_POINTS, computePayment, playerOrder, playerStats, POKEMON_VICTORY_POINTS, totalTokens, VICTORY_TARGETS } from '../rules'
import { legalMandatoryActions, legalPurchaseActions, sourceCardId } from './legalActions'
import type { AiConfig } from './types'

const TOKEN_VALUE: Record<TokenType, number> = {
  ruby: 1.5,
  sapphire: 1.5,
  onyx: 1.5,
  diamond: 1.5,
  emerald: 1.5,
  pearl: 2.8,
  gold: 3.4,
}

export function evaluateState(state: GameState, perspective: PlayerId): number {
  if (state.winner?.playerId === perspective) return 1_000_000
  if (state.winner) return -1_000_000
  const own = playerScore(state, perspective)
  const opponents = playerOrder(state).filter((playerId) => playerId !== perspective)
  if (opponents.length === 0) return own
  const strongestOpponent = Math.max(...opponents.map((playerId) => playerScore(state, playerId)))
  const averageOpponent = opponents.reduce((sum, playerId) => sum + playerScore(state, playerId), 0) / opponents.length
  return own - strongestOpponent * 0.72 - averageOpponent * 0.28
}

export function playerScore(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]
  const stats = playerStats(state, playerId)
  const pointTarget = state.gameType === 'classic' ? CLASSIC_VICTORY_POINTS : state.gameType === 'pokemon' ? POKEMON_VICTORY_POINTS : VICTORY_TARGETS.points
  const totalProgress = progress(stats.points, pointTarget)
  const crownProgress = progress(stats.crowns, VICTORY_TARGETS.crowns)
  const bestColorPoints = Math.max(...GEM_TYPES.map((gem) => stats.colorPoints[gem]))
  const colorProgress = progress(bestColorPoints, VICTORY_TARGETS.colorPoints)
  const bonusScore = GEM_TYPES.reduce((sum, gem) => sum + stats.bonuses[gem] * 4, 0)
  const tokenScore = TOKEN_TYPES.reduce((sum, token) => sum + player.tokens[token] * TOKEN_VALUE[token], 0)
  const overflow = Math.max(0, totalTokens(player) - 10)
  const reserveScore = player.reserve.reduce((sum, cardId) => sum + scoreCard(state, playerId, cardId) * 0.16, 0)
  if (state.gameType === 'classic' || state.gameType === 'pokemon') {
    return (
      stats.points * 24 +
      150 * totalProgress +
      bonusScore * 1.35 +
      tokenScore +
      reserveScore -
      overflow * 22
    )
  }

  return (
    stats.points * 20 +
    stats.crowns * 14 +
    bestColorPoints * 16 +
    120 * totalProgress +
    115 * crownProgress +
    130 * colorProgress +
    bonusScore +
    tokenScore +
    player.privileges * 3.5 +
    reserveScore -
    overflow * 18
  )
}

export function scoreCard(state: GameState, playerId: PlayerId, cardId: number): number {
  const card = getCard(cardId)
  const stats = playerStats(state, playerId)
  const missing = missingCost(state, playerId, cardId)
  const missingCount = Object.values(missing).reduce((sum, value) => sum + value, 0)
  const cardColor = card.wild ? bestWildColor(state, playerId) : card.color
  const colorPath = cardColor ? stats.colorPoints[cardColor] : 0
  if (state.gameType === 'classic' || state.gameType === 'pokemon') {
    return card.points * 18 + (card.color ? 8 : 0) + colorPath * 1.5 - missingCount * 6
  }
  const ability =
    card.ability === 'extraTurn'
      ? 24
      : card.ability === 'stealToken'
        ? 12
        : card.ability === 'takePrivilege'
          ? 9
          : card.ability?.startsWith('take')
            ? 9
            : 0
  return card.points * 14 + card.crowns * 10 + (card.doubleGem ? 8 : card.color ? 5 : 0) + (card.wild ? 16 : 0) + ability + colorPath * 2 - missingCount * 7
}

export function scoreAction(state: GameState, playerId: PlayerId, action: GameAction, nextState: GameState, config: AiConfig): { score: number; tags: string[] } {
  const tags: string[] = [action.type]
  let score = evaluateState(nextState, playerId)
  if (nextState.winner?.playerId === playerId) tags.push('immediateWin')
  if (action.type === 'purchaseCard') {
    const cardId = sourceCardId(state, playerId, action.source)
    if (cardId) {
      const card = getCard(cardId)
      tags.push('purchase')
      if (card.ability === 'extraTurn') tags.push('extraTurn')
      if (card.crowns > 0) tags.push('crownProgress')
      score += scoreCard(state, playerId, cardId)
    }
  }
  if (action.type === 'reserveCard') {
    tags.push('reserve')
    const cardId = sourceCardId(state, playerId, action.source)
    if (cardId) score += scoreCard(state, playerId, cardId) * 0.45 + 10
  }
  if (action.type === 'takeTokens') {
    const taken = action.cellIds.flatMap((cellId) => state.board.find((cell) => cell.id === cellId)?.token?.type ?? [])
    if (taken.length === 3 && taken.every((token) => token === taken[0])) score -= 6
    if (taken.filter((token) => token === 'pearl').length >= 2) score -= 5
  }
  if (action.type === 'takeClassicBankTokens') {
    tags.push('takeBankTokens')
    const purchaseDelta = legalPurchaseActions(nextState, playerId).length - legalPurchaseActions(state, playerId).length
    score += purchaseDelta * 24
    if (new Set(action.tokenTypes).size === action.tokenTypes.length) score += 4
  }
  if (action.type === 'evolvePokemon') {
    tags.push('evolution')
    score += 70
  }
  if (action.type === 'endTurn') tags.push('endTurn')
  if (action.type === 'usePrivilege') {
    tags.push('usePrivilege')
    if (legalPurchaseActions(nextState, playerId).length > legalPurchaseActions(state, playerId).length) {
      tags.push('enablesPurchase')
      score += 28
    } else {
      score -= 3
    }
  }
  if (action.type === 'replenishBoard') {
    tags.push('replenish')
    if (legalMandatoryActions(state, playerId, config).length > 0) score -= 8 * config.behavior.replenishPenaltyWeight
    else score += 18
  }
  return { score, tags }
}

export function bestWildColor(state: GameState, playerId: PlayerId) {
  const stats = playerStats(state, playerId)
  return GEM_TYPES.reduce((best, gem) => (stats.colorPoints[gem] > stats.colorPoints[best] ? gem : best), GEM_TYPES[0])
}

export function missingCost(state: GameState, playerId: PlayerId, cardId: number): Record<Exclude<TokenType, 'gold'>, number> {
  const card = getCard(cardId)
  const stats = playerStats(state, playerId)
  const player = state.players[playerId]
  let goldLeft = player.tokens.gold
  const missing = { ruby: 0, sapphire: 0, onyx: 0, diamond: 0, emerald: 0, pearl: 0 }
  for (const token of [...GEM_TYPES, 'pearl'] as const) {
    const discounted = token === 'pearl' ? card.cost.pearl : Math.max(0, card.cost[token] - stats.bonuses[token])
    const gap = Math.max(0, discounted - player.tokens[token])
    const coveredByGold = Math.min(goldLeft, gap)
    goldLeft -= coveredByGold
    missing[token] = gap - coveredByGold
  }
  return missing
}

export function canPurchaseAfterAction(state: GameState, playerId: PlayerId): boolean {
  return legalPurchaseActions(state, playerId).some((action) => {
    if (action.type !== 'purchaseCard') return false
    const cardId = sourceCardId(state, playerId, action.source)
    return Boolean(cardId && computePayment(state, playerId, cardId))
  })
}

function progress(value: number, target: number): number {
  const ratio = Math.max(0, Math.min(1, value / target))
  return Math.pow(ratio, 2.1)
}
