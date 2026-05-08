import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEVELOPMENT_CARDS, NOBLES, POKEMON_DEVELOPMENT_CARDS, POKEMON_LEGENDARY_CARDS, POKEMON_RARE_CARDS } from './multiplayerData'
import { getCard, pokemonLegendaryCards, pokemonRareCards } from './cards'
import { CARD_ATLASES } from './data/cards.generated'
import type { CardDefinition } from './types'
import type { Costs } from './multiplayerData'

function assetBytes(filename: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../../public/assets/duel-splendor/${filename}`, import.meta.url)))
}

function repoPath(path: string): string {
  return fileURLToPath(new URL(`../../${path}`, import.meta.url))
}

function webpSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP')
  if (bytes.subarray(12, 16).toString('ascii') === 'VP8X') {
    return {
      width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
    }
  }
  return {
    width: bytes[26] | (bytes[27] << 8),
    height: bytes[28] | (bytes[29] << 8),
  }
}

function pokemonAssetDir(path: string): string {
  return repoPath(`public/assets/pokemon-splendor/${path}`)
}

function atlasAssetExists(atlas: CardDefinition['atlas']): boolean {
  return existsSync(repoPath(CARD_ATLASES[atlas].url.replace(/^\/assets\//, 'public/assets/')))
}

function expectCost(actual: Costs | undefined, expected: Costs) {
  expect(actual).toEqual(expected)
}

describe('project-local generated assets', () => {
  it('uses mode-local optimized WebP token sprites', () => {
    for (const token of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald', 'pearl', 'gold']) {
      const bytes = assetBytes(`token-${token}.webp`)
      const { width, height } = webpSize(bytes)

      expect(width).toBeGreaterThanOrEqual(512)
      expect(height).toBeGreaterThanOrEqual(512)
    }
  })

  it('keeps the privilege scroll as a trimmed generated scroll, not the emerald token', () => {
    const privilege = assetBytes('privilege.webp')
    const emerald = assetBytes('token-emerald.webp')
    const { width, height } = webpSize(privilege)

    expect(Buffer.compare(privilege, emerald)).not.toBe(0)
    expect(height).toBeGreaterThan(width * 2)
  })

  it('does not expose the removed source asset importer', () => {
    const manifest = JSON.parse(readFileSync(repoPath('package.json'), 'utf8')) as { scripts?: Record<string, string> }

    expect(manifest.scripts?.assets).toBeUndefined()
    expect(existsSync(repoPath('scripts/import-assets.mjs'))).toBe(false)
  })

  it('includes the complete classic Splendor asset set from the reference project', () => {
    expect(atlasAssetExists('classic-tier1')).toBe(true)
    expect(atlasAssetExists('classic-tier2')).toBe(true)
    expect(atlasAssetExists('classic-tier3')).toBe(true)
    expect(atlasAssetExists('classic-noble')).toBe(true)
    expect(readdirSync(repoPath('public/assets/splendor-base/tokens')).filter((file) => file.endsWith('.webp'))).toHaveLength(6)
    expect(readdirSync(repoPath('public/assets/splendor-base/card-backs')).filter((file) => file.endsWith('.jpg'))).toHaveLength(3)
    expect(existsSync(repoPath('public/assets/splendor-base/card-backs/noble.webp'))).toBe(true)
  })

  it('keeps classic multiplayer data wired to optimized atlases', () => {
    expect(DEVELOPMENT_CARDS).toHaveLength(90)
    expect(NOBLES).toHaveLength(10)
    for (const card of DEVELOPMENT_CARDS) {
      const definition = getCard(Number(card.id))
      expect(definition.atlas).toBe(`classic-tier${card.tier}`)
      expect(atlasAssetExists(definition.atlas)).toBe(true)
    }
    for (const noble of NOBLES) {
      const definition = getCard(Number(noble.id))
      expect(definition.atlas).toBe('classic-noble')
      expect(atlasAssetExists(definition.atlas)).toBe(true)
    }
  })

  it('keeps pokemon multiplayer data wired to optimized atlases', () => {
    expect(atlasAssetExists('pokemon-stage1')).toBe(true)
    expect(atlasAssetExists('pokemon-stage2')).toBe(true)
    expect(atlasAssetExists('pokemon-stage3')).toBe(true)
    expect(atlasAssetExists('pokemon-rare')).toBe(true)
    expect(atlasAssetExists('pokemon-legendary')).toBe(true)
    expect(readdirSync(pokemonAssetDir('tokens')).filter((file) => file.endsWith('.webp'))).toHaveLength(6)
    expect(readdirSync(pokemonAssetDir('card-backs')).filter((file) => file.endsWith('.webp'))).toHaveLength(5)
    expect(existsSync(pokemonAssetDir('ATTRIBUTION.md'))).toBe(true)
    expect(POKEMON_DEVELOPMENT_CARDS).toHaveLength(80)
    expect(POKEMON_RARE_CARDS).toHaveLength(10)
    expect(POKEMON_LEGENDARY_CARDS).toHaveLength(10)
    expect(pokemonRareCards('primary')).toHaveLength(5)
    expect(pokemonLegendaryCards('primary')).toHaveLength(5)
    expect(pokemonRareCards('alternate')).toHaveLength(5)
    expect(pokemonLegendaryCards('alternate')).toHaveLength(5)
    expect(POKEMON_DEVELOPMENT_CARDS.filter((card) => card.tier === 1)).toHaveLength(35)
    expect(POKEMON_DEVELOPMENT_CARDS.filter((card) => card.tier === 2)).toHaveLength(30)
    expect(POKEMON_DEVELOPMENT_CARDS.filter((card) => card.tier === 3)).toHaveLength(15)
    expect(POKEMON_DEVELOPMENT_CARDS.every((card) => !card.goldCost && !card.bonusColors)).toBe(true)
    expect(POKEMON_RARE_CARDS.every((card) => card.deckKind === 'rare' && card.prestige > 0 && card.goldCost && (card.bonusColors?.length ?? 0) > 1)).toBe(true)
    expect(POKEMON_LEGENDARY_CARDS.every((card) => card.deckKind === 'legendary' && card.prestige === 0 && card.goldCost && (card.bonusColors?.length ?? 0) > 1)).toBe(true)
    expect(POKEMON_LEGENDARY_CARDS.map((card) => card.name)).not.toContain('小拳石')
    expect(POKEMON_LEGENDARY_CARDS.map((card) => card.name)).not.toContain('隆隆石')
    expect(POKEMON_RARE_CARDS.map((card) => card.name)).toEqual(expect.arrayContaining(['超梦', '梦幻', '火焰鸟', '闪电鸟', '急冻鸟']))
    expect(POKEMON_LEGENDARY_CARDS.map((card) => card.name)).toEqual(expect.arrayContaining(['伊布', '百变怪', '卡比兽', '拉普拉斯', '化石翼龙']))
    expect(pokemonRareCards('primary').map((cardId) => getCard(cardId).name)).toEqual(['美洛耶塔', '凯路迪欧', '蒂安希', '比克提尼', '捷拉奥拉'])
    expect(pokemonRareCards('alternate').map((cardId) => getCard(cardId).name)).toEqual(['超梦', '梦幻', '火焰鸟', '闪电鸟', '急冻鸟'])
    expect(pokemonLegendaryCards('primary').map((cardId) => getCard(cardId).name)).toEqual(['小智的皮卡丘', '伊布', '百变怪', '卡比兽', '拉普拉斯'])
    expect(pokemonLegendaryCards('alternate').map((cardId) => getCard(cardId).name)).toEqual(['化石翼龙', '小刚的大岩蛇', '火箭队的果然翁', '小刚的可达鸭', '火箭队的喵喵'])
    expect(POKEMON_DEVELOPMENT_CARDS.find((card) => card.name === '大针蜂')?.tier).toBe(3)
    expect(POKEMON_DEVELOPMENT_CARDS.find((card) => card.name === '喷火龙')?.tier).toBe(3)
    for (const cardId of [30001, 30041, 30071, 30101, 30201]) {
      expect(atlasAssetExists(getCard(cardId).atlas)).toBe(true)
    }
  })

  it('matches corrected Pokemon printed card values', () => {
    const pokemonById = new Map(POKEMON_DEVELOPMENT_CARDS.map((card) => [card.id, card]))

    expectCost(pokemonById.get('pk-015')?.cost, { white: 0, blue: 2, green: 0, red: 2, brown: 0 })
    expectCost(pokemonById.get('pk-016')?.cost, { white: 3, blue: 0, green: 0, red: 0, brown: 0 })
    expectCost(pokemonById.get('pk-019')?.cost, { white: 0, blue: 1, green: 1, red: 1, brown: 1 })
    expectCost(pokemonById.get('pk-031')?.cost, { white: 0, blue: 0, green: 0, red: 3, brown: 2 })
    expectCost(pokemonById.get('pk-037')?.cost, { white: 0, blue: 0, green: 0, red: 0, brown: 3 })
    expectCost(pokemonById.get('pk-038')?.cost, { white: 0, blue: 0, green: 0, red: 0, brown: 6 })
    expectCost(pokemonById.get('pk-091')?.evolutionCost, { white: 3, blue: 0, green: 0, red: 0, brown: 0 })
    expectCost(pokemonById.get('pk-092')?.evolutionCost, { white: 3, blue: 0, green: 0, red: 0, brown: 0 })
  })

  it('keeps generated table surfaces and homepage cover available', () => {
    const generatedPngs = [
      'public/assets/home/splendor-box-cover.webp',
      'public/assets/splendor-base/tabletops/jewel-felt.webp',
      'public/assets/duel-splendor/tabletops/birch-boardgame-table.webp',
      'public/assets/pokemon-splendor/tabletops/vivid-monster-table.webp',
    ]

    for (const asset of generatedPngs) {
      const bytes = readFileSync(repoPath(asset))
      const { width, height } = webpSize(bytes)
      expect(width).toBeGreaterThanOrEqual(724)
      expect(height).toBeGreaterThanOrEqual(724)
    }

    expect(existsSync(repoPath('public/assets/home/ATTRIBUTION.md'))).toBe(true)
  })
})
