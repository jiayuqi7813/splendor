import type { Card, HiddenCard, TierState } from "../types";
import { BACK_IMAGES, CARD_IMAGES, COLOR_LABELS, COST_KEYS, GEM_VISUALS, TIER_VISUALS } from "../types";

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
    const tierInfo = TIER_VISUALS[deckTier];
    return (
      <button
        onClick={onClick}
        disabled={disabled || count <= 0}
        className="deck-plinth group relative flex w-24 shrink-0 flex-col items-center gap-2 rounded-[1.35rem] p-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-28"
      >
        <div className={`absolute inset-1 rounded-[1.1rem] bg-gradient-to-br ${tierInfo.gradient} opacity-20 blur-md transition group-hover:opacity-45`} />
        <img
          src={BACK_IMAGES[deckTier]}
          alt={`${tierInfo.label}牌堆`}
          className="card-hover relative h-32 w-24 rounded-xl border border-[rgba(247,211,122,.45)] object-cover shadow-[0_18px_38px_rgba(0,0,0,.5)] md:h-40 md:w-28"
        />
        <span className="relative rounded-full border border-[rgba(247,211,122,.45)] bg-[rgba(12,8,4,.78)] px-3 py-1 text-xs font-black text-[var(--gold-bright)] shadow-[0_0_16px_rgba(214,168,79,.25)]">{count}张</span>
        <span className="relative text-[10px] tracking-[.22em] text-[var(--parchment-dim)]">{tierInfo.label}</span>
      </button>
    );
  }

  if (!card) {
    return (
      <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-[rgba(214,168,79,.28)] bg-[radial-gradient(circle_at_center,rgba(214,168,79,.08),rgba(5,7,13,.45))] text-xs tracking-[.28em] text-[var(--parchment-dim)] md:h-40 md:w-28">
        空槽
      </div>
    );
  }

  if (isHidden(card)) {
    const hiddenTier = card.tier ?? tier ?? 1;
    return (
      <div className="flex w-24 shrink-0 flex-col items-center gap-2 md:w-28">
        <img
          src={BACK_IMAGES[hiddenTier]}
          alt="隐藏保留卡"
          className="h-32 w-24 rounded-xl border border-[rgba(214,168,79,.38)] object-cover shadow-[0_14px_30px_rgba(0,0,0,.45)] md:h-40 md:w-28"
        />
        <span className="rounded-full border border-[rgba(214,168,79,.32)] bg-black/35 px-2 py-0.5 text-[10px] tracking-[.18em] text-[var(--parchment)]">封存</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative w-24 shrink-0 rounded-xl text-left transition duration-200 hover:z-20 disabled:cursor-not-allowed md:w-28"
    >
      <div className={`absolute -inset-1 rounded-2xl bg-gradient-to-br ${GEM_VISUALS[card.color].gradient} opacity-0 blur-md transition duration-300 group-hover:opacity-45`} />
      <img
        src={CARD_IMAGES(card.id)}
        alt={`发展卡 ${card.id}`}
        className="card-hover relative h-32 w-24 rounded-xl border border-[rgba(247,211,122,.42)] object-cover shadow-[0_20px_42px_rgba(0,0,0,.5)] md:h-40 md:w-28"
      />
      <div className="parchment-panel pointer-events-none absolute left-1/2 top-2 z-30 hidden w-52 -translate-x-1/2 p-3 text-xs shadow-2xl group-hover:block">
        <div className="mb-2 font-black text-[var(--ink)]">
          {COLOR_LABELS[card.color]} · {card.prestige} 声望
        </div>
        <div className="grid grid-cols-5 gap-1">
          {COST_KEYS.map((color) => (
            <span key={color} className="rounded-lg border border-[rgba(47,31,20,.18)] bg-[rgba(255,255,255,.34)] px-1 py-0.5 text-center text-[var(--ink)]">
              {COLOR_LABELS[color]} {card.cost[color]}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
