import { getCard } from '../cards'
import { GEM_TYPES, TOKEN_TYPES, type CardSource, type GameAction, type GameState, type GemType, type PlayerId, type Tier, type TokenType } from '../types'
import { availableRoyalCards, computePayment, playerStats, otherPlayer } from '../rules'
import type { AiConfig } from './types'

const TIERS: Tier[] = [1, 2, 3]
const LINE_DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const

export function legalActions(state: GameState, playerId: PlayerId, config?: AiConfig): GameAction[] {
  if (state.status !== 'playing' || state.winner) return []
  if (state.pending) {
    if (state.pending.playerId !== playerId) return []
    return legalPendingActions(state, playerId)
  }
  if (state.currentPlayer !== playerId) return []
  if (state.gameType === 'pokemon' && state.turnActions?.mandatoryDone) {
    const evolutionActions = state.turnActions.evolved ? [] : legalPokemonEvolutionActions(state, playerId)
    return [...evolutionActions, { type: 'endTurn', playerId }]
  }
  return [...legalOptionalActions(state, playerId), ...legalMandatoryActions(state, playerId, config)]
}

export function legalPendingActions(state: GameState, playerId: PlayerId): GameAction[] {
  const pending = state.pending
  if (!pending || pending.playerId !== playerId) return []
  if (pending.type === 'chooseRoyal') {
    const available = new Set(availableRoyalCards(state))
    return pending.options.filter((cardId) => available.has(cardId)).map((cardId) => ({ type: 'chooseRoyal', playerId, cardId }))
  }
  if (pending.type === 'takeBoardToken') {
    return state.board
      .filter((cell) => cell.token?.type === pending.tokenType)
      .map((cell) => ({ type: 'takeBoardToken', playerId, cellId: cell.id }))
  }
  if (pending.type === 'stealToken') {
    const opponent = state.players[otherPlayer(playerId)]
    return ([...GEM_TYPES, 'pearl'] as const)
      .filter((tokenType) => opponent.tokens[tokenType] > 0)
      .map((tokenType) => ({ type: 'stealToken', playerId, tokenType }))
  }
  if (pending.type === 'discard') {
    return TOKEN_TYPES.filter((tokenType) => state.players[playerId].tokens[tokenType] > 0).map((tokenType) => ({
      type: 'discardToken',
      playerId,
      tokenType,
    }))
  }
  return []
}

export function legalOptionalActions(state: GameState, playerId: PlayerId): GameAction[] {
  if (state.gameType === 'classic' || state.gameType === 'pokemon') return []
  const actions: GameAction[] = []
  const player = state.players[playerId]
  if (player.privileges > 0 && !state.turnActions?.replenished) {
    for (const cell of state.board) {
      if (cell.token && cell.token.type !== 'gold') actions.push({ type: 'usePrivilege', playerId, cellId: cell.id })
    }
  }
  if (!state.turnActions?.replenished && state.board.some((cell) => !cell.token) && state.bag.length > 0) {
    actions.push({ type: 'replenishBoard', playerId })
  }
  return actions
}

export function legalMandatoryActions(state: GameState, playerId: PlayerId, config?: AiConfig): GameAction[] {
  if (state.gameType === 'classic' || state.gameType === 'pokemon') return [...legalClassicBankTokenActions(state, playerId), ...legalReserveActions(state, playerId, config), ...legalPurchaseActions(state, playerId)]
  return [...legalTakeTokenActions(state, playerId), ...legalReserveActions(state, playerId, config), ...legalPurchaseActions(state, playerId)]
}

export function legalTakeTokenActions(state: GameState, playerId: PlayerId): GameAction[] {
  if (state.gameType === 'classic' || state.gameType === 'pokemon') return []
  const cellsByPosition = new Map(state.board.map((cell) => [`${cell.x}:${cell.y}`, cell]))
  const actions = new Map<string, GameAction>()
  for (const cell of state.board) {
    if (cell.token && cell.token.type !== 'gold') {
      actions.set(cell.id, { type: 'takeTokens', playerId, cellIds: [cell.id] })
    }
    for (const [dx, dy] of LINE_DIRECTIONS) {
      for (const length of [2, 3] as const) {
        const cells = Array.from({ length }, (_, index) => cellsByPosition.get(`${cell.x + dx * index}:${cell.y + dy * index}`))
        if (cells.every((item) => item?.token && item.token.type !== 'gold')) {
          const cellIds = cells.map((item) => item!.id)
          const key = [...cellIds].sort().join('|')
          actions.set(key, { type: 'takeTokens', playerId, cellIds })
        }
      }
    }
  }
  return [...actions.values()]
}

export function legalClassicBankTokenActions(state: GameState, playerId: PlayerId): GameAction[] {
  if (state.gameType !== 'classic' && state.gameType !== 'pokemon') return []
  const counts = classicBankCounts(state)
  const actions: GameAction[] = []
  for (let left = 0; left < GEM_TYPES.length; left += 1) {
    for (let middle = left + 1; middle < GEM_TYPES.length; middle += 1) {
      for (let right = middle + 1; right < GEM_TYPES.length; right += 1) {
        const tokenTypes = [GEM_TYPES[left], GEM_TYPES[middle], GEM_TYPES[right]]
        if (tokenTypes.every((tokenType) => counts[tokenType] > 0)) actions.push({ type: 'takeClassicBankTokens', playerId, tokenTypes })
      }
    }
  }
  for (const tokenType of GEM_TYPES) {
    if (counts[tokenType] >= 4) actions.push({ type: 'takeClassicBankTokens', playerId, tokenTypes: [tokenType, tokenType] })
  }
  return actions
}

export function legalReserveActions(state: GameState, playerId: PlayerId, _config?: AiConfig): GameAction[] {
  const player = state.players[playerId]
  if (player.reserve.length >= 3) return []
  const goldCellId = reservableGoldCellId(state)
  if (!goldCellId) return []
  const sources: CardSource[] = []
  for (const tier of TIERS) {
    state.market[tier].forEach((cardId, index) => {
      if (cardId) sources.push({ type: 'market', tier, index })
    })
  }
  for (const tier of TIERS) {
    if (state.decks[tier].length > 0) {
      sources.push({ type: 'deck', tier })
    }
  }
  return sources.map((source) => ({ type: 'reserveCard', playerId, source, goldCellId }) satisfies GameAction)
}

export function legalPurchaseActions(state: GameState, playerId: PlayerId): GameAction[] {
  const sources: Array<{ source: CardSource; cardId: number }> = []
  for (const tier of TIERS) {
    state.market[tier].forEach((cardId, index) => {
      if (cardId) sources.push({ source: { type: 'market', tier, index }, cardId })
    })
  }
  if (state.gameType === 'pokemon' && state.pokemonSpecial) {
    if (state.pokemonSpecial.rareFaceUp) sources.push({ source: { type: 'pokemonSpecial', deck: 'rare' }, cardId: state.pokemonSpecial.rareFaceUp })
    if (state.pokemonSpecial.legendaryFaceUp) sources.push({ source: { type: 'pokemonSpecial', deck: 'legendary' }, cardId: state.pokemonSpecial.legendaryFaceUp })
  }
  state.players[playerId].reserve.forEach((cardId, index) => sources.push({ source: { type: 'reserve', index }, cardId }))

  const bonuses = playerStats(state, playerId).bonuses
  return sources.flatMap(({ source, cardId }) => {
    if (!computePayment(state, playerId, cardId)) return []
    const card = getCard(cardId)
    if (!card.wild) return [{ type: 'purchaseCard', playerId, source }]
    return GEM_TYPES.filter((gem) => bonuses[gem] > 0).map((wildColor: GemType) => ({ type: 'purchaseCard', playerId, source, wildColor }))
  })
}

export function legalPokemonEvolutionActions(state: GameState, playerId: PlayerId): GameAction[] {
  if (state.gameType !== 'pokemon' || !state.turnActions?.mandatoryDone || state.turnActions.evolved) return []
  const player = state.players[playerId]
  const sources: Array<{ source: CardSource; cardId: number }> = []
  for (const tier of TIERS) {
    state.market[tier].forEach((cardId, index) => {
      if (cardId) sources.push({ source: { type: 'market', tier, index }, cardId })
    })
  }
  player.reserve.forEach((cardId, index) => sources.push({ source: { type: 'reserve', index }, cardId }))
  const bonuses = playerStats(state, playerId).bonuses
  return sources.flatMap(({ source, cardId }) => {
    const card = getCard(cardId)
    if (card.deckKind !== 'common' || !card.evolvesFrom) return []
    const base = player.purchased.find((purchased) => {
      const baseCard = getCard(purchased.cardId)
      if (baseCard.name !== card.evolvesFrom || !baseCard.evolutionCost) return false
      return GEM_TYPES.every((gem) => bonuses[gem] >= baseCard.evolutionCost![gem])
    })
    if (!base) return []
    return [{ type: 'evolvePokemon', playerId, source }]
  })
}

export function sourceCardId(state: GameState, playerId: PlayerId, source: CardSource): number | undefined {
  if (source.type === 'market') return state.market[source.tier][source.index] ?? undefined
  if (source.type === 'reserve') return state.players[playerId].reserve[source.index]
  if (source.type === 'pokemonSpecial') return source.deck === 'rare' ? state.pokemonSpecial?.rareFaceUp ?? undefined : state.pokemonSpecial?.legendaryFaceUp ?? undefined
  return state.decks[source.tier][0]
}

function classicBankCounts(state: GameState): Record<TokenType, number> {
  const counts = Object.fromEntries(TOKEN_TYPES.map((tokenType) => [tokenType, 0])) as Record<TokenType, number>
  for (const token of state.bag) counts[token.type] += 1
  for (const cell of state.board) {
    if (cell.token) counts[cell.token.type] += 1
  }
  return counts
}

function reservableGoldCellId(state: GameState): string | undefined {
  const boardGold = state.board.find((cell) => cell.token?.type === 'gold')
  if (boardGold) return boardGold.id
  if ((state.gameType === 'classic' || state.gameType === 'pokemon') && state.bag.some((token) => token.type === 'gold')) return 'bank:gold'
  return undefined
}
