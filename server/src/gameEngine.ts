import {
  ALL_COLORS,
  BASIC_COLORS,
  BasicColor,
  Card,
  DEVELOPMENT_CARDS,
  GemColor,
  Gems,
  Noble,
  NOBLES,
  emptyCosts,
  emptyGems,
} from "./gameData";

export type HiddenCard = { id: string; hidden: true; tier?: 1 | 2 | 3 };

export interface PlayerState {
  id: string;
  username: string;
  avatarId: number;
  isHost: boolean;
  gems: Gems;
  bonuses: Record<BasicColor, number>;
  purchasedCards: Card[];
  reservedCards: Card[];
  nobles: Noble[];
  prestige: number;
  connected?: boolean;
  socketId?: string;
  turnsTaken?: number;
}

interface TierInternal {
  faceUp: (Card | null)[];
  deck: Card[];
}

export interface PublicTier {
  faceUp: (Card | null)[];
  deckCount: number;
}

export interface GameState {
  roomId: string;
  phase: "waiting" | "playing" | "finalRound" | "ended";
  currentPlayerId: string;
  turnOrder: string[];
  finalRoundStarterId: string | null;
  bank: Gems;
  tier1: PublicTier;
  tier2: PublicTier;
  tier3: PublicTier;
  nobles: Noble[];
  players: PlayerState[];
  myPlayerId: string;
  winner: PlayerState | null;
  lastAction: string | null;
  pendingDiscardPlayerId?: string | null;
  finalRoundTargetTurns?: number | null;
  gameOverReason?: string | null;
  _decks?: {
    tier1: TierInternal;
    tier2: TierInternal;
    tier3: TierInternal;
  };
}

export interface GameRoom {
  roomId: string;
  players: PlayerState[];
  hostId: string;
  gameState: GameState;
  createdAt: number;
  lastActivity: number;
}

type Validation = { valid: boolean; error?: string };

type CardLocation =
  | { type: "market"; card: Card; tier: 1 | 2 | 3; index: number }
  | { type: "reserved"; card: Card; reservedIndex: number };

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sumGems(gems: Gems): number {
  return ALL_COLORS.reduce((total, color) => total + gems[color], 0);
}

function publicTier(tier: TierInternal): PublicTier {
  return { faceUp: tier.faceUp, deckCount: tier.deck.length };
}

function syncPublicTiers(state: GameState): void {
  if (!state._decks) return;
  state.tier1 = publicTier(state._decks.tier1);
  state.tier2 = publicTier(state._decks.tier2);
  state.tier3 = publicTier(state._decks.tier3);
}

function getTierInternal(state: GameState, tier: 1 | 2 | 3): TierInternal {
  if (!state._decks) {
    throw new Error("游戏牌堆尚未初始化");
  }
  return state._decks[`tier${tier}`];
}

function drawToMarket(state: GameState, tier: 1 | 2 | 3, slotIndex: number): void {
  const tierState = getTierInternal(state, tier);
  tierState.faceUp[slotIndex] = tierState.deck.shift() ?? null;
  syncPublicTiers(state);
}

function getPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((player) => player.id === playerId);
}

function basicColorFromCardColor(color: Card["color"]): BasicColor {
  return color;
}

function recalculatePrestige(player: PlayerState): void {
  player.prestige =
    player.purchasedCards.reduce((total, card) => total + card.prestige, 0) +
    player.nobles.reduce((total, noble) => total + noble.prestige, 0);
}

function ensureTurnReady(state: GameState, playerId: string): Validation {
  if (state.phase !== "playing" && state.phase !== "finalRound") {
    return { valid: false, error: "游戏当前不在可行动阶段" };
  }
  if (state.currentPlayerId !== playerId) {
    return { valid: false, error: "还没有轮到你行动" };
  }
  if (state.pendingDiscardPlayerId) {
    return { valid: false, error: "当前必须先完成弃置代币" };
  }
  if (!getPlayer(state, playerId)) {
    return { valid: false, error: "玩家不存在" };
  }
  return { valid: true };
}

function isBasicColor(color: string): color is BasicColor {
  return (BASIC_COLORS as readonly string[]).includes(color);
}

function findMarketCard(state: GameState, cardId: string): Extract<CardLocation, { type: "market" }> | null {
  for (const tier of [1, 2, 3] as const) {
    const tierState = getTierInternal(state, tier);
    const index = tierState.faceUp.findIndex((card) => card?.id === cardId);
    if (index >= 0) {
      const card = tierState.faceUp[index];
      if (card) return { type: "market", card, tier, index };
    }
  }
  return null;
}

function findBuyableCard(state: GameState, player: PlayerState, cardId: string): CardLocation | null {
  const market = findMarketCard(state, cardId);
  if (market) return market;
  const reservedIndex = player.reservedCards.findIndex((card) => card.id === cardId);
  if (reservedIndex >= 0) {
    return { type: "reserved", card: player.reservedCards[reservedIndex], reservedIndex };
  }
  return null;
}

function normalizeGoldSubs(goldSubs: Partial<Record<string, number>> | undefined): Record<BasicColor, number> {
  const normalized = emptyCosts();
  if (!goldSubs) return normalized;
  for (const [key, value] of Object.entries(goldSubs)) {
    if (isBasicColor(key)) {
      normalized[key] = Number.isInteger(value) && value > 0 ? value : 0;
    }
  }
  return normalized;
}

function calculatePayment(player: PlayerState, card: Card, goldSubsInput?: Partial<Record<string, number>>) {
  const goldSubs = normalizeGoldSubs(goldSubsInput);
  const coloredPayment = emptyCosts();
  let goldTotal = 0;
  for (const color of BASIC_COLORS) {
    const needAfterBonus = Math.max(0, card.cost[color] - player.bonuses[color]);
    const gold = goldSubs[color];
    coloredPayment[color] = Math.max(0, needAfterBonus - gold);
    goldTotal += gold;
  }
  return { coloredPayment, goldSubs, goldTotal };
}

function finishActionOrRequireDiscard(state: GameState, playerId: string, actionText: string): GameState {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  if (sumGems(player.gems) > 10) {
    state.pendingDiscardPlayerId = playerId;
    state.lastAction = `${actionText}，需要弃置 ${sumGems(player.gems) - 10} 个代币`;
    syncPublicTiers(state);
    return state;
  }
  const noble = checkNobleVisit(state, playerId);
  const suffix = noble ? `，贵族 ${noble.id} 来访` : "";
  state.lastAction = `${actionText}${suffix}`;
  return advanceTurn(state);
}

function settleGame(state: GameState): void {
  const finalScores = [...state.players].sort((a, b) => {
    if (b.prestige !== a.prestige) return b.prestige - a.prestige;
    if (a.purchasedCards.length !== b.purchasedCards.length) return a.purchasedCards.length - b.purchasedCards.length;
    return state.turnOrder.indexOf(a.id) - state.turnOrder.indexOf(b.id);
  });
  state.winner = finalScores[0] ?? null;
  state.phase = "ended";
  state.currentPlayerId = "";
  state.gameOverReason = state.winner
    ? `${state.winner.username} 以 ${state.winner.prestige} 点声望获胜；若声望相同，则购买发展卡更少者胜出。`
    : "游戏结束。";
  state.lastAction = state.gameOverReason;
}

export function createGame(players: PlayerState[], playerCount: number): GameRoom {
  const roomId = players[0]?.id ? "pending" : "pending";
  const tierDecks = {
    tier1: shuffle(DEVELOPMENT_CARDS.filter((card) => card.tier === 1)),
    tier2: shuffle(DEVELOPMENT_CARDS.filter((card) => card.tier === 2)),
    tier3: shuffle(DEVELOPMENT_CARDS.filter((card) => card.tier === 3)),
  };
  const internalDecks = {
    tier1: { faceUp: tierDecks.tier1.splice(0, 4), deck: tierDecks.tier1 },
    tier2: { faceUp: tierDecks.tier2.splice(0, 4), deck: tierDecks.tier2 },
    tier3: { faceUp: tierDecks.tier3.splice(0, 4), deck: tierDecks.tier3 },
  };
  const gemCount = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  const initializedPlayers = players.map((player) => ({
    ...player,
    gems: emptyGems(),
    bonuses: emptyCosts(),
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
    prestige: 0,
    connected: player.connected ?? true,
    turnsTaken: 0,
  }));
  const state: GameState = {
    roomId,
    phase: "playing",
    currentPlayerId: initializedPlayers[0]?.id ?? "",
    turnOrder: initializedPlayers.map((player) => player.id),
    finalRoundStarterId: null,
    bank: { white: gemCount, blue: gemCount, green: gemCount, red: gemCount, brown: gemCount, gold: 5 },
    tier1: publicTier(internalDecks.tier1),
    tier2: publicTier(internalDecks.tier2),
    tier3: publicTier(internalDecks.tier3),
    nobles: shuffle(NOBLES).slice(0, playerCount + 1),
    players: initializedPlayers,
    myPlayerId: "",
    winner: null,
    lastAction: "游戏开始，第一位玩家开始行动",
    pendingDiscardPlayerId: null,
    finalRoundTargetTurns: null,
    gameOverReason: null,
    _decks: internalDecks,
  };
  return {
    roomId,
    players: initializedPlayers,
    hostId: initializedPlayers.find((player) => player.isHost)?.id ?? initializedPlayers[0]?.id ?? "",
    gameState: state,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
}

export function validateTakeGems(state: GameState, playerId: string, colors: string[]): Validation {
  const turn = ensureTurnReady(state, playerId);
  if (!turn.valid) return turn;
  if (!Array.isArray(colors)) return { valid: false, error: "宝石选择无效" };
  if (colors.some((color) => color === "gold")) return { valid: false, error: "不能直接拿取黄金代币" };
  if (colors.some((color) => !isBasicColor(color))) return { valid: false, error: "包含未知宝石颜色" };
  if (colors.length === 3) {
    if (new Set(colors).size !== 3) return { valid: false, error: "取三颗宝石时必须选择三种不同颜色" };
    for (const color of colors as BasicColor[]) {
      if (state.bank[color] <= 0) return { valid: false, error: `${color} 宝石银行库存不足` };
    }
    return { valid: true };
  }
  if (colors.length === 2) {
    if (colors[0] !== colors[1]) return { valid: false, error: "取两颗宝石时必须选择同一种颜色" };
    const color = colors[0] as BasicColor;
    if (state.bank[color] < 4) return { valid: false, error: "取两颗相同宝石要求银行该颜色至少剩余 4 个" };
    return { valid: true };
  }
  return { valid: false, error: "每回合只能取三种不同宝石或两颗相同宝石" };
}

export function applyTakeGems(state: GameState, playerId: string, colors: string[]): GameState {
  const validation = validateTakeGems(state, playerId, colors);
  if (!validation.valid) throw new Error(validation.error);
  const next = state;
  const player = getPlayer(next, playerId)!;
  for (const color of colors as BasicColor[]) {
    next.bank[color] -= 1;
    player.gems[color] += 1;
  }
  return finishActionOrRequireDiscard(next, playerId, `${player.username} 拿取了 ${colors.length} 个宝石`);
}

export function validateReserve(
  state: GameState,
  playerId: string,
  cardId?: string | null,
  fromDeck?: number | null,
): Validation {
  const turn = ensureTurnReady(state, playerId);
  if (!turn.valid) return turn;
  const player = getPlayer(state, playerId)!;
  if (player.reservedCards.length >= 3) return { valid: false, error: "每位玩家最多只能保留 3 张发展卡" };
  const hasCard = Boolean(cardId);
  const hasDeck = fromDeck !== undefined && fromDeck !== null;
  if (hasCard === hasDeck) return { valid: false, error: "请选择一张场上卡，或选择一个等级牌堆保留" };
  if (hasCard) {
    return findMarketCard(state, cardId!) ? { valid: true } : { valid: false, error: "场上没有这张发展卡" };
  }
  if (![1, 2, 3].includes(Number(fromDeck))) return { valid: false, error: "牌堆等级无效" };
  const tier = getTierInternal(state, Number(fromDeck) as 1 | 2 | 3);
  if (tier.deck.length <= 0) return { valid: false, error: "该等级牌堆已经没有剩余卡牌" };
  return { valid: true };
}

export function applyReserve(
  state: GameState,
  playerId: string,
  cardId?: string | null,
  fromDeck?: number | null,
): GameState {
  const validation = validateReserve(state, playerId, cardId, fromDeck);
  if (!validation.valid) throw new Error(validation.error);
  const player = getPlayer(state, playerId)!;
  let card: Card;
  if (cardId) {
    const location = findMarketCard(state, cardId)!;
    card = location.card;
    location.type;
    getTierInternal(state, location.tier).faceUp[location.index] = null;
    drawToMarket(state, location.tier, location.index);
  } else {
    const tier = getTierInternal(state, Number(fromDeck) as 1 | 2 | 3);
    card = tier.deck.shift()!;
    syncPublicTiers(state);
  }
  player.reservedCards.push(card);
  let goldText = "";
  if (state.bank.gold > 0) {
    state.bank.gold -= 1;
    player.gems.gold += 1;
    goldText = "并获得 1 枚黄金";
  }
  return finishActionOrRequireDiscard(state, playerId, `${player.username} 保留了一张发展卡${goldText}`);
}

export function validateBuy(
  state: GameState,
  playerId: string,
  cardId: string,
  goldSubs?: Partial<Record<string, number>>,
): Validation {
  const turn = ensureTurnReady(state, playerId);
  if (!turn.valid) return turn;
  const player = getPlayer(state, playerId)!;
  const location = findBuyableCard(state, player, cardId);
  if (!location) return { valid: false, error: "找不到可购买的发展卡" };
  if (goldSubs) {
    for (const [key, value] of Object.entries(goldSubs)) {
      if (!isBasicColor(key)) return { valid: false, error: "黄金替代颜色无效" };
      if (!Number.isInteger(value) || value < 0) return { valid: false, error: "黄金替代数量必须是非负整数" };
    }
  }
  const { coloredPayment, goldSubs: normalized, goldTotal } = calculatePayment(player, location.card, goldSubs);
  if (goldTotal > player.gems.gold) return { valid: false, error: "黄金数量不足" };
  for (const color of BASIC_COLORS) {
    const needAfterBonus = Math.max(0, location.card.cost[color] - player.bonuses[color]);
    if (normalized[color] > needAfterBonus) return { valid: false, error: "不能使用超过费用需求的黄金" };
    if (coloredPayment[color] > player.gems[color]) return { valid: false, error: `${color} 宝石不足` };
    if (coloredPayment[color] + normalized[color] !== needAfterBonus) {
      return { valid: false, error: "支付方案必须精确覆盖费用，不能少付或多付" };
    }
  }
  return { valid: true };
}

export function applyBuy(
  state: GameState,
  playerId: string,
  cardId: string,
  goldSubs?: Partial<Record<string, number>>,
): GameState {
  const validation = validateBuy(state, playerId, cardId, goldSubs);
  if (!validation.valid) throw new Error(validation.error);
  const player = getPlayer(state, playerId)!;
  const location = findBuyableCard(state, player, cardId)!;
  const { coloredPayment, goldSubs: normalized, goldTotal } = calculatePayment(player, location.card, goldSubs);
  for (const color of BASIC_COLORS) {
    player.gems[color] -= coloredPayment[color];
    state.bank[color] += coloredPayment[color];
  }
  player.gems.gold -= goldTotal;
  state.bank.gold += goldTotal;
  if (location.type === "market") {
    getTierInternal(state, location.tier).faceUp[location.index] = null;
    drawToMarket(state, location.tier, location.index);
  } else {
    player.reservedCards.splice(location.reservedIndex, 1);
  }
  player.purchasedCards.push(location.card);
  player.bonuses[basicColorFromCardColor(location.card.color)] += 1;
  recalculatePrestige(player);
  const paidText = BASIC_COLORS.map((color) => {
    const gold = normalized[color] ? `+${normalized[color]}金` : "";
    return coloredPayment[color] || gold ? `${color}${coloredPayment[color]}${gold}` : "";
  })
    .filter(Boolean)
    .join("、");
  return finishActionOrRequireDiscard(state, playerId, `${player.username} 购买了 ${location.card.id}${paidText ? `（支付 ${paidText}）` : ""}`);
}

export function applyDiscardTokens(state: GameState, playerId: string, tokens: Partial<Record<GemColor, number>>): GameState {
  if (state.pendingDiscardPlayerId !== playerId) throw new Error("当前不需要你弃置代币");
  const player = getPlayer(state, playerId);
  if (!player) throw new Error("玩家不存在");
  const before = sumGems(player.gems);
  const normalized: Gems = emptyGems();
  for (const color of ALL_COLORS) {
    const value = tokens[color] ?? 0;
    if (!Number.isInteger(value) || value < 0) throw new Error("弃置数量必须是非负整数");
    if (value > player.gems[color]) throw new Error("弃置数量不能超过持有数量");
    normalized[color] = value;
  }
  const discardTotal = sumGems(normalized);
  if (before - discardTotal > 10) throw new Error("弃置后仍超过 10 个代币");
  if (discardTotal < before - 10) throw new Error("弃置数量不足");
  for (const color of ALL_COLORS) {
    player.gems[color] -= normalized[color];
    state.bank[color] += normalized[color];
  }
  state.pendingDiscardPlayerId = null;
  const noble = checkNobleVisit(state, playerId);
  state.lastAction = `${player.username} 弃置了 ${discardTotal} 个代币${noble ? `，贵族 ${noble.id} 来访` : ""}`;
  return advanceTurn(state);
}

export function checkNobleVisit(state: GameState, playerId: string): Noble | null {
  const player = getPlayer(state, playerId);
  if (!player) return null;
  const index = state.nobles.findIndex((noble) => BASIC_COLORS.every((color) => player.bonuses[color] >= noble.req[color]));
  if (index < 0) return null;
  const [noble] = state.nobles.splice(index, 1);
  player.nobles.push(noble);
  recalculatePrestige(player);
  return noble;
}

export function checkWinCondition(state: GameState): boolean {
  const current = getPlayer(state, state.currentPlayerId);
  if (!current) return false;
  if (state.phase === "playing" && current.prestige >= 15) {
    state.phase = "finalRound";
    state.finalRoundStarterId = current.id;
    state.finalRoundTargetTurns = (current.turnsTaken ?? 0) + 1;
    return true;
  }
  return state.phase === "finalRound";
}

export function advanceTurn(state: GameState): GameState {
  const current = getPlayer(state, state.currentPlayerId);
  if (!current) return state;
  current.turnsTaken = (current.turnsTaken ?? 0) + 1;
  const reached = state.phase === "playing" && current.prestige >= 15;
  if (reached) {
    state.phase = "finalRound";
    state.finalRoundStarterId = current.id;
    state.finalRoundTargetTurns = current.turnsTaken;
    state.lastAction = `${state.lastAction}；${current.username} 达到 15 点声望，触发最终轮`;
  }
  if (
    state.phase === "finalRound" &&
    state.finalRoundTargetTurns !== null &&
    state.finalRoundTargetTurns !== undefined &&
    state.players.every((player) => (player.turnsTaken ?? 0) >= state.finalRoundTargetTurns!)
  ) {
    settleGame(state);
    syncPublicTiers(state);
    return state;
  }
  const currentIndex = state.turnOrder.indexOf(current.id);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  state.currentPlayerId = state.turnOrder[nextIndex];
  syncPublicTiers(state);
  return state;
}

export function getPlayerView(state: GameState, playerId: string): GameState {
  syncPublicTiers(state);
  const view = cloneState(state);
  delete view._decks;
  view.myPlayerId = playerId;
  view.players = view.players.map((player) => {
    const cleaned = { ...player };
    delete cleaned.socketId;
    if (player.id !== playerId) {
      cleaned.reservedCards = player.reservedCards.map((card) => ({ id: `hidden-${card.id}`, hidden: true, tier: card.tier }) as unknown as Card);
    }
    return cleaned;
  });
  return view;
}

export { BASIC_COLORS, ALL_COLORS, emptyGems, emptyCosts };
