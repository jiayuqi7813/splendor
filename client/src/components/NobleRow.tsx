import type { BasicColor, Noble, PlayerState } from "../types";

const BASE_URL = "https://raw.githubusercontent.com/hexanome-04/splendor/master/client/public/images";
const BASIC_COLORS: BasicColor[] = ["white", "blue", "green", "red", "brown"];
const COLOR_LABEL: Record<BasicColor, string> = {
  white: "白",
  blue: "蓝",
  green: "绿",
  red: "红",
  brown: "棕",
};

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
    <section className="rounded-3xl border border-amber-400/20 bg-slate-950/60 p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold text-amber-200">贵族拜访区</h2>
        <span className="text-sm text-slate-400">满足永久宝石需求后自动拜访</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {nobles.map((noble) => (
          <div
            key={noble.id}
            className={`group relative shrink-0 rounded-2xl border bg-slate-900/80 p-2 transition hover:-translate-y-1 ${
              canVisit(noble, currentPlayer)
                ? "border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.45)]"
                : "border-amber-400/20"
            }`}
          >
            <img
              src={`${BASE_URL}/nobles/${noble.id}.jpg`}
              alt={`贵族 ${noble.id}`}
              className="h-28 w-24 rounded-xl object-cover md:h-36 md:w-28"
            />
            <div className="mt-2 text-center text-sm font-bold text-amber-200">{noble.prestige} 声望</div>
            <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-48 -translate-x-1/2 rounded-xl border border-amber-300/30 bg-slate-950 p-3 text-xs text-slate-100 shadow-2xl group-hover:block">
              <div className="mb-1 font-bold text-amber-200">贵族需求</div>
              <div className="grid grid-cols-5 gap-1">
                {BASIC_COLORS.map((color) => (
                  <span key={color} className="rounded bg-white/10 px-1 py-0.5 text-center">
                    {COLOR_LABEL[color]} {noble.req[color]}
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
