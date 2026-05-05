import { ChevronDown, ChevronUp, Crown, WifiOff } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { BasicColor, GameVariant, PlayerState } from "../types";
import { AVATARS, BASIC_COLORS, colorLabelsFor, tokenImagesFor, cardImageUrl, deckBackUrl, nobleImageUrl } from "../types";

interface OpponentPanelProps {
  players: PlayerState[];
  myPlayerId: string;
  currentPlayerId: string;
  variant?: GameVariant;
}

const tokenOrder = ["white", "blue", "green", "red", "brown", "gold"] as const;

function cardsByColor(player: PlayerState) {
  return BASIC_COLORS.reduce<Record<BasicColor, typeof player.purchasedCards>>((acc, color) => {
    acc[color] = player.purchasedCards.filter((card) => card.color === color);
    return acc;
  }, {} as Record<BasicColor, typeof player.purchasedCards>);
}

export function OpponentPanel({ players, myPlayerId, currentPlayerId, variant = "classic" }: OpponentPanelProps) {
  const opponents = players.filter((player) => player.id !== myPlayerId);
  const [expandedId, setExpandedId] = useState(opponents[0]?.id ?? "");
  const labels = colorLabelsFor(variant);
  const tokenImages = tokenImagesFor(variant);

  return (
    <aside className="opponent-panel">
      <div className="panel-heading">
        <h2>其他玩家</h2>
        <span>{opponents.length} 位</span>
      </div>

      <div className="opponent-list">
        {opponents.map((player) => {
          const expanded = expandedId === player.id;
          const purchasedGroups = cardsByColor(player);
          const portraitCard = player.purchasedCards[player.purchasedCards.length - 1];
          return (
            <article key={player.id} className={`opponent-card ${player.id === currentPlayerId ? "active" : ""}`}>
              <button type="button" className="opponent-summary" onClick={() => setExpandedId(expanded ? "" : player.id)}>
                <span className="opponent-avatar">
                  {portraitCard ? <img src={cardImageUrl(portraitCard.id, portraitCard)} alt="" /> : AVATARS[player.avatarId % AVATARS.length]}
                </span>
                <span>
                  <strong>{player.username}</strong>
                  <em>
                    <Crown size={15} />
                    {player.prestige} 分
                  </em>
                </span>
                {player.connected === false ? <WifiOff size={16} /> : expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>

              <div className="opponent-resource-board">
                <div className="opponent-token-grid" aria-label={`${player.username} 的资源`}>
                  {tokenOrder.map((color) => (
                    <span key={color}>
                      <img src={tokenImages[color]} alt="" />
                      {player.gems[color]}
                    </span>
                  ))}
                </div>
                <div className="opponent-bonus-row compact" aria-label={`${player.username} 的永久加成`}>
                  {BASIC_COLORS.map((color) => (
                    <span key={color}>
                      <img src={tokenImages[color]} alt="" />
                      {purchasedGroups[color].length}
                    </span>
                  ))}
                </div>
              </div>

              <div className="opponent-preview-row">
                <div>
                  <h3>{variant === "pokemon" ? "已捕捉" : "发展卡"} ({player.purchasedCards.length})</h3>
                  <div className="opponent-card-strip">
                    {player.purchasedCards.slice(-4).map((card) => (
                      <img key={card.id} src={cardImageUrl(card.id, card)} alt="" />
                    ))}
                    {!player.purchasedCards.length ? <em>0</em> : null}
                  </div>
                </div>
                <div>
                  <h3>{variant === "pokemon" ? "保留" : "预留卡"} ({player.reservedCards.length})</h3>
                  <div className="opponent-card-strip reserved">
                    {player.reservedCards.slice(0, 3).map((card, index) => (
                      <img key={`${card.id}-${index}`} src={deckBackUrl(card.tier ?? 1, variant, card.deckKind ?? "common")} alt="" />
                    ))}
                    {!player.reservedCards.length ? <em>0</em> : null}
                  </div>
                </div>
              </div>

              {expanded ? (
                <div className="opponent-detail">
                  <div>
                    <h3>永久加成</h3>
                    <div className="opponent-bonus-row">
                      {BASIC_COLORS.map((color) => (
                        <span key={color}>
                          <img src={tokenImages[color]} alt="" />
                          {labels[color]} {purchasedGroups[color].length}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3>已购发展卡</h3>
                    <div className="opponent-purchased-groups">
                      {BASIC_COLORS.map((color) => (
                        <span key={color} style={{ "--group-color": `var(--gem-${color})` } as CSSProperties}>
                          <b>{labels[color]}</b>
                          <em>{purchasedGroups[color].length}</em>
                          {purchasedGroups[color].slice(-3).map((card) => (
                            <img key={card.id} src={cardImageUrl(card.id, card)} alt="" />
                          ))}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="opponent-meta-grid">
                    <span>
                      <b>{player.purchasedCards.length}</b>
                      已购卡
                    </span>
                    <span>
                      <b>{player.reservedCards.length}</b>
                      预留卡
                    </span>
                    <span>
                      <b>{player.nobles.length}</b>
                      {variant === "pokemon" ? "进化" : "贵族"}
                    </span>
                    <span>
                      <b>{player.turnsTaken ?? 0}</b>
                      回合
                    </span>
                  </div>

                  {variant === "pokemon" ? (
                    <div className="opponent-noble-row">
                      <span>进化压底 {player.tuckedCards.length} 张</span>
                    </div>
                  ) : (
                    <div className="opponent-noble-row">
                      {player.nobles.length ? (
                      player.nobles.map((noble) => <img key={noble.id} src={nobleImageUrl(noble.id)} alt={`贵族 ${noble.prestige} 分`} />)
                      ) : (
                        <span>尚未获得贵族</span>
                      )}
                    </div>
                  )}

                  <div className="opponent-reserved-row" aria-label={`${player.username} 的隐藏预留卡`}>
                    {player.reservedCards.map((card, index) => (
                      <span key={`${card.id}-${index}`}>
                        <img src={deckBackUrl(card.tier ?? 1, variant, card.deckKind ?? "common")} alt="" />
                      </span>
                    ))}
                    {player.reservedCards.length === 0 ? <em>没有预留卡</em> : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
