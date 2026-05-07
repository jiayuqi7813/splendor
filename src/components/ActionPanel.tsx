import { Bookmark, CircleCheck, Hand, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import type { BasicColor, Card, GameState, GemColor, Gems, PlayerState } from "../types";
import { BASIC_COLORS, COLOR_LABELS, TOKEN_IMAGES } from "../types";

interface Props {
  gameState: GameState;
  me: PlayerState;
  currentPlayer?: PlayerState;
  selectedCard: Card | null;
  onCloseCard: () => void;
  onTakeGems: (colors: GemColor[]) => void;
  onReserveCard: (cardId: string | null, fromDeck: 1 | 2 | 3 | null) => void;
  onBuyCard: (cardId: string, goldSubstitutions: Partial<Record<BasicColor, number>>) => void;
  onDiscardTokens: (tokens: Partial<Gems>) => void;
  pendingDiscardExcess: number | null;
}

const gemOrder: GemColor[] = ["green", "white", "blue", "red", "brown"];
const discardOrder: GemColor[] = ["green", "blue", "red", "brown", "white", "gold"];

function totalGems(gems: Gems) {
  return Object.values(gems).reduce((sum, n) => sum + n, 0);
}

export default function ActionPanel({
  gameState,
  me,
  currentPlayer,
  selectedCard,
  onTakeGems,
  onReserveCard,
  onDiscardTokens,
  pendingDiscardExcess,
}: Props) {
  const [selectedGems, setSelectedGems] = useState<GemColor[]>([]);
  const [discard, setDiscard] = useState<Partial<Gems>>({});
  const isMyTurn = gameState.currentPlayerId === me.id;
  const mustDiscard = gameState.pendingDiscardPlayerId === me.id || pendingDiscardExcess !== null;

  const gemValidation = useMemo(() => {
    if (selectedGems.length === 3) {
      const unique = new Set(selectedGems);
      const valid = unique.size === 3 && selectedGems.every((c) => c !== "gold" && gameState.bank[c] > 0);
      return { valid, text: valid ? "可拿取 3 种不同宝石" : "三颗必须不同且库存充足" };
    }

    if (selectedGems.length === 2) {
      const [a, b] = selectedGems;
      const valid = a === b && a !== "gold" && gameState.bank[a] >= 4;
      return { valid, text: valid ? `可拿取 2 枚${COLOR_LABELS[a]}` : "两颗相同宝石要求库存至少 4" };
    }

    return { valid: false, text: selectedGems.length ? `已选择 ${selectedGems.length} 枚` : "选择宝石后确认拿取" };
  }, [gameState.bank, selectedGems]);

  const toggleGem = (color: GemColor) => {
    if (color === "gold" || !isMyTurn || mustDiscard || gameState.bank[color] <= 0) return;
    setSelectedGems((prev) => {
      const count = prev.filter((c) => c === color).length;
      const without = prev.filter((c) => c !== color);
      if (count === 0) return prev.length < 3 ? [...prev, color] : [color];
      if (count === 1 && prev.length <= 1 && gameState.bank[color] >= 4) return [color, color];
      return without;
    });
  };

  const discardTotal = Object.values(discard).reduce((sum, n) => sum + (n ?? 0), 0);
  const remainingTokens = totalGems(me.gems) - discardTotal;

  const changeDiscard = (color: GemColor) => {
    setDiscard((prev) => {
      const current = prev[color] ?? 0;
      const next = current >= me.gems[color] ? 0 : current + 1;
      return { ...prev, [color]: next };
    });
  };

  if (!isMyTurn) {
    return (
      <div className="action-stack muted">
        <button className="action-command teal" type="button" disabled>
          <Hand size={25} />
          <span>
            等待行动
            <small>{currentPlayer?.username ?? "当前玩家"} 的回合</small>
          </span>
        </button>
        <button className="action-command blue" type="button" disabled>
          <ShoppingCart size={25} />
          <span>
            购买卡牌
            <small>轮到你时点击卡牌</small>
          </span>
        </button>
        <button className="action-command amber" type="button" disabled>
          <Bookmark size={25} />
          <span>
            预留卡牌
            <small>最多保留 3 张</small>
          </span>
        </button>
      </div>
    );
  }

  if (mustDiscard) {
    return (
      <div className="discard-panel">
        <h2>必须弃置代币</h2>
        <p>当前 {totalGems(me.gems)} 枚，弃至 10 枚以内。</p>
        <div className="discard-grid">
          {discardOrder.map((color) => (
            <button
              key={color}
              className="discard-chip"
              type="button"
              onClick={() => changeDiscard(color)}
              disabled={me.gems[color] === 0}
            >
              <img src={TOKEN_IMAGES[color]} alt={COLOR_LABELS[color]} />
              <span>{COLOR_LABELS[color]}</span>
              <strong>{discard[color] ?? 0}</strong>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="action-submit"
          disabled={remainingTokens > 10}
          onClick={() => {
            onDiscardTokens(discard);
            setDiscard({});
          }}
        >
          <CircleCheck size={18} />
          确认弃置 · 剩余 {remainingTokens}
        </button>
      </div>
    );
  }

  return (
    <div className="action-stack">
      <div className="gem-picker">
        <div className="picker-head">
          <Hand size={24} />
          <span>
            拿取宝石
            <small>{gemValidation.text}</small>
          </span>
        </div>
        <div className="picker-grid">
          {gemOrder.map((color) => {
            const selectedCount = selectedGems.filter((c) => c === color).length;
            return (
              <button
                key={color}
                className={`picker-token ${selectedCount ? "selected" : ""}`}
                type="button"
                onClick={() => toggleGem(color)}
                disabled={gameState.bank[color] <= 0}
              >
                <img src={TOKEN_IMAGES[color]} alt={COLOR_LABELS[color]} />
                <span>{selectedCount || gameState.bank[color]}</span>
              </button>
            );
          })}
        </div>
        <button
          className="action-command teal"
          type="button"
          disabled={!gemValidation.valid}
          onClick={() => {
            onTakeGems(selectedGems);
            setSelectedGems([]);
          }}
        >
          <CircleCheck size={23} />
          <span>
            确认拿取
            <small>从公共区拿宝石</small>
          </span>
        </button>
      </div>

      <button className="action-command blue" type="button" disabled={!selectedCard}>
        <ShoppingCart size={25} />
        <span>
          购买卡牌
          <small>{selectedCard ? "在右侧详情确认" : "先选择一张发展卡"}</small>
        </span>
      </button>

      <button
        className="action-command amber"
        type="button"
        disabled={!selectedCard || me.reservedCards.length >= 3}
        onClick={() => selectedCard && onReserveCard(selectedCard.id, null)}
      >
        <Bookmark size={25} />
        <span>
          预留卡牌
          <small>{me.reservedCards.length}/3 张已保留</small>
        </span>
      </button>

      <button className="action-command quiet" type="button" disabled>
        <CircleCheck size={25} />
        <span>
          结束回合
          <small>将回合交给下一位玩家</small>
        </span>
      </button>
    </div>
  );
}
