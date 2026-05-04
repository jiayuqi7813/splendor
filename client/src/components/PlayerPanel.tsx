import type { BasicColor, Card, HiddenCard, PlayerState } from "../types";
import { AVATARS, AVATAR_BACKGROUNDS, BASIC_COLORS, GEM_VISUALS, colorNames, colorStyles, isHiddenCard, tokenUrl } from "../types";

interface PlayerPanelProps {
  player: PlayerState;
  isCurrent: boolean;
  isMe: boolean;
  compact?: boolean;
  detailed?: boolean;
}

const groupedCards = (cards: Card[]) =>
  BASIC_COLORS.reduce<Record<BasicColor, Card[]>>((acc, color) => {
    acc[color] = cards.filter((card) => card.color === color);
    return acc;
  }, {} as Record<BasicColor, Card[]>);

function ReservedCard({ card, isMe }: { card: Card | HiddenCard; isMe: boolean }) {
  if (isHiddenCard(card) || !isMe) {
    return (
      <div className="relative flex h-24 w-16 items-center justify-center overflow-hidden rounded-xl border border-[rgba(214,168,79,.5)] bg-gradient-to-br from-[#17331f] via-[#0b1414] to-[#05070c] text-xs text-[var(--parchment)] shadow-[0_14px_24px_rgba(0,0,0,.42)]">
        <span className="absolute inset-2 rounded-lg border border-[rgba(247,211,122,.18)]" />
        <span className="relative font-serif tracking-[0.25em] [writing-mode:vertical-rl]">封存</span>
      </div>
    );
  }

  return <img src={`https://raw.githubusercontent.com/hexanome-04/splendor/master/client/public/images/development-cards/${card.id}.jpg`} className="card-hover h-24 w-16 rounded-xl border border-[rgba(247,211,122,.35)] object-cover" alt="保留卡" />;
}

export function PlayerPanel({ player, isCurrent, isMe, compact = false }: PlayerPanelProps) {
  const groups = groupedCards(player.purchasedCards);
  const totalTokens = Object.values(player.gems).reduce((sum, value) => sum + value, 0);

  return (
    <section
      className={`guild-seat p-4 transition ${
        isCurrent ? "turn-crown shadow-[0_0_34px_rgba(247,211,122,.3)]" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`grid h-13 w-13 place-items-center rounded-full border border-[rgba(247,211,122,.48)] bg-gradient-to-br ${AVATAR_BACKGROUNDS[player.avatarId % AVATAR_BACKGROUNDS.length]} text-2xl shadow-[inset_0_1px_8px_rgba(255,255,255,.3),0_8px_20px_rgba(0,0,0,.42)]`}>
          {AVATARS[player.avatarId % AVATARS.length]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-serif text-lg font-black text-[var(--gold-bright)]">{player.username}</h3>
            {isMe && <span className="rounded-full border border-[rgba(247,211,122,.4)] bg-[rgba(214,168,79,.16)] px-2 py-0.5 text-[10px] text-[var(--parchment)]">我</span>}
            {player.connected === false && <span className="rounded-full border border-red-300/30 bg-red-950/50 px-2 py-0.5 text-[10px] text-red-100">离线</span>}
          </div>
          <p className="text-xs text-[rgba(233,216,166,.72)]">声望 {player.prestige} · 代币 {totalTokens}/10 · 购卡 {player.purchasedCards.length}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {BASIC_COLORS.map((color) => (
          <div key={color} className={`rounded-xl border px-2 py-1 text-center text-xs ${colorStyles[color].border} bg-[rgba(5,7,12,.42)] shadow-[inset_0_1px_8px_rgba(255,255,255,.04)]`}>
            <div className={`mx-auto mb-1 h-2 w-2 rounded-full bg-gradient-to-br ${GEM_VISUALS[color].gradient}`} />
            <div className={colorStyles[color].text}>{colorNames[color]}</div>
            <div className="font-black text-[var(--parchment)]">{player.bonuses[color]}</div>
          </div>
        ))}
      </div>

      {!compact && (
        <>
          <div className="mt-4">
            <div className="mb-2 font-serif text-sm font-semibold text-[var(--gold-bright)]">持有代币</div>
            <div className="grid grid-cols-6 gap-2">
              {(["white", "blue", "green", "red", "brown", "gold"] as const).map((color) => (
                <div key={color} className="text-center">
                  <img src={tokenUrl(color)} className={`mx-auto h-9 w-9 rounded-full border ${GEM_VISUALS[color].ring} ${GEM_VISUALS[color].glow}`} alt={colorNames[color]} />
                  <div className="mt-1 text-xs font-black text-[var(--parchment)]">{player.gems[color]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 font-serif text-sm font-semibold text-[var(--gold-bright)]">已购发展卡</div>
            <div className="grid grid-cols-5 gap-2">
              {BASIC_COLORS.map((color) => (
                <div key={color} className="relative min-h-18 rounded-xl border border-[rgba(214,168,79,.2)] bg-[rgba(0,0,0,.24)] p-1">
                  <div className={`text-center text-xs ${colorStyles[color].text}`}>{colorNames[color]}</div>
                  <div className="mt-1 flex flex-col items-center">
                    {groups[color].slice(0, 4).map((card, index) => (
                      <div key={card.id} className="-mt-1 h-4 w-10 rounded border border-[rgba(255,255,255,.25)] shadow-sm" style={{ backgroundColor: colorStyles[color].dot, zIndex: index }} />
                    ))}
                    <span className="mt-1 text-xs font-bold text-[var(--parchment)]">×{groups[color].length}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 font-serif text-sm font-semibold text-[var(--gold-bright)]">保留卡</div>
            <div className="flex gap-2">
              {player.reservedCards.length === 0 && <span className="text-sm text-[rgba(233,216,166,.55)]">暂无保留卡</span>}
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
