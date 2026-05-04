import { RotateCcw } from "lucide-react";
import { AVATARS } from "../types";
import type { GameOverPayload } from "../types";

interface Props {
  payload: GameOverPayload;
}

export function GameOverModal({ payload }: Props) {
  return (
    <div className="modal-backdrop">
      <div className="modal-panel game-over-panel">
        <span className="seat-avatar">{AVATARS[payload.winner.avatarId % AVATARS.length]}</span>
        <p className="hud-label">Game Over</p>
        <h2>{payload.winner.username} 获得胜利</h2>
        <p>{payload.reason}</p>

        <div className="score-list">
          {payload.finalScores.map((player, index) => (
            <article key={player.id}>
              <strong>{index + 1}</strong>
              <span>{player.username}</span>
              <em>{player.prestige} 分</em>
            </article>
          ))}
        </div>

        <button type="button" onClick={() => window.location.reload()} className="hud-button">
          <RotateCcw size={19} />
          返回大厅
        </button>
      </div>
    </div>
  );
}
