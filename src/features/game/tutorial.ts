import { BASIC_COLORS, isHiddenCard, type Card, type GameState, type PlayerState } from "~/types";

export type TutorialKind = "turnOverview" | "takeGems" | "buyCard" | "reserveCard" | "discardTokens" | "evolvePokemon";
export type TutorialFrequency = "common" | "rare";
export type TutorialCounts = Partial<Record<TutorialKind, number>>;

export interface TutorialStep {
  kind: TutorialKind;
  frequency: TutorialFrequency;
  key: string;
  targetSelector: string;
  targetSelectors?: string[];
  allowedSelectors?: string[];
  text: string;
}

const COMMON_LIMIT = 3;
const RARE_LIMIT = 1;
const COMMON_KINDS = new Set<TutorialKind>(["turnOverview", "takeGems", "buyCard", "reserveCard"]);

export function tutorialLimitForKind(kind: TutorialKind) {
  return COMMON_KINDS.has(kind) ? COMMON_LIMIT : RARE_LIMIT;
}

export function tutorialFrequencyForKind(kind: TutorialKind): TutorialFrequency {
  return COMMON_KINDS.has(kind) ? "common" : "rare";
}

export function canShowTutorialKind(kind: TutorialKind, counts: TutorialCounts) {
  return (counts[kind] ?? 0) < tutorialLimitForKind(kind);
}

export function selectTutorialStep(state: GameState, playerId: string, counts: TutorialCounts = {}): TutorialStep | undefined {
  if (state.phase === "waiting" || state.phase === "ended" || state.winner) return undefined;
  if (state.pendingDiscardPlayerId && state.pendingDiscardPlayerId !== playerId) return undefined;
  if (state.pendingEvolutionPlayerId && state.pendingEvolutionPlayerId !== playerId) return undefined;
  if (!state.pendingDiscardPlayerId && !state.pendingEvolutionPlayerId && state.currentPlayerId !== playerId) return undefined;

  const me = state.players.find((player) => player.id === playerId);
  if (!me) return undefined;

  const candidates = state.pendingDiscardPlayerId === playerId || state.pendingEvolutionPlayerId === playerId
    ? pendingCandidates(state, me)
    : turnCandidates(state, me);
  return candidates.find((candidate) => canShowTutorialKind(candidate.kind, counts));
}

function pendingCandidates(state: GameState, me: PlayerState): TutorialStep[] {
  if (state.pendingDiscardPlayerId === me.id) {
    return [
      step(
        "discardTokens",
        `discard:${state.roomId}:${me.turnsTaken ?? 0}:${totalTokenCount(me)}`,
        ".discard-drop-zone",
        "你的代币超过上限。把要丢弃的代币拖到弃币区，数量降到 10 枚后确认。",
        [".discard-drop-zone", ".my-drawer-gems"],
      ),
    ];
  }

  if (state.pendingEvolutionPlayerId === me.id) {
    return [
      step(
        "evolvePokemon",
        `evolve:${state.roomId}:${me.turnsTaken ?? 0}:${me.purchasedCards.length}`,
        ".evolution-zone",
        "本次捕捉触发了进化。选择一个满足条件的目标，或跳过继续游戏。",
        [".evolution-zone", ".pokemon-special-panel", ".development-market"],
      ),
    ];
  }

  return [];
}

function turnCandidates(state: GameState, me: PlayerState): TutorialStep[] {
  const candidates: TutorialStep[] = [];
  const buyTargets = visibleCards(state).filter((card) => canAfford(me, card));
  if (buyTargets.length > 0) {
    candidates.push(
      step(
        "buyCard",
        `buy:${state.roomId}:${state.currentPlayerId}:${me.turnsTaken ?? 0}:${buyTargets[0].id}`,
        ".development-market",
        state.variant === "pokemon" ? "你现在有可以捕捉的宝可梦。点击或拖入购买区，系统会自动校验支付。" : "你现在有可以买的发展卡。点击或拖入购买区，系统会自动校验支付。",
        [".development-market", ".purchase-zone", ".my-drawer-gems"],
      ),
    );
  }

  if (me.reservedCards.length < 3 && visibleCards(state).some((card) => state.variant !== "pokemon" || card.deckKind === "common")) {
    candidates.push(
      step(
        "reserveCard",
        `reserve:${state.roomId}:${state.currentPlayerId}:${me.turnsTaken ?? 0}`,
        ".reserve-zone",
        state.variant === "pokemon" ? "可以保留普通宝可梦或从普通牌堆盲保。保留后会获得 1 枚大师球（若库存还有）。" : "可以预留市场牌或从牌堆盲抽。预留后会获得 1 枚黄金（若库存还有）。",
        [".development-market", ".reserve-zone"],
      ),
    );
  }

  if (BASIC_COLORS.some((color) => state.bank[color] > 0)) {
    candidates.push(
      step(
        "takeGems",
        `take:${state.roomId}:${state.currentPlayerId}:${me.turnsTaken ?? 0}`,
        ".bank-panel",
        state.variant === "pokemon" ? "你可以拿 3 种不同精灵球，或在库存至少 4 枚时拿 2 枚同色精灵球。" : "你可以拿 3 种不同宝石，或在库存至少 4 枚时拿 2 枚同色宝石。",
        [".bank-panel", ".my-drawer-gems"],
        [".bank-token", ".my-area-drawer"],
      ),
    );
  }

  candidates.push(
    step(
      "turnOverview",
      `overview:${state.roomId}:${state.currentPlayerId}:${me.turnsTaken ?? 0}`,
      ".tabletop-board",
      "轮到你行动。公共区、市场和你的行动抽屉会显示当前可用操作；拖动对象可以先预览，再确认提交。",
      [".tabletop-board", ".public-bank-strip", ".my-area-drawer"],
    ),
  );

  return candidates;
}

function step(kind: TutorialKind, key: string, targetSelector: string, text: string, targetSelectors?: string[], allowedSelectors?: string[]): TutorialStep {
  return { kind, frequency: tutorialFrequencyForKind(kind), key, targetSelector, text, targetSelectors, allowedSelectors };
}

function visibleCards(state: GameState): Card[] {
  return [
    ...state.tier1.faceUp,
    ...state.tier2.faceUp,
    ...state.tier3.faceUp,
    ...(state.rare?.faceUp ?? []),
    ...(state.legendary?.faceUp ?? []),
    ...state.players.flatMap((player) => player.reservedCards.filter((card): card is Card => !isHiddenCard(card))),
  ].filter((card): card is Card => Boolean(card));
}

function canAfford(player: PlayerState, card: Card) {
  let goldNeeded = card.goldCost ?? 0;
  for (const color of BASIC_COLORS) {
    goldNeeded += Math.max(0, card.cost[color] - player.bonuses[color] - player.gems[color]);
  }
  return player.gems.gold >= goldNeeded;
}

function totalTokenCount(player: PlayerState) {
  return Object.values(player.gems).reduce((sum, value) => sum + value, 0);
}
