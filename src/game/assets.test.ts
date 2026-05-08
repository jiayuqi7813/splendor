import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEVELOPMENT_CARDS, NOBLES, POKEMON_DEVELOPMENT_CARDS, POKEMON_LEGENDARY_CARDS, POKEMON_RARE_CARDS } from './multiplayerData'

function assetBytes(filename: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../../public/assets/duel-splendor/${filename}`, import.meta.url)))
}

function repoPath(path: string): string {
  return fileURLToPath(new URL(`../../${path}`, import.meta.url))
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

function splendorAssetDir(path: string): string {
  return repoPath(`public/assets/splendor-base/${path}`)
}

function pokemonAssetDir(path: string): string {
  return repoPath(`public/assets/pokemon-splendor/${path}`)
}

function publicAssetExists(path: string): boolean {
  return existsSync(repoPath(path.replace(/^\/assets\//, 'public/assets/')))
}

describe('project-local generated assets', () => {
  it('uses generated high-resolution PNG token sprites', () => {
    for (const token of ['ruby', 'sapphire', 'onyx', 'diamond', 'emerald', 'pearl', 'gold']) {
      const bytes = assetBytes(`token-${token}.png`)
      const { width, height } = pngSize(bytes)

      expect(width).toBe(1024)
      expect(height).toBe(1024)
      expect(bytes[25]).toBe(6)
    }
  })

  it('keeps the privilege scroll as a trimmed generated scroll, not the emerald token', () => {
    const privilege = assetBytes('privilege.png')
    const emerald = assetBytes('token-emerald.png')
    const { width, height } = pngSize(privilege)

    expect(Buffer.compare(privilege, emerald)).not.toBe(0)
    expect(privilege[25]).toBe(6)
    expect(height).toBeGreaterThan(width * 2)
  })

  it('does not expose the removed source asset importer', () => {
    const manifest = JSON.parse(readFileSync(repoPath('package.json'), 'utf8')) as { scripts?: Record<string, string> }

    expect(manifest.scripts?.assets).toBeUndefined()
    expect(existsSync(repoPath('scripts/import-assets.mjs'))).toBe(false)
  })

  it('includes the complete classic Splendor asset set from the reference project', () => {
    expect(readdirSync(splendorAssetDir('cards')).filter((file) => file.endsWith('.jpg'))).toHaveLength(90)
    expect(readdirSync(splendorAssetDir('nobles')).filter((file) => file.endsWith('.jpg'))).toHaveLength(10)
    expect(readdirSync(splendorAssetDir('tokens')).filter((file) => file.endsWith('.png'))).toHaveLength(6)
    expect(readdirSync(splendorAssetDir('card-backs')).filter((file) => file.endsWith('.jpg'))).toHaveLength(3)
    expect(readFileSync(splendorAssetDir('cards/card-01.jpg')).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  })

  it('keeps classic multiplayer data wired to existing assets', () => {
    expect(DEVELOPMENT_CARDS).toHaveLength(90)
    expect(NOBLES).toHaveLength(10)
    for (const card of DEVELOPMENT_CARDS) expect(publicAssetExists(card.image ?? '')).toBe(true)
    for (const noble of NOBLES) expect(publicAssetExists(noble.image ?? '')).toBe(true)
  })

  it('keeps pokemon multiplayer data wired to existing assets', () => {
    expect(readdirSync(pokemonAssetDir('cards/stage1')).filter((file) => file.endsWith('.webp'))).toHaveLength(40)
    expect(readdirSync(pokemonAssetDir('cards/stage2')).filter((file) => file.endsWith('.webp'))).toHaveLength(30)
    expect(readdirSync(pokemonAssetDir('cards/stage3')).filter((file) => file.endsWith('.webp'))).toHaveLength(20)
    expect(readdirSync(pokemonAssetDir('cards/rare')).filter((file) => file.endsWith('.webp'))).toHaveLength(5)
    expect(readdirSync(pokemonAssetDir('cards/legendary')).filter((file) => file.endsWith('.webp'))).toHaveLength(5)
    expect(readdirSync(pokemonAssetDir('tokens')).filter((file) => file.endsWith('.webp'))).toHaveLength(6)
    expect(readdirSync(pokemonAssetDir('card-backs')).filter((file) => file.endsWith('.webp'))).toHaveLength(5)
    expect(existsSync(pokemonAssetDir('ATTRIBUTION.md'))).toBe(true)
    expect(POKEMON_DEVELOPMENT_CARDS).toHaveLength(80)
    expect(POKEMON_RARE_CARDS).toHaveLength(15)
    expect(POKEMON_LEGENDARY_CARDS).toHaveLength(5)
    expect(POKEMON_DEVELOPMENT_CARDS.filter((card) => card.tier === 1)).toHaveLength(35)
    expect(POKEMON_DEVELOPMENT_CARDS.filter((card) => card.tier === 2)).toHaveLength(30)
    expect(POKEMON_DEVELOPMENT_CARDS.filter((card) => card.tier === 3)).toHaveLength(15)
    expect(POKEMON_DEVELOPMENT_CARDS.every((card) => !card.goldCost && !card.bonusColors)).toBe(true)
    expect(POKEMON_RARE_CARDS.every((card) => card.deckKind === 'rare' && card.goldCost && (card.bonusColors?.length ?? 0) > 1)).toBe(true)
    expect(POKEMON_LEGENDARY_CARDS.every((card) => card.deckKind === 'legendary' && card.goldCost && (card.bonusColors?.length ?? 0) > 1)).toBe(true)
    expect(POKEMON_LEGENDARY_CARDS.map((card) => card.name)).not.toContain('小拳石')
    expect(POKEMON_LEGENDARY_CARDS.map((card) => card.name)).not.toContain('隆隆石')
    expect(POKEMON_DEVELOPMENT_CARDS.find((card) => card.name === '大针蜂')?.tier).toBe(3)
    expect(POKEMON_DEVELOPMENT_CARDS.find((card) => card.name === '喷火龙')?.tier).toBe(3)
    for (const card of [...POKEMON_DEVELOPMENT_CARDS, ...POKEMON_RARE_CARDS, ...POKEMON_LEGENDARY_CARDS]) {
      expect(publicAssetExists(card.image ?? '')).toBe(true)
    }
  })

  it('keeps generated table surfaces and homepage cover available', () => {
    const generatedPngs = [
      'public/assets/home/splendor-box-cover.png',
      'public/assets/splendor-base/tabletops/jewel-felt.png',
      'public/assets/duel-splendor/tabletops/birch-boardgame-table.png',
      'public/assets/pokemon-splendor/tabletops/vivid-monster-table.png',
    ]

    for (const asset of generatedPngs) {
      const bytes = readFileSync(repoPath(asset))
      const { width, height } = pngSize(bytes)
      expect(width).toBeGreaterThanOrEqual(724)
      expect(height).toBeGreaterThanOrEqual(724)
    }

    expect(existsSync(repoPath('public/assets/home/ATTRIBUTION.md'))).toBe(true)
  })
})
