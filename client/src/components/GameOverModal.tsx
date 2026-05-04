import { AVATARS } from "../types";
import type { GameOverPayload } from "../types";

interface Props {
  payload: GameOverPayload;
}

export function GameOverModal({ payload }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="panel-in gilded-frame w-full max-w-2xl rounded-[2rem] p-8 text-[var(--parchment)]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border-4 border-[var(--gold-bright)] bg-[radial-gradient(circle,#f7d37a,#8a5a1f)] text-5xl shadow-[0_0_55px_rgba(247,211,122,.45)]">
            {AVATARS[payload.winner.avatarId] ?? "👑"}
          </div>
          <p className="font-serif text-sm uppercase tracking-[0.5em] text-[var(--gold-bright)]">游戏结束</p>
          <h2 className="mt-2 font-serif text-4xl font-black text-[var(--gold-bright)]">
            {payload.winner.username} 获得胜利
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--parchment-muted)]">{payload.reason}</p>
        </div>

        <div className="mt-8 space-y-3">
          {payload.finalScores.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-2xl border border-[var(--gold)]/25 bg-black/25 px-4 py-3 shadow-inner"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/15 font-serif text-xl font-black text-[var(--gold-bright)]">#{index + 1}</span>
                <span className="text-2xl">{AVATARS[player.avatarId] ?? "💎"}</span>
                <span className="font-bold">{player.username}</span>
              </div>
              <div className="text-right text-sm text-slate-300">
                <p className="font-black text-[var(--gold-bright)]">{player.prestige} 声望</p>
                <p>{player.purchasedCards.length} 张发展卡</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => window.location.reload()}
          className="jewel-button mt-8 w-full rounded-2xl px-5 py-3 font-black"
        >
          返回大厅
        </button>
      </div>
    </div>
  );
}
