import type { FormEvent } from "react";
import { AVATARS, BACKGROUND_URL } from "../types";

interface LobbyScreenProps {
  username: string;
  avatarId: number;
  roomCode: string;
  joining: boolean;
  error: string;
  onUsernameChange: (value: string) => void;
  onAvatarChange: (value: number) => void;
  onRoomCodeChange: (value: string) => void;
  onToggleJoin: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

const avatarBg = [
  "from-yellow-400 to-amber-700",
  "from-purple-400 to-indigo-700",
  "from-sky-300 to-blue-700",
  "from-orange-300 to-stone-700",
  "from-slate-300 to-red-800",
  "from-violet-300 to-fuchsia-800",
  "from-amber-300 to-yellow-800",
  "from-emerald-300 to-teal-800",
  "from-yellow-200 to-pink-600",
  "from-rose-300 to-purple-900",
  "from-red-400 to-orange-800",
  "from-blue-200 to-slate-800",
];

export default function LobbyScreen({
  username,
  avatarId,
  roomCode,
  joining,
  error,
  onUsernameChange,
  onAvatarChange,
  onRoomCodeChange,
  onToggleJoin,
  onCreateRoom,
  onJoinRoom,
}: LobbyScreenProps) {
  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (joining) {
      onJoinRoom();
      return;
    }
    onToggleJoin();
  };

  return (
    <main
      className="min-h-screen bg-cover bg-center text-white"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,.82), rgba(2,6,23,.92)), url(${BACKGROUND_URL})` }}
    >
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="w-full max-w-2xl rounded-[2rem] border border-amber-300/30 bg-slate-950/80 p-8 shadow-2xl shadow-black/60 backdrop-blur">
          <div className="mb-8 text-center">
            <p className="mb-2 text-sm tracking-[0.5em] text-amber-200/80">在线桌游</p>
            <h1 className="bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-600 bg-clip-text text-4xl font-black text-transparent md:text-6xl">
              璀璨宝石 · Splendor
            </h1>
            <p className="mt-4 text-slate-300">创建房间，邀请好友，在宝石与贵族之间争夺 15 点声望。</p>
          </div>

          <form className="space-y-6" onSubmit={submitJoin}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-amber-100">用户名</span>
              <input
                value={username}
                maxLength={16}
                required
                onChange={(event) => onUsernameChange(event.target.value)}
                className="w-full rounded-2xl border border-amber-200/20 bg-slate-900/80 px-4 py-3 text-lg text-white outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30"
                placeholder="请输入最多 16 字"
              />
            </label>

            <div>
              <span className="mb-3 block text-sm font-semibold text-amber-100">选择头像</span>
              <div className="grid grid-cols-6 gap-3 md:grid-cols-12">
                {AVATARS.map((emoji, index) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onAvatarChange(index)}
                    className={`grid aspect-square place-items-center rounded-full bg-gradient-to-br text-2xl shadow-lg transition hover:scale-110 ${
                      avatarBg[index]
                    } ${avatarId === index ? "ring-4 ring-amber-300 ring-offset-2 ring-offset-slate-950" : "ring-1 ring-white/20"}`}
                    aria-label={`头像 ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {joining && (
              <label className="block animate-slide-in">
                <span className="mb-2 block text-sm font-semibold text-amber-100">房间号</span>
                <input
                  value={roomCode}
                  maxLength={6}
                  onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-amber-200/20 bg-slate-900/80 px-4 py-3 text-center text-2xl font-black uppercase tracking-[0.35em] text-white outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30"
                  placeholder="ABC123"
                />
              </label>
            )}

            {error && <p className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>}

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={onCreateRoom}
                className="rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-600 px-6 py-4 text-lg font-black text-slate-950 shadow-lg shadow-amber-900/30 transition hover:scale-[1.02] hover:from-amber-200 hover:to-yellow-500"
              >
                创建房间
              </button>
              <button
                type="submit"
                className="rounded-2xl border border-amber-200/30 bg-slate-800/80 px-6 py-4 text-lg font-black text-amber-100 transition hover:scale-[1.02] hover:border-amber-300"
              >
                {joining ? "确认加入" : "加入房间"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
