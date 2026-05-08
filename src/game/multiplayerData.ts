export type GemColor = "white" | "blue" | "green" | "red" | "brown" | "gold";
export type BasicColor = Exclude<GemColor, "gold">;
export type GameVariant = "classic" | "pokemon";
export type CardDeckKind = "common" | "rare" | "legendary";
export type PokemonSpecialSet = "primary" | "alternate";
export type Gems = Record<GemColor, number>;
export type Costs = Record<BasicColor, number>;

export interface Card {
  id: string;
  tier: 1 | 2 | 3;
  color: BasicColor;
  prestige: number;
  cost: Costs;
  variant?: GameVariant;
  deckKind?: CardDeckKind;
  pokemonSpecialSet?: PokemonSpecialSet;
  name?: string;
  image?: string;
  goldCost?: number;
  bonusColors?: BasicColor[];
  evolvesFrom?: string;
  evolutionCost?: Costs;
  reservedHidden?: boolean;
}

export interface Noble {
  id: string;
  prestige: number;
  req: Costs;
  image?: string;
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

const CLASSIC_DEVELOPMENT_CARDS: Card[] = [
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

function classicCardImage(card: Card): string {
  return `/assets/splendor-base/cards/card-${card.id}.jpg`;
}

function classicNobleImage(noble: Noble): string {
  return `/assets/splendor-base/nobles/noble-${noble.id}.jpg`;
}

export const DEVELOPMENT_CARDS: Card[] = CLASSIC_DEVELOPMENT_CARDS.map((card) => ({
  ...card,
  variant: "classic",
  image: classicCardImage(card),
}));

const CLASSIC_NOBLES: Noble[] = [
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

export const NOBLES: Noble[] = CLASSIC_NOBLES.map((noble) => ({
  ...noble,
  image: classicNobleImage(noble),
}));

const pokemonNames = [
  "迷你龙",
  "哈克龙",
  "快龙",
  "伊布",
  "超梦",
  "迷你龙",
  "走路草",
  "走路草",
  "走路草",
  "独角虫",
  "独角虫",
  "小火龙",
  "小火龙",
  "波波",
  "波波",
  "波波",
  "凯西",
  "凯西",
  "绿毛虫",
  "绿毛虫",
  "蚊香蝌蚪",
  "蚊香蝌蚪",
  "蚊香蝌蚪",
  "喇叭芽",
  "喇叭芽",
  "喇叭芽",
  "腕力",
  "腕力",
  "杰尼龟",
  "杰尼龟",
  "妙蛙种子",
  "妙蛙种子",
  "鬼斯",
  "鬼斯",
  "尼多兰",
  "尼多兰",
  "尼多兰",
  "哈克龙",
  "臭臭花",
  "臭臭花",
  "铁壳蛹",
  "铁壳蛹",
  "火恐龙",
  "火恐龙",
  "比比鸟",
  "比比鸟",
  "勇基拉",
  "勇基拉",
  "铁甲蛹",
  "铁甲蛹",
  "蚊香君",
  "蚊香君",
  "豪力",
  "豪力",
  "卡咪龟",
  "卡咪龟",
  "口呆花",
  "口呆花",
  "鬼斯通",
  "鬼斯通",
  "妙蛙草",
  "妙蛙草",
  "尼多娜",
  "尼多娜",
  "大针蜂",
  "霸王花",
  "喷火龙",
  "隆隆岩",
  "大比鸟",
  "胡地",
  "巴大蝶",
  "蚊香泳士",
  "水箭龟",
  "怪力",
  "大食花",
  "耿鬼",
  "尼多后",
  "妙蛙花",
  "百变怪",
  "卡比兽",
  "拉普拉斯",
  "化石翼龙",
  "小刚的大岩蛇",
  "火箭队的果然翁",
  "小刚的可达鸭",
  "火箭队的喵喵",
  "梦幻",
  "火焰鸟",
  "闪电鸟",
  "急冻鸟",
  "美洛耶塔",
  "凯路迪欧",
  "蒂安希",
  "比克提尼",
  "捷拉奥拉",
  "小智的皮卡丘",
  "小拳石",
  "小拳石",
  "隆隆石",
  "隆隆石",
] as const;

const evolvesFromByName: Partial<Record<string, string>> = {
  哈克龙: "迷你龙",
  快龙: "哈克龙",
  臭臭花: "走路草",
  霸王花: "臭臭花",
  铁壳蛹: "独角虫",
  大针蜂: "铁壳蛹",
  火恐龙: "小火龙",
  喷火龙: "火恐龙",
  比比鸟: "波波",
  大比鸟: "比比鸟",
  勇基拉: "凯西",
  胡地: "勇基拉",
  铁甲蛹: "绿毛虫",
  巴大蝶: "铁甲蛹",
  蚊香君: "蚊香蝌蚪",
  蚊香泳士: "蚊香君",
  豪力: "腕力",
  怪力: "豪力",
  卡咪龟: "杰尼龟",
  水箭龟: "卡咪龟",
  口呆花: "喇叭芽",
  大食花: "口呆花",
  鬼斯通: "鬼斯",
  耿鬼: "鬼斯通",
  妙蛙草: "妙蛙种子",
  妙蛙花: "妙蛙草",
  尼多娜: "尼多兰",
  尼多后: "尼多娜",
  隆隆石: "小拳石",
  隆隆岩: "隆隆石",
};

function assetPath(folder: string, file: string) {
  return `/assets/pokemon-splendor/${folder}/${file}.webp`;
}

function pokemonCommonImage(tier: 1 | 2 | 3, serial: number) {
  return assetPath(`cards/stage${tier}`, `stage${tier}-${String(serial).padStart(3, "0")}`);
}

type PokemonCardStats = {
  prestige: number;
  bonusColors: BasicColor[];
  cost: Costs;
  goldCost?: number;
  evolutionCost?: Costs;
};

const pc = (
  prestige: number,
  bonusColors: BasicColor | BasicColor[],
  cost: Costs,
  evolutionCost?: Costs,
  goldCost?: number,
): PokemonCardStats => ({
  prestige,
  bonusColors: Array.isArray(bonusColors) ? bonusColors : [bonusColors],
  cost,
  evolutionCost,
  goldCost,
});

const POKEMON_ASSET_CARD_STATS: PokemonCardStats[] = [
  pc(1, "brown", c(0, 0, 3, 2, 0), c(0, 3, 0, 0, 0)),
  pc(3, "brown", c(4, 4, 1, 0, 0), c(0, 0, 4, 0, 0)),
  pc(5, "brown", c(7, 3, 0, 0, 0)),
  pc(0, ["brown", "brown"], c(0, 0, 3, 2, 0), undefined, 1),
  pc(2, ["brown", "brown"], c(3, 3, 0, 3, 0), undefined, 1),
  pc(1, "brown", c(0, 0, 0, 0, 4), c(0, 3, 0, 0, 0)),
  pc(0, "brown", c(2, 0, 0, 1, 0), c(0, 0, 2, 0, 0)),
  pc(0, "brown", c(0, 0, 2, 0, 2), c(0, 0, 2, 0, 0)),
  pc(0, "brown", c(0, 3, 0, 0, 0), c(0, 0, 2, 0, 0)),
  pc(0, "brown", c(1, 1, 1, 1, 0), c(0, 0, 0, 3, 0)),
  pc(0, "brown", c(1, 2, 0, 1, 0), c(0, 0, 0, 3, 0)),
  pc(1, "blue", c(2, 0, 0, 0, 3), c(0, 0, 3, 0, 0)),
  pc(1, "blue", c(0, 4, 0, 0, 0), c(0, 0, 3, 0, 0)),
  pc(0, "blue", c(0, 0, 2, 0, 1), c(0, 0, 0, 2, 0)),
  pc(0, "blue", c(0, 2, 0, 2, 0), c(0, 0, 0, 2, 0)),
  pc(0, "blue", c(3, 0, 0, 0, 0), c(0, 0, 0, 2, 0)),
  pc(1, "white", c(0, 3, 2, 0, 0), c(0, 0, 0, 3, 0)),
  pc(1, "white", c(4, 0, 0, 0, 0), c(0, 0, 0, 3, 0)),
  pc(0, "white", c(0, 1, 1, 1, 1), c(0, 3, 0, 0, 0)),
  pc(0, "white", c(0, 1, 1, 0, 2), c(0, 3, 0, 0, 0)),
  pc(0, "white", c(0, 2, 1, 0, 0), c(0, 0, 0, 0, 2)),
  pc(0, "white", c(2, 0, 0, 0, 2), c(0, 0, 0, 0, 2)),
  pc(0, "white", c(0, 0, 0, 3, 0), c(0, 0, 0, 0, 2)),
  pc(0, "red", c(0, 1, 0, 0, 2), c(2, 0, 0, 0, 0)),
  pc(0, "red", c(2, 0, 0, 2, 0), c(2, 0, 0, 0, 0)),
  pc(0, "red", c(0, 0, 3, 0, 0), c(2, 0, 0, 0, 0)),
  pc(0, "red", c(1, 1, 1, 0, 1), c(0, 0, 3, 0, 0)),
  pc(0, "red", c(1, 0, 2, 0, 1), c(0, 0, 3, 0, 0)),
  pc(1, "red", c(3, 2, 0, 0, 0), c(0, 0, 0, 0, 3)),
  pc(1, "red", c(0, 0, 0, 4, 0), c(0, 0, 0, 0, 3)),
  pc(1, "green", c(0, 0, 0, 3, 2), c(3, 0, 0, 0, 0)),
  pc(1, "green", c(0, 0, 4, 0, 0), c(3, 0, 0, 0, 0)),
  pc(0, "green", c(1, 1, 0, 1, 1), c(0, 0, 0, 0, 3)),
  pc(0, "green", c(2, 0, 0, 1, 1), c(0, 0, 0, 0, 3)),
  pc(0, "green", c(1, 0, 0, 2, 0), c(0, 2, 0, 0, 0)),
  pc(0, "green", c(0, 2, 2, 0, 0), c(0, 2, 0, 0, 0)),
  pc(0, "green", c(0, 0, 0, 0, 3), c(0, 2, 0, 0, 0)),
  pc(3, "brown", c(0, 0, 0, 0, 6), c(0, 0, 4, 0, 0)),
  pc(1, "brown", c(0, 2, 3, 2, 0), c(0, 0, 4, 0, 0)),
  pc(1, "brown", c(0, 2, 0, 2, 3), c(0, 0, 4, 0, 0)),
  pc(2, "brown", c(1, 2, 0, 4, 0), c(3, 0, 0, 0, 0)),
  pc(2, "brown", c(0, 0, 2, 0, 5), c(3, 0, 0, 0, 0)),
  pc(3, "blue", c(0, 0, 4, 1, 4), c(0, 0, 0, 4, 0)),
  pc(3, "blue", c(0, 6, 0, 0, 0), c(0, 0, 0, 4, 0)),
  pc(1, "blue", c(2, 0, 2, 3, 0), c(0, 0, 0, 4, 0)),
  pc(1, "blue", c(2, 3, 0, 0, 2), c(0, 0, 0, 4, 0)),
  pc(3, "white", c(0, 0, 4, 4, 1), c(0, 0, 0, 0, 4)),
  pc(3, "white", c(6, 0, 0, 0, 0), c(0, 0, 0, 0, 4)),
  pc(2, "white", c(0, 4, 1, 2, 0), c(0, 0, 3, 0, 0)),
  pc(2, "white", c(5, 0, 0, 0, 2), c(0, 0, 3, 0, 0)),
  pc(1, "white", c(0, 2, 0, 2, 3), c(0, 0, 0, 0, 4)),
  pc(1, "white", c(3, 2, 2, 0, 0), c(0, 0, 0, 0, 4)),
  pc(2, "red", c(0, 1, 4, 0, 2), c(0, 3, 0, 0, 0)),
  pc(2, "red", c(2, 0, 0, 5, 0), c(0, 3, 0, 0, 0)),
  pc(3, "red", c(1, 4, 0, 0, 4), c(4, 0, 0, 0, 0)),
  pc(3, "red", c(0, 0, 0, 6, 0), c(4, 0, 0, 0, 0)),
  pc(1, "red", c(3, 0, 2, 0, 2), c(4, 0, 0, 0, 0)),
  pc(1, "red", c(0, 0, 2, 3, 2), c(4, 0, 0, 0, 0)),
  pc(2, "green", c(2, 0, 0, 1, 4), c(0, 0, 0, 3, 0)),
  pc(2, "green", c(0, 2, 5, 0, 0), c(0, 0, 0, 3, 0)),
  pc(3, "green", c(4, 1, 0, 4, 0), c(0, 4, 0, 0, 0)),
  pc(3, "green", c(0, 0, 6, 0, 0), c(0, 4, 0, 0, 0)),
  pc(1, "green", c(2, 3, 0, 0, 2), c(0, 4, 0, 0, 0)),
  pc(1, "green", c(2, 0, 3, 2, 0), c(0, 4, 0, 0, 0)),
  pc(4, "brown", c(0, 0, 4, 6, 0)),
  pc(3, "brown", c(2, 2, 0, 0, 5)),
  pc(5, "blue", c(0, 0, 3, 0, 7)),
  pc(4, "blue", c(6, 0, 0, 4, 0)),
  pc(3, "blue", c(0, 5, 2, 0, 2)),
  pc(5, "white", c(0, 0, 7, 3, 0)),
  pc(4, "white", c(0, 6, 0, 0, 4)),
  pc(3, "white", c(5, 0, 2, 2, 0)),
  pc(5, "red", c(0, 7, 0, 0, 3)),
  pc(4, "red", c(4, 0, 6, 0, 0)),
  pc(3, "red", c(0, 2, 0, 5, 2)),
  pc(4, "green", c(0, 4, 0, 0, 6)),
  pc(3, "green", c(2, 0, 5, 2, 0)),
  pc(5, "green", c(3, 0, 0, 7, 0)),
  pc(0, ["blue", "blue"], c(3, 0, 2, 0, 0), undefined, 1),
  pc(0, ["white", "white"], c(0, 0, 0, 3, 2), undefined, 1),
  pc(0, ["red", "red"], c(0, 2, 0, 0, 3), undefined, 1),
  pc(0, ["green", "green"], c(2, 3, 0, 0, 0), undefined, 1),
  pc(0, ["brown", "brown"], c(0, 0, 3, 2, 0), undefined, 1),
  pc(0, ["blue", "blue"], c(3, 0, 2, 0, 0), undefined, 1),
  pc(0, ["white", "white"], c(0, 0, 0, 3, 2), undefined, 1),
  pc(0, ["red", "red"], c(0, 2, 0, 0, 3), undefined, 1),
  pc(2, ["blue", "blue"], c(0, 0, 3, 3, 3), undefined, 1),
  pc(2, ["white", "white"], c(0, 3, 3, 0, 3), undefined, 1),
  pc(2, ["red", "red"], c(3, 3, 3, 0, 0), undefined, 1),
  pc(2, ["green", "green"], c(3, 0, 0, 3, 3), undefined, 1),
];

type PokemonSourceCard = {
  id: string;
  name: string;
  image: string;
  stats: PokemonCardStats;
};

function pokemonSourceImage(index: number) {
  if (index < 40) return pokemonCommonImage(1, index + 1);
  if (index < 70) return pokemonCommonImage(2, index - 39);
  return pokemonCommonImage(3, index - 69);
}

function isPokemonSpecial(stats: PokemonCardStats) {
  return stats.bonusColors.length > 1 || (stats.goldCost ?? 0) > 0;
}

const pokemonEvolutionRoots = new Set(Object.values(evolvesFromByName));

function pokemonCommonTier(name: string): 1 | 2 | 3 {
  if (!evolvesFromByName[name]) return 1;
  return pokemonEvolutionRoots.has(name) ? 2 : 3;
}

function pokemonSourceToCommonCard(source: PokemonSourceCard): Card {
  const tier = pokemonCommonTier(source.name);
  return {
    id: source.id,
    tier,
    variant: "pokemon",
    deckKind: "common",
    name: source.name,
    image: source.image,
    color: source.stats.bonusColors[0],
    prestige: source.stats.prestige,
    cost: source.stats.cost,
    evolvesFrom: evolvesFromByName[source.name],
    evolutionCost: source.stats.evolutionCost,
  };
}

const pokemonBaseSources: PokemonSourceCard[] = POKEMON_ASSET_CARD_STATS.map((stats, index) => ({
  id: `pk-${DEVELOPMENT_CARDS[index]?.id ?? String(index + 1).padStart(2, "0")}`,
  name: pokemonNames[index] ?? `宝可梦 ${index + 1}`,
  image: pokemonSourceImage(index),
  stats,
}));

const pokemonLegendaryCommonSources: PokemonSourceCard[] = [
  {
    id: "pk-091",
    name: "小拳石",
    image: assetPath("cards/legendary", "legendary-002"),
    stats: pc(0, "blue", c(1, 0, 1, 1, 1), c(3, 0, 0, 0, 0)),
  },
  {
    id: "pk-092",
    name: "小拳石",
    image: assetPath("cards/legendary", "legendary-003"),
    stats: pc(0, "blue", c(0, 1, 1, 2, 0), c(3, 0, 0, 0, 0)),
  },
  {
    id: "pk-093",
    name: "隆隆石",
    image: assetPath("cards/legendary", "legendary-004"),
    stats: pc(2, "blue", c(4, 0, 2, 0, 1), c(0, 0, 0, 0, 3)),
  },
  {
    id: "pk-094",
    name: "隆隆石",
    image: assetPath("cards/legendary", "legendary-005"),
    stats: pc(2, "blue", c(0, 5, 0, 2, 0), c(0, 0, 0, 0, 3)),
  },
];

export const POKEMON_DEVELOPMENT_CARDS: Card[] = [
  ...pokemonBaseSources.filter((source) => !isPokemonSpecial(source.stats)),
  ...pokemonLegendaryCommonSources,
].map(pokemonSourceToCommonCard);

const special = (
  id: string,
  name: string,
  deckKind: Exclude<CardDeckKind, "common">,
  pokemonSpecialSet: PokemonSpecialSet,
  prestige: number,
  image: string,
  goldCost: number,
  bonusColors: BasicColor[],
  cost: Costs,
): Card => ({
  id,
  tier: 3,
  color: bonusColors[0],
  prestige,
  cost,
  variant: "pokemon",
  deckKind,
  pokemonSpecialSet,
  name,
  image,
  goldCost,
  bonusColors,
});

function pokemonSourceToSpecialCard(
  source: PokemonSourceCard,
  deckKind: Exclude<CardDeckKind, "common">,
  pokemonSpecialSet: PokemonSpecialSet,
  idPrefix: "pk-r" | "pk-l",
  index: number,
): Card {
  return special(
    `${idPrefix}${String(index + 1).padStart(2, "0")}`,
    source.name,
    deckKind,
    pokemonSpecialSet,
    source.stats.prestige,
    source.image,
    source.stats.goldCost ?? 1,
    source.stats.bonusColors,
    source.stats.cost,
  );
}

const pokemonEmbeddedSpecialSources = pokemonBaseSources.filter((source) => isPokemonSpecial(source.stats));

export const POKEMON_LEGACY_SPECIAL_CARD_IDS: readonly (readonly [number, string])[] = pokemonEmbeddedSpecialSources.map((source) => [
  30000 + Number(source.id.replace("pk-", "")),
  source.name,
] as const);

const pokemonPrintedRareSources: PokemonSourceCard[] = [
  { id: "pk-r-src-01", name: "美洛耶塔", image: assetPath("cards/rare", "rare-001"), stats: pc(2, ["brown", "brown"], c(3, 3, 0, 3, 0), undefined, 1) },
  { id: "pk-r-src-02", name: "凯路迪欧", image: assetPath("cards/rare", "rare-002"), stats: pc(2, ["blue", "blue"], c(0, 0, 3, 3, 3), undefined, 1) },
  { id: "pk-r-src-03", name: "蒂安希", image: assetPath("cards/rare", "rare-003"), stats: pc(2, ["white", "white"], c(0, 3, 3, 0, 3), undefined, 1) },
  { id: "pk-r-src-04", name: "比克提尼", image: assetPath("cards/rare", "rare-004"), stats: pc(2, ["red", "red"], c(3, 3, 3, 0, 0), undefined, 1) },
  { id: "pk-r-src-05", name: "捷拉奥拉", image: assetPath("cards/rare", "rare-005"), stats: pc(2, ["green", "green"], c(3, 0, 0, 3, 3), undefined, 1) },
];

const pokemonPrintedLegendarySources: PokemonSourceCard[] = [
  { id: "pk-l-src-01", name: "小智的皮卡丘", image: assetPath("cards/legendary", "legendary-001"), stats: pc(0, ["green", "green"], c(2, 3, 0, 0, 0), undefined, 1) },
];

function isPokemonLegendarySpecial(source: PokemonSourceCard): boolean {
  return source.stats.prestige === 0;
}

function isPokemonMythicalSpecial(source: PokemonSourceCard): boolean {
  return source.stats.prestige > 0;
}

const primaryLegendarySpecialNames = new Set(["小智的皮卡丘", "伊布", "百变怪", "卡比兽", "拉普拉斯"]);

export const POKEMON_RARE_CARDS: Card[] = [
  ...pokemonPrintedRareSources.map((source) => ({ source, set: "primary" as const })),
  ...pokemonEmbeddedSpecialSources.filter(isPokemonMythicalSpecial).map((source) => ({ source, set: "alternate" as const })),
].map(({ source, set }, index) => pokemonSourceToSpecialCard(source, "rare", set, "pk-r", index));

export const POKEMON_LEGENDARY_CARDS: Card[] = [
  ...[
    ...pokemonPrintedLegendarySources,
    ...pokemonEmbeddedSpecialSources.filter(isPokemonLegendarySpecial),
  ].map((source) => ({ source, set: primaryLegendarySpecialNames.has(source.name) ? "primary" as const : "alternate" as const })),
].map(({ source, set }, index) => pokemonSourceToSpecialCard(source, "legendary", set, "pk-l", index));
