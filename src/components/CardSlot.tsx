import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Card, GameVariant, HiddenCard, TierState } from "~/game/types";
import { BACK_IMAGES, BASIC_COLORS, CARD_IMAGES, COLOR_LABELS, colorLabelsFor, deckBackUrl, tokenImagesFor, cardImageUrl } from "~/game/types";
import { Draggable, DropZone } from "./BoardDragProvider";

interface Props {
  card?: Card | HiddenCard | null;
  tier?: 1 | 2 | 3;
  deck?: TierState;
  mode?: "card" | "deck" | "reserved";
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  variant?: GameVariant;
  deckKind?: "common" | "rare" | "legendary";
  dealIndex?: number;
}

function isHidden(card: Card | HiddenCard | null | undefined): card is HiddenCard {
  return Boolean(card && "hidden" in card);
}

const deckLabels: Record<1 | 2 | 3, string> = {
  1: "LEVEL I",
  2: "LEVEL II",
  3: "LEVEL III",
};

export function CardSlot({ card, tier, deck, mode = "card", onClick, disabled, selected, variant = "classic", deckKind = "common", dealIndex }: Props) {
  const labels = colorLabelsFor(variant);
  const tokenImages = tokenImagesFor(variant);
  const [isDealing, setIsDealing] = useState(false);
  const previousCardIdRef = useRef<string | null>(null);

  const visibleCardId = card && !isHidden(card) ? card.id : null;
  useEffect(() => {
    const previousCardId = previousCardIdRef.current;
    previousCardIdRef.current = visibleCardId;
    if (!visibleCardId || !previousCardId || previousCardId === visibleCardId || dealIndex === undefined) return;

    setIsDealing(false);
    const frame = window.requestAnimationFrame(() => setIsDealing(true));
    const timer = window.setTimeout(() => setIsDealing(false), 620);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [dealIndex, visibleCardId]);

  if (mode === "deck") {
    const deckTier = tier ?? 1;
    const count = deck?.deckCount ?? 0;
    const deckButton = (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || count <= 0}
        className={`deck-card deck-tier-${deckTier}`}
        aria-label={`${deckTier} 级牌堆，剩余 ${count} 张`}
      >
        <img src={variant === "pokemon" ? deckBackUrl(deckTier, variant, deckKind) : BACK_IMAGES[deckTier]} alt="" />
        <span>{variant === "pokemon" ? deckLabels[deckTier].replace("LEVEL", "STAGE") : deckLabels[deckTier]}</span>
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
      <div className={`deck-card reserved-back deck-tier-${hiddenTier}`}>
        <img src={deckBackUrl(hiddenTier, variant, card.deckKind ?? "common")} alt="" />
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
        className={`market-card ${selected ? "selected" : ""} ${isDealing ? "dealing-from-deck" : ""} deal-slot-${Math.min(dealIndex ?? 0, 3)}`}
        style={
          {
            "--card-accent": `var(--gem-${card.color})`,
          } as CSSProperties
        }
        aria-label={`${labels[card.color]}${variant === "pokemon" ? "宝可梦" : "发展卡"}，${card.prestige} 分`}
      >
        <img src={variant === "pokemon" ? cardImageUrl(card.id, card) : CARD_IMAGES(card.id)} alt="" />
        {variant === "pokemon" ? null : (
          <>
            <span className="market-prestige">{card.prestige}</span>
            <span className="market-bonus" />
            <span className="market-tier">{card.tier}</span>
            <span className="market-costs">
              {visibleCosts.map((color) => (
                <span key={color}>
                  <img src={tokenImages[color]} alt="" />
                  <b>{card.cost[color]}</b>
                </span>
              ))}
            </span>
          </>
        )}
      </button>
    </DropZone>
  );

  return (
    <Draggable id={`market-card:${card.id}`} data={{ kind: "market-card", card }} disabled={disabled} className="draggable-card-shell">
      {cardButton}
    </Draggable>
  );
}
