import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { RoomIntent, RoomIntentEvent } from "../shared/protocol";
import type { BasicColor, Card, GameState, GameVariant, GemColor, Gems, PlayerState, PlayerTracePayload, TraceItem, TracePhase, TracePointPayload } from "../types";
import { AVATARS, BASIC_COLORS, cardImageUrl, colorLabelsFor, deckBackUrl, isHiddenCard, tokenImagesFor } from "../types";

type DragPayload =
  | { kind: "bank-gem"; color: GemColor }
  | { kind: "my-gem"; color: GemColor }
  | { kind: "market-card"; card: Card }
  | { kind: "reserved-card"; card: Card }
  | { kind: "deck"; tier: 1 | 2 | 3 };

type StagedReserve = { card?: Card; fromDeck?: 1 | 2 | 3 } | null;
type TracePoint = TracePointPayload;
type RemoteTrace = PlayerTracePayload & { points: TracePoint[]; finishing: boolean; targetPoint: TracePoint; renderX: number; renderY: number };
type RemoteClickEffect = { id: string; point: TracePoint; playerId: string; avatarId: number; renderX: number; renderY: number; at: number };
type TraceItemInput =
  | { kind: "cursor" }
  | { kind: "bank-gem" | "my-gem"; color: GemColor }
  | { kind: "market-card"; cardId: string }
  | { kind: "reserved-card"; tier: 1 | 2 | 3 }
  | { kind: "deck"; tier: 1 | 2 | 3 };

interface PaymentPlan {
  need: Record<BasicColor, number>;
  coloredPayment: Record<BasicColor, number>;
  goldSubstitutions: Record<BasicColor, number>;
  remaining: Record<BasicColor, number>;
  goldTotal: number;
  fixedGold: number;
  missingTotal: number;
  canBuy: boolean;
}

interface BoardDragContextValue {
  activeDrag: DragPayload | null;
  activeDragPoint: { x: number; y: number } | null;
  selectedCard: Card | null;
  selectedCardSource: "market" | "reserved" | null;
  stagedTakeGems: GemColor[];
  stagedPayment: Partial<Gems>;
  stagedDiscard: Partial<Gems>;
  stagedReserve: StagedReserve;
  notice: string;
  isMyTurn: boolean;
  mustDiscard: boolean;
  paymentPlan: PaymentPlan | null;
  setSelectedCard: (card: Card | null, source?: "market" | "reserved" | null) => void;
  stageTakeGem: (color: GemColor) => void;
  stagePaymentGem: (color: GemColor) => void;
  stageDiscardGem: (color: GemColor) => void;
  stageReserveCard: (card: Card) => void;
  stageReserveDeck: (tier: 1 | 2 | 3) => void;
  clearStagedTake: () => void;
  clearPayment: () => void;
  clearDiscard: () => void;
  clearReserve: () => void;
  confirmTake: () => void;
  canConfirmTake: boolean;
  confirmBuy: () => void;
  confirmReserve: () => void;
  confirmDiscard: () => void;
  describeTake: string;
  variant: GameVariant;
  colorLabels: Record<GemColor, string>;
  tokenImages: Record<GemColor, string>;
  availableEvolutions: Card[];
  canHandleEvolution: boolean;
  confirmEvolution: (targetCardId: string) => void;
  skipEvolution: () => void;
  remoteIntent: RoomIntentEvent | null;
}

const BoardDragContext = createContext<BoardDragContextValue | null>(null);
const TRACE_THROTTLE_MS = 45;
const CURSOR_TRACE_THROTTLE_MS = 33;
const CURSOR_IDLE_END_MS = 680;
const CURSOR_BUFFER_POINT_LIMIT = 48;
const TRACE_POINT_LIMIT = 56;
const REMOTE_TRACE_LIMIT = 12;
const REMOTE_CLICK_LIMIT = 18;
const REMOTE_CLICK_EFFECT_MS = 720;
const REMOTE_CURSOR_LERP = 0.34;
const REMOTE_CURSOR_SNAP_DISTANCE = 0.00035;
const TRACE_SURFACE_SELECTOR = "[data-trace-surface='game']";
const CURSOR_ANCHOR_SELECTOR = "[data-cursor-anchor]";
const TRACE_COLORS = [
  "oklch(58% 0.12 188)",
  "oklch(58% 0.17 28)",
  "oklch(58% 0.16 158)",
  "oklch(57% 0.17 255)",
  "oklch(66% 0.14 78)",
  "oklch(45% 0.05 70)",
];
const ACTION_DROP_IDS = new Set(["my-gems-zone", "selected-card-zone", "payment-zone", "reserve-zone", "discard-zone"]);

const tabletopCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const actionCollisions = pointerCollisions.filter(({ id }) => ACTION_DROP_IDS.has(String(id)));
  if (actionCollisions.length > 0) return actionCollisions;
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function emptyBasic(): Record<BasicColor, number> {
  return { white: 0, blue: 0, green: 0, red: 0, brown: 0 };
}

function totalGems(gems: Partial<Gems>) {
  return Object.values(gems).reduce((sum, value) => sum + (value ?? 0), 0);
}

function incrementGem(gems: Partial<Gems>, color: GemColor) {
  return { ...gems, [color]: (gems[color] ?? 0) + 1 };
}

function validateTakeSelection(selection: GemColor[], bank: Gems, labels: Record<GemColor, string>) {
  if (selection.length === 3) {
    const unique = new Set(selection);
    const valid = unique.size === 3 && selection.every((color) => color !== "gold" && bank[color] > 0);
    return { valid, text: valid ? "双击我的宝石区确认拿取" : "三颗必须不同且库存充足" };
  }

  if (selection.length === 2) {
    const [first, second] = selection;
    const valid = first === second && first !== "gold" && bank[first] >= 4;
    return { valid, text: valid ? `双击确认拿取 2 枚${labels[first]}` : "两颗相同要求库存至少 4" };
  }

  return { valid: false, text: selection.length ? `已暂放 ${selection.length} 枚` : "拖公共区到我的区域" };
}

function createPaymentPlan(player: PlayerState, card: Card | null): PaymentPlan | null {
  if (!card) return null;
  const need = emptyBasic();
  const coloredPayment = emptyBasic();
  const goldSubstitutions = emptyBasic();
  const remaining = emptyBasic();

  for (const color of BASIC_COLORS) {
    need[color] = Math.max(0, card.cost[color] - player.bonuses[color]);
    coloredPayment[color] = Math.min(player.gems[color], need[color]);
    remaining[color] = Math.max(0, need[color] - coloredPayment[color]);
  }

  const fixedGold = card.goldCost ?? 0;
  let goldLeft = Math.max(0, player.gems.gold - fixedGold);
  let goldTotal = fixedGold;
  for (const color of BASIC_COLORS) {
    const goldForColor = Math.min(remaining[color], goldLeft);
    goldSubstitutions[color] = goldForColor;
    remaining[color] -= goldForColor;
    goldLeft -= goldForColor;
    goldTotal += goldForColor;
  }

  const missingGold = Math.max(0, fixedGold - player.gems.gold);
  const missingTotal = BASIC_COLORS.reduce((sum, color) => sum + remaining[color], 0) + missingGold;
  return { need, coloredPayment, goldSubstitutions, remaining, goldTotal, fixedGold, missingTotal, canBuy: missingTotal === 0 };
}

function dragLabel(payload: DragPayload | null, labels: Record<GemColor, string>) {
  if (!payload) return "";
  if (payload.kind === "bank-gem" || payload.kind === "my-gem") return labels[payload.color];
  if (payload.kind === "deck") return `${payload.tier} 级牌堆`;
  return `${payload.card.name ?? labels[payload.card.color]} ${payload.card.prestige} 分`;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function viewportPosition(clientX: number, clientY: number) {
  return {
    x: clampUnit(clientX / Math.max(window.innerWidth, 1)),
    y: clampUnit(clientY / Math.max(window.innerHeight, 1)),
  };
}

function traceSurfaceElement() {
  return document.querySelector<HTMLElement>(TRACE_SURFACE_SELECTOR);
}

function cursorAnchorFromId(anchorId: string | undefined) {
  if (!anchorId) return null;
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(anchorId) : anchorId.replace(/["\\]/g, "\\$&");
  return document.querySelector<HTMLElement>(`[data-cursor-anchor="${escaped}"]`);
}

function usableElementRect(element: HTMLElement | null) {
  if (!element || !element.isConnected) return null;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none" || Number(style.opacity) === 0) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 ? rect : null;
}

function cursorAnchorFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLElement>(CURSOR_ANCHOR_SELECTOR);
  return usableElementRect(anchor) ? anchor : null;
}

function cursorAnchorFromPoint(clientX: number, clientY: number, target?: EventTarget | null) {
  const targetAnchor = cursorAnchorFromTarget(target ?? null);
  if (targetAnchor) return targetAnchor;
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const anchor = element.closest<HTMLElement>(CURSOR_ANCHOR_SELECTOR);
    if (usableElementRect(anchor)) return anchor;
  }
  return null;
}

function unitPointInRect(clientX: number, clientY: number, rect: DOMRect) {
  return {
    x: clampUnit((clientX - rect.left) / Math.max(rect.width, 1)),
    y: clampUnit((clientY - rect.top) / Math.max(rect.height, 1)),
  };
}

function tracePointFromClient(clientX: number, clientY: number, target?: EventTarget | null): TracePoint {
  const at = Date.now();
  const surface = traceSurfaceElement();
  const surfaceRect = usableElementRect(surface);
  const surfacePoint = surfaceRect ? unitPointInRect(clientX, clientY, surfaceRect) : null;
  const anchor = cursorAnchorFromPoint(clientX, clientY, target);
  const anchorRect = usableElementRect(anchor);
  if (anchor?.dataset.cursorAnchor && anchorRect) {
    const anchorPoint = unitPointInRect(clientX, clientY, anchorRect);
    return {
      ...anchorPoint,
      at,
      space: "anchor",
      anchorId: anchor.dataset.cursorAnchor,
      ...(surfacePoint ? { surfaceX: surfacePoint.x, surfaceY: surfacePoint.y } : {}),
    };
  }
  if (surfacePoint) {
    return { ...surfacePoint, at, space: "surface" };
  }
  return { ...viewportPosition(clientX, clientY), at, space: "viewport" };
}

function tracePointFromPayload(payload: PlayerTracePayload): TracePoint {
  return {
    x: payload.x,
    y: payload.y,
    at: payload.at,
    space: payload.space ?? "viewport",
    anchorId: payload.anchorId,
    surfaceX: payload.surfaceX,
    surfaceY: payload.surfaceY,
  };
}

function resolveSurfacePoint(x: number, y: number) {
  const surfaceRect = usableElementRect(traceSurfaceElement());
  if (!surfaceRect) return null;
  return viewportPosition(surfaceRect.left + x * surfaceRect.width, surfaceRect.top + y * surfaceRect.height);
}

function resolveTracePoint(point: TracePoint) {
  if (point.space === "anchor") {
    if (point.anchorId) {
      const anchorRect = usableElementRect(cursorAnchorFromId(point.anchorId));
      if (anchorRect) {
        return viewportPosition(anchorRect.left + point.x * anchorRect.width, anchorRect.top + point.y * anchorRect.height);
      }
    }
    if (typeof point.surfaceX === "number" && typeof point.surfaceY === "number") {
      return resolveSurfacePoint(point.surfaceX, point.surfaceY) ?? { x: point.surfaceX, y: point.surfaceY };
    }
  }
  if (point.space === "surface") {
    return resolveSurfacePoint(point.x, point.y) ?? { x: point.x, y: point.y };
  }
  return { x: point.x, y: point.y };
}

function serializeTracePoint(point: TracePoint) {
  return {
    x: point.x,
    y: point.y,
    at: point.at,
    space: point.space,
    anchorId: point.anchorId,
    surfaceX: point.surfaceX,
    surfaceY: point.surfaceY,
  };
}

function clientPointFromActivator(event: Event): { x: number; y: number } | null {
  if ("clientX" in event && "clientY" in event && typeof event.clientX === "number" && typeof event.clientY === "number") {
    return { x: event.clientX, y: event.clientY };
  }
  if ("touches" in event) {
    const touches = (event as TouchEvent).touches;
    if (!touches.length) return null;
    const touch = touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }
  return null;
}

function pointFromActivator(event: Event): TracePoint | null {
  const point = clientPointFromActivator(event);
  return point ? tracePointFromClient(point.x, point.y, event.target) : null;
}

function traceItemFromPayload(payload: DragPayload): TraceItemInput {
  if (payload.kind === "bank-gem" || payload.kind === "my-gem") return { kind: payload.kind, color: payload.color };
  if (payload.kind === "deck") return { kind: "deck", tier: payload.tier };
  if (payload.kind === "market-card") return { kind: "market-card", cardId: payload.card.id };
  return { kind: "reserved-card", tier: payload.card.tier };
}

function traceItemLabel(item: TraceItem, labels: Record<GemColor, string>) {
  switch (item.kind) {
    case "cursor":
      return "鼠标";
    case "bank-gem":
    case "my-gem":
      return labels[item.color];
    case "market-card":
      return `${item.name ?? labels[item.color]} ${item.prestige} 分`;
    case "reserved-card":
      return "预留卡";
    case "deck":
      return `${item.tier} 级牌堆`;
  }
}

function traceColorFor(playerId: string, avatarId: number) {
  let hash = avatarId;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) >>> 0;
  }
  return TRACE_COLORS[hash % TRACE_COLORS.length];
}

export function BoardDragProvider({
  gameState,
  me,
  currentPlayer,
  pendingDiscardExcess,
  onTakeGems,
  onReserveCard,
  onBuyCard,
  onDiscardTokens,
  onEvolvePokemon,
  onIntent,
  remoteIntent,
  children,
}: {
  gameState: GameState;
  me: PlayerState;
  currentPlayer?: PlayerState;
  pendingDiscardExcess: number | null;
  onTakeGems: (colors: GemColor[]) => void;
  onReserveCard: (cardId: string | null, fromDeck: 1 | 2 | 3 | null) => void;
  onBuyCard: (cardId: string, goldSubstitutions: Partial<Record<BasicColor, number>>) => void;
  onDiscardTokens: (tokens: Partial<Gems>) => void;
  onEvolvePokemon: (targetCardId: string | null, skip?: boolean) => void;
  onIntent?: (intent: RoomIntent) => void;
  remoteIntent?: RoomIntentEvent | null;
  children: ReactNode;
}) {
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [activeDragPoint, setActiveDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedCard, setSelectedCardState] = useState<Card | null>(null);
  const [selectedCardSource, setSelectedCardSource] = useState<"market" | "reserved" | null>(null);
  const [stagedTakeGems, setStagedTakeGems] = useState<GemColor[]>([]);
  const [stagedPayment, setStagedPayment] = useState<Partial<Gems>>({});
  const [stagedDiscard, setStagedDiscard] = useState<Partial<Gems>>({});
  const [stagedReserve, setStagedReserve] = useState<StagedReserve>(null);
  const [notice, setNotice] = useState("拖动宝石或卡牌来安排你的行动。双击目标区域确认。");
  const [remoteTraces, setRemoteTraces] = useState<RemoteTrace[]>([]);
  const [remoteClickEffects, setRemoteClickEffects] = useState<RemoteClickEffect[]>([]);
  const activeDragRef = useRef<DragPayload | null>(null);
  const initialClientPointRef = useRef<{ x: number; y: number } | null>(null);
  const initialTracePointRef = useRef<TracePoint | null>(null);
  const latestTracePointRef = useRef<TracePoint | null>(null);
  const traceIdRef = useRef("");
  const lastTraceEmitRef = useRef(0);
  const cursorTraceIdRef = useRef("");
  const latestCursorPointRef = useRef<TracePoint | null>(null);
  const cursorBufferedPointsRef = useRef<TracePoint[]>([]);
  const lastCursorEmitRef = useRef(0);
  const cursorIdleTimerRef = useRef<number | null>(null);
  const removeTraceTimersRef = useRef<Record<string, number>>({});
  const removeClickTimersRef = useRef<Record<string, number>>({});
  const lastIntentEmitRef = useRef(0);
  const lastIntentKeyRef = useRef("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const isMyTurn = gameState.currentPlayerId === me.id;
  const mustDiscard = gameState.pendingDiscardPlayerId === me.id || pendingDiscardExcess !== null;
  const colorLabels = colorLabelsFor(gameState.variant);
  const tokenImages = tokenImagesFor(gameState.variant);
  const takeValidation = validateTakeSelection(stagedTakeGems, gameState.bank, colorLabels);
  const paymentPlan = useMemo(() => createPaymentPlan(me, selectedCard), [me, selectedCard]);
  const canHandleEvolution = gameState.variant === "pokemon" && gameState.pendingEvolutionPlayerId === me.id;
  const availableEvolutions = useMemo(() => {
    if (!canHandleEvolution) return [];
    const market = [...gameState.tier1.faceUp, ...gameState.tier2.faceUp, ...gameState.tier3.faceUp].filter((card): card is Card => Boolean(card));
    const reserved = me.reservedCards.filter((card): card is Card => !isHiddenCard(card));
    return [...market, ...reserved].filter((card) => {
      if (!card.evolvesFrom || card.deckKind !== "common") return false;
      if (!me.purchasedCards.some((owned) => owned.name === card.evolvesFrom)) return false;
      const evolutionCost = card.evolutionCost ?? card.cost;
      return BASIC_COLORS.every((color) => me.bonuses[color] >= evolutionCost[color]);
    });
  }, [canHandleEvolution, gameState.tier1.faceUp, gameState.tier2.faceUp, gameState.tier3.faceUp, me]);

  useEffect(() => {
    setStagedTakeGems([]);
    setStagedPayment({});
    setStagedDiscard({});
    setStagedReserve(null);
  }, [gameState.currentPlayerId, gameState.lastAction]);

  useEffect(() => {
    return () => {
      Object.values(removeTraceTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      Object.values(removeClickTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      removeTraceTimersRef.current = {};
      removeClickTimersRef.current = {};
    };
  }, []);

  const guardTurn = () => {
    if (!isMyTurn) {
      setNotice(`还没有轮到你，当前是 ${currentPlayer?.username ?? "其他玩家"} 的回合。`);
      return false;
    }
    if (mustDiscard) {
      setNotice("当前必须先完成弃置代币。");
      return false;
    }
    if (gameState.pendingEvolutionPlayerId) {
      setNotice("当前必须先完成或跳过进化。");
      return false;
    }
    return true;
  };

  const setSelectedCard = (card: Card | null, source: "market" | "reserved" | null = null) => {
    setSelectedCardState(card);
    setSelectedCardSource(card ? source : null);
    setStagedPayment({});
    if (card) setNotice(gameState.variant === "pokemon" ? "已选中宝可梦。条件足够时可直接捕捉。" : "已选中发展卡。条件足够时可直接购买，也可以拖宝石查看支付。");
  };

  const stageTakeGem = (color: GemColor) => {
    if (!guardTurn()) return;
    if (color === "gold") {
      setNotice(`${colorLabels.gold}不能直接从公共区拿取，只能通过预留卡牌获得。`);
      return;
    }
    if (gameState.bank[color] <= 0) {
      setNotice(`${colorLabels[color]}库存不足。`);
      return;
    }
    setStagedTakeGems((prev) => {
      const sameCount = prev.filter((item) => item === color).length;
      if (prev.length === 0) return [color];
      if (prev.length === 1 && sameCount === 1) {
        if (gameState.bank[color] < 4) {
          setNotice("两颗相同要求公共库存至少 4。");
          return prev;
        }
        setNotice(`已暂放 2 枚${colorLabels[color]}，双击我的区域确认。`);
        return [color, color];
      }
      if (prev.length < 3 && sameCount === 0 && new Set(prev).size === prev.length) {
        return [...prev, color];
      }
      setNotice("只能取 3 种不同，或库存至少 4 时取 2 枚同色。");
      return prev;
    });
  };

  const stagePaymentGem = (color: GemColor, targetCard: Card | null = selectedCard, paymentBase: Partial<Gems> = stagedPayment, resetPayment = false) => {
    if (!guardTurn()) return;
    if (!targetCard) {
      setNotice(gameState.variant === "pokemon" ? "请先选择或拖入一张要捕捉的宝可梦。" : "请先选择或拖入一张要购买的发展卡。");
      return;
    }
    if (me.gems[color] <= (paymentBase[color] ?? 0)) {
      setNotice(`${colorLabels[color]}数量不足。`);
      return;
    }
    const plan = createPaymentPlan(me, targetCard);
    const stagedCount = paymentBase[color] ?? 0;
    const neededCount = color === "gold" ? plan?.goldTotal ?? 0 : plan?.need[color] ?? 0;
    if (neededCount <= 0) {
      setNotice(`${colorLabels[color]}暂时不需要用于这张卡。`);
      return;
    }
    if (stagedCount >= neededCount) {
      setNotice(`${colorLabels[color]}已经足够支付这张卡。`);
      return;
    }
    setStagedPayment((prev) => incrementGem(resetPayment ? paymentBase : prev, color));
    setNotice("已记录手动支付。条件足够时可以直接点击购买。");
  };

  const stageDiscardGem = (color: GemColor) => {
    if (!mustDiscard) {
      setNotice("当前不需要弃置代币。");
      return;
    }
    if (me.gems[color] <= (stagedDiscard[color] ?? 0)) {
      setNotice(`${colorLabels[color]}数量不足，无法继续弃置。`);
      return;
    }
    setStagedDiscard((prev) => incrementGem(prev, color));
    setNotice("已暂放弃置对象。双击弃置区确认。");
  };

  const stageReserveCard = (card: Card) => {
    if (!guardTurn()) return;
    if (gameState.variant === "pokemon" && card.deckKind !== "common") {
      setNotice("稀有和传说宝可梦不能保留，只能捕捉。");
      return;
    }
    if (me.reservedCards.length >= 3) {
      setNotice("预留区已满。");
      return;
    }
    setStagedReserve({ card });
    setNotice("已暂放到预留区，点击确认预留。");
  };

  const stageReserveDeck = (tier: 1 | 2 | 3) => {
    if (!guardTurn()) return;
    if (me.reservedCards.length >= 3) {
      setNotice("预留区已满。");
      return;
    }
    setStagedReserve({ fromDeck: tier });
    setNotice(`已暂放 ${tier} 级牌堆，点击确认预留。`);
  };

  const confirmTake = () => {
    if (!guardTurn()) return;
    if (!takeValidation.valid) {
      setNotice(takeValidation.text);
      return;
    }
    onTakeGems(stagedTakeGems);
    setNotice(gameState.variant === "pokemon" ? "已提交拿取精灵球动作。" : "已提交取宝石动作。");
    setStagedTakeGems([]);
  };

  const confirmBuy = () => {
    if (!guardTurn() || !selectedCard || !paymentPlan) return;
    if (!paymentPlan.canBuy) {
      setNotice(gameState.variant === "pokemon" ? "精灵球不足，还不能捕捉这只宝可梦。" : "宝石不足，还不能购买这张卡。");
      return;
    }
    onBuyCard(selectedCard.id, paymentPlan.goldSubstitutions);
    setNotice(gameState.variant === "pokemon" ? "已提交捕捉动作。" : "已提交购买动作。");
    setSelectedCardState(null);
    setSelectedCardSource(null);
    setStagedPayment({});
  };

  const confirmReserve = () => {
    if (!guardTurn() || !stagedReserve) return;
    if (stagedReserve.card) onReserveCard(stagedReserve.card.id, null);
    if (stagedReserve.fromDeck) onReserveCard(null, stagedReserve.fromDeck);
    setNotice("已提交预留动作。");
    setStagedReserve(null);
  };

  const confirmDiscard = () => {
    if (!mustDiscard) return;
    const remaining = totalGems(me.gems) - totalGems(stagedDiscard);
    if (remaining > 10) {
      setNotice(`还需要再弃置 ${remaining - 10} 枚代币。`);
      return;
    }
    onDiscardTokens(stagedDiscard);
    setNotice("已提交弃置动作。");
    setStagedDiscard({});
  };

  const confirmEvolution = (targetCardId: string) => {
    if (!canHandleEvolution) return;
    onEvolvePokemon(targetCardId, false);
  };

  const skipEvolution = () => {
    if (!canHandleEvolution) return;
    onEvolvePokemon(null, true);
  };

  const canShareIntent = (intent: RoomIntent) => {
    if (intent.type === "clear") return true;
    return isMyTurn || mustDiscard || canHandleEvolution;
  };

  const publishIntent = (intent: RoomIntent, force = false) => {
    if (!onIntent || !canShareIntent(intent)) return;
    const key = JSON.stringify(intent);
    const now = Date.now();
    if (!force && key === lastIntentKeyRef.current && now - lastIntentEmitRef.current < 160) return;
    if (!force && now - lastIntentEmitRef.current < 70) return;
    lastIntentKeyRef.current = key;
    lastIntentEmitRef.current = now;
    onIntent(intent);
  };

  const cardSourceFromPayload = (payload: DragPayload): Extract<RoomIntent, { type: "hoverCard" }>["source"] => {
    if (payload.kind === "market-card") return { type: "market", cardId: payload.card.id };
    if (payload.kind === "reserved-card") return { type: "reserved", cardId: payload.card.id };
    if (payload.kind === "deck") return { type: "deck", tier: payload.tier };
    return undefined;
  };

  const intentSourceForTarget = (targetId?: string) => {
    if (!targetId) return activeDragRef.current ? cardSourceFromPayload(activeDragRef.current) : undefined;
    if (targetId.startsWith("card-drop:")) {
      const cardId = targetId.replace("card-drop:", "");
      return isReservedCard(me, cardId) ? ({ type: "reserved", cardId } as const) : ({ type: "market", cardId } as const);
    }
    return selectedCard ? ({ type: selectedCardSource === "reserved" ? "reserved" : "market", cardId: selectedCard.id } as const) : undefined;
  };

  const paymentIntentFor = (targetId: string | undefined, gem?: GemColor): RoomIntent | null => {
    const source = intentSourceForTarget(targetId);
    if (!source || source.type === "deck") return null;
    const card = findCardById(gameState, me, source.cardId);
    return { type: "paymentTarget", source, gem, valid: Boolean(createPaymentPlan(me, card)?.canBuy) };
  };

  const emitTrace = (phase: TracePhase, payload: DragPayload, point: TracePoint, targetId?: string) => {
    if (phase === "end" || phase === "cancel") {
      publishIntent({ type: "clear" }, true);
      return;
    }

    if (payload.kind === "bank-gem") {
      if (targetId === "my-gems-zone") {
        const colors = [...stagedTakeGems, payload.color];
        const selection = validateTakeSelection(colors, gameState.bank, colorLabels);
        publishIntent({ type: "gemSelection", colors, valid: selection.valid, ...(selection.valid ? {} : { invalidPoint: { x: point.x, y: point.y } }) });
      } else {
        publishIntent({ type: "hoverGem", color: payload.color, area: "bank" });
      }
      return;
    }

    if (payload.kind === "my-gem") {
      if (targetId === "discard-zone") {
        const tokens = incrementGem(stagedDiscard, payload.color);
        publishIntent({ type: "discardSelection", tokens, valid: totalGems(me.gems) - totalGems(tokens) <= 10 });
        return;
      }
      if (targetId === "payment-zone" || targetId === "selected-card-zone" || targetId?.startsWith("card-drop:")) {
        const paymentIntent = paymentIntentFor(targetId, payload.color);
        if (paymentIntent) publishIntent(paymentIntent);
        return;
      }
      publishIntent({ type: "hoverGem", color: payload.color, area: "mine" });
      return;
    }

    if (payload.kind === "market-card" && targetId === "reserve-zone") {
      publishIntent({ type: "reserveTarget", source: cardSourceFromPayload(payload), valid: me.reservedCards.length < 3 });
      return;
    }
    if (payload.kind === "deck" && targetId === "reserve-zone") {
      publishIntent({ type: "reserveTarget", source: cardSourceFromPayload(payload), valid: me.reservedCards.length < 3 });
      return;
    }

    if ((payload.kind === "market-card" || payload.kind === "reserved-card") && (targetId === "selected-card-zone" || targetId?.startsWith("card-drop:"))) {
      publishIntent(paymentIntentFor(targetId, undefined) ?? { type: "hoverCard", source: cardSourceFromPayload(payload) });
      return;
    }

    if (gameState.variant === "pokemon" && (payload.kind === "market-card" || payload.kind === "reserved-card") && canHandleEvolution) {
      publishIntent({ type: "evolutionTarget", cardId: payload.card.id, valid: availableEvolutions.some((card) => card.id === payload.card.id) });
      return;
    }

    if (payload.kind === "market-card" || payload.kind === "reserved-card" || payload.kind === "deck") {
      publishIntent({ type: "hoverCard", source: cardSourceFromPayload(payload) });
    }
  };

  const pointFromDragDelta = (event: DragMoveEvent | DragEndEvent | DragCancelEvent) => {
    const start = initialClientPointRef.current;
    if (!start) return latestTracePointRef.current ?? initialTracePointRef.current;
    return tracePointFromClient(start.x + event.delta.x, start.y + event.delta.y);
  };

  const onDragStart = (event: DragStartEvent) => {
    const payload = (event.active.data.current as DragPayload | undefined) ?? null;
    setActiveDrag(payload);
    activeDragRef.current = payload;
    initialClientPointRef.current = clientPointFromActivator(event.activatorEvent);
    const startPoint = pointFromActivator(event.activatorEvent);
    initialTracePointRef.current = startPoint;
    latestTracePointRef.current = startPoint;
    setActiveDragPoint(startPoint ? resolveTracePoint(startPoint) : null);
    lastTraceEmitRef.current = 0;
    if (payload && startPoint) emitTrace("start", payload, startPoint);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const payload = activeDragRef.current;
    if (!payload) return;
    const point = pointFromDragDelta(event);
    if (!point) return;
    latestTracePointRef.current = point;
    setActiveDragPoint(resolveTracePoint(point));
    const now = Date.now();
    if (now - lastTraceEmitRef.current < TRACE_THROTTLE_MS) return;
    lastTraceEmitRef.current = now;
    emitTrace("move", payload, point, event.over?.id ? String(event.over.id) : undefined);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const payload = event.active.data.current as DragPayload | undefined;
    const overId = String(event.over?.id ?? "");
    const endPoint = payload ? pointFromDragDelta(event) : null;
    if (payload && endPoint) emitTrace("end", payload, endPoint, overId || undefined);
    setActiveDrag(null);
    setActiveDragPoint(null);
    activeDragRef.current = null;
    initialClientPointRef.current = null;
    initialTracePointRef.current = null;
    latestTracePointRef.current = null;
    traceIdRef.current = "";
    if (!payload || !overId) return;

    if (payload.kind === "bank-gem" && overId === "my-gems-zone") stageTakeGem(payload.color);
    else if (payload.kind === "my-gem" && overId === "my-gems-zone") {
      setNotice("已放回我的宝石区。");
    }
    else if (payload.kind === "my-gem" && overId === "payment-zone") stagePaymentGem(payload.color);
    else if (payload.kind === "my-gem" && overId === "selected-card-zone") stagePaymentGem(payload.color);
    else if (payload.kind === "my-gem" && overId === "discard-zone") stageDiscardGem(payload.color);
    else if (payload.kind === "my-gem" && overId.startsWith("card-drop:")) {
      const card = findCardById(gameState, me, overId.replace("card-drop:", ""));
      if (card) {
        const source = isReservedCard(me, card.id) ? "reserved" : "market";
        const resetPayment = selectedCard?.id !== card.id;
        if (resetPayment) {
          setSelectedCardState(card);
          setSelectedCardSource(source);
        }
        stagePaymentGem(payload.color, card, resetPayment ? {} : stagedPayment, resetPayment);
      }
    } else if ((payload.kind === "market-card" || payload.kind === "reserved-card") && overId === "selected-card-zone") {
      setSelectedCard(payload.card, payload.kind === "reserved-card" ? "reserved" : "market");
    } else if (payload.kind === "market-card" && overId === "reserve-zone") {
      stageReserveCard(payload.card);
    } else if (payload.kind === "deck" && overId === "reserve-zone") {
      stageReserveDeck(payload.tier);
    } else {
      setNotice("这里不能放置这个对象。");
    }
  };

  const onDragCancel = (event: DragCancelEvent) => {
    const payload = activeDragRef.current;
    const cancelPoint = payload ? pointFromDragDelta(event) : null;
    if (payload && cancelPoint) emitTrace("cancel", payload, cancelPoint);
    setActiveDrag(null);
    setActiveDragPoint(null);
    activeDragRef.current = null;
    initialClientPointRef.current = null;
    initialTracePointRef.current = null;
    latestTracePointRef.current = null;
    traceIdRef.current = "";
  };

  const value: BoardDragContextValue = {
    activeDrag,
    activeDragPoint,
    selectedCard,
    selectedCardSource,
    stagedTakeGems,
    stagedPayment,
    stagedDiscard,
    stagedReserve,
    notice,
    isMyTurn,
    mustDiscard,
    paymentPlan,
    setSelectedCard,
    stageTakeGem,
    stagePaymentGem,
    stageDiscardGem,
    stageReserveCard,
    stageReserveDeck,
    clearStagedTake: () => setStagedTakeGems([]),
    clearPayment: () => setStagedPayment({}),
    clearDiscard: () => setStagedDiscard({}),
    clearReserve: () => setStagedReserve(null),
    confirmTake,
    canConfirmTake: takeValidation.valid,
    confirmBuy,
    confirmReserve,
    confirmDiscard,
    describeTake: takeValidation.text,
    variant: gameState.variant,
    colorLabels,
    tokenImages,
    availableEvolutions,
    canHandleEvolution,
    confirmEvolution,
    skipEvolution,
    remoteIntent: remoteIntent ?? null,
  };

  return (
    <BoardDragContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={tabletopCollisionDetection}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
            frequency: 16,
          },
        }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {children}
        <RemoteTraceLayer traces={remoteTraces} clickEffects={remoteClickEffects} variant={gameState.variant} />
        <RemoteIntentLayer event={remoteIntent ?? null} gameState={gameState} />
        <DragOverlay>
          {activeDrag ? (
            <div className={`drag-overlay ${activeDrag.kind.includes("gem") ? "token" : "card"}`}>
              {activeDrag.kind === "bank-gem" || activeDrag.kind === "my-gem" ? (
                <img src={tokenImages[activeDrag.color]} alt="" />
              ) : activeDrag.kind === "deck" ? (
                <strong>{activeDrag.tier}</strong>
              ) : (
                <img src={cardImageUrl(activeDrag.card.id, activeDrag.card)} alt="" />
              )}
              <span>{dragLabel(activeDrag, colorLabels)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </BoardDragContext.Provider>
  );
}

function findCardById(gameState: GameState, me: PlayerState, cardId: string): Card | null {
  const marketCards = [
    ...gameState.tier1.faceUp,
    ...gameState.tier2.faceUp,
    ...gameState.tier3.faceUp,
    ...(gameState.rare?.faceUp ?? []),
    ...(gameState.legendary?.faceUp ?? []),
  ].filter(Boolean) as Card[];
  const reservedCard = me.reservedCards.find((card) => !isHiddenCard(card) && card.id === cardId);
  return marketCards.find((card) => card.id === cardId) ?? (reservedCard && !isHiddenCard(reservedCard) ? reservedCard : null);
}

function isReservedCard(me: PlayerState, cardId: string) {
  return me.reservedCards.some((card) => !isHiddenCard(card) && card.id === cardId);
}

function TraceItemVisual({ item, variant }: { item: TraceItem; variant: GameVariant }) {
  const traceTokenImages = tokenImagesFor(variant);
  switch (item.kind) {
    case "cursor":
      return (
        <svg className="remote-cursor-glyph" viewBox="0 0 28 34" aria-hidden="true">
          <path d="M5 3.5v25.2l6.8-6.2 4 8.4 4.5-2.1-4.2-8.2h8.8L5 3.5Z" />
        </svg>
      );
    case "bank-gem":
    case "my-gem":
      return <img src={traceTokenImages[item.color]} alt="" />;
    case "market-card":
      return <img src={cardImageUrl(item.cardId, { image: item.image })} alt="" />;
    case "deck":
    case "reserved-card":
      return (
        <>
          <img src={deckBackUrl(item.tier, variant)} alt="" />
          <b>{item.kind === "deck" ? item.tier : "藏"}</b>
        </>
      );
  }
}

function RemoteTraceLayer({ traces, clickEffects, variant }: { traces: RemoteTrace[]; clickEffects: RemoteClickEffect[]; variant: GameVariant }) {
  if (!traces.length && !clickEffects.length) return null;
  const labels = colorLabelsFor(variant);

  return (
    <div className="remote-trace-layer" aria-hidden="true">
      {traces.map((trace) => {
        const resolvedPoints = trace.points.map(resolveTracePoint);
        const points = resolvedPoints.map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`).join(" ");
        const traceKind = trace.item.kind === "cursor" ? "cursor" : trace.item.kind.includes("gem") ? "token" : "card";
        const style = {
          "--trace-color": traceColorFor(trace.playerId, trace.avatarId),
          "--trace-x": `${trace.renderX * 100}%`,
          "--trace-y": `${trace.renderY * 100}%`,
        } as CSSProperties;

        return (
          <div key={trace.traceId} className={`remote-trace ${trace.finishing ? "finishing" : ""}`} style={style}>
            {trace.item.kind !== "cursor" && trace.points.length > 1 ? (
              <svg className="remote-trace-path" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline points={points} />
              </svg>
            ) : null}
            {trace.item.kind !== "cursor"
              ? resolvedPoints.slice(-5).map((point, index, visiblePoints) => (
                  <span
                    key={`${trace.points[Math.max(0, trace.points.length - visiblePoints.length + index)]?.at ?? index}-${index}`}
                    className="remote-trace-dot"
                    style={
                      {
                        "--trace-dot-x": `${point.x * 100}%`,
                        "--trace-dot-y": `${point.y * 100}%`,
                        "--trace-dot-alpha": 0.24 + (index + 1) / visiblePoints.length / 2,
                      } as CSSProperties
                    }
                  />
                ))
              : null}
            {trace.item.kind === "cursor" ? (
              <div className="remote-cursor-pointer">
                <TraceItemVisual item={trace.item} variant={variant} />
                <strong>{trace.username}</strong>
              </div>
            ) : (
              <div className={`remote-trace-figure ${traceKind}`}>
                <span className="remote-trace-avatar">{AVATARS[trace.avatarId % AVATARS.length]}</span>
                <span className="remote-trace-object">
                  <TraceItemVisual item={trace.item} variant={variant} />
                </span>
                <span className="remote-trace-label">
                  <strong>{trace.username}</strong>
                  <em>{traceItemLabel(trace.item, labels)}</em>
                </span>
              </div>
            )}
          </div>
        );
      })}
      {clickEffects.map((effect) => (
        <span
          key={effect.id}
          className="remote-click-effect"
          style={
            {
              "--trace-color": traceColorFor(effect.playerId, effect.avatarId),
              "--trace-x": `${effect.renderX * 100}%`,
              "--trace-y": `${effect.renderY * 100}%`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function intentLabel(intent: RoomIntent, variant: GameVariant, labels: Record<GemColor, string>) {
  const tokenText = variant === "pokemon" ? "精灵球" : "宝石";
  const cardText = variant === "pokemon" ? "宝可梦" : "卡牌";
  switch (intent.type) {
    case "hoverGem":
      return intent.color ? `正在查看${labels[intent.color]}` : `正在查看${tokenText}`;
    case "gemSelection":
      return intent.valid ? `准备拿取 ${intent.colors.map((color) => labels[color]).join("、")}` : "正在尝试拿取组合";
    case "hoverCard":
      return `正在查看${cardText}`;
    case "paymentTarget":
      return intent.valid ? `准备支付购买${cardText}` : `正在核对支付${cardText}`;
    case "reserveTarget":
      return intent.valid === false ? "预留目标不可用" : `准备预留${cardText}`;
    case "discardSelection":
      return intent.valid ? `正在选择弃置${tokenText}` : "弃置数量还不够";
    case "evolutionTarget":
      return intent.valid ? "正在选择进化目标" : "正在查看进化目标";
    case "clear":
      return "";
  }
}

function RemoteIntentLayer({ event, gameState }: { event: RoomIntentEvent | null; gameState: GameState }) {
  if (!event || event.intent.type === "clear") return null;
  const player = gameState.players.find((item) => item.id === event.playerId);
  const labels = colorLabelsFor(gameState.variant);
  const color = traceColorFor(event.playerId, player?.avatarId ?? 0);
  const text = intentLabel(event.intent, gameState.variant, labels);
  const intentKind = event.intent.type.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

  return (
    <div className={`remote-intent-layer remote-intent-${intentKind}`} aria-hidden="true">
      <div className="remote-intent-pill" style={{ "--intent-color": color } as CSSProperties}>
        <span className="remote-intent-avatar">{AVATARS[(player?.avatarId ?? 0) % AVATARS.length]}</span>
        <strong>{player?.username ?? "其他玩家"}</strong>
        <em>{text}</em>
      </div>
    </div>
  );
}

export function useBoardDrag() {
  const context = useContext(BoardDragContext);
  if (!context) throw new Error("useBoardDrag must be used within BoardDragProvider");
  return context;
}

export function Draggable({
  id,
  data,
  disabled,
  className,
  children,
}: {
  id: string;
  data: DragPayload;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data, disabled });
  const style: CSSProperties = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {};
  return (
    <div ref={setNodeRef} className={`${className ?? ""} ${isDragging ? "dragging" : ""}`} style={style} data-cursor-anchor={id} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

export function DropZone({
  id,
  className,
  children,
  onDoubleClick,
  label,
}: {
  id: string;
  className?: string;
  children: ReactNode;
  onDoubleClick?: () => void;
  label?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "is-over" : ""}`}
      data-cursor-anchor={id}
      onDoubleClick={onDoubleClick}
      role={onDoubleClick ? "button" : undefined}
      tabIndex={onDoubleClick ? 0 : undefined}
      aria-label={label}
      onKeyDown={(event) => {
        if (onDoubleClick && (event.key === "Enter" || event.key === " ")) onDoubleClick();
      }}
    >
      {children}
    </div>
  );
}

export type { DragPayload, PaymentPlan };
