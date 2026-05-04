import { AVATARS, AVATAR_BACKGROUNDS } from "../types";
import type { RoomState } from "../types";

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
    <div className="royal-bg min-h-screen px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="ornate-corners gilded-frame panel-in rounded-[2rem] p-6 shadow-2xl md:p-8">
          <div className="text-center">
            <p className="eyebrow">商会候场厅</p>
            <h1 className="font-renaissance mt-3 text-4xl font-black text-[var(--parchment)] md:text-6xl">房间号：{roomState.roomId}</h1>
            <button
              onClick={copyRoomId}
              className="ghost-gold-button mt-4 rounded-full px-5 py-2 text-sm"
            >
              复制房间号
            </button>
            <p className="mt-6 text-xl text-[var(--parchment)]">等待玩家加入... ({roomState.players.length}/4)</p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {roomState.players.map((player) => (
              <div key={player.id} className="merchant-seat flex items-center gap-4 p-4">
                <div
                  className={`grid h-16 w-16 place-items-center rounded-full border border-[rgba(247,211,122,.55)] bg-gradient-to-br ${
                    AVATAR_BACKGROUNDS[player.avatarId % AVATAR_BACKGROUNDS.length]
                  } text-3xl shadow-lg`}
                >
                  {AVATARS[player.avatarId % AVATARS.length]}
                </div>
                <div>
                  <p className="font-renaissance text-xl font-bold text-[var(--parchment)]">{player.username}</p>
                  <p className="text-sm text-[var(--gold-bright)]">{player.id === roomState.hostId ? "(房主)" : "商会成员"}</p>
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
                className="jewel-button rounded-2xl px-10 py-4 text-lg font-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                开启宝石商会
              </button>
            ) : (
              <p className="text-[var(--gold-bright)]">等待房主开始游戏...</p>
            )}
          </div>

          <details className="parchment-panel mt-8 p-5">
            <summary className="cursor-pointer font-bold text-[var(--ink)]">游戏规则简介</summary>
            <div className="mt-4 space-y-2 text-sm leading-7 text-[rgba(45,27,18,.78)]">
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
