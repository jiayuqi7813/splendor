import {
  ALL_COLORS,
  BASIC_COLORS,
  BasicColor,
  CardDeckKind,
  Card,
  DEVELOPMENT_CARDS,
  GameVariant,
  GemColor,
  Gems,
  Noble,
  NOBLES,
  POKEMON_DEVELOPMENT_CARDS,
  POKEMON_LEGENDARY_CARDS,
  POKEMON_RARE_CARDS,
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
  tuckedCards: Card[];
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

export interface ActionLogEntry {
  id: string;
  text: string;
  at: number;
  playerId?: string | null;
}

export interface GameState {
  roomId: string;
  variant: GameVariant;
  phase: "waiting" | "playing" | "finalRound" | "ended";
  currentPlayerId: string;
  turnOrder: string[];
  finalRoundStarterId: string | null;
  bank: Gems;
  tier1: PublicTier;
  tier2: PublicTier;
  tier3: PublicTier;
  rare?: PublicTier;
  legendary?: PublicTier;
  nobles: Noble[];
  players: PlayerState[];
  myPlayerId: string;
  winner: PlayerState | null;
  lastAction: string | null;
  actionLog?: ActionLogEntry[];
  pendingDiscardPlayerId?: string | null;
  pendingEvolutionPlayerId?: string | null;
  finalRoundTargetTurns?: number | null;
  gameOverReason?: string | null;
  _decks?: {
    tier1: TierInternal;
    tier2: TierInternal;
    tier3: TierInternal;
    rare?: TierInternal;
    legendary?: TierInternal;
  };
}

export interface GameRoom {
  roomId: string;
  variant: GameVariant;
  players: PlayerState[];
  hostId: string;
  gameState: GameState | null;
  reconnectTokens?: Record<string, string>;
  createdAt: number;
  lastActivity: number;
}

type Validation = { valid: boolean; error?: string };
type DeckKey = "tier1" | "tier2" | "tier3" | "rare" | "legendary";
const ACTION_LOG_LIMIT = 36;

type CardLocation =
  | { type: "market"; card: Card; deckKey: DeckKey; tier?: 1 | 2 | 3; index: number }
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
  if (state._decks.rare) state.rare = publicTier(state._decks.rare);
  if (state._decks.legendary) state.legendary = publicTier(state._decks.legendary);
}

function recordAction(state: GameState, text: string, playerId?: string | null): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  state.lastAction = trimmed;
  const entry: ActionLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    at: Date.now(),
    playerId: playerId ?? null,
  };
  state.actionLog = [...(state.actionLog ?? []), entry].slice(-ACTION_LOG_LIMIT);
}

function getTierInternal(state: GameState, tier: 1 | 2 | 3): TierInternal {
  if (!state._decks) {
    throw new Error("游戏牌堆尚未初始化");
  }
  return state._decks[`tier${tier}`];
}

function getDeckInternal(state: GameState, deckKey: DeckKey): TierInternal {
  if (!state._decks?.[deckKey]) {
    throw new Error("游戏牌堆尚未初始化");
  }
  return state._decks[deckKey]!;
}

function drawToMarket(state: GameState, deckKey: DeckKey, slotIndex: number): void {
  const tierState = getDeckInternal(state, deckKey);
  tierState.faceUp[slotIndex] = tierState.deck.shift() ?? null;
  syncPublicTiers(state);
}

function getPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((player) => player.id === playerId);
}

function basicColorFromCardColor(color: Card["color"]): BasicColor {
  return color;
}

function cardBonusColors(card: Card): BasicColor[] {
  return card.bonusColors?.length ? card.bonusColors : [basicColorFromCardColor(card.color)];
}

function recalculatePrestige(player: PlayerState): void {
  player.prestige =
    player.purchasedCards.reduce((total, card) => total + card.prestige, 0) +
    player.nobles.reduce((total, noble) => total + noble.prestige, 0);
}

function recalculatePlayerCards(player: PlayerState): void {
  player.bonuses = emptyCosts();
  for (const card of player.purchasedCards) {
    for (const color of cardBonusColors(card)) {
      player.bonuses[color] += 1;
    }
  }
  recalculatePrestige(player);
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
  if (state.pendingEvolutionPlayerId) {
    return { valid: false, error: "当前必须先完成或跳过进化" };
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
  const marketDecks: { deckKey: DeckKey; tier?: 1 | 2 | 3 }[] = [
    { deckKey: "tier1", tier: 1 },
    { deckKey: "tier2", tier: 2 },
    { deckKey: "tier3", tier: 3 },
  ];
  if (state.variant === "pokemon") {
    marketDecks.push({ deckKey: "rare" }, { deckKey: "legendary" });
  }
  for (const entry of marketDecks) {
    const tierState = getDeckInternal(state, entry.deckKey);
    const index = tierState.faceUp.findIndex((card) => card?.id === cardId);
    if (index >= 0) {
      const card = tierState.faceUp[index];
      if (card) return { type: "market", card, deckKey: entry.deckKey, tier: entry.tier, index };
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
      const numericValue = value ?? 0;
      normalized[key] = Number.isInteger(numericValue) && numericValue > 0 ? numericValue : 0;
    }
  }
  return normalized;
}

function calculatePayment(player: PlayerState, card: Card, goldSubsInput?: Partial<Record<string, number>>) {
  const goldSubs = normalizeGoldSubs(goldSubsInput);
  const coloredPayment = emptyCosts();
  const fixedGold = card.goldCost ?? 0;
  let goldTotal = fixedGold;
  for (const color of BASIC_COLORS) {
    const needAfterBonus = Math.max(0, card.cost[color] - player.bonuses[color]);
    const gold = goldSubs[color];
    coloredPayment[color] = Math.max(0, needAfterBonus - gold);
    goldTotal += gold;
  }
  return { coloredPayment, goldSubs, goldTotal, fixedGold };
}

function satisfiesEvolutionCost(player: PlayerState, card: Card): boolean {
  const cost = card.evolutionCost ?? card.cost;
  return BASIC_COLORS.every((color) => player.bonuses[color] >= cost[color]);
}

function hasEvolutionBase(player: PlayerState, target: Card): boolean {
  if (!target.evolvesFrom) return false;
  return player.purchasedCards.some((card) => card.name === target.evolvesFrom);
}

function availableEvolutionTargets(state: GameState, player: PlayerState): Card[] {
  if (state.variant !== "pokemon") return [];
  const marketCards = [
    ...state.tier1.faceUp,
    ...state.tier2.faceUp,
    ...state.tier3.faceUp,
  ];
  const candidates = [...marketCards, ...player.reservedCards].filter((card): card is Card => Boolean(card));
  return candidates.filter((card) => card.deckKind === "common" && hasEvolutionBase(player, card) && satisfiesEvolutionCost(player, card));
}

function offerEvolutionOrAdvance(state: GameState, playerId: string): GameState {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  const targets = availableEvolutionTargets(state, player);
  if (targets.length > 0) {
    state.pendingEvolutionPlayerId = playerId;
    recordAction(state, `${state.lastAction ?? ""}，可以进化或跳过`, playerId);
    syncPublicTiers(state);
    return state;
  }
  state.pendingEvolutionPlayerId = null;
  return advanceTurn(state);
}

function finishActionOrRequireDiscard(state: GameState, playerId: string, actionText: string): GameState {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  if (sumGems(player.gems) > 10) {
    state.pendingDiscardPlayerId = playerId;
    recordAction(state, `${actionText}，需要弃置 ${sumGems(player.gems) - 10} 个代币`, playerId);
    syncPublicTiers(state);
    return state;
  }
  if (state.variant === "pokemon") {
    recordAction(state, actionText, playerId);
    return offerEvolutionOrAdvance(state, playerId);
  }
  const noble = checkNobleVisit(state, playerId);
  const suffix = noble ? `，贵族 ${noble.id} 来访` : "";
  recordAction(state, `${actionText}${suffix}`, playerId);
  return advanceTurn(state);
}

function settleGame(state: GameState): void {
  const finalScores = [...state.players].sort((a, b) => {
    if (b.prestige !== a.prestige) return b.prestige - a.prestige;
    if (state.variant === "pokemon") {
      if (b.tuckedCards.length !== a.tuckedCards.length) return b.tuckedCards.length - a.tuckedCards.length;
      if (b.purchasedCards.length !== a.purchasedCards.length) return b.purchasedCards.length - a.purchasedCards.length;
      return state.turnOrder.indexOf(a.id) - state.turnOrder.indexOf(b.id);
    }
    if (a.purchasedCards.length !== b.purchasedCards.length) return a.purchasedCards.length - b.purchasedCards.length;
    return state.turnOrder.indexOf(a.id) - state.turnOrder.indexOf(b.id);
  });
  state.winner = finalScores[0] ?? null;
  state.phase = "ended";
  state.currentPlayerId = "";
  if (state.variant === "pokemon") {
    state.gameOverReason = state.winner
      ? `${state.winner.username} 以 ${state.winner.prestige} 点奖杯获胜；平局按进化压底卡数量、再按捕捉宝可梦数量判定。`
      : "游戏结束。";
  } else {
    state.gameOverReason = state.winner
      ? `${state.winner.username} 以 ${state.winner.prestige} 点声望获胜；若声望相同，则购买发展卡更少者胜出。`
      : "游戏结束。";
  }
  recordAction(state, state.gameOverReason, state.winner?.id ?? null);
}

function isGameVariant(value: unknown): value is GameVariant {
  return value === "classic" || value === "pokemon";
}

export function normalizeVariant(value: unknown): GameVariant {
  return isGameVariant(value) ? value : "classic";
}

export function createGame(players: PlayerState[], playerCount: number, variantInput: GameVariant = "classic"): GameRoom {
  const variant = normalizeVariant(variantInput);
  const roomId = players[0]?.id ? "pending" : "pending";
  const developmentCards = variant === "pokemon" ? POKEMON_DEVELOPMENT_CARDS : DEVELOPMENT_CARDS;
  const tierDecks = {
    tier1: shuffle(developmentCards.filter((card) => card.tier === 1)),
    tier2: shuffle(developmentCards.filter((card) => card.tier === 2)),
    tier3: shuffle(developmentCards.filter((card) => card.tier === 3)),
  };
  const internalDecks = {
    tier1: { faceUp: tierDecks.tier1.splice(0, 4), deck: tierDecks.tier1 },
    tier2: { faceUp: tierDecks.tier2.splice(0, 4), deck: tierDecks.tier2 },
    tier3: { faceUp: tierDecks.tier3.splice(0, 4), deck: tierDecks.tier3 },
    ...(variant === "pokemon"
      ? {
          rare: (() => {
            const deck = shuffle(POKEMON_RARE_CARDS);
            return { faceUp: deck.splice(0, 1), deck };
          })(),
          legendary: (() => {
            const deck = shuffle(POKEMON_LEGENDARY_CARDS);
            return { faceUp: deck.splice(0, 1), deck };
          })(),
        }
      : {}),
  };
  const gemCount = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  const startText = "游戏开始，第一位玩家开始行动";
  const startedAt = Date.now();
  const initializedPlayers = players.map((player) => ({
    ...player,
    gems: emptyGems(),
    bonuses: emptyCosts(),
    purchasedCards: [],
    reservedCards: [],
    tuckedCards: [],
    nobles: [],
    prestige: 0,
    connected: player.connected ?? true,
    turnsTaken: 0,
  }));
  const state: GameState = {
    roomId,
    variant,
    phase: "playing",
    currentPlayerId: initializedPlayers[0]?.id ?? "",
    turnOrder: initializedPlayers.map((player) => player.id),
    finalRoundStarterId: null,
    bank: { white: gemCount, blue: gemCount, green: gemCount, red: gemCount, brown: gemCount, gold: 5 },
    tier1: publicTier(internalDecks.tier1),
    tier2: publicTier(internalDecks.tier2),
    tier3: publicTier(internalDecks.tier3),
    rare: internalDecks.rare ? publicTier(internalDecks.rare) : undefined,
    legendary: internalDecks.legendary ? publicTier(internalDecks.legendary) : undefined,
    nobles: variant === "pokemon" ? [] : shuffle(NOBLES).slice(0, playerCount + 1),
    players: initializedPlayers,
    myPlayerId: "",
    winner: null,
    lastAction: startText,
    actionLog: [{ id: `${startedAt}-start`, text: startText, at: startedAt, playerId: initializedPlayers[0]?.id ?? null }],
    pendingDiscardPlayerId: null,
    pendingEvolutionPlayerId: null,
    finalRoundTargetTurns: null,
    gameOverReason: null,
    _decks: internalDecks,
  };
  return {
    roomId,
    variant,
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
  const label = next.variant === "pokemon" ? "精灵球" : "宝石";
  return finishActionOrRequireDiscard(next, playerId, `${player.username} 拿取了 ${colors.length} 个${label}`);
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
    const market = findMarketCard(state, cardId!);
    if (!market) return { valid: false, error: "场上没有这张发展卡" };
    if (state.variant === "pokemon" && market.card.deckKind !== "common") {
      return { valid: false, error: "稀有和传说宝可梦不能保留" };
    }
    return { valid: true };
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
    getDeckInternal(state, location.deckKey).faceUp[location.index] = null;
    drawToMarket(state, location.deckKey, location.index);
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
  const label = state.variant === "pokemon" ? "普通宝可梦" : "发展卡";
  return finishActionOrRequireDiscard(state, playerId, `${player.username} 保留了一张${label}${goldText}`);
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
      if (!Number.isInteger(value) || (value ?? 0) < 0) return { valid: false, error: "黄金替代数量必须是非负整数" };
    }
  }
  const { coloredPayment, goldSubs: normalized, goldTotal, fixedGold } = calculatePayment(player, location.card, goldSubs);
  if (goldTotal > player.gems.gold) return { valid: false, error: "黄金数量不足" };
  const wildGoldTotal = BASIC_COLORS.reduce((sum, color) => sum + normalized[color], 0);
  if (wildGoldTotal > Math.max(0, player.gems.gold - fixedGold)) return { valid: false, error: "黄金替代数量不足" };
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
    getDeckInternal(state, location.deckKey).faceUp[location.index] = null;
    drawToMarket(state, location.deckKey, location.index);
  } else {
    player.reservedCards.splice(location.reservedIndex, 1);
  }
  player.purchasedCards.push(location.card);
  recalculatePlayerCards(player);
  const paidText = BASIC_COLORS.map((color) => {
    const gold = normalized[color] ? `+${normalized[color]}金` : "";
    return coloredPayment[color] || gold ? `${color}${coloredPayment[color]}${gold}` : "";
  })
    .filter(Boolean)
    .join("、");
  const verb = state.variant === "pokemon" ? "捕捉了" : "购买了";
  return finishActionOrRequireDiscard(state, playerId, `${player.username} ${verb} ${location.card.name ?? location.card.id}${paidText ? `（支付 ${paidText}）` : ""}`);
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
  if (state.variant === "pokemon") {
    recordAction(state, `${player.username} 弃置了 ${discardTotal} 个精灵球`, playerId);
    return offerEvolutionOrAdvance(state, playerId);
  }
  const noble = checkNobleVisit(state, playerId);
  recordAction(state, `${player.username} 弃置了 ${discardTotal} 个代币${noble ? `，贵族 ${noble.id} 来访` : ""}`, playerId);
  return advanceTurn(state);
}

export function checkNobleVisit(state: GameState, playerId: string): Noble | null {
  if (state.variant === "pokemon") return null;
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
  const targetPrestige = state.variant === "pokemon" ? 18 : 15;
  if (state.phase === "playing" && current.prestige >= targetPrestige) {
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
  const targetPrestige = state.variant === "pokemon" ? 18 : 15;
  const reached = state.phase === "playing" && current.prestige >= targetPrestige;
  if (reached) {
    state.phase = "finalRound";
    state.finalRoundStarterId = current.id;
    state.finalRoundTargetTurns = current.turnsTaken;
    recordAction(state, `${state.lastAction ?? ""}；${current.username} 达到 ${targetPrestige} 点${state.variant === "pokemon" ? "奖杯" : "声望"}，触发最终轮`, current.id);
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

export function validateEvolvePokemon(
  state: GameState,
  playerId: string,
  targetCardId?: string | null,
  skip?: boolean,
): Validation {
  if (state.variant !== "pokemon") return { valid: false, error: "当前玩法没有进化机制" };
  if (state.pendingEvolutionPlayerId !== playerId) return { valid: false, error: "当前不需要你处理进化" };
  const player = getPlayer(state, playerId);
  if (!player) return { valid: false, error: "玩家不存在" };
  if (skip) return { valid: true };
  if (!targetCardId) return { valid: false, error: "请选择进化目标" };
  const market = findMarketCard(state, targetCardId);
  const reservedIndex = player.reservedCards.findIndex((card) => card.id === targetCardId);
  const target = market?.card ?? (reservedIndex >= 0 ? player.reservedCards[reservedIndex] : null);
  if (!target) return { valid: false, error: "找不到进化目标" };
  if (target.deckKind !== "common") return { valid: false, error: "稀有和传说宝可梦不能作为进化目标" };
  if (!hasEvolutionBase(player, target)) return { valid: false, error: "没有可进化的前置宝可梦" };
  if (!satisfiesEvolutionCost(player, target)) return { valid: false, error: "永久精灵球奖励不足，无法进化" };
  return { valid: true };
}

export function applyEvolvePokemon(
  state: GameState,
  playerId: string,
  targetCardId?: string | null,
  skip?: boolean,
): GameState {
  const validation = validateEvolvePokemon(state, playerId, targetCardId, skip);
  if (!validation.valid) throw new Error(validation.error);
  const player = getPlayer(state, playerId)!;
  if (skip || !targetCardId) {
    state.pendingEvolutionPlayerId = null;
    recordAction(state, `${player.username} 跳过进化`, playerId);
    return advanceTurn(state);
  }

  const market = findMarketCard(state, targetCardId);
  const reservedIndex = player.reservedCards.findIndex((card) => card.id === targetCardId);
  const target = market?.card ?? player.reservedCards[reservedIndex];
  const baseIndex = player.purchasedCards.findIndex((card) => card.name === target.evolvesFrom);
  const [base] = player.purchasedCards.splice(baseIndex, 1);
  player.tuckedCards.push(base);

  if (market) {
    getDeckInternal(state, market.deckKey).faceUp[market.index] = null;
    drawToMarket(state, market.deckKey, market.index);
  } else {
    player.reservedCards.splice(reservedIndex, 1);
    syncPublicTiers(state);
  }
  player.purchasedCards.push(target);
  recalculatePlayerCards(player);
  state.pendingEvolutionPlayerId = null;
  recordAction(state, `${player.username} 将 ${base.name ?? base.id} 进化为 ${target.name ?? target.id}`, playerId);
  return advanceTurn(state);
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
export type { BasicColor, GemColor };
