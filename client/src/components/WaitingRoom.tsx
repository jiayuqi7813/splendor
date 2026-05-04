import type { RoomState } from "../types";

const avatars = ["👑", "🔮", "💎", "🏺", "⚔️", "🧙", "🦁", "🐉", "🌟", "🎭", "🔥", "🌙"];
const avatarColors = [
  "from-amber-400 to-yellow-700",
  "from-purple-400 to-indigo-700",
  "from-cyan-300 to-blue-700",
  "from-orange-300 to-stone-700",
  "from-slate-300 to-red-700",
  "from-violet-300 to-fuchsia-700",
  "from-yellow-300 to-orange-700",
  "from-emerald-300 to-teal-800",
  "from-yellow-200 to-amber-600",
  "from-pink-300 to-rose-700",
  "from-red-400 to-orange-800",
  "from-blue-200 to-slate-700",
];

interface WaitingRoomProps {
  roomState: RoomState;
  playerId: string;
  onStart: () => void;
  error: string | null;
}

export function WaitingRoom({ roomState, playerId, onStart, error }: WaitingRoomProps) {
  const isHost = roomState.hostId === playerId;

  const copyRoomId = async () => {
    await navigator.clipboard?.writeText(roomState.roomId);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-amber-300/30 bg-slate-950/85 p-8 shadow-2xl shadow-black/40">
          <div className="text-center">
            <p className="text-sm tracking-[0.35em] text-amber-200">等待室</p>
            <h1 className="mt-2 text-4xl font-black text-amber-100">房间号：{roomState.roomId}</h1>
            <button
              onClick={copyRoomId}
              className="mt-4 rounded-full border border-amber-300/40 px-5 py-2 text-sm text-amber-100 transition hover:bg-amber-300/10"
            >
              复制房间号
            </button>
            <p className="mt-6 text-xl text-slate-200">等待玩家加入... ({roomState.players.length}/4)</p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {roomState.players.map((player) => (
              <div key={player.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${
                    avatarColors[player.avatarId % avatarColors.length]
                  } text-2xl shadow-lg`}
                >
                  {avatars[player.avatarId % avatars.length]}
                </div>
                <div>
                  <p className="text-lg font-bold">{player.username}</p>
                  <p className="text-sm text-amber-200">{player.id === roomState.hostId ? "(房主)" : "玩家"}</p>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="mt-6 text-center text-sm text-red-300">{error}</p>}

          <div className="mt-8 text-center">
            {isHost ? (
              <button
                onClick={onStart}
                disabled={roomState.players.length < 2}
                className="rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-600 px-10 py-4 font-black text-slate-950 shadow-lg shadow-amber-900/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                开始游戏
              </button>
            ) : (
              <p className="text-amber-100">等待房主开始游戏...</p>
            )}
          </div>

          <details className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <summary className="cursor-pointer font-bold text-amber-100">游戏规则简介</summary>
            <div className="mt-4 space-y-2 text-sm leading-7 text-slate-300">
              <p>每回合只能选择一种行动：取宝石、保留发展卡或购买发展卡。</p>
              <p>购买的发展卡提供永久宝石折扣，声望达到 15 点会触发最终轮。</p>
              <p>所有玩家完成相同回合数后结算，声望最高者获胜；平局时购买卡更少者获胜。</p>
              <p>回合结束最多持有 10 个代币，超过时必须弃置。</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
