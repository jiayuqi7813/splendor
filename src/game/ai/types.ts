import type { AiDifficultyId, GameAction, GameState, GemType, PlayerId, TokenType } from '../types'

export type DifficultyId = AiDifficultyId

export type HiddenInfoMode = 'strictFair' | 'humanMemoryFair' | 'oracleDebug'

export interface AiConfig {
  difficulty: DifficultyId
  hiddenInfoMode: HiddenInfoMode
  behavior: {
    temperature: number
    topK: number
    blunderRate: number
    replenishPenaltyWeight: number
    evolutionForgetRate?: number
  }
  fairness: {
    allowDeckTopKnowledge: boolean
    allowBagOrderKnowledge: boolean
    allowOpponentReserveIds: boolean
  }
  seed?: string | number
}

export interface AiMemory {
  effectiveStrength?: number
  knownOpponentReserveIds?: number[]
}

export interface AiDecisionTrace {
  difficulty: DifficultyId
  effectiveStrength: number
  hiddenInfoMode: HiddenInfoMode
  candidateCount: number
  selectedRank: number
  selectedTags: string[]
  topCandidates: Array<{
    actionSummary: string
    score: number
    tags: string[]
  }>
  stuckPending?: boolean
}

export type AiDecision =
  | {
      action: GameAction
      updatedMemory?: AiMemory
      trace?: AiDecisionTrace
    }
  | {
      action: null
      updatedMemory?: AiMemory
      trace?: AiDecisionTrace
    }

export interface ChooseAiActionInput {
  state: GameState
  aiPlayerId: PlayerId
  config?: Partial<AiConfig>
  memory?: AiMemory
  rng?: Rng
}

export interface Rng {
  next(): number
}

export interface TurnPlan {
  actions: GameAction[]
  firstAction: GameAction
  endsTurn: boolean
  tags: string[]
}

export interface EvalContext {
  config: AiConfig
  perspective: PlayerId
}

export interface OpponentModel {
  need: Record<Exclude<TokenType, 'gold'>, number>
  targetCards: Array<{ cardId: number; probability: number }>
}

export type TokenNeed = Record<Exclude<TokenType, 'gold'>, number>

export type ColorValues = Record<GemType, number>
