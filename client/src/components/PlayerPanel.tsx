import type { BasicColor, Card, HiddenCard, PlayerState } from "../types";
import { AVATARS, BASIC_COLORS, colorNames, colorStyles, isHiddenCard, tokenUrl } from "../types";

interface PlayerPanelProps {
  player: PlayerState;
  isCurrent: boolean;
  isMe: boolean;
  compact?: boolean;
}

const groupedCards = (cards: Card[]) =>
  BASIC_COLORS.reduce<Record<BasicColor, Card[]>>((acc, color) => {
    acc[color] = cards.filter((card) => card.color === color);
    return acc;
  }, {} as Record<BasicColor, Card[]>);

function ReservedCard({ card, isMe }: { card: Card | HiddenCard; isMe: boolean }) {
  if (isHiddenCard(card) || !isMe) {
    return (
      <div className="flex h-20 w-14 items-center justify-center rounded-lg border border-amber-300/40 bg-gradient-to-br from-emerald-900 to-slate-950 text-xs text-amber-100">
        保留
      </div>
    );
  }

  return <img src={`https://raw.githubusercontent.com/hexanome-04/splendor/master/client/public/images/development-cards/${card.id}.jpg`} className="h-20 w-14 rounded-lg object-cover" alt="保留卡" />;
}

export default function PlayerPanel({ player, isCurrent, isMe, compact = false }: PlayerPanelProps) {
  const groups = groupedCards(player.purchasedCards);
  const totalTokens = Object.values(player.gems).reduce((sum, value) => sum + value, 0);

  return (
    <section
      className={`rounded-2xl border bg-slate-950/70 p-4 shadow-xl transition ${
        isCurrent ? "animate-pulseGold border-amber-300 shadow-amber-400/30" : "border-white/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${AVATARS[player.avatarId % AVATARS.length].bg} text-2xl`}>
          {AVATARS[player.avatarId % AVATARS.length].emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-white">{player.username}</h3>
            {isMe && <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-100">我</span>}
            {player.connected === false && <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-100">离线</span>}
          </div>
          <p className="text-sm text-slate-300">声望 {player.prestige} · 代币 {totalTokens}/10 · 购卡 {player.purchasedCards.length}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {BASIC_COLORS.map((color) => (
          <div key={color} className={`rounded-lg border px-2 py-1 text-center text-sm ${colorStyles[color].border} bg-white/5`}>
            <div className={colorStyles[color].text}>{colorNames[color]}</div>
            <div className="font-bold text-white">{player.bonuses[color]}</div>
          </div>
        ))}
      </div>

      {!compact && (
        <>
          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-amber-100">持有代币</div>
            <div className="grid grid-cols-6 gap-2">
              {(["white", "blue", "green", "red", "brown", "gold"] as const).map((color) => (
                <div key={color} className="text-center">
                  <img src={tokenUrl(color)} className="mx-auto h-8 w-8 rounded-full" alt={colorNames[color]} />
                  <div className="text-xs text-white">{player.gems[color]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-amber-100">已购发展卡</div>
            <div className="grid grid-cols-5 gap-2">
              {BASIC_COLORS.map((color) => (
                <div key={color} className="relative min-h-16 rounded-lg border border-white/10 bg-black/20 p-1">
                  <div className={`text-center text-xs ${colorStyles[color].text}`}>{colorNames[color]}</div>
                  <div className="mt-1 flex flex-col items-center">
                    {groups[color].slice(0, 4).map((card, index) => (
                      <div key={card.id} className="-mt-1 h-4 w-10 rounded border border-white/20" style={{ backgroundColor: colorStyles[color].dot, zIndex: index }} />
                    ))}
                    <span className="mt-1 text-xs text-white">×{groups[color].length}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-amber-100">保留卡</div>
            <div className="flex gap-2">
              {player.reservedCards.length === 0 && <span className="text-sm text-slate-400">暂无保留卡</span>}
              {player.reservedCards.map((card, index) => (
                <ReservedCard key={`${card.id}-${index}`} card={card} isMe={isMe} />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
