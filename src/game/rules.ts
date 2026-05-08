import { cardsByTier, classicCardsByTier, classicNobleCards, duelRoyalCards, getCard, pokemonCardsByTier, pokemonLegendaryCards, pokemonRareCards } from './cards'
import { MARKET_SIZES, SPIRAL_CELL_IDS, TOKEN_LABELS } from './data/static'
import { GEM_TYPES, TOKEN_TYPES, type BoardCell, type CardAbility, type CardSource, type Cost, type GameAction, type GameState, type GemType, type PlayerId, type PokemonSpecialSet, type PurchasedCard, type Tier, type Token, type TokenType, type TurnResume, type VictoryReason } from './types'

const DEFAULT_PLAYER_ORDER: PlayerId[] = ['p1', 'p2']
const PLAYER_NAMES: Record<PlayerId, string> = {
  p1: '玩家一',
  p2: '玩家二',
  p3: '玩家三',
  p4: '玩家四',
}

export const VICTORY_TARGETS = {
  points: 20,
  crowns: 10,
  colorPoints: 10,
} as const

export const CLASSIC_VICTORY_POINTS = 15
export const POKEMON_VICTORY_POINTS = 18

export class RuleError extends Error {}

export function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === 'p1' ? 'p2' : 'p1'
}

export function playerOrder(state: GameState): PlayerId[] {
  return state.playerOrder?.length ? state.playerOrder : DEFAULT_PLAYER_ORDER
}

function nextPlayer(state: GameState, playerId: PlayerId): PlayerId {
  const order = playerOrder(state)
  const index = order.indexOf(playerId)
  assertRule(index >= 0, '玩家不在当前房间内。')
  return order[(index + 1) % order.length]
}

function createPlayer(id: PlayerId): GameState['players'][PlayerId] {
  return {
    id,
    name: PLAYER_NAMES[id],
    connected: false,
    seated: false,
    tokens: emptyTokens(),
    tokenSlots: [],
    privileges: 0,
    reserve: [],
    purchased: [],
    tucked: [],
    turnsTaken: 0,
  }
}

function assertRule(value: unknown, message: string): asserts value {
  if (!value) throw new RuleError(message)
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state)
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function emptyTokens(): Record<TokenType, number> {
  return {
    ruby: 0,
    sapphire: 0,
    onyx: 0,
    diamond: 0,
    emerald: 0,
    pearl: 0,
    gold: 0,
  }
}

function makeBag(gameType: GameState['gameType'] = 'duel'): Token[] {
  const counts: Record<TokenType, number> =
    gameType === 'classic' || gameType === 'pokemon'
      ? {
          ruby: 7,
          sapphire: 7,
          onyx: 7,
          diamond: 7,
          emerald: 7,
          pearl: 0,
          gold: 5,
        }
      : {
          ruby: 4,
          sapphire: 4,
          onyx: 4,
          diamond: 4,
          emerald: 4,
          pearl: 2,
          gold: 3,
        }
  const tokens: Token[] = []
  for (const type of TOKEN_TYPES) {
    for (let index = 0; index < counts[type]; index += 1) tokens.push({ id: `${type}-${index}`, type })
  }
  return shuffle(tokens)
}

function makeBoard(): BoardCell[] {
  return SPIRAL_CELL_IDS.map((id) => {
    const [x, y] = id.split(':').map(Number)
    return { id, x, y }
  })
}

function draw(deck: number[]): number | null {
  return deck.shift() ?? null
}

function makeMarket(decks: Record<Tier, number[]>, gameType: GameState['gameType'] = 'duel'): Record<Tier, Array<number | null>> {
  const sizes = gameType === 'classic' || gameType === 'pokemon' ? ({ 1: 4, 2: 4, 3: 4 } as const) : MARKET_SIZES
  return {
    1: Array.from({ length: sizes[1] }, () => draw(decks[1])),
    2: Array.from({ length: sizes[2] }, () => draw(decks[2])),
    3: Array.from({ length: sizes[3] }, () => draw(decks[3])),
  }
}

function resolvePokemonSpecialSet(value: unknown): PokemonSpecialSet {
  return value === 'alternate' ? 'alternate' : 'primary'
}

export function createInitialGame(roomId: string, options: { gameType?: GameState['gameType']; playerCount?: 2 | 3 | 4; pokemonSpecialSet?: PokemonSpecialSet } = {}): GameState {
  const gameType = options.gameType ?? 'duel'
  const playerCount = options.playerCount ?? (gameType === 'classic' || gameType === 'pokemon' ? 4 : 2)
  const pokemonSpecialSet = resolvePokemonSpecialSet(options.pokemonSpecialSet)
  const order = (playerCount === 4 ? ['p1', 'p2', 'p3', 'p4'] : ['p1', 'p2']) as PlayerId[]
  const firstPlayer = order[Math.floor(Math.random() * order.length)]
  const deckSource = gameType === 'pokemon' ? pokemonCardsByTier : gameType === 'classic' ? classicCardsByTier : cardsByTier
  const decks = {
    1: shuffle(deckSource(1)),
    2: shuffle(deckSource(2)),
    3: shuffle(deckSource(3)),
  }
  const state: GameState = {
    roomId,
    gameType,
    status: 'waiting',
    currentPlayer: firstPlayer,
    firstPlayer,
    playerOrder: order,
    turnNumber: 1,
    board: makeBoard(),
    bag: makeBag(gameType),
    decks,
    market: makeMarket(decks, gameType),
    royalCards: gameType === 'classic' ? shuffle(classicNobleCards()).slice(0, playerCount + 1) : gameType === 'pokemon' ? [] : duelRoyalCards(),
    pokemonSpecial: gameType === 'pokemon'
      ? (() => {
          const rareDeck = shuffle(pokemonRareCards(pokemonSpecialSet))
          const legendaryDeck = shuffle(pokemonLegendaryCards(pokemonSpecialSet))
          return {
            set: pokemonSpecialSet,
            rareFaceUp: draw(rareDeck),
            rareDeck,
            legendaryFaceUp: draw(legendaryDeck),
            legendaryDeck,
            evolutionPile: [],
          }
        })()
      : undefined,
    availablePrivileges: 3,
    turnActions: {},
    players: {
      p1: createPlayer('p1'),
      p2: createPlayer('p2'),
      p3: createPlayer('p3'),
      p4: createPlayer('p4'),
    },
    log: [`房间已创建，等待 ${playerCount} 位玩家加入。`],
  }
  replenishBoard(state, false)
  awardPrivilege(state, nextPlayer(state, firstPlayer))
  return state
}

export function startGameIfReady(state: GameState): void {
  assertRule(state.status === 'waiting', '游戏已经开始。')
  if (state.gameType === 'classic' || state.gameType === 'pokemon') {
    startClassicGameIfReady(state)
    return
  }
  const order = playerOrder(state)
  assertRule(order.every((id) => state.players[id].seated), `需要 ${order.length} 位玩家都确认姓名并入座。`)
  assertRule(order.every((id) => state.players[id].connected), `需要 ${order.length} 位玩家都在线。`)
  state.status = 'playing'
  state.log.unshift(`${state.players[state.currentPlayer].name} 先手，下一位玩家获得 1 张特权卷轴。`)
}

function startClassicGameIfReady(state: GameState): void {
  const activeOrder = (['p1', 'p2', 'p3', 'p4'] as const).filter((id) => state.players[id].seated && state.players[id].connected)
  assertRule(activeOrder.length >= 2, '璀璨宝石经典版需要至少 2 位玩家确认姓名并在线。')
  assertRule(activeOrder.length <= 4, '璀璨宝石经典版最多 4 位玩家。')
  state.playerOrder = [...activeOrder]
  if (!state.playerOrder.includes(state.currentPlayer)) state.currentPlayer = state.playerOrder[0]
  state.firstPlayer = state.currentPlayer
  if (state.gameType === 'classic') state.royalCards = state.royalCards.slice(0, activeOrder.length + 1)
  trimClassicBankToPlayerCount(state, activeOrder.length)
  state.status = 'playing'
  state.log.unshift(`${state.players[state.currentPlayer].name} 先手。`)
}

function trimClassicBankToPlayerCount(state: GameState, playerCount: number): void {
  const targetByPlayerCount: Record<number, number> = { 2: 4, 3: 5, 4: 7 }
  const targetGemCount = targetByPlayerCount[playerCount] ?? 7
  for (const type of GEM_TYPES) trimClassicBankToken(state, type, targetGemCount)
  trimClassicBankToken(state, 'gold', 5)
}

function trimClassicBankToken(state: GameState, type: TokenType, targetCount: number): void {
  let count = state.bag.filter((token) => token.type === type).length + state.board.filter((cell) => cell.token?.type === type).length
  for (let index = state.bag.length - 1; index >= 0 && count > targetCount; index -= 1) {
    if (state.bag[index]?.type !== type) continue
    state.bag.splice(index, 1)
    count -= 1
  }
  for (const cell of [...state.board].reverse()) {
    if (count <= targetCount) break
    if (cell.token?.type !== type) continue
    cell.token = undefined
    count -= 1
  }
}

export function totalTokens(player: GameState['players'][PlayerId]): number {
  const count = tokenCountFromMap(player.tokens)
  return player.tokenSlots?.length === count ? player.tokenSlots.length : count
}

export function playerStats(state: GameState, playerId: PlayerId) {
  const player = state.players[playerId]
  const bonuses: Record<GemType, number> = { ruby: 0, sapphire: 0, onyx: 0, diamond: 0, emerald: 0 }
  const colorPoints: Record<GemType, number> = { ruby: 0, sapphire: 0, onyx: 0, diamond: 0, emerald: 0 }
  let crowns = 0
  let points = 0
  for (const purchased of player.purchased) {
    const card = getCard(purchased.cardId)
    points += card.points
    crowns += card.crowns
    const colors = purchased.wildColor ? [purchased.wildColor] : card.bonusColors?.length ? card.bonusColors : card.color ? [card.color] : []
    for (const color of colors) {
      if (color) {
        const gemCount = card.doubleGem ? 2 : 1
        bonuses[color] += gemCount
        colorPoints[color] += card.points
      }
    }
  }
  return { bonuses, colorPoints, crowns, points, tokenCount: totalTokens(player) }
}

export function royalCardOwner(state: GameState, cardId: number): PlayerId | undefined {
  if (getCard(cardId).tier !== 'royal') return undefined
  for (const playerId of playerOrder(state)) {
    if (state.players[playerId].purchased.some((card) => card.cardId === cardId)) return playerId
  }
  return undefined
}

export function availableRoyalCards(state: GameState): number[] {
  return state.royalCards.filter((cardId) => !royalCardOwner(state, cardId))
}

export function victoryProgress(state: GameState, playerId: PlayerId) {
  const stats = playerStats(state, playerId)
  const bestColor = GEM_TYPES.reduce((best, gem) => (stats.colorPoints[gem] > stats.colorPoints[best] ? gem : best), GEM_TYPES[0])
  const pointTarget = state.gameType === 'classic' ? CLASSIC_VICTORY_POINTS : state.gameType === 'pokemon' ? POKEMON_VICTORY_POINTS : VICTORY_TARGETS.points
  return {
    ...stats,
    bestColor,
    bestColorPoints: stats.colorPoints[bestColor],
    wins: {
      points: stats.points >= pointTarget,
      crowns: stats.crowns >= VICTORY_TARGETS.crowns,
      colorPoints: stats.colorPoints[bestColor] >= VICTORY_TARGETS.colorPoints,
    },
  }
}

export function canAfford(state: GameState, playerId: PlayerId, cardId: number): boolean {
  return computePayment(state, playerId, cardId) !== undefined
}

function discountedCost(state: GameState, playerId: PlayerId, cost: Cost): Cost {
  const bonuses = playerStats(state, playerId).bonuses
  return {
    ruby: Math.max(0, cost.ruby - bonuses.ruby),
    sapphire: Math.max(0, cost.sapphire - bonuses.sapphire),
    onyx: Math.max(0, cost.onyx - bonuses.onyx),
    diamond: Math.max(0, cost.diamond - bonuses.diamond),
    emerald: Math.max(0, cost.emerald - bonuses.emerald),
    pearl: cost.pearl,
  }
}

export function computePayment(state: GameState, playerId: PlayerId, cardId: number): Partial<Record<TokenType, number>> | undefined {
  const player = state.players[playerId]
  const card = getCard(cardId)
  const due = discountedCost(state, playerId, card.cost)
  const payment: Partial<Record<TokenType, number>> = {}
  let goldNeeded = card.goldCost ?? 0
  for (const token of [...GEM_TYPES, 'pearl'] as const) {
    const paid = Math.min(player.tokens[token], due[token])
    if (paid > 0) payment[token] = paid
    goldNeeded += due[token] - paid
  }
  if (goldNeeded > player.tokens.gold) return undefined
  if (goldNeeded > 0) payment.gold = goldNeeded
  return payment
}

export function areAdjacentLine(cells: BoardCell[]): boolean {
  if (cells.length <= 1) return true
  const unique = new Set(cells.map((cell) => cell.id))
  if (unique.size !== cells.length) return false
  const sorted = [...cells].sort((a, b) => (a.x - b.x === 0 ? a.y - b.y : a.x - b.x))
  const dx = Math.sign(sorted[1].x - sorted[0].x)
  const dy = Math.sign(sorted[1].y - sorted[0].y)
  if (dx === 0 && dy === 0) return false
  if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) return false
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].x - sorted[i - 1].x !== dx || sorted[i].y - sorted[i - 1].y !== dy) return false
  }
  return true
}

function getCell(state: GameState, cellId: string): BoardCell {
  const cell = state.board.find((item) => item.id === cellId)
  assertRule(cell, '棋盘格不存在。')
  return cell
}

function requireTurn(state: GameState, playerId: PlayerId): void {
  assertRule(state.status === 'playing', '游戏尚未开始。')
  assertRule(!state.winner, '游戏已经结束。')
  assertRule(state.currentPlayer === playerId, '还没有轮到你。')
  assertRule(!state.pending, '请先完成当前待处理选择。')
}

function turnActions(state: GameState): NonNullable<GameState['turnActions']> {
  state.turnActions ??= {}
  return state.turnActions
}

function resetTurnActions(state: GameState): void {
  state.turnActions = {}
}

function reorderTokenSlots(state: GameState, playerId: PlayerId, tokenIds: string[]): void {
  const player = state.players[playerId]
  ensureTokenSlots(player)
  assertRule(tokenIds.length === player.tokenSlots.length, 'token 槽位顺序不完整。')
  const tokensById = new Map(player.tokenSlots.map((token) => [token.id, token]))
  assertRule(tokensById.size === player.tokenSlots.length, 'token 槽位状态不一致。')
  const nextSlots = tokenIds.map((id) => {
    const token = tokensById.get(id)
    assertRule(token, 'token 槽位顺序无效。')
    return token
  })
  assertRule(new Set(tokenIds).size === player.tokenSlots.length, 'token 槽位顺序包含重复 token。')
  player.tokenSlots = nextSlots
}

function awardPrivilege(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId]
  if (state.availablePrivileges > 0) {
    state.availablePrivileges -= 1
    player.privileges += 1
    return
  }
  const donors = playerOrder(state).filter((id) => id !== playerId)
  const donor = donors.find((id) => state.players[id].privileges > 0)
  if (donor) {
    state.players[donor].privileges -= 1
    player.privileges += 1
  }
}

function replenishBoard(state: GameState, awardOpponent: boolean): void {
  for (const id of SPIRAL_CELL_IDS) {
    const cell = getCell(state, id)
    if (!cell.token && state.bag.length > 0) cell.token = state.bag.shift()
  }
  if (awardOpponent) awardPrivilege(state, nextPlayer(state, state.currentPlayer))
}

function takeTokenFromBoard(state: GameState, cell: BoardCell, playerId: PlayerId): Token {
  assertRule(cell.token, '这个位置没有 token。')
  const token = cell.token
  addTokenToPlayer(state, playerId, token)
  cell.token = undefined
  return token
}

function takeGoldForReserve(state: GameState, playerId: PlayerId, goldCellId: string): Token {
  if (state.gameType !== 'classic' && state.gameType !== 'pokemon') {
    const goldCell = getCell(state, goldCellId)
    assertRule(goldCell.token?.type === 'gold', '保留牌必须拿取棋盘上的 1 个黄金 token。')
    return takeTokenFromBoard(state, goldCell, playerId)
  }
  const requestedCell = state.board.find((cell) => cell.id === goldCellId)
  if (requestedCell?.token?.type === 'gold') return takeTokenFromBoard(state, requestedCell, playerId)
  const boardGold = state.board.find((cell) => cell.token?.type === 'gold')
  if (boardGold) return takeTokenFromBoard(state, boardGold, playerId)
  const bagGoldIndex = state.bag.findIndex((token) => token.type === 'gold')
  assertRule(bagGoldIndex >= 0, '银行没有黄金 token。')
  const [token] = state.bag.splice(bagGoldIndex, 1)
  assertRule(token, '银行没有黄金 token。')
  addTokenToPlayer(state, playerId, token)
  return token
}

function bankTokenCount(state: GameState, tokenType: TokenType): number {
  return state.bag.filter((token) => token.type === tokenType).length + state.board.filter((cell) => cell.token?.type === tokenType).length
}

function takeTokenFromClassicBank(state: GameState, playerId: PlayerId, tokenType: GemType): Token {
  const bagIndex = state.bag.findIndex((token) => token.type === tokenType)
  if (bagIndex >= 0) {
    const [token] = state.bag.splice(bagIndex, 1)
    assertRule(token, '银行没有这个 token。')
    addTokenToPlayer(state, playerId, token)
    return token
  }
  const boardCell = state.board.find((cell) => cell.token?.type === tokenType)
  assertRule(boardCell?.token, '银行没有这个 token。')
  return takeTokenFromBoard(state, boardCell, playerId)
}

function addTokenToPlayer(state: GameState, playerId: PlayerId, token: Token): void {
  const player = state.players[playerId]
  ensureTokenSlots(player)
  player.tokens[token.type] += 1
  player.tokenSlots.push(token)
}

function removeTokenFromPlayer(state: GameState, playerId: PlayerId, tokenType: TokenType): Token {
  const player = state.players[playerId]
  ensureTokenSlots(player)
  assertRule(player.tokens[tokenType] > 0, '没有这个 token。')
  const slotIndex = player.tokenSlots.findIndex((token) => token.type === tokenType)
  assertRule(slotIndex >= 0, 'token 槽位状态不一致。')
  const [token] = player.tokenSlots.splice(slotIndex, 1)
  player.tokens[tokenType] -= 1
  return token
}

function removeTokenFromPlayerById(state: GameState, playerId: PlayerId, tokenId: string, tokenType: TokenType): Token {
  const player = state.players[playerId]
  ensureTokenSlots(player)
  const slotIndex = player.tokenSlots.findIndex((token) => token.id === tokenId)
  assertRule(slotIndex >= 0, '没有这个 token。')
  const token = player.tokenSlots[slotIndex]
  assertRule(token.type === tokenType, 'token 槽位状态不一致。')
  player.tokenSlots.splice(slotIndex, 1)
  player.tokens[tokenType] -= 1
  return token
}

function ensureTokenSlots(player: GameState['players'][PlayerId]): void {
  const count = tokenCountFromMap(player.tokens)
  if (!player.tokenSlots || player.tokenSlots.length !== count) player.tokenSlots = rebuildTokenSlots(player.tokens)
}

function tokenCountFromMap(counts: Record<TokenType, number>): number {
  return TOKEN_TYPES.reduce((sum, token) => sum + counts[token], 0)
}

function rebuildTokenSlots(counts: Record<TokenType, number>): Token[] {
  const slots: Token[] = []
  for (const type of TOKEN_TYPES) {
    for (let index = 0; index < counts[type]; index += 1) slots.push({ id: `legacy-${type}-${index}`, type })
  }
  return slots
}

function findSourceCard(state: GameState, playerId: PlayerId, source: CardSource): number {
  if (source.type === 'market') {
    const cardId = state.market[source.tier][source.index]
    assertRule(cardId, '市场牌不存在。')
    return cardId
  }
  if (source.type === 'reserve') {
    const cardId = state.players[playerId].reserve[source.index]
    assertRule(cardId, '保留牌不存在。')
    return cardId
  }
  if (source.type === 'pokemonSpecial') {
    assertRule(state.gameType === 'pokemon' && state.pokemonSpecial, '当前没有宝可梦特殊牌。')
    const cardId = source.deck === 'rare' ? state.pokemonSpecial.rareFaceUp : state.pokemonSpecial.legendaryFaceUp
    assertRule(cardId, '特殊牌不存在。')
    return cardId
  }
  const cardId = state.decks[source.tier][0]
  assertRule(cardId, '牌库已空。')
  return cardId
}

function removeSourceCard(state: GameState, playerId: PlayerId, source: CardSource): number {
  if (source.type === 'market') {
    const cardId = findSourceCard(state, playerId, source)
    state.market[source.tier][source.index] = draw(state.decks[source.tier])
    return cardId
  }
  if (source.type === 'reserve') {
    const [cardId] = state.players[playerId].reserve.splice(source.index, 1)
    assertRule(cardId, '保留牌不存在。')
    return cardId
  }
  if (source.type === 'pokemonSpecial') {
    assertRule(state.gameType === 'pokemon' && state.pokemonSpecial, '当前没有宝可梦特殊牌。')
    if (source.deck === 'rare') {
      const cardId = state.pokemonSpecial.rareFaceUp
      assertRule(cardId, '神话牌不存在。')
      state.pokemonSpecial.rareFaceUp = draw(state.pokemonSpecial.rareDeck)
      return cardId
    }
    const cardId = state.pokemonSpecial.legendaryFaceUp
    assertRule(cardId, '传说牌不存在。')
    state.pokemonSpecial.legendaryFaceUp = draw(state.pokemonSpecial.legendaryDeck)
    return cardId
  }
  const cardId = state.decks[source.tier].shift()
  assertRule(cardId, '牌库已空。')
  return cardId
}

function addPurchasedCard(state: GameState, playerId: PlayerId, cardId: number, wildColor?: GemType, baseResume?: TurnResume): TurnResume {
  const player = state.players[playerId]
  const card = getCard(cardId)
  if (card.wild) {
    assertRule(wildColor, '万能牌必须选择一个已有宝石颜色。')
    assertRule(playerStats(state, playerId).bonuses[wildColor] > 0, '万能牌只能放到已有宝石奖励的颜色列。')
  }
  const beforeCrowns = playerStats(state, playerId).crowns
  const purchased: PurchasedCard = { cardId, wildColor }
  player.purchased.push(purchased)
  const resume = baseResume ?? { extraTurn: false }
  resume.extraTurn ||= card.ability === 'extraTurn'
  resolveImmediateAbility(state, playerId, card.ability, resume)
  if (state.gameType === 'classic') {
    if (card.tier !== 'royal') queueClassicNobleChoice(state, playerId, resume)
    return resume
  }
  if (state.gameType === 'pokemon') return resume
  const afterCrowns = playerStats(state, playerId).crowns
  if (beforeCrowns < 3 && afterCrowns >= 3) queueRoyalChoice(state, 'threeCrowns', resume)
  else if (beforeCrowns < 6 && afterCrowns >= 6) queueRoyalChoice(state, 'sixCrowns', resume)
  return resume
}

function resolveImmediateAbility(state: GameState, playerId: PlayerId, ability: CardAbility | undefined, resume: TurnResume): void {
  if (!ability) return
  if (ability === 'takePrivilege') {
    awardPrivilege(state, playerId)
    return
  }
  if (ability.startsWith('take')) {
    const tokenType = ability.replace('take', '').toLowerCase() as GemType
    if (state.board.some((item) => item.token?.type === tokenType)) state.pending = { type: 'takeBoardToken', playerId, tokenType, resume }
    return
  }
  if (ability === 'stealToken' && stealableTokens(state, nextPlayer(state, playerId)).length > 0) state.pending = { type: 'stealToken', playerId, resume }
}

function stealableTokens(state: GameState, playerId: PlayerId): Exclude<TokenType, 'gold'>[] {
  return ([...GEM_TYPES, 'pearl'] as const).filter((token) => state.players[playerId].tokens[token] > 0)
}

function queueRoyalChoice(state: GameState, reason: 'threeCrowns' | 'sixCrowns', resume: TurnResume): void {
  const options = availableRoyalCards(state)
  if (options.length === 0) return
  resume.royalChoice = { reason, options }
}

function canVisitClassicNoble(state: GameState, playerId: PlayerId, cardId: number): boolean {
  const card = getCard(cardId)
  if (card.tier !== 'royal') return false
  const bonuses = playerStats(state, playerId).bonuses
  return GEM_TYPES.every((gem) => bonuses[gem] >= card.cost[gem])
}

function queueClassicNobleChoice(state: GameState, playerId: PlayerId, resume: TurnResume): void {
  const options = availableRoyalCards(state).filter((cardId) => canVisitClassicNoble(state, playerId, cardId))
  if (options.length === 0) return
  resume.royalChoice = { reason: 'noble', options }
}

function takeQueuedRoyalChoice(state: GameState, playerId: PlayerId, resume: TurnResume): boolean {
  if (!resume.royalChoice) return false
  const royalChoice = resume.royalChoice
  resume.royalChoice = undefined
  const available = new Set(availableRoyalCards(state))
  const options = royalChoice.options.filter((id) => available.has(id))
  if (options.length === 0) return false
  state.pending = { type: 'chooseRoyal', playerId, reason: royalChoice.reason, options, resume }
  return true
}

function victoryReason(state: GameState, playerId: PlayerId): VictoryReason | undefined {
  const progress = victoryProgress(state, playerId)
  if (state.gameType === 'classic' || state.gameType === 'pokemon') return progress.wins.points ? 'points' : undefined
  if (progress.wins.points) return 'points'
  if (progress.wins.crowns) return 'crowns'
  if (progress.wins.colorPoints) return 'colorPoints'
  return undefined
}

function victoryScore(state: GameState, playerId: PlayerId, reason: VictoryReason): number {
  const progress = victoryProgress(state, playerId)
  if (reason === 'points') return progress.points
  if (reason === 'crowns') return progress.crowns
  return progress.bestColorPoints
}

function settleFinalRound(state: GameState): boolean {
  const finalRound = state.finalRound
  if (!finalRound) return false
  const scores = playerOrder(state).map((playerId) => ({
    playerId,
    reason: victoryReason(state, playerId),
    score: victoryScore(state, playerId, finalRound.reason),
  })).filter((entry) => entry.reason)
  if (scores.length === 0) return false
  const topScore = Math.max(...scores.map((entry) => entry.score))
  let leaders = scores.filter((entry) => entry.score === topScore)
  if (state.gameType === 'pokemon' && leaders.length > 1) {
    const topEvolved = Math.max(...leaders.map((entry) => state.players[entry.playerId].tucked?.length ?? 0))
    leaders = leaders.filter((entry) => (state.players[entry.playerId].tucked?.length ?? 0) === topEvolved)
  }
  if (leaders.length > 1) {
    state.finalRound = { ...finalRound, targetTurns: finalRound.targetTurns + 1, overtimeRounds: (finalRound.overtimeRounds ?? 0) + 1 }
    state.log.unshift(`多名玩家同为 ${topScore}，加时一回合。`)
    return false
  }
  const [winner] = leaders
  state.winner = { playerId: winner.playerId, reason: winner.reason ?? finalRound.reason }
  state.status = 'finished'
  state.currentPlayer = winner.playerId
  state.log.unshift(`${state.players[winner.playerId].name} 达成胜利条件。`)
  return true
}

function finishMandatoryAction(state: GameState, playerId: PlayerId, resume: TurnResume): void {
  if (state.pending) return
  if (takeQueuedRoyalChoice(state, playerId, resume)) return
  const tokenOverflow = totalTokens(state.players[playerId]) - 10
  if (tokenOverflow > 0) {
    state.pending = { type: 'discard', playerId, count: tokenOverflow, resume }
    return
  }
  if (resume.continueTurn) return
  if (state.gameType === 'pokemon') {
    turnActions(state).mandatoryDone = true
    return
  }
  advanceTurnAfterMandatoryAction(state, playerId, resume)
}

function advanceTurnAfterMandatoryAction(state: GameState, playerId: PlayerId, resume: TurnResume): void {
  const player = state.players[playerId]
  player.turnsTaken = (player.turnsTaken ?? 0) + 1
  const reason = victoryReason(state, playerId)
  const wasFinalRoundActive = Boolean(state.finalRound)
  if (!state.finalRound && reason) {
    state.finalRound = { triggerPlayerId: playerId, targetTurns: player.turnsTaken, reason }
    state.log.unshift(`${player.name} 达成胜利条件，触发最终圈。`)
  }
  resetTurnActions(state)
  if (state.gameType === 'duel' && state.finalRound) {
    const roundEndsHere = nextPlayer(state, playerId) === state.firstPlayer
    if ((wasFinalRoundActive || reason) && roundEndsHere && settleFinalRound(state)) return
    const next = nextPlayer(state, playerId)
    state.currentPlayer = next
    if (next === state.firstPlayer) state.turnNumber += 1
    return
  }
  if (state.finalRound && playerOrder(state).every((id) => (state.players[id].turnsTaken ?? 0) >= state.finalRound!.targetTurns) && settleFinalRound(state)) return
  if (!resume.extraTurn) {
    const next = nextPlayer(state, playerId)
    state.currentPlayer = next
    if (next === state.firstPlayer) state.turnNumber += 1
  }
}

function takeTokensAction(state: GameState, action: Extract<GameAction, { type: 'takeTokens' }>): void {
  requireTurn(state, action.playerId)
  assertRule(action.cellIds.length >= 1 && action.cellIds.length <= 3, '必须拿 1 到 3 个 token。')
  const cells = action.cellIds.map((id) => getCell(state, id))
  assertRule(areAdjacentLine(cells), '只能拿连续相邻的一条线。')
  assertRule(cells.every((cell) => cell.token && cell.token.type !== 'gold'), '普通拿取不能拿黄金 token。')
  const tokens = cells.map((cell) => takeTokenFromBoard(state, cell, action.playerId))
  const sameThree = tokens.length === 3 && tokens.every((token) => token.type === tokens[0].type)
  const twoPearls = tokens.filter((token) => token.type === 'pearl').length === 2
  if (sameThree || twoPearls) awardPrivilege(state, nextPlayer(state, action.playerId))
  state.log.unshift(`${state.players[action.playerId].name} 拿取了 ${tokens.map((token) => TOKEN_LABELS[token.type]).join('、')}。`)
  finishMandatoryAction(state, action.playerId, { extraTurn: false })
}

function takeClassicBankTokensAction(state: GameState, action: Extract<GameAction, { type: 'takeClassicBankTokens' }>): void {
  requireTurn(state, action.playerId)
  assertRule(state.gameType === 'classic' || state.gameType === 'pokemon', '只有璀璨宝石可以从银行拿取 token。')
  assertRule(!turnActions(state).mandatoryDone, '本回合既定行动已经完成。')
  assertRule(action.tokenTypes.length === 2 || action.tokenTypes.length === 3, '必须拿 2 个相同或 3 个不同的 token。')
  assertRule(action.tokenTypes.every((tokenType) => GEM_TYPES.includes(tokenType)), '普通拿取不能拿黄金 token。')
  const uniqueTypes = [...new Set(action.tokenTypes)]
  if (action.tokenTypes.length === 2) {
    assertRule(uniqueTypes.length === 1, '拿 2 个 token 时必须颜色相同。')
    assertRule(bankTokenCount(state, action.tokenTypes[0]) >= 4, '银行少于 4 枚时不能拿 2 个相同颜色。')
  } else {
    assertRule(uniqueTypes.length === 3, '拿 3 个 token 时必须颜色互不相同。')
  }
  const beforeCounts = new Map(uniqueTypes.map((tokenType) => [tokenType, bankTokenCount(state, tokenType)]))
  for (const tokenType of uniqueTypes) {
    const requested = action.tokenTypes.filter((item) => item === tokenType).length
    assertRule((beforeCounts.get(tokenType) ?? 0) >= requested, '银行 token 不足。')
  }
  const tokens = action.tokenTypes.map((tokenType) => takeTokenFromClassicBank(state, action.playerId, tokenType))
  state.log.unshift(`${state.players[action.playerId].name} 拿取了 ${tokens.map((token) => TOKEN_LABELS[token.type]).join('、')}。`)
  finishMandatoryAction(state, action.playerId, { extraTurn: false })
}

function reserveCardAction(state: GameState, action: Extract<GameAction, { type: 'reserveCard' }>): void {
  requireTurn(state, action.playerId)
  assertRule(!turnActions(state).mandatoryDone, '本回合既定行动已经完成。')
  const player = state.players[action.playerId]
  assertRule(player.reserve.length < 3, '最多只能保留 3 张牌。')
  assertRule(!(state.gameType === 'pokemon' && action.source.type === 'pokemonSpecial'), '神话和传说宝可梦不能保留。')
  const cardId = removeSourceCard(state, action.playerId, action.source)
  takeGoldForReserve(state, action.playerId, action.goldCellId)
  player.reserve.push(cardId)
  state.log.unshift(`${player.name} 保留了 1 张牌并拿取黄金。`)
  finishMandatoryAction(state, action.playerId, { extraTurn: false })
}

function purchaseCardAction(state: GameState, action: Extract<GameAction, { type: 'purchaseCard' }>): void {
  requireTurn(state, action.playerId)
  assertRule(!turnActions(state).mandatoryDone, '本回合既定行动已经完成。')
  const player = state.players[action.playerId]
  const cardId = findSourceCard(state, action.playerId, action.source)
  const payment = computePayment(state, action.playerId, cardId)
  assertRule(payment, 'token 不足，无法购买这张牌。')
  for (const token of TOKEN_TYPES) {
    for (let paid = 0; paid < (payment[token] ?? 0); paid += 1) state.bag.push(removeTokenFromPlayer(state, action.playerId, token))
  }
  const removedCardId = removeSourceCard(state, action.playerId, action.source)
  const resume = addPurchasedCard(state, action.playerId, removedCardId, action.wildColor)
  state.log.unshift(`${player.name} 购买了 ${getCard(removedCardId).points} 分牌。`)
  finishMandatoryAction(state, action.playerId, resume)
}

function pokemonEvolutionBaseIndex(state: GameState, playerId: PlayerId, targetCardId: number): number {
  if (state.gameType !== 'pokemon') return -1
  const target = getCard(targetCardId)
  if (target.deckKind !== 'common' || !target.evolvesFrom) return -1
  const player = state.players[playerId]
  const bonuses = playerStats(state, playerId).bonuses
  return player.purchased.findIndex((purchased) => {
    const base = getCard(purchased.cardId)
    if (base.name !== target.evolvesFrom || !base.evolutionCost) return false
    return GEM_TYPES.every((gem) => bonuses[gem] >= base.evolutionCost![gem])
  })
}

function canEvolvePokemon(state: GameState, playerId: PlayerId, targetCardId: number): boolean {
  return pokemonEvolutionBaseIndex(state, playerId, targetCardId) >= 0
}

function evolvePokemonAction(state: GameState, action: Extract<GameAction, { type: 'evolvePokemon' }>): void {
  requireTurn(state, action.playerId)
  assertRule(state.gameType === 'pokemon', '当前玩法没有进化机制。')
  assertRule(turnActions(state).mandatoryDone, '完成本回合既定行动后才能进化。')
  assertRule(!turnActions(state).evolved, '每回合只能进化 1 张宝可梦。')
  assertRule(action.source.type !== 'deck' && action.source.type !== 'pokemonSpecial', '只能进化场上或预留区的普通宝可梦。')
  const targetCardId = findSourceCard(state, action.playerId, action.source)
  assertRule(canEvolvePokemon(state, action.playerId, targetCardId), '不满足进化条件。')
  const target = getCard(targetCardId)
  const player = state.players[action.playerId]
  const baseIndex = pokemonEvolutionBaseIndex(state, action.playerId, targetCardId)
  assertRule(baseIndex >= 0, '没有可进化的前置宝可梦。')
  const [base] = player.purchased.splice(baseIndex, 1)
  assertRule(base, '没有可进化的前置宝可梦。')
  player.tucked ??= []
  player.tucked.push(base.cardId)
  state.pokemonSpecial?.evolutionPile.push(base.cardId)
  const removedCardId = removeSourceCard(state, action.playerId, action.source)
  player.purchased.push({ cardId: removedCardId })
  turnActions(state).evolved = true
  state.log.unshift(`${player.name} 将 ${getCard(base.cardId).name ?? '宝可梦'} 进化为 ${target.name ?? '宝可梦'}。`)
}

function endTurnAction(state: GameState, action: Extract<GameAction, { type: 'endTurn' }>): void {
  requireTurn(state, action.playerId)
  assertRule(state.gameType === 'pokemon', '只有宝可梦版需要主动结束回合。')
  assertRule(turnActions(state).mandatoryDone, '本回合既定行动还没有完成。')
  advanceTurnAfterMandatoryAction(state, action.playerId, { extraTurn: false })
}

export function applyAction(input: GameState, action: GameAction): GameState {
  const state = cloneState(input)
  if (action.type === 'startGame') {
    startGameIfReady(state)
    return state
  }
  if (action.type === 'usePrivilege') {
    requireTurn(state, action.playerId)
    const player = state.players[action.playerId]
    const cell = getCell(state, action.cellId)
    assertRule(player.privileges > 0, '没有可用特权卷轴。')
    assertRule(!turnActions(state).replenished, '补棋盘后不能再使用特权卷轴。')
    assertRule(cell.token && cell.token.type !== 'gold', '特权不能拿黄金 token。')
    player.privileges -= 1
    state.availablePrivileges += 1
    const token = takeTokenFromBoard(state, cell, action.playerId)
    turnActions(state).usedPrivilege = true
    state.log.unshift(`${player.name} 使用特权拿取 ${TOKEN_LABELS[token.type]}。`)
    const tokenOverflow = totalTokens(player) - 10
    if (tokenOverflow > 0) state.pending = { type: 'discard', playerId: action.playerId, count: tokenOverflow, resume: { extraTurn: false, continueTurn: true } }
    return state
  }
  if (action.type === 'replenishBoard') {
    requireTurn(state, action.playerId)
    assertRule(!turnActions(state).replenished, '本回合已经补充过棋盘。')
    assertRule(state.board.some((cell) => !cell.token), '棋盘没有空位需要补充。')
    replenishBoard(state, true)
    turnActions(state).replenished = true
    state.log.unshift(`${state.players[action.playerId].name} 补充了棋盘。`)
    return state
  }
  if (action.type === 'reorderTokenSlots') {
    assertRule(!state.winner, '游戏已经结束。')
    reorderTokenSlots(state, action.playerId, action.tokenIds)
    return state
  }
  if (action.type === 'takeTokens') takeTokensAction(state, action)
  else if (action.type === 'takeClassicBankTokens') takeClassicBankTokensAction(state, action)
  else if (action.type === 'reserveCard') reserveCardAction(state, action)
  else if (action.type === 'purchaseCard') purchaseCardAction(state, action)
  else if (action.type === 'evolvePokemon') evolvePokemonAction(state, action)
  else if (action.type === 'endTurn') endTurnAction(state, action)
  else if (action.type === 'chooseRoyal') {
    const pending = state.pending
    assertRule(pending?.type === 'chooseRoyal' && pending.playerId === action.playerId, '当前不能选择皇家牌。')
    assertRule(pending.options.includes(action.cardId), '皇家牌不可用。')
    assertRule(!royalCardOwner(state, action.cardId), '这张皇家牌已经被拿取。')
    state.pending = undefined
    const resume = addPurchasedCard(state, action.playerId, action.cardId, undefined, pending.resume)
    finishMandatoryAction(state, action.playerId, resume)
  } else if (action.type === 'takeBoardToken') {
    const pending = state.pending
    assertRule(pending?.type === 'takeBoardToken' && pending.playerId === action.playerId, '当前不能拿取技能 token。')
    const cell = getCell(state, action.cellId)
    assertRule(cell.token?.type === pending.tokenType, '只能拿取技能指定颜色的 token。')
    takeTokenFromBoard(state, cell, action.playerId)
    state.pending = undefined
    finishMandatoryAction(state, action.playerId, pending.resume)
  } else if (action.type === 'stealToken') {
    const pending = state.pending
    assertRule(pending?.type === 'stealToken' && pending.playerId === action.playerId, '当前不能拿取对手 token。')
    const opponent = state.players[nextPlayer(state, action.playerId)]
    assertRule(opponent.tokens[action.tokenType] > 0, '对手没有这个 token。')
    const token = action.tokenId
      ? removeTokenFromPlayerById(state, opponent.id, action.tokenId, action.tokenType)
      : removeTokenFromPlayer(state, opponent.id, action.tokenType)
    addTokenToPlayer(state, action.playerId, token)
    state.pending = undefined
    finishMandatoryAction(state, action.playerId, pending.resume)
  } else if (action.type === 'discardToken') {
    const pending = state.pending
    assertRule(pending?.type === 'discard' && pending.playerId === action.playerId, '当前不需要弃 token。')
    const token = action.tokenId
      ? removeTokenFromPlayerById(state, action.playerId, action.tokenId, action.tokenType)
      : removeTokenFromPlayer(state, action.playerId, action.tokenType)
    state.bag.push(token)
    const nextCount = pending.count - 1
    state.pending = nextCount > 0 ? { ...pending, count: nextCount } : undefined
    if (!state.pending) finishMandatoryAction(state, action.playerId, pending.resume)
  }
  return state
}
