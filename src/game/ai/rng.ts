import type { Rng } from './types'

function seedToNumber(seed: string | number | undefined): number {
  if (typeof seed === 'number') return seed >>> 0
  const text = String(seed ?? 'gem-duel-ai')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createRng(seed?: string | number): Rng {
  let state = seedToNumber(seed) || 1
  return {
    next() {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      return ((state >>> 0) % 1_000_000) / 1_000_000
    },
  }
}

export function stableShuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng.next() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

export function softmaxSample<T>(items: readonly T[], score: (item: T) => number, temperature: number, rng: Rng): T | undefined {
  if (items.length === 0) return undefined
  if (temperature <= 0.001) return [...items].sort((left, right) => score(right) - score(left))[0]
  const scores = items.map(score)
  const max = Math.max(...scores)
  const weights = scores.map((value) => Math.exp((value - max) / temperature))
  const total = weights.reduce((sum, value) => sum + value, 0)
  let cursor = rng.next() * total
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index]
    if (cursor <= 0) return items[index]
  }
  return items.at(-1)
}
