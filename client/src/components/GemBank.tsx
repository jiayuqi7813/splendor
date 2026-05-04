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
    <div className="rounded-3xl border border-amber-300/20 bg-slate-950/70 p-4 shadow-2xl shadow-black/30">
      <h3 className="mb-3 text-lg font-bold text-amber-100">宝石银行</h3>
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
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                isSelected ? "border-amber-300 bg-amber-300/15 shadow-[0_0_18px_rgba(255,215,0,0.45)]" : "border-white/10 bg-white/5 hover:bg-white/10"
              } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <img className={`h-10 w-10 rounded-full border-2 ${colorRing[color]}`} src={TOKEN_IMAGE[color]} alt={COLOR_LABELS[color]} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-100">{COLOR_LABELS[color]}</div>
                <div className="text-xs text-slate-400">{disabled ? "不可直接选取" : isSelected ? `已选 ${count}` : "点击选择"}</div>
              </div>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-lg font-black text-amber-100">{bank[color]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
