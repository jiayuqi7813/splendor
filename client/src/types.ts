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

export const COLOR_CN = COLOR_LABELS;

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

export const colorRing = COLOR_ACCENTS;

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
