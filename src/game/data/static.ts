export type GemColor = "white" | "blue" | "green" | "red" | "brown" | "gold";
export type BasicColor = Exclude<GemColor, "gold">;
export type GameVariant = "classic" | "pokemon";
export type CardDeckKind = "common" | "rare" | "legendary";
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
  name?: string;
  image?: string;
  goldCost?: number;
  bonusColors?: BasicColor[];
  evolvesFrom?: string;
  evolutionCost?: Costs;
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

const tierSerials: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

export const POKEMON_DEVELOPMENT_CARDS: Card[] = DEVELOPMENT_CARDS.map((card, index) => {
  const name = pokemonNames[index] ?? `宝可梦 ${index + 1}`;
  const serial = (tierSerials[card.tier] += 1);
  return {
    ...card,
    id: `pk-${card.id}`,
    variant: "pokemon",
    deckKind: "common",
    name,
    image: pokemonCommonImage(card.tier, serial),
    evolvesFrom: evolvesFromByName[name],
    evolutionCost: card.cost,
  };
});

const special = (
  id: string,
  name: string,
  deckKind: Exclude<CardDeckKind, "common">,
  prestige: number,
  image: string,
  goldCost: number,
  bonusColors: [BasicColor, BasicColor],
): Card => ({
  id,
  tier: 3,
  color: bonusColors[0],
  prestige,
  cost: emptyCosts(),
  variant: "pokemon",
  deckKind,
  name,
  image,
  goldCost,
  bonusColors,
});

export const POKEMON_RARE_CARDS: Card[] = [
  special("pk-r01", "美洛耶塔", "rare", 2, assetPath("cards/rare", "rare-001"), 1, ["white", "blue"]),
  special("pk-r02", "凯路迪欧", "rare", 2, assetPath("cards/rare", "rare-002"), 1, ["red", "brown"]),
  special("pk-r03", "蒂安希", "rare", 2, assetPath("cards/rare", "rare-003"), 1, ["blue", "green"]),
  special("pk-r04", "比克提尼", "rare", 2, assetPath("cards/rare", "rare-004"), 1, ["red", "green"]),
  special("pk-r05", "捷拉奥拉", "rare", 2, assetPath("cards/rare", "rare-005"), 1, ["white", "brown"]),
];

export const POKEMON_LEGENDARY_CARDS: Card[] = [
  special("pk-l01", "小智的皮卡丘", "legendary", 3, assetPath("cards/legendary", "legendary-001"), 2, ["green", "red"]),
  special("pk-l02", "小拳石", "legendary", 2, assetPath("cards/legendary", "legendary-002"), 2, ["blue", "brown"]),
  special("pk-l03", "小拳石", "legendary", 2, assetPath("cards/legendary", "legendary-003"), 2, ["white", "green"]),
  special("pk-l04", "隆隆石", "legendary", 2, assetPath("cards/legendary", "legendary-004"), 2, ["red", "blue"]),
  special("pk-l05", "隆隆岩", "legendary", 2, assetPath("cards/legendary", "legendary-005"), 2, ["brown", "green"]),
];
