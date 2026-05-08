import type { TokenType } from '../types'
import { assetPath } from '@/utils/paths'

export const BOARD_SIZE = 5

export const SPIRAL_CELL_IDS = [
  '2:2',
  '2:3',
  '1:3',
  '1:2',
  '1:1',
  '2:1',
  '3:1',
  '3:2',
  '3:3',
  '3:4',
  '2:4',
  '1:4',
  '0:4',
  '0:3',
  '0:2',
  '0:1',
  '0:0',
  '1:0',
  '2:0',
  '3:0',
  '4:0',
  '4:1',
  '4:2',
  '4:3',
  '4:4',
] as const

export const TOKEN_LABELS: Record<TokenType, string> = {
  ruby: '红宝石',
  sapphire: '蓝宝石',
  onyx: '黑玛瑙',
  diamond: '钻石',
  emerald: '祖母绿',
  pearl: '珍珠',
  gold: '黄金',
}

export const TOKEN_SHORT: Record<TokenType, string> = {
  ruby: '红',
  sapphire: '蓝',
  onyx: '黑',
  diamond: '白',
  emerald: '绿',
  pearl: '珠',
  gold: '金',
}

export const TOKEN_COLORS: Record<TokenType, string> = {
  ruby: '#b92830',
  sapphire: '#2765af',
  onyx: '#202126',
  diamond: '#f5f2e9',
  emerald: '#268451',
  pearl: '#dfc7a4',
  gold: '#c99831',
}

export const TOKEN_IMAGES: Record<TokenType, string> = {
  ruby: assetPath('token-ruby.png'),
  sapphire: assetPath('token-sapphire.png'),
  onyx: assetPath('token-onyx.png'),
  diamond: assetPath('token-diamond.png'),
  emerald: assetPath('token-emerald.png'),
  pearl: assetPath('token-pearl.png'),
  gold: assetPath('token-gold.png'),
}

export const MARKET_SIZES = {
  1: 5,
  2: 4,
  3: 3,
} as const
