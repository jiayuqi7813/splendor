import { describe, expect, it } from 'vitest'
import { createInitialGame, startGameIfReady } from './rules'
import { selectTutorialStep, type TutorialCounts } from './tutorial'
import type { GameState, PlayerId } from './types'

function playingState(playerId: PlayerId = 'p1'): GameState {
  const state = createInitialGame(`tutorial-${Math.random()}`)
  state.players.p1.connected = true
  state.players.p2.connected = true
  state.players.p1.seated = true
  state.players.p2.seated = true
  startGameIfReady(state)
  state.currentPlayer = playerId
  state.firstPlayer = playerId
  state.pending = undefined
  state.winner = undefined
  state.turnActions = {}
  state.players.p1.privileges = 0
  state.players.p2.privileges = 0
  state.players.p1.tokens = { ruby: 0, sapphire: 0, onyx: 0, diamond: 0, emerald: 0, pearl: 0, gold: 0 }
  state.players.p1.tokenSlots = []
  for (const cell of state.board) {
    if (cell.token?.type === 'gold') cell.token = { ...cell.token, type: 'ruby' }
  }
  return state
}

function makeCardPurchasable(state: GameState, playerId: PlayerId) {
  state.players[playerId].tokens = { ruby: 8, sapphire: 8, onyx: 8, diamond: 8, emerald: 8, pearl: 8, gold: 8 }
}

function addGoldToBoard(state: GameState) {
  const cell = state.board[0]
  cell.token = { id: 'tutorial-gold', type: 'gold' }
  return cell.id
}

describe('tutorial guidance selector', () => {
  it('does not show guidance before the game starts', () => {
    const state = createInitialGame('waiting-tutorial')
    state.players.p1.connected = true

    expect(selectTutorialStep(state, 'p1')).toBeUndefined()
  })

  it('shows guidance on the current player turn', () => {
    const state = playingState('p1')

    expect(selectTutorialStep(state, 'p1')?.kind).toBe('takeTokens')
    expect(selectTutorialStep(state, 'p2')).toBeUndefined()
  })

  it('stops showing the common token guidance after three displays', () => {
    const state = playingState('p1')
    const counts: TutorialCounts = { takeTokens: 3, turnOverview: 3 }

    expect(selectTutorialStep(state, 'p1', counts)).toBeUndefined()
  })

  it('teaches purchase when a card is affordable even after overview is exhausted', () => {
    const state = playingState('p1')
    makeCardPurchasable(state, 'p1')

    const step = selectTutorialStep(state, 'p1', { turnOverview: 3 })

    expect(step?.kind).toBe('purchaseCard')
    expect(step?.targetSelectors?.some((selector) => selector.includes('data-card-source-key'))).toBe(true)
    expect(step?.targetSelectors).toContain('[data-player-purchased-pool="p1"]')
  })

  it('does not highlight the card area when no card action is legal', () => {
    const state = playingState('p1')
    const step = selectTutorialStep(state, 'p1')

    expect(step?.kind).toBe('takeTokens')
    expect(step?.targetSelectors).not.toContain('.marketPool')
  })

  it('teaches reserve only when gold and reserve space are available', () => {
    const state = playingState('p1')
    addGoldToBoard(state)

    const step = selectTutorialStep(state, 'p1', { takeTokens: 3 })

    expect(step?.kind).toBe('reserveCard')
    expect(step?.targetSelectors?.some((selector) => selector.includes('tutorial-gold') || selector.includes('data-cell-id'))).toBe(true)
    expect(step?.targetSelectors?.some((selector) => selector.includes('data-card-source-key'))).toBe(true)
  })

  it('does not teach reserve when reserve is full', () => {
    const state = playingState('p1')
    addGoldToBoard(state)
    state.players.p1.reserve = state.market[1].filter((cardId): cardId is number => Boolean(cardId)).slice(0, 3)

    expect(selectTutorialStep(state, 'p1', { takeTokens: 3 })?.kind).not.toBe('reserveCard')
  })

  it('keeps common tutorial tracks independent', () => {
    const state = playingState('p1')
    makeCardPurchasable(state, 'p1')

    expect(selectTutorialStep(state, 'p1', { takeTokens: 3, reserveCard: 3 })?.kind).toBe('purchaseCard')
    expect(selectTutorialStep(state, 'p1', { purchaseCard: 3 })?.kind).toBe('takeTokens')
  })

  it('stops showing a rare pending operation after one display', () => {
    const state = playingState('p1')
    const rubyCell = state.board.find((cell) => cell.token?.type === 'ruby')
    expect(rubyCell).toBeTruthy()
    state.pending = { type: 'takeBoardToken', playerId: 'p1', tokenType: 'ruby', resume: { extraTurn: false } }

    expect(selectTutorialStep(state, 'p1')?.kind).toBe('takeBoardToken')
    expect(selectTutorialStep(state, 'p1', { takeBoardToken: 1 })).toBeUndefined()
  })

  it('prioritizes pending guidance over normal turn actions', () => {
    const state = playingState('p1')
    state.royalCards = [1400, 1401]
    state.pending = { type: 'chooseRoyal', playerId: 'p1', reason: 'threeCrowns', options: [1400, 1401], resume: { extraTurn: false } }

    expect(selectTutorialStep(state, 'p1')?.kind).toBe('chooseRoyal')
  })
})
