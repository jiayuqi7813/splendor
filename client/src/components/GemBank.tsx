import type { GemColor, Gems } from "../types";
import { COLOR_LABELS, TOKEN_IMAGES } from "../types";
import { Draggable } from "./BoardDragProvider";

interface GemBankProps {
  bank: Gems;
  selected?: GemColor[];
  onToggle?: (color: GemColor) => void;
  compact?: boolean;
}

const bankOrder: GemColor[] = ["green", "blue", "red", "brown", "white", "gold"];

export function GemBank({ bank, selected = [], onToggle, compact = false }: GemBankProps) {
  return (
    <section className={`bank-panel ${compact ? "compact" : ""}`}>
      <h2>公共宝石区</h2>
      <div className="bank-tokens">
        {bankOrder.map((color) => {
          const selectedCount = selected.filter((c) => c === color).length;
          return (
            <Draggable key={color} id={`bank-gem:${color}`} data={{ kind: "bank-gem", color }} disabled={bank[color] <= 0 || color === "gold"} className="draggable-token">
              <button
                type="button"
                disabled={bank[color] <= 0}
                onClick={() => onToggle?.(color)}
                className={`bank-token ${selectedCount ? "selected" : ""}`}
                aria-label={`${COLOR_LABELS[color]}库存 ${bank[color]}`}
              >
                <img src={TOKEN_IMAGES[color]} alt="" />
                <span>{bank[color]}</span>
              </button>
            </Draggable>
          );
        })}
      </div>
    </section>
  );
}
