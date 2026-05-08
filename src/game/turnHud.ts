import type { GameState, PlayerId } from './types'

export function currentTurnPosition(state: GameState): { current: number; total: number } {
  const order = state.playerOrder?.length ? state.playerOrder : (['p1', 'p2'] as PlayerId[])
  const firstIndex = order.indexOf(state.firstPlayer)
  const currentIndex = order.indexOf(state.currentPlayer)
  return {
    current: firstIndex >= 0 && currentIndex >= 0 ? ((currentIndex - firstIndex + order.length) % order.length) + 1 : 1,
    total: order.length,
  }
}

export function turnHudLabels(state: GameState): string[] {
  const labels = [`第 ${state.turnNumber} 圈`]
  if (state.status === 'playing' && !state.winner) {
    const position = currentTurnPosition(state)
    labels.push(`行动 ${position.current} / ${position.total}`)
  }
  if (state.finalRound?.overtimeRounds) labels.push(`加时第 ${state.finalRound.overtimeRounds} 回合`)
  return labels
}
