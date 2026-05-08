import { CARD_ATLASES } from '@/game/data/cards.generated'
import { TOKEN_LABELS } from '@/game/data/static'
import { getCard } from '@/game/cards'
import type { CardDefinition, GemType } from '@/game/types'

export function CardView({ cardId, small = false, wildColor }: { cardId: number; small?: boolean; wildColor?: GemType }) {
  const card = getCard(cardId)
  const atlas = CARD_ATLASES[card.atlas]
  if (!atlas) {
    return <div className={small ? 'cardMini' : 'card'} title={`卡牌资源错误：${cardId}`} />
  }
  return (
    <div className={small ? 'cardMini' : 'card'} title={describeCard(card, wildColor)}>
      <div
        className="cardArt"
        style={{
          backgroundImage: `url(${atlas.url})`,
          backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
          backgroundPosition: `${(card.x / (atlas.columns - 1)) * 100}% ${(card.y / (atlas.rows - 1)) * 100}%`,
        }}
      />
    </div>
  )
}

function describeCard(card: CardDefinition, wildColor?: GemType): string {
  const color = wildColor ?? card.color
  const cost = Object.entries(card.cost)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${TOKEN_LABELS[type as keyof typeof TOKEN_LABELS]} ${count}`)
    .join('，')
  return `${card.points} 分${color ? `，${TOKEN_LABELS[color]}奖励` : ''}${card.wild ? '，万能奖励' : ''}${card.crowns ? `，${card.crowns} 皇冠` : ''}${cost ? `，费用：${cost}` : ''}`
}
