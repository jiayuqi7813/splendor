import { useMemo, useState } from 'react';
import type { BasicColor, Card, GameState, GemColor, Gems, PlayerState, TierState } from '../types';
import { BASIC_COLORS, COLOR_CN, GEM_VISUALS, TOKEN_IMAGES, cardImageUrl } from '../types';

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
  initialSelectedGems?: GemColor[];
  onClearGemSelection?: () => void;
}

const emptyBasic = (): Record<BasicColor, number> => ({ white: 0, blue: 0, green: 0, red: 0, brown: 0 });

function totalGems(gems: Gems) {
  return Object.values(gems).reduce((sum, n) => sum + n, 0);
}

function getTier(gameState: GameState, tier: 1 | 2 | 3): TierState {
  return tier === 1 ? gameState.tier1 : tier === 2 ? gameState.tier2 : gameState.tier3;
}

function calculateNeed(player: PlayerState, card: Card) {
  return BASIC_COLORS.reduce((acc, color) => {
    acc[color] = Math.max(0, card.cost[color] - player.bonuses[color]);
    return acc;
  }, emptyBasic());
}

function autoGoldPlan(player: PlayerState, card: Card) {
  const need = calculateNeed(player, card);
  const gold: Record<BasicColor, number> = emptyBasic();
  let goldLeft = player.gems.gold;
  let canBuy = true;
  for (const color of BASIC_COLORS) {
    const missing = Math.max(0, need[color] - player.gems[color]);
    if (missing > goldLeft) {
      canBuy = false;
    }
    gold[color] = missing;
    goldLeft -= missing;
  }
  return { need, gold, canBuy };
}

export default function ActionPanel({
  gameState,
  me,
  currentPlayer,
  selectedCard,
  onCloseCard,
  onTakeGems,
  onReserveCard,
  onBuyCard,
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
      const valid = unique.size === 3 && selectedGems.every((c) => c !== 'gold' && gameState.bank[c] > 0);
      return { valid, text: valid ? '可以取 3 种不同宝石' : '取 3 个时必须为三种不同且银行有库存' };
    }
    if (selectedGems.length === 2) {
      const [a, b] = selectedGems;
      const valid = a === b && a !== 'gold' && gameState.bank[a] >= 4;
      return { valid, text: valid ? `可以取 2 个${COLOR_CN[a]}` : '取 2 个相同宝石时，银行该颜色必须至少剩 4 个' };
    }
    return { valid: false, text: `已选择 ${selectedGems.length} 个，请选择 3 种不同或 2 个相同宝石` };
  }, [gameState.bank, selectedGems]);

  const toggleGem = (color: GemColor) => {
    if (color === 'gold' || !isMyTurn || mustDiscard) {
      return;
    }
    setSelectedGems((prev) => {
      const count = prev.filter((c) => c === color).length;
      const without = prev.filter((c) => c !== color);
      if (count === 0) {
        return prev.length < 3 ? [...prev, color] : [color];
      }
      if (count === 1 && prev.length <= 1 && gameState.bank[color] >= 4) {
        return [color, color];
      }
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

  const renderDiscard = () => (
    <div className="rounded-3xl border border-red-400/50 bg-red-950/40 p-4 shadow-2xl">
      <h3 className="text-xl font-bold text-red-100">必须弃置代币</h3>
      <p className="mt-1 text-sm text-red-100/80">你当前持有 {totalGems(me.gems)} 个代币，请选择弃置，直到剩余不超过 10 个。</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(['white', 'blue', 'green', 'red', 'brown', 'gold'] as GemColor[]).map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => changeDiscard(color)}
            disabled={me.gems[color] === 0}
            className="rounded-2xl border border-white/10 bg-slate-950/60 p-2 text-sm text-white disabled:opacity-40"
          >
            <img src={TOKEN_IMAGES[color]} alt={COLOR_CN[color]} className="mx-auto h-9 w-9 rounded-full" />
            <div>{COLOR_CN[color]}：{me.gems[color]}</div>
            <div className="text-amber-200">弃 {(discard[color] ?? 0)}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 text-sm text-white/80">弃置后剩余：{remainingTokens} 个</div>
      <button
        type="button"
        disabled={remainingTokens > 10}
        onClick={() => {
          onDiscardTokens(discard);
          setDiscard({});
        }}
        className="mt-3 w-full rounded-2xl bg-red-500 px-4 py-3 font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-600"
      >
        确认弃置
      </button>
    </div>
  );

  const renderDeckReserve = () => (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {([1, 2, 3] as const).map((tier) => {
        const tierState = getTier(gameState, tier);
        return (
          <button
            key={tier}
            type="button"
            disabled={!isMyTurn || mustDiscard || me.reservedCards.length >= 3 || tierState.deckCount <= 0}
            onClick={() => onReserveCard(null, tier)}
            className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            保留 {tier} 级牌堆
            <div className="text-xs text-white/60">{tierState.deckCount} 张</div>
          </button>
        );
      })}
    </div>
  );

  const renderCardModal = () => {
    if (!selectedCard) {
      return null;
    }
    const { need, gold, canBuy } = autoGoldPlan(me, selectedCard);
    const canReserve = me.reservedCards.length < 3;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCloseCard}>
        <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl border border-amber-300/40 bg-slate-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-5 md:flex-row">
            <img src={cardImageUrl(selectedCard.id)} alt={selectedCard.id} className="mx-auto w-56 rounded-2xl shadow-2xl" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-bold text-amber-100">发展卡 #{selectedCard.id}</h3>
                <button type="button" onClick={onCloseCard} className="rounded-full bg-white/10 px-3 py-1 text-white hover:bg-white/20">关闭</button>
              </div>
              <p className="mt-2 text-white/75">{selectedCard.tier} 级 · {COLOR_CN[selectedCard.color]}加成 · {selectedCard.prestige} 声望</p>
              <div className="mt-4 rounded-2xl bg-white/5 p-4">
                <h4 className="font-bold text-white">实际费用（已扣除永久加成）</h4>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/80">
                  {BASIC_COLORS.map((color) => (
                    <div key={color} className="rounded-xl bg-slate-900/80 px-3 py-2">
                      {COLOR_CN[color]}：需要 {need[color]}，你有 {me.gems[color]}，黄金补 {gold[color]}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={!isMyTurn || mustDiscard || !canBuy}
                  onClick={() => {
                    onBuyCard(selectedCard.id, gold);
                    onCloseCard();
                  }}
                  className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                >
                  {canBuy ? '购买' : '宝石不足，无法购买'}
                </button>
                <button
                  type="button"
                  disabled={!isMyTurn || mustDiscard || !canReserve}
                  onClick={() => {
                    onReserveCard(selectedCard.id, null);
                    onCloseCard();
                  }}
                  className="flex-1 rounded-2xl bg-amber-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-white"
                >
                  {canReserve ? '保留' : '保留区已满'}
                </button>
              </div>
              <p className="mt-3 text-xs text-white/50">购买时系统会精确使用上方黄金补充方案，不会多付黄金。</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className="rounded-3xl border border-amber-300/20 bg-slate-950/80 p-4 shadow-2xl">
      <h2 className="text-xl font-bold text-amber-100">操作面板</h2>
      {!isMyTurn && (
        <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-white/75">
          等待 {currentPlayer?.username ?? '当前玩家'} 行动。
        </div>
      )}
      {isMyTurn && !mustDiscard && (
        <>
          <div className="mt-3 rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-100">轮到你行动：请选择取宝石、保留卡或点击卡牌购买。</div>
          <div className="mt-4">
            <h3 className="font-bold text-white">取宝石</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {BASIC_COLORS.map((color) => {
                const selectedCount = selectedGems.filter((c) => c === color).length;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleGem(color)}
                    className={`rounded-2xl border p-2 text-sm text-white transition ${selectedCount ? 'border-amber-300 bg-amber-300/20 shadow-[0_0_18px_rgba(251,191,36,.55)]' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  >
                    <img src={TOKEN_IMAGES[color]} alt={COLOR_CN[color]} className="mx-auto h-9 w-9 rounded-full" />
                    <div>{COLOR_CN[color]} × {selectedCount}</div>
                    <div className="text-xs text-white/50">银行 {gameState.bank[color]}</div>
                  </button>
                );
              })}
            </div>
            <p className={`mt-2 text-sm ${gemValidation.valid ? 'text-emerald-200' : 'text-amber-200'}`}>{gemValidation.text}</p>
            <button
              type="button"
              disabled={!gemValidation.valid}
              onClick={() => {
                onTakeGems(selectedGems);
                setSelectedGems([]);
              }}
              className="mt-3 w-full rounded-2xl bg-blue-500 px-4 py-3 font-bold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              确认取宝石
            </button>
          </div>
          <div className="mt-5">
            <h3 className="font-bold text-white">从牌堆保留</h3>
            {renderDeckReserve()}
          </div>
        </>
      )}
      {mustDiscard && renderDiscard()}
      {renderCardModal()}
      <div className="mt-5 rounded-2xl bg-black/30 p-3 text-xs leading-relaxed text-white/55">
        提示：点击场上的发展卡可查看大图、实际费用，并执行购买或保留。购买保留卡时可点击自己面板中的保留卡。
      </div>
    </aside>
  );
}
