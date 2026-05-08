import { describe, expect, it, vi } from 'vitest'
import { chooseAiAction } from '../bot'
import { AI_DIFFICULTY_IDS, AI_PRESETS, effectiveStrengthFor, isDifficultyId } from '../difficulty'
import { legalActions } from '../legalActions'
import { applyAction, createInitialGame } from '../../rules'
import type { GameState, PlayerId, TokenType } from '../../types'

function playingState(currentPlayer: PlayerId = 'p1'): GameState {
  const state = createInitialGame(`ai-test-${Math.random()}`)
  state.players.p1.connected = true
  state.players.p2.connected = true
  state.status = 'playing'
  state.currentPlayer = currentPlayer
  state.pending = undefined
  return state
}

function classicPlayingState(currentPlayer: PlayerId = 'p1'): GameState {
  const state = createInitialGame(`classic-ai-test-${Math.random()}`, { gameType: 'classic', playerCount: 4 })
  for (const playerId of state.playerOrder) {
    state.players[playerId].connected = true
    state.players[playerId].seated = true
  }
  state.status = 'playing'
  state.currentPlayer = currentPlayer
  state.firstPlayer = 'p1'
  state.pending = undefined
  return state
}

function giveToken(state: GameState, playerId: PlayerId, token: TokenType, count = 1) {
  for (let index = 0; index < count; index += 1) {
    state.players[playerId].tokens[token] += 1
    state.players[playerId].tokenSlots.push({ id: `${token}-${playerId}-${index}`, type: token })
  }
}

function seededRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

describe('AI bot', () => {
  it('defines slider-facing difficulty presets from idiot to nightmare', () => {
    expect(isDifficultyId('idiot')).toBe(true)
    expect(isDifficultyId('nightmare')).toBe(true)
    expect(isDifficultyId('broken')).toBe(false)
    expect(AI_DIFFICULTY_IDS).toContain('idiot')
    expect(AI_DIFFICULTY_IDS).toContain('nightmare')
    expect(effectiveStrengthFor('idiot')).toBeLessThan(effectiveStrengthFor('beginner'))
    expect(AI_PRESETS.nightmare.hiddenInfoMode).toBe('oracleDebug')
    expect(AI_PRESETS.nightmare.fairness.allowDeckTopKnowledge).toBe(true)
  })

  it('returns a legal action that applyAction accepts', () => {
    const state = playingState('p1')
    const decision = chooseAiAction({ state, aiPlayerId: 'p1', config: { difficulty: 'standard', seed: 'legal' } })
    expect(decision.action).toBeTruthy()
    expect(legalActions(state, 'p1').some((action) => JSON.stringify(action) === JSON.stringify(decision.action))).toBe(true)
    expect(() => applyAction(state, decision.action!)).not.toThrow()
    expect(decision.trace?.candidateCount).toBeGreaterThan(0)
  })

  it('chooses from classic Splendor bank, reserve, and purchase actions', () => {
    const state = classicPlayingState('p1')
    const actions = legalActions(state, 'p1')
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.every((action) => !['takeTokens', 'usePrivilege', 'replenishBoard'].includes(action.type))).toBe(true)
    expect(actions.some((action) => action.type === 'takeClassicBankTokens')).toBe(true)

    const decision = chooseAiAction({ state, aiPlayerId: 'p1', config: { difficulty: 'standard', seed: 'classic-legal' } })
    expect(decision.action).toBeTruthy()
    expect(actions.some((action) => JSON.stringify(action) === JSON.stringify(decision.action))).toBe(true)
    expect(() => applyAction(state, decision.action!)).not.toThrow()
  })

  it('returns null when it is not the AI turn or pending', () => {
    const state = playingState('p2')
    const decision = chooseAiAction({ state, aiPlayerId: 'p1' })
    expect(decision.action).toBeNull()
  })

  it('handles all supported pending choices', () => {
    const royalState = playingState('p1')
    royalState.royalCards = [1400, 1401]
    royalState.pending = { type: 'chooseRoyal', playerId: 'p1', reason: 'threeCrowns', options: [1400, 1401], resume: { extraTurn: false } }
    expect(chooseAiAction({ state: royalState, aiPlayerId: 'p1' }).action?.type).toBe('chooseRoyal')

    const boardState = playingState('p1')
    boardState.pending = { type: 'takeBoardToken', playerId: 'p1', tokenType: 'ruby', resume: { extraTurn: false } }
    boardState.board[0].token = { id: 'ruby-pending', type: 'ruby' }
    expect(chooseAiAction({ state: boardState, aiPlayerId: 'p1' }).action?.type).toBe('takeBoardToken')

    const stealState = playingState('p1')
    stealState.pending = { type: 'stealToken', playerId: 'p1', resume: { extraTurn: false } }
    giveToken(stealState, 'p2', 'pearl')
    const steal = chooseAiAction({ state: stealState, aiPlayerId: 'p1' }).action
    expect(steal).toMatchObject({ type: 'stealToken', tokenType: 'pearl' })

    const discardState = playingState('p1')
    discardState.pending = { type: 'discard', playerId: 'p1', count: 1, resume: { extraTurn: false } }
    giveToken(discardState, 'p1', 'ruby')
    expect(chooseAiAction({ state: discardState, aiPlayerId: 'p1' }).action?.type).toBe('discardToken')
  })

  it('does not use hidden bag, deck, or opponent reserve order in fair mode', () => {
    const stateA = playingState('p1')
    const stateB = structuredClone(stateA)
    stateB.bag = [...stateA.bag].reverse()
    stateB.decks = {
      1: [...stateA.decks[1]].reverse(),
      2: [...stateA.decks[2]].reverse(),
      3: [...stateA.decks[3]].reverse(),
    }
    stateA.players.p2.reserve = [2100]
    stateB.players.p2.reserve = [7107]

    const actionA = chooseAiAction({ state: stateA, aiPlayerId: 'p1', config: { difficulty: 'standard', seed: 'fair' } }).action
    const actionB = chooseAiAction({ state: stateB, aiPlayerId: 'p1', config: { difficulty: 'standard', seed: 'fair' } }).action
    expect(actionB).toEqual(actionA)
  })

  it('can play an AI-vs-AI game through to a winner', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(0x5eed))
    try {
      let state = playingState('p1')
      let actionCount = 0

      while (!state.winner && actionCount < 700) {
        const actor = state.pending?.playerId ?? state.currentPlayer
        const decision = chooseAiAction({ state, aiPlayerId: actor, config: { difficulty: 'standard' } })
        expect(decision.action, `missing AI action at turn ${state.turnNumber} for ${actor}`).toBeTruthy()
        state = applyAction(state, decision.action!)
        actionCount += 1
      }

      expect(state.status).toBe('finished')
      expect(state.winner).toBeTruthy()
      expect(actionCount).toBeLessThan(700)
    } finally {
      randomSpy.mockRestore()
    }
  })
})
