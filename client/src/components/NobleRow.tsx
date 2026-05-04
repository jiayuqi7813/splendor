import type { Noble, PlayerState } from "../types";
import { BASIC_COLORS, COLOR_SHORT_LABELS, nobleImageUrl } from "../types";

interface NobleRowProps {
  nobles: Noble[];
  currentPlayer?: PlayerState;
}

function canVisit(noble: Noble, player?: PlayerState) {
  if (!player) return false;
  return BASIC_COLORS.every((color) => player.bonuses[color] >= noble.req[color]);
}

export function NobleRow({ nobles, currentPlayer }: NobleRowProps) {
  return (
    <section className="noble-gallery p-4">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.42em] text-[var(--gold-soft)]">noble gallery</p>
          <h2 className="font-serif text-2xl font-black text-[var(--parchment)]">贵族画廊</h2>
        </div>
        <span className="rounded-full border border-[var(--gold)]/25 bg-black/20 px-3 py-1 text-xs text-[var(--muted)]">满足永久宝石需求后自动拜访</span>
      </div>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-2">
        {nobles.map((noble) => (
          <div
            key={noble.id}
            className={`group relative shrink-0 rounded-[1.4rem] border bg-[#120b16]/80 p-2 shadow-[0_18px_34px_rgba(0,0,0,.42)] transition duration-300 hover:-translate-y-1 ${
              canVisit(noble, currentPlayer)
                ? "animate-[nobleGlow_2.8s_ease-in-out_infinite] border-[var(--gold-bright)] shadow-[0_0_28px_rgba(247,211,122,.45)]"
                : "border-[var(--gold)]/25"
            }`}
          >
            <img
              src={nobleImageUrl(noble.id)}
              alt={`贵族 ${noble.id}`}
              className="h-28 w-24 rounded-[1rem] border border-black/50 object-cover md:h-36 md:w-28"
            />
            {canVisit(noble, currentPlayer) && <div className="absolute -right-2 -top-2 rounded-full bg-[var(--gold-bright)] px-2 py-1 text-[10px] font-black text-[#27150a]">可拜访</div>}
            <div className="mt-2 text-center text-sm font-black text-[var(--gold-bright)]">{noble.prestige} 声望</div>
            <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-52 -translate-x-1/2 rounded-2xl border border-[var(--gold)]/40 bg-[#20140d]/95 p-3 text-xs text-[var(--parchment)] shadow-2xl group-hover:block">
              <div className="mb-2 font-serif text-base font-black text-[var(--gold-bright)]">贵族需求</div>
              <div className="grid grid-cols-5 gap-1">
                {BASIC_COLORS.map((color) => (
                  <span key={color} className="rounded-lg border border-[var(--gold)]/20 bg-black/25 px-1 py-1 text-center">
                    {COLOR_SHORT_LABELS[color]} {noble.req[color]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
