import { cloneState, playerOrder } from '../rules'
import type { GameState, PlayerId, Tier } from '../types'
import type { AiConfig, AiMemory, Rng } from './types'

const TIERS: Tier[] = [1, 2, 3]

export function makeObservation(state: GameState, aiPlayerId: PlayerId, config: AiConfig, _memory?: AiMemory): GameState {
  if (config.hiddenInfoMode === 'oracleDebug') return state
  const observation = cloneState(state)
  if (!config.fairness.allowBagOrderKnowledge) {
    observation.bag = [...observation.bag].sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`))
  }
  if (!config.fairness.allowDeckTopKnowledge) {
    for (const tier of TIERS) observation.decks[tier] = [...observation.decks[tier]].sort((left, right) => left - right)
  }
  if (!config.fairness.allowOpponentReserveIds) {
    for (const opponentId of playerOrder(observation)) {
      if (opponentId !== aiPlayerId) observation.players[opponentId].reserve = []
    }
  }
  return observation
}

export function determinizeForAi(state: GameState, aiPlayerId: PlayerId, config: AiConfig, memory: AiMemory | undefined, _rng: Rng): GameState {
  return makeObservation(state, aiPlayerId, config, memory)
}
