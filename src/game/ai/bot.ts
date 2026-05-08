import { applyAction } from '../rules'
import type { GameAction, GameState, PlayerId } from '../types'
import { effectiveStrengthFor, resolveConfig } from './difficulty'
import { evaluateState, scoreAction } from './evaluate'
import { legalActions, legalPokemonEvolutionActions } from './legalActions'
import { makeObservation } from './observation'
import { choosePendingAction, settleForcedPendingsForSimulation, summarizeAction } from './pending'
import { createRng, softmaxSample } from './rng'
import type { AiDecision, AiDecisionTrace, ChooseAiActionInput } from './types'

export function chooseAiAction(input: ChooseAiActionInput): AiDecision {
  const config = resolveConfig(input.config)
  const memory = input.memory
  const rng = input.rng ?? createRng(config.seed ?? `${input.state.roomId}:${input.state.turnNumber}:${input.aiPlayerId}`)
  const effectiveStrength = memory?.effectiveStrength ?? effectiveStrengthFor(config.difficulty)

  if (input.state.status !== 'playing' || input.state.winner) return { action: null, updatedMemory: memory }
  if (input.state.pending) {
    if (input.state.pending.playerId !== input.aiPlayerId) return { action: null, updatedMemory: memory }
    return choosePendingAction(input.state, input.aiPlayerId, config, memory, rng)
  }
  if (input.state.currentPlayer !== input.aiPlayerId) return { action: null, updatedMemory: memory }

  if (input.state.gameType === 'pokemon' && input.state.turnActions?.mandatoryDone) {
    const evolutions = input.state.turnActions.evolved ? [] : legalPokemonEvolutionActions(input.state, input.aiPlayerId)
    const forgetRate = config.behavior.evolutionForgetRate ?? 0
    if (evolutions.length > 0 && rng.next() >= forgetRate) {
      const rankedEvolutions = evolutions
        .map((action) => rankAction(input.state, input.aiPlayerId, action, config))
        .filter((item): item is RankedAction => Boolean(item))
        .sort((left, right) => right.score - left.score)
      const selected = rankedEvolutions[0]
      if (selected) {
        return {
          action: selected.action,
          updatedMemory: { ...memory, effectiveStrength },
          trace: trace(config.difficulty, effectiveStrength, config.hiddenInfoMode, rankedEvolutions, 1, selected),
        }
      }
    }
    return {
      action: { type: 'endTurn', playerId: input.aiPlayerId },
      updatedMemory: { ...memory, effectiveStrength },
      trace: trace(config.difficulty, effectiveStrength, config.hiddenInfoMode, [], 1, {
        action: { type: 'endTurn', playerId: input.aiPlayerId },
        score: evaluateState(input.state, input.aiPlayerId),
        tags: evolutions.length > 0 ? ['endTurn', 'forgotEvolution'] : ['endTurn'],
      }),
    }
  }

  const actions = legalActions(input.state, input.aiPlayerId, config)
  const observation = makeObservation(input.state, input.aiPlayerId, config, memory)
  const ranked = actions
    .map((action) => rankAction(observation, input.aiPlayerId, action, config))
    .filter((item): item is RankedAction => Boolean(item))
    .sort((left, right) => right.score - left.score)

  const immediateWin = ranked.find((item) => item.tags.includes('immediateWin'))
  const selected = immediateWin ?? selectRanked(ranked, config, rng)
  const selectedRank = selected ? ranked.findIndex((item) => item.action === selected.action) + 1 : 0

  return {
    action: selected?.action ?? null,
    updatedMemory: { ...memory, effectiveStrength },
    trace: trace(config.difficulty, effectiveStrength, config.hiddenInfoMode, ranked, selectedRank, selected),
  }
}

interface RankedAction {
  action: GameAction
  score: number
  tags: string[]
}

function rankAction(observation: GameState, playerId: PlayerId, action: GameAction, config: ReturnType<typeof resolveConfig>): RankedAction | undefined {
  try {
    const nextObserved = settleForcedPendingsForSimulation(applyAction(observation, action), playerId, config)
    const scored = scoreAction(observation, playerId, action, nextObserved, config)
    if (nextObserved.winner?.playerId === playerId) scored.tags.push('immediateWin')
    return { action, score: scored.score + tacticalLookahead(nextObserved, playerId), tags: [...new Set(scored.tags)] }
  } catch {
    return undefined
  }
}

function tacticalLookahead(state: GameState, playerId: PlayerId): number {
  if (state.winner?.playerId === playerId) return 1_000_000
  const currentEval = evaluateState(state, playerId)
  if (state.currentPlayer === playerId && !state.pending) {
    const purchaseBonus = legalActions(state, playerId)
      .filter((action) => action.type === 'purchaseCard')
      .length
    return currentEval * 0.05 + purchaseBonus * 12
  }
  return currentEval * 0.03
}

function selectRanked(ranked: RankedAction[], config: ReturnType<typeof resolveConfig>, rng: ReturnType<typeof createRng>): RankedAction | undefined {
  if (ranked.length === 0) return undefined
  const top = ranked.slice(0, Math.max(1, config.behavior.topK))
  if (rng.next() < config.behavior.blunderRate && ranked.length > top.length) {
    return ranked[Math.min(ranked.length - 1, top.length + Math.floor(rng.next() * Math.min(4, ranked.length - top.length)))]
  }
  return softmaxSample(top, (item) => item.score, config.behavior.temperature * 40, rng) ?? top[0]
}

function trace(
  difficulty: AiDecisionTrace['difficulty'],
  effectiveStrength: number,
  hiddenInfoMode: AiDecisionTrace['hiddenInfoMode'],
  ranked: RankedAction[],
  selectedRank: number,
  selected: RankedAction | undefined,
): AiDecisionTrace {
  return {
    difficulty,
    effectiveStrength,
    hiddenInfoMode,
    candidateCount: ranked.length,
    selectedRank,
    selectedTags: selected?.tags ?? [],
    topCandidates: ranked.slice(0, 5).map((item) => ({
      actionSummary: summarizeAction(item.action),
      score: Number(item.score.toFixed(2)),
      tags: item.tags,
    })),
  }
}
