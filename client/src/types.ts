export type GemColor = "white" | "blue" | "green" | "red" | "brown" | "gold";
export type BasicColor = Exclude<GemColor, "gold">;
export type Gems = Record<GemColor, number>;
export type Costs = Record<BasicColor, number>;

export interface Card {
  id: string;
  tier: 1 | 2 | 3;
  color: BasicColor;
  prestige: number;
  cost: Costs;
}

export interface HiddenCard {
  id: string;
  hidden: true;
  tier?: 1 | 2 | 3;
}

export type ReservedCard = Card | HiddenCard;

export interface Noble {
  id: string;
  prestige: number;
  req: Costs;
}

export interface PlayerState {
  id: string;
  username: string;
  avatarId: number;
  isHost: boolean;
  gems: Gems;
  bonuses: Costs;
  purchasedCards: Card[];
  reservedCards: ReservedCard[];
  nobles: Noble[];
  prestige: number;
  connected?: boolean;
  turnsTaken?: number;
}

export interface TierState {
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
  tier1: TierState;
  tier2: TierState;
  tier3: TierState;
  nobles: Noble[];
  players: PlayerState[];
  myPlayerId: string;
  winner: PlayerState | null;
  lastAction: string | null;
  pendingDiscardPlayerId?: string | null;
  gameOverReason?: string | null;
}

export interface RoomState {
  roomId: string;
  players: PlayerState[];
  hostId: string;
  phase: "waiting" | "playing" | "finalRound" | "ended";
  started: boolean;
  createdAt: number;
  lastActivity: number;
}

export interface GameOverPayload {
  winner: PlayerState;
  finalScores: PlayerState[];
  reason: string;
}

export const BASIC_COLORS: BasicColor[] = ["white", "blue", "green", "red", "brown"];
export const ALL_COLORS: GemColor[] = ["white", "blue", "green", "red", "brown", "gold"];

export const COLOR_LABELS: Record<GemColor, string> = {
  white: "钻石",
  blue: "蓝宝石",
  green: "翡翠",
  red: "红宝石",
  brown: "玛瑙",
  gold: "黄金",
};

export const COLOR_SHORT_LABELS: Record<BasicColor, string> = {
  white: "白",
  blue: "蓝",
  green: "绿",
  red: "红",
  brown: "棕",
};

export const COLOR_ACCENTS: Record<GemColor, string> = {
  white: "border-slate-100 text-slate-100",
  blue: "border-[#1a6fc4] text-blue-200",
  green: "border-[#1a9c4a] text-emerald-200",
  red: "border-[#c41a1a] text-red-200",
  brown: "border-[#8b4513] text-amber-700",
  gold: "border-[#ffd700] text-yellow-200",
};

export const COLOR_DOTS: Record<BasicColor, string> = {
  white: "#e5e7eb",
  blue: "#1a6fc4",
  green: "#1a9c4a",
  red: "#c41a1a",
  brown: "#8b4513",
};

export const BASE_IMAGE_URL = "https://raw.githubusercontent.com/hexanome-04/splendor/master/client/public/images";
export const BACKGROUND_URL = `${BASE_IMAGE_URL}/bluebackground.jpg`;

export function cardImageUrl(id: string) {
  return `${BASE_IMAGE_URL}/development-cards/${id}.jpg`;
}

export function nobleImageUrl(id: string) {
  return `${BASE_IMAGE_URL}/nobles/${id}.jpg`;
}

export function tokenImageUrl(color: GemColor) {
  const names: Record<GemColor, string> = {
    white: "WhiteToken",
    blue: "BlueToken",
    green: "GreenToken",
    red: "RedToken",
    brown: "BrownToken",
    gold: "GoldToken",
  };
  return `${BASE_IMAGE_URL}/tokens/${names[color]}.jpg`;
}

export function deckBackUrl(tier: 1 | 2 | 3) {
  const file = tier === 1 ? "GreenCard.jpg" : tier === 2 ? "YellowCard.jpg" : "BlueCard.jpg";
  return `${BASE_IMAGE_URL}/${file}`;
}

export function isHiddenCard(card: ReservedCard): card is HiddenCard {
  return "hidden" in card && card.hidden === true;
}

export const AVATARS = ["👑", "🔮", "💎", "🏺", "⚔️", "🧙", "🦁", "🐉", "🌟", "🎭", "🔥", "🌙"];
export const AVATAR_BACKGROUNDS = [
  "from-amber-400 to-yellow-700",
  "from-purple-400 to-indigo-800",
  "from-sky-300 to-blue-700",
  "from-orange-300 to-stone-700",
  "from-slate-300 to-red-800",
  "from-violet-300 to-fuchsia-800",
  "from-yellow-300 to-orange-700",
  "from-emerald-300 to-teal-800",
  "from-yellow-200 to-pink-600",
  "from-rose-300 to-purple-800",
  "from-red-400 to-amber-700",
  "from-blue-200 to-slate-900",
];

export function totalTokens(gems: Gems) {
  return ALL_COLORS.reduce((sum, color) => sum + gems[color], 0);
}

export const TOKEN_IMAGES: Record<GemColor, string> = {
  white: tokenImageUrl("white"),
  blue: tokenImageUrl("blue"),
  green: tokenImageUrl("green"),
  red: tokenImageUrl("red"),
  brown: tokenImageUrl("brown"),
  gold: tokenImageUrl("gold"),
};

export const BACK_IMAGES: Record<1 | 2 | 3, string> = {
  1: deckBackUrl(1),
  2: deckBackUrl(2),
  3: deckBackUrl(3),
};

export const COLOR_CN = COLOR_LABELS;
export const COST_KEYS = BASIC_COLORS;
export const gemColors = ALL_COLORS;
export const TOKEN_IMAGE = TOKEN_IMAGES;
export const CARD_IMAGES = cardImageUrl;

export const colorRing: Record<GemColor, string> = {
  white: "border-slate-100",
  blue: "border-[#1a6fc4]",
  green: "border-[#1a9c4a]",
  red: "border-[#c41a1a]",
  brown: "border-[#8b4513]",
  gold: "border-[#ffd700]",
};

export const colorNames = COLOR_LABELS;
export const tokenUrl = tokenImageUrl;
export const colorStyles: Record<GemColor, { border: string; text: string; dot: string }> = {
  white: { border: "border-slate-200/50", text: "text-slate-100", dot: "#e5e7eb" },
  blue: { border: "border-blue-400/50", text: "text-blue-200", dot: "#1a6fc4" },
  green: { border: "border-emerald-400/50", text: "text-emerald-200", dot: "#1a9c4a" },
  red: { border: "border-red-400/50", text: "text-red-200", dot: "#c41a1a" },
  brown: { border: "border-amber-800/60", text: "text-amber-700", dot: "#8b4513" },
  gold: { border: "border-yellow-300/60", text: "text-yellow-200", dot: "#ffd700" },
};

export const GEM_VISUALS: Record<GemColor, { label: string; short: string; gradient: string; glow: string; ring: string; ink: string }> = {
  white: {
    label: "钻石",
    short: "白",
    gradient: "from-slate-50 via-cyan-100 to-slate-300",
    glow: "shadow-[0_0_26px_rgba(244,247,251,.45)]",
    ring: "border-slate-100",
    ink: "text-slate-50",
  },
  blue: {
    label: "蓝宝石",
    short: "蓝",
    gradient: "from-blue-300 via-[#1a6fc4] to-blue-950",
    glow: "shadow-[0_0_26px_rgba(26,111,196,.55)]",
    ring: "border-blue-300",
    ink: "text-blue-200",
  },
  green: {
    label: "翡翠",
    short: "绿",
    gradient: "from-emerald-200 via-[#1a9c4a] to-emerald-950",
    glow: "shadow-[0_0_26px_rgba(26,156,74,.55)]",
    ring: "border-emerald-300",
    ink: "text-emerald-200",
  },
  red: {
    label: "红宝石",
    short: "红",
    gradient: "from-red-300 via-[#c41a1a] to-red-950",
    glow: "shadow-[0_0_26px_rgba(196,26,26,.55)]",
    ring: "border-red-300",
    ink: "text-red-200",
  },
  brown: {
    label: "玛瑙",
    short: "棕",
    gradient: "from-amber-500 via-[#8b4513] to-stone-950",
    glow: "shadow-[0_0_26px_rgba(139,69,19,.55)]",
    ring: "border-amber-700",
    ink: "text-amber-300",
  },
  gold: {
    label: "黄金",
    short: "金",
    gradient: "from-yellow-200 via-[#ffd700] to-amber-700",
    glow: "shadow-[0_0_30px_rgba(255,215,0,.62)]",
    ring: "border-yellow-200",
    ink: "text-yellow-200",
  },
};

export const TIER_VISUALS: Record<1 | 2 | 3, { title: string; label: string; subtitle: string; accent: string; roman: string; gradient: string }> = {
  1: { title: "一级发展卡", label: "一级", subtitle: "商路学徒", accent: "text-emerald-200", roman: "I", gradient: "from-emerald-500/30 via-emerald-900/20 to-slate-950" },
  2: { title: "二级发展卡", label: "二级", subtitle: "工坊大师", accent: "text-amber-200", roman: "II", gradient: "from-amber-500/30 via-yellow-900/20 to-slate-950" },
  3: { title: "三级发展卡", label: "三级", subtitle: "宫廷巨匠", accent: "text-blue-200", roman: "III", gradient: "from-blue-500/30 via-indigo-900/20 to-slate-950" },
};
