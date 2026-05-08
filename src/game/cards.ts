import { CARD_DEFINITIONS } from './data/cards.generated'
import { DEVELOPMENT_CARDS, NOBLES, POKEMON_DEVELOPMENT_CARDS, POKEMON_LEGACY_SPECIAL_CARD_IDS, POKEMON_LEGENDARY_CARDS, POKEMON_RARE_CARDS, type BasicColor, type Card, type Costs } from './multiplayerData'
import type { CardDefinition, Cost, GemType, PokemonSpecialSet } from './types'

const CLASSIC_COLOR_TO_DUEL: Record<BasicColor, GemType> = {
  white: 'diamond',
  blue: 'sapphire',
  green: 'emerald',
  red: 'ruby',
  brown: 'onyx',
}

function classicCost(cost: Costs): Cost {
  return {
    ruby: cost.red,
    sapphire: cost.blue,
    onyx: cost.brown,
    diamond: cost.white,
    emerald: cost.green,
    pearl: 0,
  }
}

function classicNobleCost(cost: Costs): Cost {
  return classicCost(cost)
}

const CLASSIC_CARD_DEFINITIONS: CardDefinition[] = DEVELOPMENT_CARDS.map((card) => ({
  id: `Classic${card.id}`,
  cardId: Number(card.id),
  number: Number(card.id),
  tier: card.tier,
  color: CLASSIC_COLOR_TO_DUEL[card.color],
  points: card.prestige,
  crowns: 0,
  doubleGem: false,
  wild: false,
  royalOnlyPoints: false,
  cost: classicCost(card.cost),
  atlas: `classic-tier${card.tier}` as CardDefinition['atlas'],
  ...classicCardAtlasPosition(card),
}))

const CLASSIC_NOBLE_DEFINITIONS: CardDefinition[] = NOBLES.map((noble) => ({
  id: `ClassicNoble${noble.id}`,
  cardId: Number(noble.id),
  number: Number(noble.id),
  tier: 'royal',
  points: noble.prestige,
  crowns: 0,
  doubleGem: false,
  wild: false,
  royalOnlyPoints: false,
  cost: classicNobleCost(noble.req),
  atlas: 'classic-noble' as CardDefinition['atlas'],
  ...classicNobleAtlasPosition(noble),
}))

function gridPosition(index: number, columns: number): Pick<CardDefinition, 'x' | 'y'> {
  return { x: index % columns, y: Math.floor(index / columns) }
}

function classicCardAtlasPosition(card: Card): Pick<CardDefinition, 'x' | 'y'> {
  const number = Number(card.id)
  const firstInTier = card.tier === 1 ? 1 : card.tier === 2 ? 41 : 71
  return gridPosition(number - firstInTier, 10)
}

function classicNobleAtlasPosition(noble: { id: string }): Pick<CardDefinition, 'x' | 'y'> {
  return gridPosition(Number(noble.id) - 20001, 5)
}

const POKEMON_CARD_ID_BASE = 30000
const POKEMON_RARE_ID_BASE = 30100
const POKEMON_LEGENDARY_ID_BASE = 30200

function pokemonCardNumber(card: Card, index: number): number {
  if (card.deckKind === 'rare') return POKEMON_RARE_ID_BASE + index + 1
  if (card.deckKind === 'legendary') return POKEMON_LEGENDARY_ID_BASE + index + 1
  const numeric = Number(card.id.replace('pk-', ''))
  return POKEMON_CARD_ID_BASE + (Number.isFinite(numeric) ? numeric : index + 1)
}

function pokemonDefinition(card: Card, index: number): CardDefinition {
  const bonusColors = card.bonusColors?.map((color) => CLASSIC_COLOR_TO_DUEL[color])
  const color = bonusColors?.[0] ?? CLASSIC_COLOR_TO_DUEL[card.color]
  const cardId = pokemonCardNumber(card, index)
  const atlas = pokemonAtlasPosition(card)
  return {
    id: `Pokemon${card.id}`,
    cardId,
    number: cardId,
    tier: card.tier,
    color,
    points: card.prestige,
    crowns: 0,
    doubleGem: false,
    wild: false,
    royalOnlyPoints: false,
    cost: classicCost(card.cost),
    name: card.name,
    deckKind: card.deckKind ?? 'common',
    pokemonSpecialSet: card.pokemonSpecialSet,
    goldCost: card.goldCost,
    bonusColors,
    evolvesFrom: card.evolvesFrom,
    evolutionCost: card.evolutionCost ? classicCost(card.evolutionCost) : undefined,
    atlas: atlas.atlas,
    x: atlas.x,
    y: atlas.y,
  }
}

function pokemonAtlasPosition(card: Card): Pick<CardDefinition, 'atlas' | 'x' | 'y'> {
  const image = card.image ?? ''
  const stage = image.match(/cards\/stage([123])\/stage\1-(\d+)\.webp$/)
  if (stage) {
    const stageNumber = Number(stage[1]) as 1 | 2 | 3
    return {
      atlas: `pokemon-stage${stageNumber}` as CardDefinition['atlas'],
      ...gridPosition(Number(stage[2]) - 1, 10),
    }
  }
  const rare = image.match(/cards\/rare\/rare-(\d+)\.webp$/)
  if (rare) {
    return { atlas: 'pokemon-rare', ...gridPosition(Number(rare[1]) - 1, 5) }
  }
  const legendary = image.match(/cards\/legendary\/legendary-(\d+)\.webp$/)
  if (legendary) {
    return { atlas: 'pokemon-legendary', ...gridPosition(Number(legendary[1]) - 1, 5) }
  }
  return { atlas: `pokemon-stage${card.tier}` as CardDefinition['atlas'], ...gridPosition(0, 10) }
}

const POKEMON_CARD_DEFINITIONS: CardDefinition[] = [
  ...POKEMON_DEVELOPMENT_CARDS.map((card, index) => pokemonDefinition(card, index)),
  ...POKEMON_RARE_CARDS.map((card, index) => pokemonDefinition(card, index)),
  ...POKEMON_LEGENDARY_CARDS.map((card, index) => pokemonDefinition(card, index)),
]

const POKEMON_LEGACY_SPECIAL_DEFINITIONS: CardDefinition[] = POKEMON_LEGACY_SPECIAL_CARD_IDS.flatMap(([legacyCardId, name]) => {
  const card = POKEMON_CARD_DEFINITIONS.find((definition) => definition.deckKind !== 'common' && definition.name === name)
  return card ? [{ ...card, cardId: legacyCardId, number: legacyCardId }] : []
})

export const CARDS = CARD_DEFINITIONS as readonly CardDefinition[]

const ALL_CARD_DEFINITIONS = [...CLASSIC_CARD_DEFINITIONS, ...CLASSIC_NOBLE_DEFINITIONS, ...POKEMON_CARD_DEFINITIONS, ...POKEMON_LEGACY_SPECIAL_DEFINITIONS, ...CARDS] as readonly CardDefinition[]

export const CARD_BY_ID = new Map<number, CardDefinition>(ALL_CARD_DEFINITIONS.map((card) => [card.cardId, card]))

export function getCard(cardId: number): CardDefinition {
  const card = CARD_BY_ID.get(cardId)
  if (!card) throw new Error(`Unknown card ${cardId}`)
  return card
}

export function cardsByTier(tier: 1 | 2 | 3): number[] {
  return CARDS.filter((card) => card.tier === tier).map((card) => card.cardId)
}

export function classicCardsByTier(tier: 1 | 2 | 3): number[] {
  return CLASSIC_CARD_DEFINITIONS.filter((card) => card.tier === tier).map((card) => card.cardId)
}

export function pokemonCardsByTier(tier: 1 | 2 | 3): number[] {
  return POKEMON_CARD_DEFINITIONS.filter((card) => card.deckKind === 'common' && card.tier === tier).map((card) => card.cardId)
}

export function pokemonRareCards(set: PokemonSpecialSet = 'primary'): number[] {
  return POKEMON_CARD_DEFINITIONS.filter((card) => card.deckKind === 'rare' && card.pokemonSpecialSet === set).map((card) => card.cardId)
}

export function pokemonLegendaryCards(set: PokemonSpecialSet = 'primary'): number[] {
  return POKEMON_CARD_DEFINITIONS.filter((card) => card.deckKind === 'legendary' && card.pokemonSpecialSet === set).map((card) => card.cardId)
}

export function royalCards(): number[] {
  return [...CARDS.filter((card) => card.tier === 'royal')]
    .sort((left, right) => left.number - right.number)
    .map((card) => card.cardId)
}

export function duelRoyalCards(): number[] {
  return [...CARD_DEFINITIONS.filter((card) => card.tier === 'royal')]
    .sort((left, right) => left.number - right.number)
    .map((card) => card.cardId)
}

export function classicNobleCards(): number[] {
  return CLASSIC_NOBLE_DEFINITIONS.map((card) => card.cardId)
}
