import { AVATARS } from "../types";
import type { GameOverPayload } from "../types";

interface Props {
  payload: GameOverPayload;
}

export function GameOverModal({ payload }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-amber-300/40 bg-slate-950 p-8 text-white shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-400 text-4xl shadow-lg shadow-amber-400/30">
            {AVATARS[payload.winner.avatarId] ?? "👑"}
          </div>
          <p className="text-sm text-amber-200">游戏结束</p>
          <h2 className="mt-2 text-3xl font-black text-amber-300">
            {payload.winner.username} 获得胜利
          </h2>
          <p className="mt-3 text-slate-300">{payload.reason}</p>
        </div>

        <div className="mt-8 space-y-3">
          {payload.finalScores.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 text-xl font-black text-amber-200">#{index + 1}</span>
                <span className="text-2xl">{AVATARS[player.avatarId] ?? "💎"}</span>
                <span className="font-bold">{player.username}</span>
              </div>
              <div className="text-right text-sm text-slate-300">
                <p className="font-black text-amber-200">{player.prestige} 声望</p>
                <p>{player.purchasedCards.length} 张发展卡</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => window.location.reload()}
          className="mt-8 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-600 px-5 py-3 font-black text-slate-950 transition hover:scale-[1.02]"
        >
          返回大厅
        </button>
      </div>
    </div>
  );
}
