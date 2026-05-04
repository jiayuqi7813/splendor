import { useState, type FormEvent } from "react";
import { AVATARS, BACKGROUND_URL } from "../types";

interface LobbyScreenProps {
  username?: string;
  avatarId?: number;
  roomCode?: string;
  joining?: boolean;
  error: string;
  onUsernameChange?: (value: string) => void;
  onAvatarChange?: (value: number) => void;
  onRoomCodeChange?: (value: string) => void;
  onToggleJoin?: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
  onCreate?: (username: string, avatarId: number) => void;
  onJoin?: (roomId: string, username: string, avatarId: number) => void;
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
  username: controlledUsername,
  avatarId: controlledAvatarId,
  roomCode: controlledRoomCode,
  joining: controlledJoining,
  error,
  onUsernameChange,
  onAvatarChange,
  onRoomCodeChange,
  onToggleJoin,
  onCreateRoom,
  onJoinRoom,
  onCreate,
  onJoin,
}: LobbyScreenProps) {
  const [localUsername, setLocalUsername] = useState("");
  const [localAvatarId, setLocalAvatarId] = useState(0);
  const [localRoomCode, setLocalRoomCode] = useState("");
  const [localJoining, setLocalJoining] = useState(false);
  const username = controlledUsername ?? localUsername;
  const avatarId = controlledAvatarId ?? localAvatarId;
  const roomCode = controlledRoomCode ?? localRoomCode;
  const joining = controlledJoining ?? localJoining;
  const changeUsername = (value: string) => {
    onUsernameChange?.(value);
    if (controlledUsername === undefined) setLocalUsername(value);
  };
  const changeAvatar = (value: number) => {
    onAvatarChange?.(value);
    if (controlledAvatarId === undefined) setLocalAvatarId(value);
  };
  const changeRoomCode = (value: string) => {
    onRoomCodeChange?.(value);
    if (controlledRoomCode === undefined) setLocalRoomCode(value);
  };
  const create = () => {
    onCreateRoom?.();
    onCreate?.(username.trim(), avatarId);
  };
  const join = () => {
    if (onJoinRoom) onJoinRoom();
    else onJoin?.(roomCode.trim().toUpperCase(), username.trim(), avatarId);
  };
  const toggleJoin = () => {
    onToggleJoin?.();
    if (controlledJoining === undefined) setLocalJoining(true);
  };
  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (joining) {
      join();
      return;
    }
    toggleJoin();
  };

  return (
    <main
      className="royal-bg relative min-h-screen overflow-hidden bg-cover bg-center text-white"
      style={{ backgroundImage: `linear-gradient(rgba(5,7,15,.72), rgba(5,7,15,.92)), url(${BACKGROUND_URL})` }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-8 mx-auto h-64 max-w-5xl rounded-full bg-[radial-gradient(circle,rgba(247,211,122,.22),transparent_65%)] blur-3xl" />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <section className="parchment-panel panel-enter w-full max-w-3xl p-6 shadow-2xl md:p-9">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.62em] text-[var(--gold-deep)]">宝石商会请柬</p>
            <h1 className="font-serif text-5xl font-black leading-tight text-[var(--ink)] drop-shadow-sm md:text-7xl">
              璀璨宝石 · Splendor
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#4b3423] md:text-base">
              推开文艺复兴商会的大门，挑选宝石、经营矿脉、赢得贵族青睐，率先抵达 15 点声望。
            </p>
          </div>

          <form className="space-y-6" onSubmit={submitJoin}>
            <label className="block">
              <span className="mb-2 block text-sm font-black tracking-[0.24em] text-[var(--gold-deep)]">商会署名</span>
              <input
                value={username}
                maxLength={16}
                required
                onChange={(event) => changeUsername(event.target.value)}
                className="w-full rounded-2xl border border-[#b8893d]/45 bg-[#2b170d]/10 px-4 py-3 text-lg font-semibold text-[var(--ink)] outline-none transition placeholder:text-[#7b5b3c]/60 focus:border-[var(--gold)] focus:ring-4 focus:ring-[#d6a84f]/20"
                placeholder="请输入最多 16 字"
              />
            </label>

            <div>
              <span className="mb-3 block text-sm font-black tracking-[0.24em] text-[var(--gold-deep)]">选择商会徽章</span>
              <div className="grid grid-cols-6 gap-3 md:grid-cols-12">
                {AVATARS.map((emoji, index) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => changeAvatar(index)}
                    className={`relative grid aspect-square place-items-center rounded-full bg-gradient-to-br text-2xl shadow-lg transition duration-300 hover:-translate-y-1 hover:scale-110 ${
                      avatarBg[index]
                    } ${avatarId === index ? "token-glow ring-4 ring-[#f7d37a] ring-offset-2 ring-offset-[#e9d8a6]" : "ring-2 ring-[#7c5422]/30"}`}
                    aria-label={`头像 ${emoji}`}
                  >
                    <span className="absolute inset-1 rounded-full border border-white/25" />
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {joining && (
              <label className="block animate-slide-in">
                <span className="mb-2 block text-sm font-black tracking-[0.24em] text-[var(--gold-deep)]">房间印章</span>
                <input
                  value={roomCode}
                  maxLength={6}
                  onChange={(event) => changeRoomCode(event.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-[#b8893d]/50 bg-[#2b170d]/10 px-4 py-3 text-center text-3xl font-black uppercase tracking-[0.42em] text-[var(--ink)] outline-none transition placeholder:text-[#7b5b3c]/50 focus:border-[var(--gold)] focus:ring-4 focus:ring-[#d6a84f]/20"
                  placeholder="ABC123"
                />
              </label>
            )}

            {error && <p className="rounded-xl border border-red-700/30 bg-red-950/15 px-4 py-3 text-sm font-bold text-red-800">{error}</p>}

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={create}
                className="jewel-button rounded-2xl px-6 py-4 text-lg"
              >
                创建房间
              </button>
              <button
                type="submit"
                className="ghost-gold-button rounded-2xl px-6 py-4 text-lg"
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
