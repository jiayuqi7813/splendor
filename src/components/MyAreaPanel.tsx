import { Bookmark, CheckCircle2, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import type { BasicColor, Card, GameVariant, GemColor, PlayerState, ReservedCard } from "~/game/types";
import {
  BASIC_COLORS,
  cardImageUrl,
  colorLabelsFor,
  deckBackUrl,
  isHiddenCard,
  nobleImageUrl,
  tokenImagesFor,
} from "~/game/types";
import { Draggable, DropZone, useBoardDrag } from "./BoardDragProvider";
import { PaymentDropZone } from "./PaymentDropZone";

const tokenOrder: GemColor[] = ["white", "blue", "green", "red", "brown", "gold"];

function groupedPurchasedCards(player: PlayerState) {
  return BASIC_COLORS.reduce<Record<BasicColor, Card[]>>((acc, color) => {
    acc[color] = player.purchasedCards.filter((card) => card.color === color);
    return acc;
  }, {} as Record<BasicColor, Card[]>);
}

function MiniCard({ card, draggable, variant }: { card: ReservedCard; draggable?: boolean; variant: GameVariant }) {
  if (isHiddenCard(card)) {
    const tier = card.tier ?? 1;
    return (
      <span className="mini-card back">
        <img src={deckBackUrl(tier, variant, card.deckKind ?? "common")} alt="" />
      </span>
    );
  }

  const image = (
    <button type="button" className="mini-card" aria-label={`预留卡 ${card.prestige} 分`}>
      <img src={cardImageUrl(card.id, card)} alt="" />
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

function EmptyPurchasedSlot() {
  return (
    <span className="tiny-card empty-purchased-card" aria-hidden="true">
      <b>0</b>
    </span>
  );
}

function EmptyReserveSlot({ index }: { index: number }) {
  return (
    <span className="mini-card reserve-slot empty" aria-label={`预留空位 ${index + 1}`}>
      <b>{index + 1}</b>
    </span>
  );
}

export function MyAreaPanel({ player, variant = "classic" }: { player: PlayerState; variant?: GameVariant }) {
  const {
    selectedCard,
    selectedCardSource,
    stagedDiscard,
    stagedReserve,
    notice,
    mustDiscard,
    stageReserveCard,
    clearDiscard,
    clearReserve,
    confirmReserve,
    confirmDiscard,
    availableEvolutions,
    canHandleEvolution,
    confirmEvolution,
    skipEvolution,
  } = useBoardDrag();
  const groups = groupedPurchasedCards(player);
  const labels = colorLabelsFor(variant);
  const tokenImages = tokenImagesFor(variant);
  const openReserveSlots = Math.max(0, 3 - player.reservedCards.length - (stagedReserve ? 1 : 0));

  return (
    <section className="my-area-panel">
      <div className="my-area-title">
        <h2>我的区域{variant === "pokemon" ? "（你的回合）" : ""}</h2>
        <p>{notice}</p>
      </div>

      <div className="my-playmat">
        <div className="purchased-zone">
          <div className="mini-section-head">
            <strong>{variant === "pokemon" ? "我的宝可梦" : "我的卡片"} ({player.purchasedCards.length})</strong>
            <span>{variant === "pokemon" && player.tuckedCards.length ? `进化压底 ${player.tuckedCards.length}` : "按颜色分组"}</span>
          </div>
          <div className="purchased-groups">
            {BASIC_COLORS.map((color) => (
              <div key={color} className="purchased-group">
                <span style={{ "--group-color": `var(--gem-${color})` } as CSSProperties}>{labels[color]} ({groups[color].length})</span>
                <div>
                  {groups[color].slice(0, 6).map((card) => (
                    <span key={card.id} className="tiny-card">
                      <img src={cardImageUrl(card.id, card)} alt="" />
                      <b>{card.prestige}</b>
                    </span>
                  ))}
                  {groups[color].length === 0 ? <EmptyPurchasedSlot /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="reserve-stack">
          <DropZone
            id="reserve-zone"
            className={`reserve-zone ${stagedReserve ? "has-staged-reserve" : ""}`}
            label="预留区，拖入卡牌后点击确认预留"
          >
            <div className="mini-section-head">
              <strong>{variant === "pokemon" ? "保留宝可梦" : "预留卡"} ({player.reservedCards.length}/3)</strong>
              <span className="reserve-head-actions">
                {selectedCard && selectedCardSource !== "reserved" ? (
                  <button type="button" onClick={(event) => {
                    event.stopPropagation();
                    stageReserveCard(selectedCard);
                  }} aria-label="预留选中卡">
                    <Bookmark size={15} />
                  </button>
                ) : null}
                <button type="button" onClick={(event) => {
                  event.stopPropagation();
                  clearReserve();
                }} aria-label="清空待预留">
                  <RotateCcw size={15} />
                </button>
              </span>
            </div>
            <div className="reserved-card-row">
              {player.reservedCards.map((card, index) => (
                <MiniCard key={`${card.id}-${index}`} card={card} draggable variant={variant} />
              ))}
              {stagedReserve ? (
                <span className="mini-card reserved-staged">
                  <Bookmark size={18} />
                  <b>{stagedReserve.card ? "卡" : stagedReserve.fromDeck}</b>
                </span>
              ) : null}
              {Array.from({ length: openReserveSlots }, (_, index) => (
                <EmptyReserveSlot key={`empty-reserve-${index}`} index={player.reservedCards.length + (stagedReserve ? 1 : 0) + index} />
              ))}
            </div>
            {stagedReserve ? (
              <button type="button" className="reserve-confirm-button" onClick={(event) => {
                event.stopPropagation();
                confirmReserve();
              }}>
                <CheckCircle2 size={16} />
                确认预留
              </button>
            ) : null}
          </DropZone>

          <AchievementSummary player={player} variant={variant} />
        </div>
      </div>

      <div className="my-action-rail">
        {variant === "pokemon" && canHandleEvolution ? (
          <div className="evolution-zone">
            <div className="mini-section-head">
              <strong>可进化宝可梦</strong>
              <button type="button" onClick={skipEvolution}>跳过</button>
            </div>
            <div className="evolution-options">
              {availableEvolutions.map((card) => (
                <button key={card.id} type="button" onClick={() => confirmEvolution(card.id)}>
                  <img src={cardImageUrl(card.id, card)} alt="" />
                  <span>{card.evolvesFrom} → {card.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <PaymentDropZone />
        )}

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
                  <img src={tokenImages[color]} alt="" />
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
      </div>
    </section>
  );
}

function AchievementSummary({ player, variant }: { player: PlayerState; variant: GameVariant }) {
  if (variant === "pokemon") {
    const tuckedPreview = player.tuckedCards.slice(-5);
    return (
      <div className="achievement-zone pokemon-achievement-zone">
        <div className="mini-section-head">
          <strong>进化压底</strong>
          <span>{player.tuckedCards.length} 张</span>
        </div>
        <div className="achievement-card-row">
          {tuckedPreview.map((card) => (
            <span key={card.id} className="tiny-card">
              <img src={cardImageUrl(card.id, card)} alt="" />
              <b>{card.prestige}</b>
            </span>
          ))}
          {!tuckedPreview.length ? <em>捕捉后可在这里查看被压底的进化素材</em> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="achievement-zone my-nobles-row">
      <div className="mini-section-head">
        <strong>已获贵族</strong>
        <span>{player.nobles.length} 位</span>
      </div>
      <div className="achievement-card-row">
        {player.nobles.map((noble) => (
          <img key={noble.id} src={nobleImageUrl(noble.id)} alt={`已获贵族 ${noble.prestige} 分`} />
        ))}
        {!player.nobles.length ? <em>满足条件后贵族会自动来访</em> : null}
      </div>
    </div>
  );
}

export function MyGemsZone({ player, className = "", variant = "classic" }: { player: PlayerState; className?: string; variant?: GameVariant }) {
  const { stagedTakeGems, describeTake, clearStagedTake, confirmTake, canConfirmTake } = useBoardDrag();
  const labels = colorLabelsFor(variant);
  const tokenImages = tokenImagesFor(variant);

  return (
    <DropZone
      id="my-gems-zone"
      className={`my-gems-zone ${className}`.trim()}
      label="我的宝石区，拖入公共宝石后点击确认拿取"
    >
      <div className="mini-section-head">
        <strong>{variant === "pokemon" ? "我的精灵球" : "我的宝石"}</strong>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            clearStagedTake();
          }}
          aria-label="清空待拿宝石"
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="my-token-row">
        {tokenOrder.map((color) => (
          <Draggable key={color} id={`my-gem:${color}`} data={{ kind: "my-gem", color }} disabled={player.gems[color] <= 0} className="draggable-token">
            <button type="button" className="my-token" disabled={player.gems[color] <= 0} aria-label={`我的${labels[color]} ${player.gems[color]}`}>
              <img src={tokenImages[color]} alt="" />
              <span>{player.gems[color]}</span>
            </button>
          </Draggable>
        ))}
      </div>
      <div className="staged-gem-row" onClick={(event) => event.stopPropagation()}>
        <span>{describeTake}</span>
        {stagedTakeGems.map((color, index) => (
          <img key={`${color}-${index}`} src={tokenImages[color]} alt="" />
        ))}
        <button
          type="button"
          className="take-confirm-button"
          disabled={!canConfirmTake}
          onClick={(event) => {
            event.stopPropagation();
            confirmTake();
          }}
        >
          <CheckCircle2 size={15} />
          确认拿取
        </button>
      </div>
    </DropZone>
  );
}
