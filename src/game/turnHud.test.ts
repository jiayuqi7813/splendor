import { describe, expect, it } from 'vitest'
import { createInitialGame } from './rules'
import { currentTurnPosition, turnHudLabels } from './turnHud'

describe('turn HUD labels', () => {
  it('counts the active player position relative to the first player', () => {
    const state = createInitialGame('turn-hud-position')
    state.status = 'playing'
    state.playerOrder = ['p1', 'p2']
    state.firstPlayer = 'p2'
    state.currentPlayer = 'p2'

    expect(currentTurnPosition(state)).toEqual({ current: 1, total: 2 })

    state.currentPlayer = 'p1'
    expect(currentTurnPosition(state)).toEqual({ current: 2, total: 2 })
  })

  it('shows round, player position, and overtime when applicable', () => {
    const state = createInitialGame('turn-hud-overtime')
    state.status = 'playing'
    state.playerOrder = ['p1', 'p2', 'p3', 'p4']
    state.firstPlayer = 'p3'
    state.currentPlayer = 'p4'
    state.turnNumber = 3
    state.finalRound = { triggerPlayerId: 'p1', targetTurns: 4, reason: 'points', overtimeRounds: 1 }

    expect(turnHudLabels(state)).toEqual(['第 3 圈', '行动 2 / 4', '加时第 1 回合'])
  })
})
