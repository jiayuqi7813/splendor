import { Copy, Play } from "lucide-react";
import { AVATARS } from "../types";
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
    <main className="waiting-shell">
      <section className="waiting-card">
        <div className="waiting-head">
          <p className="hud-label">Waiting Room</p>
          <h1>房间号：{roomState.roomId}</h1>
          <button type="button" onClick={copyRoomId} className="copy-button">
            <Copy size={18} />
            复制房间号
          </button>
          <p>等待玩家加入 ({roomState.players.length}/4)</p>
        </div>

        <div className="waiting-players">
          {roomState.players.map((player) => (
            <article key={player.id} className="waiting-player">
              <span className="seat-avatar">{AVATARS[player.avatarId % AVATARS.length]}</span>
              <div>
                <strong>{player.username}</strong>
                <small>{player.id === roomState.hostId ? "房主" : "准备中"}</small>
              </div>
            </article>
          ))}
        </div>

        {error ? <p className="status-box error-text">{error}</p> : null}

        {isHost ? (
          <button type="button" onClick={onStart} disabled={roomState.players.length < 2} className="hud-button start-button">
            <Play size={19} />
            开始游戏
          </button>
        ) : (
          <p className="status-box">等待房主开始游戏。</p>
        )}
      </section>
    </main>
  );
}
