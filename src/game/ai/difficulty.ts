import type { AiConfig, DifficultyId } from './types'

export const AI_DIFFICULTY_IDS = ['idiot', 'beginner', 'casual', 'standard', 'hard', 'expert', 'nightmare', 'oracleDebug'] as const

const baseFairness = {
  allowDeckTopKnowledge: false,
  allowBagOrderKnowledge: false,
  allowOpponentReserveIds: false,
}

export const AI_PRESETS: Record<DifficultyId, AiConfig> = {
  idiot: {
    difficulty: 'idiot',
    hiddenInfoMode: 'strictFair',
    behavior: { temperature: 1.2, topK: 16, blunderRate: 0.35, replenishPenaltyWeight: 0.15, evolutionForgetRate: 0.75 },
    fairness: baseFairness,
  },
  beginner: {
    difficulty: 'beginner',
    hiddenInfoMode: 'strictFair',
    behavior: { temperature: 0.75, topK: 8, blunderRate: 0.12, replenishPenaltyWeight: 0.35, evolutionForgetRate: 0.55 },
    fairness: baseFairness,
  },
  casual: {
    difficulty: 'casual',
    hiddenInfoMode: 'strictFair',
    behavior: { temperature: 0.45, topK: 6, blunderRate: 0.06, replenishPenaltyWeight: 0.7, evolutionForgetRate: 0.34 },
    fairness: baseFairness,
  },
  standard: {
    difficulty: 'standard',
    hiddenInfoMode: 'humanMemoryFair',
    behavior: { temperature: 0.2, topK: 4, blunderRate: 0.02, replenishPenaltyWeight: 0.9, evolutionForgetRate: 0.18 },
    fairness: baseFairness,
  },
  hard: {
    difficulty: 'hard',
    hiddenInfoMode: 'humanMemoryFair',
    behavior: { temperature: 0.08, topK: 2, blunderRate: 0.005, replenishPenaltyWeight: 1.1, evolutionForgetRate: 0.08 },
    fairness: baseFairness,
  },
  expert: {
    difficulty: 'expert',
    hiddenInfoMode: 'humanMemoryFair',
    behavior: { temperature: 0.02, topK: 1, blunderRate: 0, replenishPenaltyWeight: 1.2, evolutionForgetRate: 0 },
    fairness: baseFairness,
  },
  nightmare: {
    difficulty: 'nightmare',
    hiddenInfoMode: 'oracleDebug',
    behavior: { temperature: 0, topK: 1, blunderRate: 0, replenishPenaltyWeight: 1.45, evolutionForgetRate: 0 },
    fairness: {
      allowDeckTopKnowledge: true,
      allowBagOrderKnowledge: true,
      allowOpponentReserveIds: true,
    },
  },
  oracleDebug: {
    difficulty: 'oracleDebug',
    hiddenInfoMode: 'oracleDebug',
    behavior: { temperature: 0, topK: 1, blunderRate: 0, replenishPenaltyWeight: 1.25, evolutionForgetRate: 0 },
    fairness: {
      allowDeckTopKnowledge: true,
      allowBagOrderKnowledge: true,
      allowOpponentReserveIds: true,
    },
  },
}

export function isDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === 'string' && (AI_DIFFICULTY_IDS as readonly string[]).includes(value)
}

export function resolveConfig(config?: Partial<AiConfig>): AiConfig {
  const difficulty = config?.difficulty ?? 'standard'
  const preset = AI_PRESETS[difficulty]
  return {
    ...preset,
    ...config,
    behavior: { ...preset.behavior, ...config?.behavior },
    fairness: { ...preset.fairness, ...config?.fairness },
  }
}

export function effectiveStrengthFor(difficulty: DifficultyId): number {
  if (difficulty === 'idiot') return 0.08
  if (difficulty === 'beginner') return 0.25
  if (difficulty === 'casual') return 0.4
  if (difficulty === 'standard') return 0.58
  if (difficulty === 'hard') return 0.78
  if (difficulty === 'expert') return 0.95
  return 1
}
