import type { Card, HiddenCard, PlayerState } from "../types";
import { BASIC_COLORS, COLOR_SHORT_LABELS, TOKEN_IMAGES, AVATARS, cardImageUrl, isHiddenCard } from "../types";

interface PlayerPanelProps {
  player: PlayerState;
  isCurrent: boolean;
  isMe: boolean;
  compact?: boolean;
  detailed?: boolean;
  rank?: number;
  onReservedCardClick?: (card: Card) => void;
}

const tokenOrder = ["green", "blue", "red", "brown", "white", "gold"] as const;

function totalTokens(player: PlayerState) {
  return Object.values(player.gems).reduce((sum, value) => sum + value, 0);
}

function ReservedThumb({
  card,
  isMe,
  onClick,
}: {
  card: Card | HiddenCard;
  isMe: boolean;
  onClick?: (card: Card) => void;
}) {
  if (isHiddenCard(card) || !isMe) return <span className="reserved-dot" aria-label="隐藏保留卡" />;

  return (
    <button className="reserved-dot image" type="button" onClick={() => onClick?.(card)} aria-label={`查看保留卡 ${card.id}`}>
      <img src={cardImageUrl(card.id)} alt="" />
    </button>
  );
}

export function PlayerPanel({ player, isCurrent, isMe, onReservedCardClick }: PlayerPanelProps) {
  const avatarLabel = AVATARS[player.avatarId % AVATARS.length] ?? player.username.slice(0, 1);

  return (
    <article className={`player-seat ${isCurrent ? "current" : ""} ${isMe ? "me" : ""}`}>
      <div className="seat-avatar">{avatarLabel}</div>
      <div className="seat-main">
        <header>
          <h3>{player.username}{isMe ? "（你）" : ""}</h3>
          <strong>{player.prestige} 分</strong>
        </header>
        <div className="seat-tokens">
          {tokenOrder.map((color) => (
            <span key={color}>
              <img src={TOKEN_IMAGES[color]} alt="" />
              {player.gems[color]}
            </span>
          ))}
        </div>
        <div className="seat-bonuses">
          {BASIC_COLORS.map((color) => (
            <span key={color}>
              <img src={TOKEN_IMAGES[color]} alt="" />
              {COLOR_SHORT_LABELS[color]} {player.bonuses[color]}
            </span>
          ))}
        </div>
      </div>
      <div className="seat-reserved">
        <span>发展卡加成</span>
        <strong>{player.purchasedCards.length}</strong>
        <div>
          {player.reservedCards.slice(0, 3).map((card, index) => (
            <ReservedThumb key={`${card.id}-${index}`} card={card} isMe={isMe} onClick={onReservedCardClick} />
          ))}
          {player.reservedCards.length === 0 ? <em>0</em> : null}
        </div>
      </div>
      <small>{totalTokens(player)}/10</small>
    </article>
  );
}
