import type { CSSProperties } from "react";
import type { Card, HiddenCard, TierState } from "../types";
import { BACK_IMAGES, BASIC_COLORS, CARD_IMAGES, COLOR_LABELS, TOKEN_IMAGES } from "../types";
import { Draggable, DropZone } from "./BoardDragProvider";

interface Props {
  card?: Card | HiddenCard | null;
  tier?: 1 | 2 | 3;
  deck?: TierState;
  mode?: "card" | "deck" | "reserved";
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}

function isHidden(card: Card | HiddenCard | null | undefined): card is HiddenCard {
  return Boolean(card && "hidden" in card);
}

const deckLabels: Record<1 | 2 | 3, string> = {
  1: "LEVEL I",
  2: "LEVEL II",
  3: "LEVEL III",
};

export function CardSlot({ card, tier, deck, mode = "card", onClick, disabled, selected }: Props) {
  if (mode === "deck") {
    const deckTier = tier ?? 1;
    const count = deck?.deckCount ?? 0;
    const deckButton = (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || count <= 0}
        className="deck-card"
        aria-label={`${deckTier} 级牌堆，剩余 ${count} 张`}
      >
        <img src={BACK_IMAGES[deckTier]} alt="" />
        <span>{deckLabels[deckTier]}</span>
        <strong>{count}</strong>
      </button>
    );
    return (
      <Draggable id={`deck:${deckTier}`} data={{ kind: "deck", tier: deckTier }} disabled={disabled || count <= 0} className="draggable-card-shell">
        {deckButton}
      </Draggable>
    );
  }

  if (!card) {
    return <div className="market-card empty-card" aria-label="空卡槽" />;
  }

  if (isHidden(card)) {
    const hiddenTier = card.tier ?? tier ?? 1;
    return (
      <div className="deck-card reserved-back">
        <img src={BACK_IMAGES[hiddenTier]} alt="" />
        <span>保留</span>
      </div>
    );
  }

  const visibleCosts = BASIC_COLORS.filter((color) => card.cost[color] > 0);

  const cardButton = (
    <DropZone id={`card-drop:${card.id}`} className="card-drop-surface">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`market-card ${selected ? "selected" : ""}`}
        style={{ "--card-accent": `var(--gem-${card.color})` } as CSSProperties}
        aria-label={`${COLOR_LABELS[card.color]}发展卡，${card.prestige} 分`}
      >
        <img src={CARD_IMAGES(card.id)} alt="" />
        <span className="market-prestige">{card.prestige}</span>
        <span className="market-bonus" />
        <span className="market-tier">{card.tier}</span>
        <span className="market-costs">
          {visibleCosts.map((color) => (
            <span key={color}>
              <img src={TOKEN_IMAGES[color]} alt="" />
              <b>{card.cost[color]}</b>
            </span>
          ))}
        </span>
      </button>
    </DropZone>
  );

  return (
    <Draggable id={`market-card:${card.id}`} data={{ kind: "market-card", card }} disabled={disabled} className="draggable-card-shell">
      {cardButton}
    </Draggable>
  );
}
