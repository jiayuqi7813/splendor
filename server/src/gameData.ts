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

export interface Noble {
  id: string;
  prestige: number;
  req: Costs;
}

export const BASIC_COLORS: BasicColor[] = ["white", "blue", "green", "red", "brown"];
export const ALL_COLORS: GemColor[] = ["white", "blue", "green", "red", "brown", "gold"];

export const emptyGems = (): Gems => ({ white: 0, blue: 0, green: 0, red: 0, brown: 0, gold: 0 });
export const emptyCosts = (): Costs => ({ white: 0, blue: 0, green: 0, red: 0, brown: 0 });

const c = (w: number, bl: number, g: number, r: number, br: number): Costs => ({
  white: w,
  blue: bl,
  green: g,
  red: r,
  brown: br,
});

export const DEVELOPMENT_CARDS: Card[] = [
  { id: "01", tier: 1, color: "white", prestige: 1, cost: c(0, 0, 4, 0, 0) },
  { id: "02", tier: 1, color: "blue", prestige: 1, cost: c(0, 0, 0, 4, 0) },
  { id: "03", tier: 1, color: "green", prestige: 1, cost: c(0, 0, 0, 0, 4) },
  { id: "04", tier: 1, color: "red", prestige: 1, cost: c(4, 0, 0, 0, 0) },
  { id: "05", tier: 1, color: "brown", prestige: 1, cost: c(0, 4, 0, 0, 0) },
  { id: "06", tier: 1, color: "white", prestige: 0, cost: c(3, 1, 0, 0, 1) },
  { id: "07", tier: 1, color: "blue", prestige: 0, cost: c(0, 1, 3, 1, 0) },
  { id: "08", tier: 1, color: "green", prestige: 0, cost: c(1, 3, 1, 0, 0) },
  { id: "09", tier: 1, color: "red", prestige: 0, cost: c(1, 0, 0, 1, 3) },
  { id: "010", tier: 1, color: "brown", prestige: 0, cost: c(0, 0, 1, 3, 1) },
  { id: "011", tier: 1, color: "white", prestige: 0, cost: c(0, 3, 0, 0, 0) },
  { id: "012", tier: 1, color: "blue", prestige: 0, cost: c(0, 0, 0, 0, 3) },
  { id: "013", tier: 1, color: "green", prestige: 0, cost: c(0, 0, 0, 3, 0) },
  { id: "014", tier: 1, color: "red", prestige: 0, cost: c(3, 0, 0, 0, 0) },
  { id: "015", tier: 1, color: "brown", prestige: 0, cost: c(0, 0, 3, 0, 0) },
  { id: "016", tier: 1, color: "white", prestige: 0, cost: c(0, 2, 2, 0, 1) },
  { id: "017", tier: 1, color: "blue", prestige: 0, cost: c(1, 0, 2, 2, 0) },
  { id: "018", tier: 1, color: "green", prestige: 0, cost: c(0, 1, 0, 2, 2) },
  { id: "019", tier: 1, color: "red", prestige: 0, cost: c(2, 0, 1, 0, 2) },
  { id: "020", tier: 1, color: "brown", prestige: 0, cost: c(2, 2, 0, 1, 0) },
  { id: "021", tier: 1, color: "white", prestige: 0, cost: c(0, 2, 0, 0, 2) },
  { id: "022", tier: 1, color: "blue", prestige: 0, cost: c(0, 0, 2, 0, 2) },
  { id: "023", tier: 1, color: "green", prestige: 0, cost: c(0, 2, 0, 2, 0) },
  { id: "024", tier: 1, color: "red", prestige: 0, cost: c(2, 0, 0, 2, 0) },
  { id: "025", tier: 1, color: "brown", prestige: 0, cost: c(2, 0, 2, 0, 0) },
  { id: "026", tier: 1, color: "white", prestige: 0, cost: c(0, 1, 2, 1, 1) },
  { id: "027", tier: 1, color: "blue", prestige: 0, cost: c(1, 0, 1, 2, 1) },
  { id: "028", tier: 1, color: "green", prestige: 0, cost: c(1, 1, 0, 1, 2) },
  { id: "029", tier: 1, color: "red", prestige: 0, cost: c(2, 1, 1, 0, 1) },
  { id: "030", tier: 1, color: "brown", prestige: 0, cost: c(1, 2, 1, 1, 0) },
  { id: "031", tier: 1, color: "white", prestige: 0, cost: c(0, 0, 0, 2, 1) },
  { id: "032", tier: 1, color: "blue", prestige: 0, cost: c(1, 0, 0, 0, 2) },
  { id: "033", tier: 1, color: "green", prestige: 0, cost: c(2, 1, 0, 0, 0) },
  { id: "034", tier: 1, color: "red", prestige: 0, cost: c(0, 2, 1, 0, 0) },
  { id: "035", tier: 1, color: "brown", prestige: 0, cost: c(0, 0, 2, 1, 0) },
  { id: "036", tier: 1, color: "white", prestige: 0, cost: c(0, 1, 1, 1, 1) },
  { id: "037", tier: 1, color: "blue", prestige: 0, cost: c(1, 0, 1, 1, 1) },
  { id: "038", tier: 1, color: "green", prestige: 0, cost: c(1, 1, 0, 1, 1) },
  { id: "039", tier: 1, color: "red", prestige: 0, cost: c(1, 1, 1, 0, 1) },
  { id: "040", tier: 1, color: "brown", prestige: 0, cost: c(1, 1, 1, 1, 0) },
  { id: "041", tier: 2, color: "white", prestige: 1, cost: c(0, 0, 3, 2, 2) },
  { id: "042", tier: 2, color: "blue", prestige: 1, cost: c(0, 2, 2, 3, 0) },
  { id: "043", tier: 2, color: "green", prestige: 1, cost: c(2, 3, 0, 0, 2) },
  { id: "044", tier: 2, color: "red", prestige: 1, cost: c(2, 0, 0, 2, 3) },
  { id: "045", tier: 2, color: "brown", prestige: 1, cost: c(3, 2, 2, 0, 0) },
  { id: "046", tier: 2, color: "white", prestige: 1, cost: c(2, 3, 0, 3, 0) },
  { id: "047", tier: 2, color: "blue", prestige: 1, cost: c(0, 2, 3, 0, 3) },
  { id: "048", tier: 2, color: "green", prestige: 1, cost: c(3, 0, 2, 3, 0) },
  { id: "049", tier: 2, color: "red", prestige: 1, cost: c(0, 3, 0, 2, 3) },
  { id: "050", tier: 2, color: "brown", prestige: 1, cost: c(3, 0, 3, 0, 2) },
  { id: "051", tier: 2, color: "white", prestige: 3, cost: c(6, 0, 0, 0, 0) },
  { id: "052", tier: 2, color: "blue", prestige: 3, cost: c(0, 6, 0, 0, 0) },
  { id: "053", tier: 2, color: "green", prestige: 3, cost: c(0, 0, 6, 0, 0) },
  { id: "054", tier: 2, color: "red", prestige: 3, cost: c(0, 0, 0, 6, 0) },
  { id: "055", tier: 2, color: "brown", prestige: 3, cost: c(0, 0, 0, 0, 6) },
  { id: "056", tier: 2, color: "white", prestige: 2, cost: c(0, 0, 1, 4, 2) },
  { id: "057", tier: 2, color: "blue", prestige: 2, cost: c(2, 0, 0, 1, 4) },
  { id: "058", tier: 2, color: "green", prestige: 2, cost: c(4, 2, 0, 0, 1) },
  { id: "059", tier: 2, color: "red", prestige: 2, cost: c(1, 4, 2, 0, 0) },
  { id: "060", tier: 2, color: "brown", prestige: 2, cost: c(0, 1, 4, 2, 0) },
  { id: "061", tier: 2, color: "white", prestige: 2, cost: c(0, 0, 0, 5, 0) },
  { id: "062", tier: 2, color: "blue", prestige: 2, cost: c(0, 5, 0, 0, 0) },
  { id: "063", tier: 2, color: "green", prestige: 2, cost: c(0, 0, 5, 0, 0) },
  { id: "064", tier: 2, color: "red", prestige: 2, cost: c(0, 0, 0, 0, 5) },
  { id: "065", tier: 2, color: "brown", prestige: 2, cost: c(5, 0, 0, 0, 0) },
  { id: "066", tier: 2, color: "white", prestige: 2, cost: c(0, 0, 0, 5, 3) },
  { id: "067", tier: 2, color: "blue", prestige: 2, cost: c(5, 3, 0, 0, 0) },
  { id: "068", tier: 2, color: "green", prestige: 2, cost: c(0, 5, 3, 0, 0) },
  { id: "069", tier: 2, color: "red", prestige: 2, cost: c(3, 0, 0, 0, 5) },
  { id: "070", tier: 2, color: "brown", prestige: 2, cost: c(0, 0, 5, 3, 0) },
  { id: "071", tier: 3, color: "white", prestige: 3, cost: c(0, 3, 3, 5, 3) },
  { id: "072", tier: 3, color: "blue", prestige: 3, cost: c(3, 0, 3, 3, 5) },
  { id: "073", tier: 3, color: "green", prestige: 3, cost: c(5, 3, 0, 3, 3) },
  { id: "074", tier: 3, color: "red", prestige: 3, cost: c(3, 5, 3, 0, 3) },
  { id: "075", tier: 3, color: "brown", prestige: 3, cost: c(3, 3, 5, 3, 0) },
  { id: "076", tier: 3, color: "white", prestige: 4, cost: c(0, 0, 0, 0, 7) },
  { id: "077", tier: 3, color: "blue", prestige: 4, cost: c(7, 0, 0, 0, 0) },
  { id: "078", tier: 3, color: "green", prestige: 4, cost: c(0, 7, 0, 0, 0) },
  { id: "079", tier: 3, color: "red", prestige: 4, cost: c(0, 0, 7, 0, 0) },
  { id: "080", tier: 3, color: "brown", prestige: 4, cost: c(0, 0, 0, 7, 0) },
  { id: "081", tier: 3, color: "white", prestige: 4, cost: c(3, 0, 0, 3, 6) },
  { id: "082", tier: 3, color: "blue", prestige: 4, cost: c(6, 3, 0, 0, 3) },
  { id: "083", tier: 3, color: "green", prestige: 4, cost: c(3, 6, 3, 0, 0) },
  { id: "084", tier: 3, color: "red", prestige: 4, cost: c(0, 3, 6, 3, 0) },
  { id: "085", tier: 3, color: "brown", prestige: 4, cost: c(0, 0, 3, 6, 3) },
  { id: "086", tier: 3, color: "white", prestige: 5, cost: c(3, 0, 0, 0, 7) },
  { id: "087", tier: 3, color: "blue", prestige: 5, cost: c(7, 3, 0, 0, 0) },
  { id: "088", tier: 3, color: "green", prestige: 5, cost: c(0, 7, 3, 0, 0) },
  { id: "089", tier: 3, color: "red", prestige: 5, cost: c(0, 0, 7, 3, 0) },
  { id: "090", tier: 3, color: "brown", prestige: 5, cost: c(0, 0, 0, 7, 3) },
];

export const NOBLES: Noble[] = [
  { id: "20001", prestige: 3, req: c(4, 4, 0, 0, 0) },
  { id: "20002", prestige: 3, req: c(0, 4, 4, 0, 0) },
  { id: "20003", prestige: 3, req: c(0, 0, 4, 4, 0) },
  { id: "20004", prestige: 3, req: c(0, 0, 0, 4, 4) },
  { id: "20005", prestige: 3, req: c(4, 0, 0, 0, 4) },
  { id: "20006", prestige: 3, req: c(3, 3, 0, 0, 3) },
  { id: "20007", prestige: 3, req: c(3, 3, 3, 0, 0) },
  { id: "20008", prestige: 3, req: c(0, 3, 3, 3, 0) },
  { id: "20009", prestige: 3, req: c(0, 0, 3, 3, 3) },
  { id: "20010", prestige: 3, req: c(3, 0, 0, 3, 3) },
];
