import { describe, expect, it } from 'vitest'
import { CARD_DEFINITIONS } from './data/cards.generated'
import { cardsByTier, getCard, pokemonLegendaryCards, pokemonRareCards } from './cards'
import { createInitialGame, applyAction, areAdjacentLine, canAfford, playerStats } from './rules'
import { TOKEN_TYPES } from './types'
import type { BoardCell, CardAbility, CardDefinition, Cost, GameState, GemType, PlayerId, TokenType } from './types'

const TEST_CARDS = CARD_DEFINITIONS as readonly CardDefinition[]
const DUEL_CARD_IDS = new Set(TEST_CARDS.map((card) => card.cardId))

function playingState(): GameState {
  const state = createInitialGame('test')
  state.players.p1.connected = true
  state.players.p2.connected = true
  state.status = 'playing'
  state.currentPlayer = 'p1'
  state.firstPlayer = 'p1'
  state.pending = undefined
  return state
}

function classicPlayingState(playerCount: 2 | 3 | 4 = 4): GameState {
  const state = createInitialGame('classic-test', { gameType: 'classic', playerCount })
  const activePlayers = (['p1', 'p2', 'p3', 'p4'] as const).slice(0, playerCount)
  for (const playerId of activePlayers) {
    state.players[playerId].connected = true
    state.players[playerId].seated = true
  }
  state.playerOrder = [...activePlayers]
  state.status = 'playing'
  state.currentPlayer = 'p1'
  state.firstPlayer = 'p1'
  state.turnNumber = 1
  state.pending = undefined
  return state
}

function pokemonPlayingState(playerCount: 2 | 3 | 4 = 4): GameState {
  const state = createInitialGame('pokemon-test', { gameType: 'pokemon', playerCount })
  const activePlayers = (['p1', 'p2', 'p3', 'p4'] as const).slice(0, playerCount)
  for (const playerId of activePlayers) {
    state.players[playerId].connected = true
    state.players[playerId].seated = true
  }
  state.playerOrder = [...activePlayers]
  state.status = 'playing'
  state.currentPlayer = 'p1'
  state.firstPlayer = 'p1'
  state.turnNumber = 1
  state.pending = undefined
  return state
}

function putTokens(state: GameState, tokens: TokenType[]) {
  state.board.forEach((cell) => {
    cell.token = undefined
  })
  const targetIds = ['0:0', '1:0', '2:0', '3:0', '4:0']
  tokens.forEach((type, index) => {
    const cell = state.board.find((item) => item.id === targetIds[index])
    if (!cell) throw new Error(`Missing test cell ${targetIds[index]}`)
    cell.token = { id: `${type}-${index}`, type }
  })
}

function giveToken(state: GameState, playerId: PlayerId, token: TokenType, count = 1) {
  for (let index = 0; index < count; index += 1) {
    state.players[playerId].tokens[token] += 1
    state.players[playerId].tokenSlots.push({ id: `${token}-test-${index}`, type: token })
  }
}

function givePrintedCost(state: GameState, playerId: PlayerId, cardId: number) {
  const card = TEST_CARDS.find((item) => item.cardId === cardId)
  if (!card) throw new Error(`Missing test card ${cardId}`)
  for (const token of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald', 'pearl'] as const) {
    if (card.cost[token] > 0) giveToken(state, playerId, token, card.cost[token])
  }
}

function preparePokemonEvolutionState(state: GameState) {
  const baseCardId = 30001
  const targetCardId = 30002
  state.players.p1.purchased = [{ cardId: baseCardId }]
  state.market[1][0] = targetCardId
  const cost = getCard(baseCardId).evolutionCost ?? getCard(baseCardId).cost
  const bonusCardByGem: Record<GemType, number> = { diamond: 30021, sapphire: 30012, emerald: 30035, ruby: 30028, onyx: 30001 }
  for (const gem of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald'] as const) {
    for (let index = 0; index < cost[gem]; index += 1) state.players.p1.purchased.push({ cardId: bonusCardByGem[gem] })
  }
  return {
    baseCardId,
    targetCardId,
    purchasedBefore: state.players.p1.purchased.map((card) => ({ ...card })),
    evolutionPileBefore: [...(state.pokemonSpecial?.evolutionPile ?? [])],
  }
}

function takeClassicTurn(state: GameState, playerId: PlayerId): GameState {
  return applyAction(state, { type: 'takeClassicBankTokens', playerId, tokenTypes: ['ruby', 'sapphire', 'emerald'] })
}

const ZERO_COST: Cost = { ruby: 0, sapphire: 0, onyx: 0, diamond: 0, emerald: 0, pearl: 0 }

type CostRow = readonly [number, readonly [number, number, number, number, number, number]]

const EXPECTED_JEWEL_COST_ROWS: CostRow[] = [
  [0, [0, 3, 0, 0, 0, 0]],
  [1, [0, 2, 0, 0, 3, 0]],
  [2, [0, 0, 2, 2, 0, 0]],
  [3, [0, 0, 4, 0, 0, 1]],
  [4, [0, 0, 1, 2, 2, 1]],
  [5, [2, 2, 1, 0, 0, 1]],
  [6, [0, 0, 2, 2, 0, 1]],
  [7, [0, 1, 1, 1, 1, 0]],
  [8, [0, 0, 2, 3, 0, 0]],
  [9, [0, 2, 0, 0, 2, 1]],
  [10, [2, 0, 2, 0, 0, 0]],
  [11, [1, 1, 1, 0, 1, 0]],
  [12, [1, 0, 1, 1, 1, 0]],
  [13, [2, 0, 0, 0, 2, 0]],
  [14, [2, 0, 2, 0, 0, 1]],
  [15, [0, 2, 0, 2, 0, 1]],
  [16, [3, 0, 0, 0, 0, 0]],
  [17, [0, 0, 3, 0, 0, 0]],
  [18, [3, 0, 0, 0, 2, 0]],
  [19, [0, 2, 0, 2, 0, 0]],
  [20, [0, 0, 0, 4, 0, 1]],
  [21, [0, 0, 0, 0, 3, 0]],
  [22, [1, 1, 1, 1, 0, 0]],
  [23, [1, 1, 0, 1, 1, 0]],
  [24, [2, 0, 3, 0, 0, 0]],
  [25, [4, 0, 0, 0, 0, 1]],
  [26, [0, 3, 0, 2, 0, 0]],
  [27, [0, 2, 0, 0, 2, 0]],
  [28, [2, 0, 0, 0, 2, 1]],
  [29, [0, 0, 0, 3, 0, 0]],
  [30, [2, 0, 4, 0, 0, 1]],
  [31, [0, 5, 0, 0, 2, 0]],
  [32, [4, 0, 0, 0, 2, 1]],
  [33, [0, 6, 0, 0, 0, 1]],
  [34, [0, 0, 0, 0, 6, 1]],
  [35, [0, 6, 0, 0, 0, 1]],
  [36, [0, 2, 0, 5, 0, 0]],
  [37, [0, 0, 5, 2, 0, 0]],
  [38, [2, 2, 0, 0, 2, 1]],
  [39, [2, 0, 2, 2, 0, 1]],
  [40, [5, 0, 2, 0, 0, 0]],
  [41, [0, 2, 2, 2, 0, 1]],
  [42, [3, 4, 0, 0, 0, 0]],
  [43, [2, 0, 0, 0, 5, 0]],
  [44, [0, 4, 0, 2, 0, 1]],
  [45, [0, 0, 3, 0, 4, 0]],
  [46, [4, 0, 0, 3, 0, 0]],
  [47, [0, 0, 0, 0, 6, 1]],
  [48, [0, 0, 2, 4, 0, 1]],
  [49, [0, 2, 0, 0, 4, 1]],
  [50, [0, 3, 4, 0, 0, 0]],
  [51, [0, 0, 0, 4, 3, 0]],
  [52, [0, 2, 0, 2, 2, 1]],
  [53, [2, 0, 2, 0, 2, 1]],
  [60, [5, 3, 3, 0, 0, 1]],
  [61, [3, 0, 0, 3, 5, 1]],
  [62, [3, 3, 0, 5, 0, 1]],
  [63, [0, 0, 0, 8, 0, 0]],
  [64, [0, 6, 0, 2, 2, 0]],
  [65, [2, 2, 0, 0, 6, 0]],
  [66, [6, 0, 2, 0, 2, 0]],
  [67, [8, 0, 0, 0, 0, 0]],
  [68, [2, 0, 6, 2, 0, 0]],
  [69, [0, 0, 5, 3, 3, 1]],
  [70, [0, 2, 2, 6, 0, 0]],
  [71, [0, 5, 3, 0, 3, 1]],
  [72, [0, 0, 8, 0, 0, 0]],
]

const EXPECTED_JEWEL_COSTS = new Map<number, Cost>(
  EXPECTED_JEWEL_COST_ROWS.map(([cardNumber, [ruby, sapphire, onyx, diamond, emerald, pearl]]) => [
    cardNumber,
    { ruby, sapphire, onyx, diamond, emerald, pearl },
  ]),
)

const EXPECTED_CROWN_CARDS = new Map<number, number>([
  [2100, 1],
  [2116, 1],
  [2117, 1],
  [2120, 1],
  [2121, 1],
  [2129, 1],
  [2304, 2],
  [2305, 2],
  [2308, 1],
  [2309, 1],
  [2311, 1],
  [2322, 1],
  [2323, 1],
  [7100, 2],
  [7101, 2],
  [7102, 2],
  [7109, 2],
  [7111, 2],
  [7112, 3],
])

const EXPECTED_ABILITY_CARDS = new Map<number, CardAbility>([
  [1401, 'extraTurn'],
  [1402, 'stealToken'],
  [1403, 'takePrivilege'],
  [2102, 'takeSapphire'],
  [2106, 'extraTurn'],
  [2109, 'extraTurn'],
  [2110, 'takeDiamond'],
  [2113, 'takeOnyx'],
  [2114, 'extraTurn'],
  [2115, 'extraTurn'],
  [2119, 'takeEmerald'],
  [2127, 'takeRuby'],
  [2128, 'extraTurn'],
  [2300, 'takePrivilege'],
  [2302, 'takePrivilege'],
  [2312, 'stealToken'],
  [2314, 'takePrivilege'],
  [2315, 'stealToken'],
  [2316, 'stealToken'],
  [2318, 'takePrivilege'],
  [2319, 'takePrivilege'],
  [2320, 'stealToken'],
  [2321, 'stealToken'],
  [7107, 'extraTurn'],
])

describe('resource data', () => {
  it('loads the expected card pool from the TTS package', () => {
    expect(CARD_DEFINITIONS.filter((card) => card.tier === 1)).toHaveLength(30)
    expect(CARD_DEFINITIONS.filter((card) => card.tier === 2)).toHaveLength(24)
    expect(CARD_DEFINITIONS.filter((card) => card.tier === 3)).toHaveLength(13)
    expect(CARD_DEFINITIONS.filter((card) => card.tier === 'royal')).toHaveLength(4)
    expect(CARD_DEFINITIONS.every((card) => card.cardId && card.atlas && card.cost)).toBe(true)
  })

  it('keeps Duel deck helpers scoped to Duel cards', () => {
    expect(cardsByTier(1)).toHaveLength(30)
    expect(cardsByTier(2)).toHaveLength(24)
    expect(cardsByTier(3)).toHaveLength(13)
    expect([1, 2, 3].flatMap((tier) => cardsByTier(tier as 1 | 2 | 3)).every((cardId) => DUEL_CARD_IDS.has(cardId))).toBe(true)
  })

  it('matches the printed jewel-card costs from the source card numbers', () => {
    for (const card of CARD_DEFINITIONS) {
      if (card.tier === 'royal') {
        expect(card.cost).toEqual(ZERO_COST)
        continue
      }
      const sourceCardNumber = Number(card.id.replace('card', ''))
      expect(card.cost).toEqual(EXPECTED_JEWEL_COSTS.get(sourceCardNumber))
    }
  })

  it('matches printed crown icons and skill icons', () => {
    for (const card of CARD_DEFINITIONS) {
      expect(card.crowns).toBe(EXPECTED_CROWN_CARDS.get(card.cardId) ?? 0)
      expect('ability' in card ? card.ability : undefined).toBe(EXPECTED_ABILITY_CARDS.get(card.cardId))
    }
  })
})

describe('rules engine', () => {
  it('keeps royal cards in fixed board positions', () => {
    expect(createInitialGame('fixed-royals').royalCards).toEqual([1400, 1401, 1402, 1403])
    expect(createInitialGame('fixed-royals-again').royalCards).toEqual([1400, 1401, 1402, 1403])
  })

  it('does not seed Duel rooms with classic Splendor card IDs', () => {
    const state = createInitialGame('duel-card-scope')
    const seededCardIds = [
      ...Object.values(state.decks).flat(),
      ...Object.values(state.market)
        .flat()
        .filter((cardId): cardId is number => cardId !== null),
      ...state.royalCards,
    ]

    expect(seededCardIds.length).toBeGreaterThan(0)
    expect(seededCardIds.every((cardId) => DUEL_CARD_IDS.has(cardId))).toBe(true)
  })

  it('validates adjacent uninterrupted lines', () => {
    const cells: BoardCell[] = [
      { id: '0:0', x: 0, y: 0 },
      { id: '1:1', x: 1, y: 1 },
      { id: '2:2', x: 2, y: 2 },
    ]
    expect(areAdjacentLine(cells)).toBe(true)
    expect(areAdjacentLine([cells[0], cells[2]])).toBe(false)
  })

  it('rejects taking gold through the normal token action', () => {
    const state = playingState()
    putTokens(state, ['gold'])
    expect(() => applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: [state.board[0].id] })).toThrow(/黄金/)
  })

  it('awards opponent privilege for three same-color tokens', () => {
    const state = playingState()
    state.availablePrivileges = 3
    state.players.p2.privileges = 0
    putTokens(state, ['ruby', 'ruby', 'ruby'])
    const next = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0', '1:0', '2:0'] })
    expect(next.players.p2.privileges).toBe(1)
  })

  it('awards opponent privilege for taking two pearls', () => {
    const state = playingState()
    state.availablePrivileges = 3
    state.players.p2.privileges = 0
    putTokens(state, ['pearl', 'pearl'])

    const next = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0', '1:0'] })
    expect(next.players.p2.privileges).toBe(1)
  })

  it('awards opponent privilege when a three-token line contains both pearls', () => {
    const state = playingState()
    state.availablePrivileges = 3
    state.players.p2.privileges = 0
    putTokens(state, ['pearl', 'ruby', 'pearl'])

    const next = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0', '1:0', '2:0'] })
    expect(next.players.p2.privileges).toBe(1)
  })

  it('transfers privilege from the opponent when the public supply is empty', () => {
    const state = playingState()
    state.availablePrivileges = 0
    state.players.p1.privileges = 1
    state.players.p2.privileges = 0
    putTokens(state, ['ruby', 'ruby', 'ruby'])

    const next = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0', '1:0', '2:0'] })
    expect(next.players.p1.privileges).toBe(0)
    expect(next.players.p2.privileges).toBe(1)
  })

  it('awards second player one privilege at game creation', () => {
    const state = createInitialGame('opening-privilege')
    expect(state.players[state.firstPlayer].privileges).toBe(0)
    expect(state.players[state.firstPlayer === 'p1' ? 'p2' : 'p1'].privileges).toBe(1)
    expect(state.availablePrivileges).toBe(2)
  })

  it('lets a player spend privileges before replenishing the board', () => {
    const state = playingState()
    state.availablePrivileges = 1
    state.players.p1.privileges = 1
    state.players.p2.privileges = 0
    putTokens(state, ['ruby'])

    const afterPrivilege = applyAction(state, { type: 'usePrivilege', playerId: 'p1', cellId: '0:0' })
    expect(afterPrivilege.currentPlayer).toBe('p1')
    expect(afterPrivilege.players.p1.privileges).toBe(0)
    expect(afterPrivilege.availablePrivileges).toBe(2)
    expect(afterPrivilege.players.p1.tokens.ruby).toBe(1)
    expect(afterPrivilege.board.find((cell) => cell.id === '0:0')?.token).toBeUndefined()

    const afterReplenish = applyAction(afterPrivilege, { type: 'replenishBoard', playerId: 'p1' })
    expect(afterReplenish.turnActions?.replenished).toBe(true)
    expect(afterReplenish.players.p2.privileges).toBe(1)
    expect(afterReplenish.availablePrivileges).toBe(1)
  })

  it('lets a player spend multiple privileges before the mandatory action', () => {
    const state = playingState()
    state.availablePrivileges = 1
    state.players.p1.privileges = 2
    putTokens(state, ['ruby', 'sapphire', 'emerald'])

    const afterFirst = applyAction(state, { type: 'usePrivilege', playerId: 'p1', cellId: '0:0' })
    const afterSecond = applyAction(afterFirst, { type: 'usePrivilege', playerId: 'p1', cellId: '1:0' })

    expect(afterSecond.currentPlayer).toBe('p1')
    expect(afterSecond.players.p1.privileges).toBe(0)
    expect(afterSecond.availablePrivileges).toBe(3)
    expect(afterSecond.players.p1.tokenSlots.map((token) => token.type)).toEqual(['ruby', 'sapphire'])

    const afterMandatory = applyAction(afterSecond, { type: 'takeTokens', playerId: 'p1', cellIds: ['2:0'] })
    expect(afterMandatory.currentPlayer).toBe('p2')
    expect(afterMandatory.players.p1.tokens.emerald).toBe(1)
  })

  it('advances the round number after both players have acted once', () => {
    const state = playingState()
    state.firstPlayer = 'p1'
    state.turnNumber = 1
    putTokens(state, ['ruby', 'sapphire'])

    const afterFirstPlayer = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0'] })
    expect(afterFirstPlayer.currentPlayer).toBe('p2')
    expect(afterFirstPlayer.turnNumber).toBe(1)

    const afterSecondPlayer = applyAction(afterFirstPlayer, { type: 'takeTokens', playerId: 'p2', cellIds: ['1:0'] })
    expect(afterSecondPlayer.currentPlayer).toBe('p1')
    expect(afterSecondPlayer.turnNumber).toBe(2)
  })

  it('lets a player reorder their token slots without changing game flow', () => {
    const state = playingState()
    giveToken(state, 'p1', 'ruby')
    giveToken(state, 'p1', 'sapphire')
    giveToken(state, 'p1', 'gold')
    const beforeIds = state.players.p1.tokenSlots.map((token) => token.id)

    const next = applyAction(state, { type: 'reorderTokenSlots', playerId: 'p1', tokenIds: [beforeIds[2], beforeIds[0], beforeIds[1]] })

    expect(next.players.p1.tokenSlots.map((token) => token.type)).toEqual(['gold', 'ruby', 'sapphire'])
    expect(next.players.p1.tokens).toEqual(state.players.p1.tokens)
    expect(next.currentPlayer).toBe(state.currentPlayer)
    expect(next.turnNumber).toBe(state.turnNumber)
  })

  it('rejects token slot reorders with missing or repeated tokens', () => {
    const state = playingState()
    giveToken(state, 'p1', 'ruby')
    giveToken(state, 'p1', 'sapphire')
    const [firstId] = state.players.p1.tokenSlots.map((token) => token.id)

    expect(() => applyAction(state, { type: 'reorderTokenSlots', playerId: 'p1', tokenIds: [firstId, firstId] })).toThrow(/重复|无效/)
    expect(() => applyAction(state, { type: 'reorderTokenSlots', playerId: 'p1', tokenIds: [firstId] })).toThrow(/不完整/)
  })

  it('discards the selected token slot by id when over the token limit', () => {
    const state = playingState()
    state.pending = { type: 'discard', playerId: 'p1', count: 1, resume: { extraTurn: false } }
    giveToken(state, 'p1', 'ruby')
    giveToken(state, 'p1', 'ruby')
    state.players.p1.tokenSlots[1].id = 'ruby-test-selected'
    const selectedToken = state.players.p1.tokenSlots[1]

    const next = applyAction(state, { type: 'discardToken', playerId: 'p1', tokenType: selectedToken.type, tokenId: selectedToken.id })

    expect(next.players.p1.tokenSlots.map((token) => token.id)).not.toContain(selectedToken.id)
    expect(next.players.p1.tokenSlots).toHaveLength(1)
    expect(next.bag.at(-1)?.id).toBe(selectedToken.id)
  })

  it('steals the selected opponent token slot by id', () => {
    const state = playingState()
    state.pending = { type: 'stealToken', playerId: 'p1', resume: { extraTurn: false } }
    giveToken(state, 'p2', 'pearl')
    giveToken(state, 'p2', 'pearl')
    state.players.p2.tokenSlots[1].id = 'pearl-test-selected'
    const selectedToken = state.players.p2.tokenSlots[1]

    const next = applyAction(state, { type: 'stealToken', playerId: 'p1', tokenType: 'pearl', tokenId: selectedToken.id })

    expect(next.players.p2.tokenSlots.map((token) => token.id)).not.toContain(selectedToken.id)
    expect(next.players.p1.tokenSlots.map((token) => token.id)).toContain(selectedToken.id)
    expect(next.players.p1.tokens.pearl).toBe(1)
    expect(next.players.p2.tokens.pearl).toBe(1)
  })

  it('rejects spending a privilege on gold', () => {
    const state = playingState()
    state.players.p1.privileges = 1
    putTokens(state, ['gold'])

    expect(() => applyAction(state, { type: 'usePrivilege', playerId: 'p1', cellId: '0:0' })).toThrow(/黄金/)
  })

  it('forces discard immediately after spending a privilege over the token limit, then keeps the turn active', () => {
    const state = playingState()
    state.players.p1.privileges = 1
    state.players.p1.tokens = {
      ruby: 10,
      sapphire: 0,
      onyx: 0,
      diamond: 0,
      emerald: 0,
      pearl: 0,
      gold: 0,
    }
    state.players.p1.tokenSlots = Array.from({ length: 10 }, (_, index) => ({ id: `ruby-held-${index}`, type: 'ruby' }))
    putTokens(state, ['sapphire', 'emerald'])

    const afterPrivilege = applyAction(state, { type: 'usePrivilege', playerId: 'p1', cellId: '0:0' })
    expect(afterPrivilege.pending).toMatchObject({ type: 'discard', playerId: 'p1', count: 1 })
    expect(afterPrivilege.currentPlayer).toBe('p1')
    expect(afterPrivilege.players.p1.tokenSlots).toHaveLength(11)
    expect(() => applyAction(afterPrivilege, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })).toThrow(/待处理/)

    const overflowToken = afterPrivilege.players.p1.tokenSlots.at(-1)!
    const afterDiscard = applyAction(afterPrivilege, { type: 'discardToken', playerId: 'p1', tokenType: overflowToken.type, tokenId: overflowToken.id })
    expect(afterDiscard.pending).toBeUndefined()
    expect(afterDiscard.currentPlayer).toBe('p1')
    expect(afterDiscard.players.p1.tokenSlots).toHaveLength(10)

    const afterMandatory = applyAction(afterDiscard, { type: 'takeTokens', playerId: 'p1', cellIds: ['1:0'] })
    expect(afterMandatory.pending).toMatchObject({ type: 'discard', playerId: 'p1', count: 1 })

    const secondOverflowToken = afterMandatory.players.p1.tokenSlots.at(-1)!
    const afterSecondDiscard = applyAction(afterMandatory, { type: 'discardToken', playerId: 'p1', tokenType: secondOverflowToken.type, tokenId: secondOverflowToken.id })
    expect(afterSecondDiscard.currentPlayer).toBe('p2')
  })

  it('rejects spending a privilege after replenishing the board', () => {
    const state = playingState()
    state.players.p1.privileges = 1
    state.board[0].token = undefined
    state.bag.push({ id: 'ruby-extra', type: 'ruby' })
    const afterReplenish = applyAction(state, { type: 'replenishBoard', playerId: 'p1' })
    const rubyCell = afterReplenish.board.find((cell) => cell.token?.type === 'ruby')
    expect(rubyCell).toBeTruthy()
    expect(() => applyAction(afterReplenish, { type: 'usePrivilege', playerId: 'p1', cellId: rubyCell!.id })).toThrow(/补棋盘后/)
  })

  it('awards privilege from purchased and royal card abilities', () => {
    const state = playingState()
    state.availablePrivileges = 3
    state.players.p1.privileges = 0
    state.players.p2.privileges = 0
    state.market[2][0] = 2300
    giveToken(state, 'p1', 'ruby', 2)
    giveToken(state, 'p1', 'onyx', 4)
    giveToken(state, 'p1', 'pearl')

    const afterPurchase = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 2, index: 0 } })
    expect(afterPurchase.players.p1.privileges).toBe(1)
    expect(afterPurchase.availablePrivileges).toBe(2)

    afterPurchase.currentPlayer = 'p1'
    afterPurchase.pending = { type: 'chooseRoyal', playerId: 'p1', reason: 'threeCrowns', options: [1403], resume: { extraTurn: false } }
    const afterRoyal = applyAction(afterPurchase, { type: 'chooseRoyal', playerId: 'p1', cardId: 1403 })
    expect(afterRoyal.players.p1.privileges).toBe(2)
    expect(afterRoyal.availablePrivileges).toBe(1)
  })

  it('enforces the reserve limit', () => {
    const state = playingState()
    state.players.p1.reserve = [2100, 2101, 2102]
    putTokens(state, ['gold'])
    expect(() =>
      applyAction(state, {
        type: 'reserveCard',
        playerId: 'p1',
        goldCellId: state.board[0].id,
        source: { type: 'market', tier: 1, index: 0 },
      }),
    ).toThrow(/3 张/)
  })

  it('reserves the top card from a deck with gold', () => {
    const state = playingState()
    putTokens(state, ['gold'])
    const topCard = state.decks[1][0]
    const nextCard = state.decks[1][1]
    const goldCell = state.board.find((cell) => cell.token?.type === 'gold')
    expect(goldCell).toBeTruthy()

    const next = applyAction(state, {
      type: 'reserveCard',
      playerId: 'p1',
      goldCellId: goldCell!.id,
      source: { type: 'deck', tier: 1 },
    })

    expect(next.players.p1.reserve).toEqual([topCard])
    expect(next.decks[1][0]).toBe(nextCard)
    expect(next.players.p1.tokens.gold).toBe(1)
    expect(next.board.find((cell) => cell.id === goldCell!.id)?.token).toBeUndefined()
  })

  it('reserves classic Splendor cards with bank gold', () => {
    const state = createInitialGame('classic-test', { gameType: 'classic', playerCount: 4 })
    state.status = 'playing'
    state.currentPlayer = 'p1'
    state.board.forEach((cell) => {
      if (cell.token?.type === 'gold') cell.token = undefined
    })
    state.bag = state.bag.filter((token) => token.type !== 'gold')
    state.bag.push({ id: 'classic-gold-test', type: 'gold' })
    const cardId = state.market[1][0]
    expect(cardId).toBeTruthy()

    const next = applyAction(state, {
      type: 'reserveCard',
      playerId: 'p1',
      goldCellId: 'bank:gold',
      source: { type: 'market', tier: 1, index: 0 },
    })

    expect(next.players.p1.reserve).toContain(cardId)
    expect(next.players.p1.tokens.gold).toBe(1)
    expect(next.bag.some((token) => token.id === 'classic-gold-test')).toBe(false)
  })

  it('starts classic Splendor with two seated players', () => {
    const state = createInitialGame('classic-two-player-test', { gameType: 'classic', playerCount: 4 })
    state.currentPlayer = 'p3'
    state.firstPlayer = 'p3'
    state.players.p1.seated = true
    state.players.p1.connected = true
    state.players.p2.seated = true
    state.players.p2.connected = true

    const next = applyAction(state, { type: 'startGame', playerId: 'p1' })
    const bankCounts = Object.fromEntries(
      TOKEN_TYPES.map((type) => [
        type,
        next.bag.filter((token) => token.type === type).length + next.board.filter((cell) => cell.token?.type === type).length,
      ]),
    )

    expect(next.status).toBe('playing')
    expect(next.playerOrder).toEqual(['p1', 'p2'])
    expect(next.currentPlayer).toBe('p1')
    expect(next.royalCards).toHaveLength(3)
    expect(bankCounts).toMatchObject({ ruby: 4, sapphire: 4, onyx: 4, diamond: 4, emerald: 4, gold: 5 })
  })

  it('takes three different classic Splendor bank tokens', () => {
    const state = createInitialGame('classic-bank-three', { gameType: 'classic', playerCount: 4 })
    state.status = 'playing'
    state.currentPlayer = 'p1'

    const next = applyAction(state, { type: 'takeClassicBankTokens', playerId: 'p1', tokenTypes: ['diamond', 'sapphire', 'emerald'] })

    expect(next.players.p1.tokenSlots.map((token) => token.type)).toEqual(['diamond', 'sapphire', 'emerald'])
    expect(next.players.p1.tokens).toMatchObject({ diamond: 1, sapphire: 1, emerald: 1 })
    expect(next.currentPlayer).toBe('p2')
  })

  it('takes two same classic Splendor bank tokens only while at least four were available', () => {
    const state = createInitialGame('classic-bank-pair', { gameType: 'classic', playerCount: 4 })
    state.status = 'playing'
    state.currentPlayer = 'p1'

    const next = applyAction(state, { type: 'takeClassicBankTokens', playerId: 'p1', tokenTypes: ['ruby', 'ruby'] })
    expect(next.players.p1.tokens.ruby).toBe(2)

    const lowBankState = createInitialGame('classic-bank-low-pair', { gameType: 'classic', playerCount: 2 })
    lowBankState.status = 'playing'
    lowBankState.currentPlayer = 'p1'
    lowBankState.bag = lowBankState.bag.filter((token) => token.type !== 'onyx')
    lowBankState.board.forEach((cell) => {
      if (cell.token?.type === 'onyx') cell.token = undefined
    })
    lowBankState.bag.push(
      { id: 'onyx-low-1', type: 'onyx' },
      { id: 'onyx-low-2', type: 'onyx' },
      { id: 'onyx-low-3', type: 'onyx' },
    )

    expect(() => applyAction(lowBankState, { type: 'takeClassicBankTokens', playerId: 'p1', tokenTypes: ['onyx', 'onyx'] })).toThrow(/少于 4/)
  })

  it('allows classic Splendor bank token overflow and enters discard state', () => {
    const state = createInitialGame('classic-bank-overflow', { gameType: 'classic', playerCount: 4 })
    state.status = 'playing'
    state.currentPlayer = 'p1'
    giveToken(state, 'p1', 'ruby', 9)

    const next = applyAction(state, { type: 'takeClassicBankTokens', playerId: 'p1', tokenTypes: ['diamond', 'sapphire', 'emerald'] })

    expect(next.players.p1.tokenSlots).toHaveLength(12)
    expect(next.pending).toMatchObject({ type: 'discard', playerId: 'p1', count: 2 })
    expect(next.currentPlayer).toBe('p1')
  })

  it('uses discounts and gold tokens for payment', () => {
    const state = playingState()
    const cardId = 2100
    state.market[1][0] = cardId
    giveToken(state, 'p1', 'sapphire', 2)
    giveToken(state, 'p1', 'gold', 1)
    expect(state.players.p1.tokenSlots.map((token) => token.type)).toEqual(['sapphire', 'sapphire', 'gold'])
    expect(canAfford(state, 'p1', cardId)).toBe(true)
    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })
    expect(next.players.p1.purchased.some((card) => card.cardId === cardId)).toBe(true)
    expect(next.players.p1.tokens.sapphire).toBe(0)
    expect(next.players.p1.tokens.gold).toBe(0)
    expect(next.players.p1.tokenSlots).toHaveLength(0)
    expect(next.bag.slice(-3).map((token) => token.type)).toEqual(['sapphire', 'sapphire', 'gold'])
  })

  it('purchases cards from the player reserve', () => {
    const state = playingState()
    state.players.p1.reserve = [2100]
    giveToken(state, 'p1', 'sapphire', 3)

    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'reserve', index: 0 } })

    expect(next.players.p1.reserve).toEqual([])
    expect(next.players.p1.purchased.some((card) => card.cardId === 2100)).toBe(true)
    expect(next.players.p1.tokens.sapphire).toBe(0)
  })

  it('purchases classic Splendor cards from the player reserve', () => {
    const state = createInitialGame('classic-reserve-purchase', { gameType: 'classic', playerCount: 4 })
    state.players.p1.connected = true
    state.players.p2.connected = true
    state.status = 'playing'
    state.currentPlayer = 'p1'
    state.pending = undefined
    state.players.p1.reserve = [35]
    giveToken(state, 'p1', 'emerald', 2)
    giveToken(state, 'p1', 'ruby', 1)

    expect(canAfford(state, 'p1', 35)).toBe(true)
    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'reserve', index: 0 } })

    expect(next.players.p1.reserve).toEqual([])
    expect(next.players.p1.purchased).toContainEqual({ cardId: 35, wildColor: undefined })
    expect(next.players.p1.tokens.emerald).toBe(0)
    expect(next.players.p1.tokens.ruby).toBe(0)
    expect(next.bag.slice(-3).map((token) => token.type)).toEqual(['ruby', 'emerald', 'emerald'])
  })

  it('uses classic Splendor printed costs and bonuses for market purchases', () => {
    const state = classicPlayingState(4)
    state.market[1][0] = 22
    giveToken(state, 'p1', 'emerald', 2)
    giveToken(state, 'p1', 'onyx', 2)

    expect(canAfford(state, 'p1', 22)).toBe(true)
    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })

    expect(next.players.p1.purchased).toContainEqual({ cardId: 22, wildColor: undefined })
    expect(next.players.p1.tokens.emerald).toBe(0)
    expect(next.players.p1.tokens.onyx).toBe(0)
    expect(playerStats(next, 'p1').bonuses.sapphire).toBe(1)
  })

  it('does not purchase cards from the opponent reserve', () => {
    const state = playingState()
    state.players.p2.reserve = [2100]
    giveToken(state, 'p1', 'sapphire', 3)

    expect(() => applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'reserve', index: 0 } })).toThrow(/保留牌不存在/)
    expect(state.players.p2.reserve).toEqual([2100])
  })

  it('assigns purchased wild cards to the submitted gem color', () => {
    const state = playingState()
    state.market[1][0] = 2103
    state.players.p1.purchased = [{ cardId: 2124 }]
    giveToken(state, 'p1', 'onyx', 4)
    giveToken(state, 'p1', 'pearl', 1)

    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 }, wildColor: 'sapphire' })

    expect(next.players.p1.purchased).toContainEqual({ cardId: 2103, wildColor: 'sapphire' })
    expect(playerStats(next, 'p1').bonuses.sapphire).toBe(2)
    expect(playerStats(next, 'p1').colorPoints.sapphire).toBe(2)
  })

  it('rejects wild purchases without a valid existing bonus column', () => {
    const state = playingState()
    state.market[1][0] = 2103
    giveToken(state, 'p1', 'onyx', 4)
    giveToken(state, 'p1', 'pearl', 1)

    expect(() => applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })).toThrow(/万能牌必须/)
    expect(() => applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 }, wildColor: 'ruby' })).toThrow(/已有宝石/)
  })

  it('queues card token abilities after purchase so the player chooses the board token', () => {
    const state = playingState()
    state.market[1][0] = 2127
    putTokens(state, ['ruby', 'ruby'])
    giveToken(state, 'p1', 'sapphire', 2)
    giveToken(state, 'p1', 'emerald', 2)

    const afterPurchase = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })

    expect(afterPurchase.players.p1.purchased.some((card) => card.cardId === 2127)).toBe(true)
    expect(afterPurchase.pending).toMatchObject({ type: 'takeBoardToken', playerId: 'p1', tokenType: 'ruby' })
    expect(afterPurchase.players.p1.tokens.ruby).toBe(0)
    expect(afterPurchase.board.find((cell) => cell.id === '1:0')?.token?.type).toBe('ruby')

    const next = applyAction(afterPurchase, { type: 'takeBoardToken', playerId: 'p1', cellId: '1:0' })
    expect(next.players.p1.tokens.ruby).toBe(1)
    expect(next.board.find((cell) => cell.id === '0:0')?.token?.type).toBe('ruby')
    expect(next.board.find((cell) => cell.id === '1:0')?.token).toBeUndefined()
  })

  it.each([
    [2102, 'sapphire'],
    [2110, 'diamond'],
    [2113, 'onyx'],
    [2119, 'emerald'],
    [2127, 'ruby'],
  ] as const)('resolves take-token ability on card %i', (cardId, tokenType) => {
    const state = playingState()
    state.market[1][0] = cardId
    putTokens(state, [tokenType])
    givePrintedCost(state, 'p1', cardId)

    const afterPurchase = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })

    expect(afterPurchase.pending).toMatchObject({ type: 'takeBoardToken', playerId: 'p1', tokenType })
    const next = applyAction(afterPurchase, { type: 'takeBoardToken', playerId: 'p1', cellId: '0:0' })
    expect(next.players.p1.tokens[tokenType]).toBe(1)
    expect(next.board.find((cell) => cell.id === '0:0')?.token).toBeUndefined()
  })

  it.each([
    [2106, 1, undefined],
    [2109, 1, undefined],
    [2114, 1, undefined],
    [2115, 1, undefined],
    [2128, 1, undefined],
    [7107, 3, 'diamond'],
  ] as const)('resolves extra-turn ability on card %i', (cardId, tier, wildColor) => {
    const state = playingState()
    state.market[tier][0] = cardId
    if (wildColor) state.players.p1.purchased = [{ cardId: 2100 }]
    givePrintedCost(state, 'p1', cardId)

    const next = applyAction(state, {
      type: 'purchaseCard',
      playerId: 'p1',
      source: { type: 'market', tier, index: 0 },
      wildColor: wildColor as GemType | undefined,
    })

    expect(next.players.p1.purchased.some((card) => card.cardId === cardId)).toBe(true)
    expect(next.currentPlayer).toBe('p1')
  })

  it.each([
    [2300, 'onyx'],
    [2302, 'ruby'],
    [2314, 'sapphire'],
    [2318, 'diamond'],
    [2319, 'emerald'],
  ] as const)('resolves take-privilege ability on card %i', (cardId, color) => {
    const state = playingState()
    state.availablePrivileges = 1
    state.players.p1.privileges = 0
    state.market[2][0] = cardId
    givePrintedCost(state, 'p1', cardId)

    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 2, index: 0 } })

    expect(next.players.p1.purchased.some((card) => card.cardId === cardId)).toBe(true)
    expect(TEST_CARDS.find((item) => item.cardId === cardId)?.color).toBe(color)
    expect(next.players.p1.privileges).toBe(1)
    expect(next.availablePrivileges).toBe(0)
  })

  it('queues steal-token card abilities only when the opponent has a valid token', () => {
    const state = playingState()
    state.market[2][0] = 2312
    giveToken(state, 'p1', 'ruby', 3)
    giveToken(state, 'p1', 'sapphire', 4)
    giveToken(state, 'p2', 'pearl')

    const afterPurchase = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 2, index: 0 } })
    expect(afterPurchase.pending?.type).toBe('stealToken')

    const afterSteal = applyAction(afterPurchase, { type: 'stealToken', playerId: 'p1', tokenType: 'pearl' })
    expect(afterSteal.players.p1.tokens.pearl).toBe(1)
    expect(afterSteal.players.p2.tokens.pearl).toBe(0)
    expect(afterSteal.currentPlayer).toBe('p2')
  })

  it('skips steal-token card abilities when the opponent has no valid token', () => {
    const state = playingState()
    state.market[2][0] = 2312
    giveToken(state, 'p1', 'ruby', 3)
    giveToken(state, 'p1', 'sapphire', 4)

    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 2, index: 0 } })
    expect(next.pending).toBeUndefined()
    expect(next.currentPlayer).toBe('p2')
  })

  it('queues and claims eligible classic nobles after buying a card', () => {
    const state = createInitialGame('classic-noble-test', { gameType: 'classic', playerCount: 4 })
    state.status = 'playing'
    state.currentPlayer = 'p1'
    state.royalCards = [20001, 20002, 20003]
    state.players.p1.purchased = [
      { cardId: 1 },
      { cardId: 6 },
      { cardId: 11 },
      { cardId: 16 },
      { cardId: 2 },
      { cardId: 7 },
      { cardId: 12 },
      { cardId: 17 },
    ]
    state.market[1][0] = 1
    giveToken(state, 'p1', 'emerald', 4)

    const afterPurchase = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })
    expect(afterPurchase.pending).toMatchObject({ type: 'chooseRoyal', reason: 'noble', options: [20001] })

    const afterNoble = applyAction(afterPurchase, { type: 'chooseRoyal', playerId: 'p1', cardId: 20001 })
    expect(afterNoble.players.p1.purchased).toContainEqual({ cardId: 20001 })
    expect(playerStats(afterNoble, 'p1').points).toBeGreaterThanOrEqual(3)
    expect(afterNoble.currentPlayer).toBe('p2')
  })

  it.each([2312, 2315, 2316, 2320, 2321] as const)('resolves steal-token ability on card %i', (cardId) => {
    const state = playingState()
    state.market[2][0] = cardId
    givePrintedCost(state, 'p1', cardId)
    giveToken(state, 'p2', 'pearl')

    const afterPurchase = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 2, index: 0 } })
    expect(afterPurchase.pending?.type).toBe('stealToken')

    const afterSteal = applyAction(afterPurchase, { type: 'stealToken', playerId: 'p1', tokenType: 'pearl' })
    expect(afterSteal.players.p1.tokens.pearl).toBe(1)
    expect(afterSteal.players.p2.tokens.pearl).toBe(0)
  })

  it('resolves royal card abilities after a royal is chosen', () => {
    const state = playingState()
    state.royalCards = [1402]
    state.pending = { type: 'chooseRoyal', playerId: 'p1', reason: 'threeCrowns', options: [1402], resume: { extraTurn: false } }
    giveToken(state, 'p2', 'emerald')

    const afterRoyal = applyAction(state, { type: 'chooseRoyal', playerId: 'p1', cardId: 1402 })
    expect(afterRoyal.players.p1.purchased.some((card) => card.cardId === 1402)).toBe(true)
    expect(afterRoyal.royalCards).toContain(1402)
    expect(afterRoyal.pending?.type).toBe('stealToken')

    const afterSteal = applyAction(afterRoyal, { type: 'stealToken', playerId: 'p1', tokenType: 'emerald' })
    expect(afterSteal.players.p1.tokens.emerald).toBe(1)
    expect(afterSteal.players.p2.tokens.emerald).toBe(0)
  })

  it('resolves all royal card choices and their abilities', () => {
    const noAbilityState = playingState()
    noAbilityState.royalCards = [1400]
    noAbilityState.pending = { type: 'chooseRoyal', playerId: 'p1', reason: 'threeCrowns', options: [1400], resume: { extraTurn: false } }
    const afterNoAbilityRoyal = applyAction(noAbilityState, { type: 'chooseRoyal', playerId: 'p1', cardId: 1400 })
    expect(afterNoAbilityRoyal.players.p1.purchased).toContainEqual({ cardId: 1400 })
    expect(afterNoAbilityRoyal.currentPlayer).toBe('p2')

    const extraTurnState = playingState()
    extraTurnState.royalCards = [1401]
    extraTurnState.pending = { type: 'chooseRoyal', playerId: 'p1', reason: 'threeCrowns', options: [1401], resume: { extraTurn: false } }
    const afterExtraTurnRoyal = applyAction(extraTurnState, { type: 'chooseRoyal', playerId: 'p1', cardId: 1401 })
    expect(afterExtraTurnRoyal.players.p1.purchased).toContainEqual({ cardId: 1401 })
    expect(afterExtraTurnRoyal.currentPlayer).toBe('p1')

    const privilegeState = playingState()
    privilegeState.availablePrivileges = 1
    privilegeState.players.p1.privileges = 0
    privilegeState.royalCards = [1403]
    privilegeState.pending = { type: 'chooseRoyal', playerId: 'p1', reason: 'threeCrowns', options: [1403], resume: { extraTurn: false } }
    const afterPrivilegeRoyal = applyAction(privilegeState, { type: 'chooseRoyal', playerId: 'p1', cardId: 1403 })
    expect(afterPrivilegeRoyal.players.p1.purchased).toContainEqual({ cardId: 1403 })
    expect(afterPrivilegeRoyal.players.p1.privileges).toBe(1)
    expect(afterPrivilegeRoyal.availablePrivileges).toBe(0)
  })

  it('queues royal choices exactly when crossing three and six crowns', () => {
    const state = playingState()
    state.players.p1.purchased = [{ cardId: 2100 }, { cardId: 2116 }]
    state.market[3][0] = 7100
    givePrintedCost(state, 'p1', 7100)

    const afterThreeCrowns = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 3, index: 0 } })
    expect(afterThreeCrowns.pending).toMatchObject({ type: 'chooseRoyal', reason: 'threeCrowns' })

    const afterRoyal = applyAction(afterThreeCrowns, { type: 'chooseRoyal', playerId: 'p1', cardId: afterThreeCrowns.royalCards[0] })
    afterRoyal.currentPlayer = 'p1'
    afterRoyal.market[2][0] = 2304
    givePrintedCost(afterRoyal, 'p1', 2304)

    const afterSixCrowns = applyAction(afterRoyal, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 2, index: 0 }, wildColor: 'diamond' })
    expect(afterSixCrowns.pending).toMatchObject({ type: 'chooseRoyal', reason: 'sixCrowns' })
    expect(afterSixCrowns.pending?.type === 'chooseRoyal' ? afterSixCrowns.pending.options : []).not.toContain(afterThreeCrowns.royalCards[0])
  })

  it('queues royal choice at crown thresholds and recognizes crown victory', () => {
    const state = playingState()
    state.players.p1.purchased = [
      { cardId: 2100 },
      { cardId: 2116 },
      { cardId: 2117 },
      { cardId: 2121 },
      { cardId: 2129 },
      { cardId: 2305, wildColor: 'ruby' },
      { cardId: 2304, wildColor: 'ruby' },
      { cardId: 7112, wildColor: 'ruby' },
    ]
    expect(playerStats(state, 'p1').crowns).toBeGreaterThanOrEqual(10)
    const next = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: [state.board.find((cell) => cell.token?.type !== 'gold')!.id] })
    expect(next.status).toBe('playing')
    expect(next.finalRound).toMatchObject({ triggerPlayerId: 'p1', reason: 'crowns' })
  })

  it('recognizes total points victory', () => {
    const state = playingState()
    state.players.p1.purchased = [{ cardId: 7103 }, { cardId: 2303 }, { cardId: 2125 }, { cardId: 1400 }, { cardId: 1401 }, { cardId: 1402 }, { cardId: 1403 }]
    putTokens(state, ['ruby', 'sapphire'])
    const afterFirst = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0'] })
    expect(afterFirst.winner).toBeUndefined()
    expect(afterFirst.currentPlayer).toBe('p2')
    const next = applyAction(afterFirst, { type: 'takeTokens', playerId: 'p2', cellIds: ['1:0'] })
    expect(next.winner?.reason).toBe('points')
  })

  it('finishes the Duel final circle without chasing extra-turn action counts', () => {
    const state = playingState()
    state.firstPlayer = 'p1'
    state.players.p1.turnsTaken = 6
    state.players.p2.turnsTaken = 2
    state.players.p1.purchased = [{ cardId: 7103 }, { cardId: 2303 }, { cardId: 2125 }, { cardId: 1400 }, { cardId: 1401 }, { cardId: 1402 }, { cardId: 2101 }]
    state.players.p2.purchased = [{ cardId: 7103 }, { cardId: 2303 }, { cardId: 1401 }, { cardId: 1402 }]
    putTokens(state, ['ruby', 'sapphire'])

    expect(playerStats(state, 'p1').points).toBe(22)
    expect(playerStats(state, 'p2').points).toBe(15)
    const afterTrigger = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0'] })
    expect(afterTrigger.status).toBe('playing')
    expect(afterTrigger.finalRound).toMatchObject({ triggerPlayerId: 'p1', reason: 'points' })
    expect(afterTrigger.currentPlayer).toBe('p2')

    const next = applyAction(afterTrigger, { type: 'takeTokens', playerId: 'p2', cellIds: ['1:0'] })
    expect(next.status).toBe('finished')
    expect(next.winner).toEqual({ playerId: 'p1', reason: 'points' })
  })

  it('recognizes same-color points victory with wild color assignment', () => {
    const state = playingState()
    state.players.p1.purchased = [
      { cardId: 7106 },
      { cardId: 7111 },
      { cardId: 2302 },
      { cardId: 2317, wildColor: 'ruby' },
    ]
    expect(playerStats(state, 'p1').colorPoints.ruby).toBeGreaterThanOrEqual(10)
    putTokens(state, ['ruby', 'sapphire'])
    const afterFirst = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0'] })
    expect(afterFirst.winner).toBeUndefined()
    const next = applyAction(afterFirst, { type: 'takeTokens', playerId: 'p2', cellIds: ['1:0'] })
    expect(next.winner?.reason).toBe('colorPoints')
  })

  it('adds an overtime round when both duel players are tied after the final circle', () => {
    const state = playingState()
    state.firstPlayer = 'p1'
    state.players.p1.purchased = [{ cardId: 7103 }, { cardId: 2303 }, { cardId: 2125 }, { cardId: 1400 }, { cardId: 1401 }, { cardId: 1402 }, { cardId: 1403 }]
    state.players.p2.purchased = [{ cardId: 7103 }, { cardId: 2303 }, { cardId: 2125 }, { cardId: 1400 }, { cardId: 1401 }, { cardId: 1402 }, { cardId: 1403 }]
    putTokens(state, ['ruby', 'sapphire', 'onyx'])

    const afterFirst = applyAction(state, { type: 'takeTokens', playerId: 'p1', cellIds: ['0:0'] })
    const afterSecond = applyAction(afterFirst, { type: 'takeTokens', playerId: 'p2', cellIds: ['1:0'] })

    expect(afterSecond.status).toBe('playing')
    expect(afterSecond.winner).toBeUndefined()
    expect(afterSecond.finalRound?.targetTurns).toBe(2)
    expect(afterSecond.finalRound?.overtimeRounds).toBe(1)
    expect(afterSecond.currentPlayer).toBe('p1')
    expect(afterSecond.turnNumber).toBe(2)
  })

  it('finishes classic Splendor only after the scoring round is complete', () => {
    const state = classicPlayingState(4)
    state.players.p1.purchased = [{ cardId: 86 }, { cardId: 87 }, { cardId: 88 }]

    const afterP1 = takeClassicTurn(state, 'p1')
    expect(afterP1.status).toBe('playing')
    expect(afterP1.winner).toBeUndefined()
    expect(afterP1.finalRound).toMatchObject({ triggerPlayerId: 'p1', targetTurns: 1, reason: 'points' })
    expect(afterP1.currentPlayer).toBe('p2')

    const afterP2 = takeClassicTurn(afterP1, 'p2')
    const afterP3 = takeClassicTurn(afterP2, 'p3')
    const afterP4 = takeClassicTurn(afterP3, 'p4')

    expect(afterP4.status).toBe('finished')
    expect(afterP4.winner).toEqual({ playerId: 'p1', reason: 'points' })
  })

  it('adds classic Splendor overtime rounds while tied at the scoring threshold', () => {
    const state = classicPlayingState(2)
    state.players.p1.purchased = [{ cardId: 86 }, { cardId: 87 }, { cardId: 88 }]
    state.players.p2.purchased = [{ cardId: 86 }, { cardId: 87 }, { cardId: 88 }]

    const afterP1 = takeClassicTurn(state, 'p1')
    const tied = takeClassicTurn(afterP1, 'p2')

    expect(tied.status).toBe('playing')
    expect(tied.winner).toBeUndefined()
    expect(tied.finalRound?.targetTurns).toBe(2)
    expect(tied.finalRound?.overtimeRounds).toBe(1)
    expect(tied.currentPlayer).toBe('p1')
    expect(tied.turnNumber).toBe(2)

    tied.players.p1.purchased.push({ cardId: 1 })
    const afterOvertimeP1 = takeClassicTurn(tied, 'p1')
    expect(afterOvertimeP1.status).toBe('playing')
    const afterOvertimeP2 = takeClassicTurn(afterOvertimeP1, 'p2')

    expect(afterOvertimeP2.status).toBe('finished')
    expect(afterOvertimeP2.winner).toEqual({ playerId: 'p1', reason: 'points' })
  })

  it('does not trigger classic Splendor victory from same-color points alone', () => {
    const state = classicPlayingState(2)
    state.players.p1.purchased = [{ cardId: 76 }, { cardId: 81 }, { cardId: 86 }]
    expect(playerStats(state, 'p1').points).toBeLessThan(15)
    expect(playerStats(state, 'p1').colorPoints.diamond).toBeGreaterThanOrEqual(10)

    const afterP1 = takeClassicTurn(state, 'p1')
    const afterP2 = takeClassicTurn(afterP1, 'p2')

    expect(afterP2.finalRound).toBeUndefined()
    expect(afterP2.winner).toBeUndefined()
    expect(afterP2.status).toBe('playing')
  })

  it('starts Pokemon Splendor with Classic market shape and special decks instead of nobles', () => {
    const state = createInitialGame('pokemon-start', { gameType: 'pokemon', playerCount: 4 })

    expect(state.gameType).toBe('pokemon')
    expect(state.royalCards).toEqual([])
    expect(state.market[1]).toHaveLength(4)
    expect(state.market[2]).toHaveLength(4)
    expect(state.market[3]).toHaveLength(4)
    expect(state.pokemonSpecial?.set).toBe('primary')
    expect(state.pokemonSpecial?.rareFaceUp).toBeTruthy()
    expect(state.pokemonSpecial?.legendaryFaceUp).toBeTruthy()
    expect(state.pokemonSpecial?.rareDeck).toHaveLength(pokemonRareCards().length - 1)
    expect(state.pokemonSpecial?.legendaryDeck).toHaveLength(pokemonLegendaryCards().length - 1)
  })

  it('can start Pokemon Splendor with the alternate special card set', () => {
    const state = createInitialGame('pokemon-alternate-specials', { gameType: 'pokemon', playerCount: 4, pokemonSpecialSet: 'alternate' })
    const rareCards = [state.pokemonSpecial!.rareFaceUp!, ...state.pokemonSpecial!.rareDeck].map(getCard)
    const legendaryCards = [state.pokemonSpecial!.legendaryFaceUp!, ...state.pokemonSpecial!.legendaryDeck].map(getCard)

    expect(state.pokemonSpecial?.set).toBe('alternate')
    expect(rareCards).toHaveLength(5)
    expect(legendaryCards).toHaveLength(5)
    expect(rareCards.every((card) => card.deckKind === 'rare' && card.pokemonSpecialSet === 'alternate' && card.points > 0)).toBe(true)
    expect(legendaryCards.every((card) => card.deckKind === 'legendary' && card.pokemonSpecialSet === 'alternate' && card.points === 0)).toBe(true)
  })

  it('requires Pokemon players to manually end the turn after a mandatory action', () => {
    const state = pokemonPlayingState(2)

    const afterTake = applyAction(state, { type: 'takeClassicBankTokens', playerId: 'p1', tokenTypes: ['diamond', 'sapphire', 'emerald'] })

    expect(afterTake.currentPlayer).toBe('p1')
    expect(afterTake.turnActions?.mandatoryDone).toBe(true)

    const afterEnd = applyAction(afterTake, { type: 'endTurn', playerId: 'p1' })
    expect(afterEnd.currentPlayer).toBe('p2')
    expect(afterEnd.turnActions).toEqual({})
  })

  it('can commit a Pokemon ball draft through the end-turn action', () => {
    const state = pokemonPlayingState(2)

    const next = applyAction(state, { type: 'endTurn', playerId: 'p1', tokenTypes: ['diamond', 'sapphire', 'emerald'] })

    expect(next.currentPlayer).toBe('p2')
    expect(next.players.p1.tokens.diamond).toBe(1)
    expect(next.players.p1.tokens.sapphire).toBe(1)
    expect(next.players.p1.tokens.emerald).toBe(1)
    expect(next.turnActions).toEqual({})
  })

  it('buys Pokemon rare and legendary cards with fixed master ball costs and refills the face-up slot', () => {
    const state = pokemonPlayingState(2)
    const rareCardId = state.pokemonSpecial!.rareFaceUp!
    const rareCard = getCard(rareCardId)
    giveToken(state, 'p1', 'gold', rareCard.goldCost ?? 0)
    for (const token of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald'] as const) {
      giveToken(state, 'p1', token, rareCard.cost[token])
    }

    const next = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'pokemonSpecial', deck: 'rare' } })

    expect(next.players.p1.purchased).toContainEqual({ cardId: rareCardId, wildColor: undefined })
    expect(next.players.p1.tokens.gold).toBe(0)
    expect(next.pokemonSpecial?.rareFaceUp).not.toBe(rareCardId)
    expect(next.currentPlayer).toBe('p1')
    expect(next.turnActions?.mandatoryDone).toBe(true)
  })

  it('rejects reserving Pokemon rare and legendary cards', () => {
    const state = pokemonPlayingState(2)
    giveToken(state, 'p1', 'gold')

    expect(() =>
      applyAction(state, { type: 'reserveCard', playerId: 'p1', source: { type: 'pokemonSpecial', deck: 'legendary' }, goldCellId: 'bank:gold' }),
    ).toThrow(/不能保留/)
  })

  it('reserves regular Pokemon cards and takes a master ball from the bank', () => {
    const state = pokemonPlayingState(2)
    const cardId = state.market[1][0]!
    const goldBefore = state.bag.filter((token) => token.type === 'gold').length + state.board.filter((cell) => cell.token?.type === 'gold').length

    const next = applyAction(state, { type: 'reserveCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 }, goldCellId: 'bank:gold' })

    expect(next.players.p1.reserve).toContain(cardId)
    expect(next.players.p1.tokens.gold).toBe(1)
    expect(next.bag.filter((token) => token.type === 'gold').length + next.board.filter((cell) => cell.token?.type === 'gold').length).toBe(goldBefore - 1)
    expect(next.currentPlayer).toBe('p1')
    expect(next.turnActions?.mandatoryDone).toBe(true)
  })

  it('can undo a Pokemon reservation before ending the turn', () => {
    const state = pokemonPlayingState(2)
    state.market[1][0] = 30001
    state.decks[1] = [30002, ...state.decks[1].filter((cardId) => cardId !== 30002)]
    const goldBefore = state.bag.filter((token) => token.type === 'gold').length + state.board.filter((cell) => cell.token?.type === 'gold').length

    const reserved = applyAction(state, { type: 'reserveCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 }, goldCellId: 'bank:gold' })
    const undone = applyAction(reserved, { type: 'undoPokemonAction', playerId: 'p1' })

    expect(undone.players.p1.reserve).not.toContain(30001)
    expect(undone.players.p1.tokens.gold).toBe(0)
    expect(undone.market[1][0]).toBe(30001)
    expect(undone.decks[1][0]).toBe(30002)
    expect(undone.bag.filter((token) => token.type === 'gold').length + undone.board.filter((cell) => cell.token?.type === 'gold').length).toBe(goldBefore)
    expect(undone.turnActions?.mandatoryDone).toBe(false)
  })

  it('can undo a Pokemon purchase and refund the spent tokens', () => {
    const state = pokemonPlayingState(2)
    state.market[1][0] = 30001
    state.decks[1] = [30002, ...state.decks[1].filter((cardId) => cardId !== 30002)]
    const card = getCard(30001)
    for (const token of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald', 'pearl'] as const) {
      if (card.cost[token] > 0) giveToken(state, 'p1', token, card.cost[token])
    }
    const tokensBefore = { ...state.players.p1.tokens }

    const purchased = applyAction(state, { type: 'purchaseCard', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })
    const undone = applyAction(purchased, { type: 'undoPokemonAction', playerId: 'p1' })

    expect(undone.players.p1.purchased.some((card) => card.cardId === 30001)).toBe(false)
    expect(undone.players.p1.tokens).toEqual(tokensBefore)
    expect(undone.market[1][0]).toBe(30001)
    expect(undone.decks[1][0]).toBe(30002)
    expect(undone.turnActions?.mandatoryDone).toBe(false)
  })

  it('evolves one Pokemon after the mandatory action and waits for manual end turn', () => {
    const state = pokemonPlayingState(2)
    const baseCardId = 30001
    const targetCardId = 30002
    state.players.p1.purchased = [{ cardId: baseCardId }]
    state.market[1][0] = targetCardId
    const cost = getCard(baseCardId).evolutionCost ?? getCard(baseCardId).cost
    const bonusCardByGem: Record<GemType, number> = { diamond: 30021, sapphire: 30012, emerald: 30035, ruby: 30028, onyx: 30001 }
    for (const gem of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald'] as const) {
      for (let index = 0; index < cost[gem]; index += 1) state.players.p1.purchased.push({ cardId: bonusCardByGem[gem] })
    }
    state.turnActions = { mandatoryDone: true }

    const next = applyAction(state, { type: 'evolvePokemon', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })

    expect(next.players.p1.purchased.some((card) => card.cardId === targetCardId)).toBe(true)
    expect(next.players.p1.tucked).toContain(baseCardId)
    expect(next.pokemonSpecial?.evolutionPile).toContain(baseCardId)
    expect(next.turnActions?.evolved).toBe(true)
    expect(next.currentPlayer).toBe('p1')
  })

  it('can undo a Pokemon evolution before ending the turn', () => {
    const state = pokemonPlayingState(2)
    const { targetCardId, purchasedBefore, evolutionPileBefore } = preparePokemonEvolutionState(state)
    state.turnActions = { mandatoryDone: true }

    const evolved = applyAction(state, { type: 'evolvePokemon', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })
    const replacementCardId = evolved.market[1][0]
    const undone = applyAction(evolved, { type: 'undoPokemonEvolution', playerId: 'p1' })

    expect(undone.players.p1.purchased).toEqual(purchasedBefore)
    expect(undone.players.p1.tucked ?? []).toEqual([])
    expect(undone.pokemonSpecial?.evolutionPile).toEqual(evolutionPileBefore)
    expect(undone.market[1][0]).toBe(targetCardId)
    if (replacementCardId) expect(undone.decks[1][0]).toBe(replacementCardId)
    expect(undone.turnActions?.mandatoryDone).toBe(true)
    expect(undone.turnActions?.evolved).toBe(false)
    expect(undone.turnActions?.pokemonEvolution).toBeUndefined()
  })

  it('undoing a Pokemon mandatory action also rolls back a draft evolution', () => {
    const state = pokemonPlayingState(2)
    const { targetCardId, purchasedBefore } = preparePokemonEvolutionState(state)
    const tokensBefore = { ...state.players.p1.tokens }

    const taken = applyAction(state, { type: 'takeClassicBankTokens', playerId: 'p1', tokenTypes: ['diamond', 'sapphire', 'emerald'] })
    const evolved = applyAction(taken, { type: 'evolvePokemon', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 } })
    const undone = applyAction(evolved, { type: 'undoPokemonAction', playerId: 'p1' })

    expect(undone.players.p1.purchased).toEqual(purchasedBefore)
    expect(undone.players.p1.tucked ?? []).toEqual([])
    expect(undone.players.p1.tokens).toEqual(tokensBefore)
    expect(undone.market[1][0]).toBe(targetCardId)
    expect(undone.turnActions?.mandatoryDone).toBe(false)
    expect(undone.turnActions?.evolved).toBe(false)
    expect(undone.turnActions?.pokemonAction).toBeUndefined()
    expect(undone.turnActions?.pokemonEvolution).toBeUndefined()
  })

  it('can commit a Pokemon ball draft before a free evolution', () => {
    const state = pokemonPlayingState(2)
    const baseCardId = 30001
    const targetCardId = 30002
    state.players.p1.purchased = [{ cardId: baseCardId }]
    state.market[1][0] = targetCardId
    const cost = getCard(baseCardId).evolutionCost ?? getCard(baseCardId).cost
    const bonusCardByGem: Record<GemType, number> = { diamond: 30021, sapphire: 30012, emerald: 30035, ruby: 30028, onyx: 30001 }
    for (const gem of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald'] as const) {
      for (let index = 0; index < cost[gem]; index += 1) state.players.p1.purchased.push({ cardId: bonusCardByGem[gem] })
    }

    const next = applyAction(state, { type: 'evolvePokemon', playerId: 'p1', source: { type: 'market', tier: 1, index: 0 }, tokenTypes: ['diamond', 'sapphire', 'emerald'] })

    expect(next.players.p1.purchased.some((card) => card.cardId === targetCardId)).toBe(true)
    expect(next.players.p1.tokens.diamond).toBe(1)
    expect(next.turnActions?.pokemonAction?.type).toBe('takeTokens')
    expect(next.turnActions?.mandatoryDone).toBe(true)
    expect(next.turnActions?.evolved).toBe(true)
    expect(next.currentPlayer).toBe('p1')
  })

  it('does not count gray prestige cards toward same-color victory', () => {
    const state = playingState()
    state.players.p1.purchased = [{ cardId: 7103 }, { cardId: 2303 }, { cardId: 2125 }]
    expect(playerStats(state, 'p1').points).toBeGreaterThanOrEqual(10)
    expect(Math.max(...Object.values(playerStats(state, 'p1').colorPoints))).toBe(0)
  })
})
