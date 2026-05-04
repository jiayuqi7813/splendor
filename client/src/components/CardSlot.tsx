import type { Card, HiddenCard, TierState } from "../types";
import { BACK_IMAGES, CARD_IMAGES, COLOR_LABELS, COST_KEYS } from "../types";

interface Props {
  card?: Card | HiddenCard | null;
  tier?: 1 | 2 | 3;
  deck?: TierState;
  mode?: "card" | "deck" | "reserved";
  onClick?: () => void;
  disabled?: boolean;
}

function isHidden(card: Card | HiddenCard | null | undefined): card is HiddenCard {
  return Boolean(card && "hidden" in card);
}

export function CardSlot({ card, tier, deck, mode = "card", onClick, disabled }: Props) {
  if (mode === "deck") {
    const deckTier = tier ?? 1;
    const count = deck?.deckCount ?? 0;
    return (
      <button
        onClick={onClick}
        disabled={disabled || count <= 0}
        className="group relative flex w-24 shrink-0 flex-col items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-28"
      >
        <img
          src={BACK_IMAGES[deckTier]}
          className="h-32 w-24 rounded-xl border border-amber-300/40 object-cover shadow-xl transition duration-200 group-hover:scale-105 md:h-40 md:w-28"
        />
        <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-amber-100">{count}张</span>
      </button>
    );
  }

  if (!card) {
    return (
      <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/40 text-xs text-slate-500 md:h-40 md:w-28">
        空位
      </div>
    );
  }

  if (isHidden(card)) {
    const hiddenTier = card.tier ?? tier ?? 1;
    return (
      <div className="flex w-24 shrink-0 flex-col items-center gap-2 md:w-28">
        <img
          src={BACK_IMAGES[hiddenTier]}
          className="h-32 w-24 rounded-xl border border-slate-500/40 object-cover shadow-lg md:h-40 md:w-28"
        />
        <span className="text-xs text-slate-300">保留卡</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative w-24 shrink-0 text-left transition duration-200 hover:z-20 disabled:cursor-not-allowed md:w-28"
    >
      <img
        src={CARD_IMAGES(card.id)}
        className="h-32 w-24 rounded-xl border border-amber-200/30 object-cover shadow-xl transition duration-200 group-hover:scale-105 md:h-40 md:w-28"
      />
      <div className="pointer-events-none absolute left-1/2 top-2 z-30 hidden w-48 -translate-x-1/2 rounded-xl border border-amber-300/40 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-2xl group-hover:block">
        <div className="mb-1 font-bold text-amber-200">
          {COLOR_LABELS[card.color]} · {card.prestige} 声望
        </div>
        <div className="grid grid-cols-5 gap-1">
          {COST_KEYS.map((color) => (
            <span key={color} className="rounded bg-white/10 px-1 py-0.5 text-center">
              {COLOR_LABELS[color]} {card.cost[color]}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
