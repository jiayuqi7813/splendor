import { Bookmark, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import type { BasicColor, Card, GemColor, PlayerState, ReservedCard } from "../types";
import {
  BASIC_COLORS,
  COLOR_LABELS,
  TOKEN_IMAGES,
  cardImageUrl,
  deckBackUrl,
  isHiddenCard,
  nobleImageUrl,
} from "../types";
import { Draggable, DropZone, useBoardDrag } from "./BoardDragProvider";
import { PaymentDropZone } from "./PaymentDropZone";

const tokenOrder: GemColor[] = ["white", "blue", "green", "red", "brown", "gold"];

function groupedPurchasedCards(player: PlayerState) {
  return BASIC_COLORS.reduce<Record<BasicColor, Card[]>>((acc, color) => {
    acc[color] = player.purchasedCards.filter((card) => card.color === color);
    return acc;
  }, {} as Record<BasicColor, Card[]>);
}

function MiniCard({ card, draggable }: { card: ReservedCard; draggable?: boolean }) {
  if (isHiddenCard(card)) {
    const tier = card.tier ?? 1;
    return (
      <span className="mini-card back">
        <img src={deckBackUrl(tier)} alt="" />
      </span>
    );
  }

  const image = (
    <button type="button" className="mini-card" aria-label={`预留卡 ${card.prestige} 分`}>
      <img src={cardImageUrl(card.id)} alt="" />
      <b>{card.prestige}</b>
    </button>
  );

  if (!draggable) return image;
  return (
    <Draggable id={`reserved-card:${card.id}`} data={{ kind: "reserved-card", card }} className="draggable-mini-card">
      {image}
    </Draggable>
  );
}

export function MyAreaPanel({ player }: { player: PlayerState }) {
  const {
    selectedCard,
    selectedCardSource,
    stagedTakeGems,
    stagedDiscard,
    stagedReserve,
    notice,
    mustDiscard,
    describeTake,
    stageReserveCard,
    clearStagedTake,
    clearDiscard,
    clearReserve,
    confirmTake,
    confirmReserve,
    confirmDiscard,
    confirmBuy,
  } = useBoardDrag();
  const groups = groupedPurchasedCards(player);

  return (
    <section className="my-area-panel">
      <div className="my-area-title">
        <h2>我的区域</h2>
        <p>{notice}</p>
      </div>

      <DropZone id="my-gems-zone" className="my-gems-zone" onDoubleClick={confirmTake} label="我的宝石区，双击确认拿取">
        <div className="mini-section-head">
          <strong>我的宝石</strong>
          <button type="button" onClick={clearStagedTake} aria-label="清空待拿宝石">
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="my-token-row">
          {tokenOrder.map((color) => (
            <Draggable key={color} id={`my-gem:${color}`} data={{ kind: "my-gem", color }} disabled={player.gems[color] <= 0} className="draggable-token">
              <button type="button" className="my-token" disabled={player.gems[color] <= 0} aria-label={`我的${COLOR_LABELS[color]} ${player.gems[color]}`}>
                <img src={TOKEN_IMAGES[color]} alt="" />
                <span>{player.gems[color]}</span>
              </button>
            </Draggable>
          ))}
        </div>
        <div className="staged-gem-row">
          <span>{describeTake}</span>
          {stagedTakeGems.map((color, index) => (
            <img key={`${color}-${index}`} src={TOKEN_IMAGES[color]} alt="" />
          ))}
        </div>
      </DropZone>

      <div className="purchased-zone">
        <div className="mini-section-head">
          <strong>我的发展卡</strong>
          <span>已获得 {player.purchasedCards.length} 张</span>
        </div>
        <div className="purchased-groups">
          {BASIC_COLORS.map((color) => (
            <div key={color} className="purchased-group">
              <span style={{ "--group-color": `var(--gem-${color})` } as CSSProperties}>{COLOR_LABELS[color]}</span>
              <div>
                {groups[color].slice(0, 5).map((card) => (
                  <span key={card.id} className="tiny-card">
                    <img src={cardImageUrl(card.id)} alt="" />
                    <b>{card.prestige}</b>
                  </span>
                ))}
                {groups[color].length === 0 ? <em>0</em> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DropZone id="reserve-zone" className="reserve-zone" onDoubleClick={confirmReserve} label="预留区，双击确认预留">
        <div className="mini-section-head">
          <strong>预留卡 ({player.reservedCards.length}/3)</strong>
          <span className="reserve-head-actions">
            {selectedCard && selectedCardSource !== "reserved" ? (
              <button type="button" onClick={() => stageReserveCard(selectedCard)} aria-label="预留选中卡">
                <Bookmark size={15} />
              </button>
            ) : null}
            <button type="button" onClick={clearReserve} aria-label="清空待预留">
              <RotateCcw size={15} />
            </button>
          </span>
        </div>
        <div className="reserved-card-row">
          {player.reservedCards.map((card, index) => (
            <MiniCard key={`${card.id}-${index}`} card={card} draggable />
          ))}
          {stagedReserve ? (
            <span className="reserved-staged">
              <Bookmark size={18} />
              {stagedReserve.card ? `${COLOR_LABELS[stagedReserve.card.color]}卡` : `${stagedReserve.fromDeck} 级牌堆`}
            </span>
          ) : null}
          {player.reservedCards.length === 0 && !stagedReserve ? <span className="drop-placeholder">拖卡或牌堆到这里</span> : null}
        </div>
      </DropZone>

      <div className="selected-payment-zone">
        <DropZone id="selected-card-zone" className="selected-card-zone" onDoubleClick={confirmBuy} label="选中卡预览，双击确认购买">
          <div className="mini-section-head">
            <strong>选中卡预览</strong>
            {selectedCard ? <span>{selectedCardSource === "reserved" ? "来自预留区" : "来自市场"}</span> : null}
          </div>
          {selectedCard ? (
            <div className="selected-card-content">
              <DropZone id={`card-drop:${selectedCard.id}`} className="selected-card-image" onDoubleClick={confirmBuy}>
                <img src={cardImageUrl(selectedCard.id)} alt="" />
                <b>{selectedCard.prestige}</b>
              </DropZone>
              <div className="selected-card-need">
                <strong>{COLOR_LABELS[selectedCard.color]} · 等级 {selectedCard.tier}</strong>
                <span>
                  需要：
                  {BASIC_COLORS.filter((color) => selectedCard.cost[color] > 0).map((color) => (
                    <em key={color}>
                      <img src={TOKEN_IMAGES[color]} alt="" />
                      {selectedCard.cost[color]}
                    </em>
                  ))}
                </span>
              </div>
            </div>
          ) : (
            <div className="empty-drop-copy">
              <Sparkles size={24} />
              <strong>拖发展卡到这里</strong>
              <span>也可以点击市场卡进行选择</span>
            </div>
          )}
        </DropZone>

        <PaymentDropZone />
      </div>

      {mustDiscard ? (
        <DropZone id="discard-zone" className="discard-drop-zone" onDoubleClick={confirmDiscard} label="弃币区，双击确认弃置">
          <div className="mini-section-head">
            <strong>弃币区</strong>
            <button type="button" onClick={clearDiscard} aria-label="清空待弃置">
              <RotateCcw size={15} />
            </button>
          </div>
          <div className="payment-token-row">
            {tokenOrder.map((color) => (
              <span key={color} className={(stagedDiscard[color] ?? 0) ? "active" : ""}>
                <img src={TOKEN_IMAGES[color]} alt="" />
                {stagedDiscard[color] ?? 0}
              </span>
            ))}
          </div>
          <button type="button" className="inline-confirm" onClick={confirmDiscard}>
            <CheckCircle2 size={16} />
            双击或点击确认弃置
          </button>
        </DropZone>
      ) : null}

      {player.nobles.length ? (
        <div className="my-nobles-row">
          {player.nobles.map((noble) => (
            <img key={noble.id} src={nobleImageUrl(noble.id)} alt={`已获贵族 ${noble.prestige} 分`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
