import { CARD_DEFINITIONS } from './data/cards.generated'
import { DEVELOPMENT_CARDS, NOBLES, POKEMON_DEVELOPMENT_CARDS, POKEMON_LEGACY_SPECIAL_CARD_IDS, POKEMON_LEGENDARY_CARDS, POKEMON_RARE_CARDS, type BasicColor, type Card, type Costs } from './multiplayerData'
import type { CardDefinition, Cost, GemType } from './types'

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
  atlas: `classic-${card.tier}` as CardDefinition['atlas'],
  x: 0,
  y: 0,
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
  x: 0,
  y: 0,
}))

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
    goldCost: card.goldCost,
    bonusColors,
    evolvesFrom: card.evolvesFrom,
    evolutionCost: card.evolutionCost ? classicCost(card.evolutionCost) : undefined,
    atlas: `classic-${card.tier}` as CardDefinition['atlas'],
    x: 0,
    y: 0,
  }
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

export function pokemonRareCards(): number[] {
  return POKEMON_CARD_DEFINITIONS.filter((card) => card.deckKind === 'rare').map((card) => card.cardId)
}

export function pokemonLegendaryCards(): number[] {
  return POKEMON_CARD_DEFINITIONS.filter((card) => card.deckKind === 'legendary').map((card) => card.cardId)
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
