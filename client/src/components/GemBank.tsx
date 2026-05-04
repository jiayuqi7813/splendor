import type { GemColor, Gems } from "../types";
import { COLOR_LABELS, TOKEN_IMAGE, colorRing, gemColors } from "../types";

interface GemBankProps {
  bank: Gems;
  selected?: GemColor[];
  onToggle?: (color: GemColor) => void;
  compact?: boolean;
}

export function GemBank({ bank, selected = [], onToggle, compact = false }: GemBankProps) {
  return (
    <div className="gem-vault rounded-[1.6rem] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted-gold)]">Treasury</p>
          <h3 className="font-serif text-xl font-black text-[var(--gold-hi)]">宝石金库</h3>
        </div>
        <span className="rounded-full border border-[rgba(247,211,122,.28)] bg-black/25 px-3 py-1 text-xs text-[var(--parchment)]">银行</span>
      </div>
      <div className={compact ? "grid grid-cols-3 gap-2" : "space-y-3"}>
        {gemColors.map((color) => {
          const count = selected.filter((c) => c === color).length;
          const isSelected = count > 0;
          const disabled = color === "gold" && Boolean(onToggle);
          return (
            <button
              key={color}
              type="button"
              disabled={disabled}
              onClick={() => onToggle?.(color)}
              className={`group flex w-full items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition ${
                isSelected
                  ? "token-selected border-[rgba(247,211,122,.75)] bg-[rgba(214,168,79,.16)]"
                  : "border-[rgba(247,211,122,.16)] bg-black/20 hover:border-[rgba(247,211,122,.42)] hover:bg-[rgba(247,211,122,.08)]"
              } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <span className={`token-orb ${colorRing[color]} h-11 w-11 shrink-0`}>
                <img className="h-full w-full rounded-full object-cover" src={TOKEN_IMAGE[color]} alt={COLOR_LABELS[color]} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-sm font-black text-[var(--parchment)]">{COLOR_LABELS[color]}</div>
                <div className="text-[10px] text-[rgba(233,216,166,.55)]">{disabled ? "不可直接选取" : isSelected ? `已选 ${count}` : "金库库存"}</div>
              </div>
              <span className="rounded-full border border-[rgba(247,211,122,.35)] bg-[rgba(8,10,18,.78)] px-2.5 py-1 text-base font-black text-[var(--gold-hi)] shadow-inner">{bank[color]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
