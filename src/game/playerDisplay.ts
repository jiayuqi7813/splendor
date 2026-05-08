import type { PlayerState } from './types'

export function displayPlayerName(player: Pick<PlayerState, 'name' | 'seated'> | undefined): string {
  if (!player) return '旁观'
  return player.seated ? player.name : '等待玩家'
}
