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

export const COLOR_CLASS: Record<GemColor, string> = {
  white: "bg-slate-100 text-slate-900 border-slate-300",
  blue: "bg-[#1a6fc4] text-white border-blue-300",
  green: "bg-[#1a9c4a] text-white border-green-300",
  red: "bg-[#c41a1a] text-white border-red-300",
  brown: "bg-[#8b4513] text-white border-amber-900",
  gold: "bg-[#ffd700] text-slate-900 border-yellow-200",
};

export const BASE_IMAGE_URL = "https://raw.githubusercontent.com/hexanome-04/splendor/master/client/public/images";

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

export function backgroundUrl() {
  return `${BASE_IMAGE_URL}/bluebackground.jpg`;
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
