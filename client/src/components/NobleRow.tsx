import type { Noble, PlayerState } from "../types";
import { BASIC_COLORS, COLOR_LABELS, nobleImageUrl, TOKEN_IMAGES } from "../types";

interface NobleRowProps {
  nobles: Noble[];
  currentPlayer?: PlayerState;
}

function canVisit(noble: Noble, player?: PlayerState) {
  if (!player) return false;
  return BASIC_COLORS.every((color) => player.bonuses[color] >= noble.req[color]);
}

export function NobleRow({ nobles, currentPlayer }: NobleRowProps) {
  return (
    <section className="noble-panel">
      <div className="panel-heading slim">
        <h2>贵族（可获得 3 分）</h2>
        <span>{nobles.length} 张</span>
      </div>
      <div className="noble-list">
        {nobles.map((noble) => (
          <article key={noble.id} className={`noble-tile ${canVisit(noble, currentPlayer) ? "ready" : ""}`}>
            <span className="noble-crown">♛</span>
            <img src={nobleImageUrl(noble.id)} alt="" />
            <div className="noble-info">
              <strong>{noble.prestige}</strong>
              <span>
                {BASIC_COLORS.filter((color) => noble.req[color] > 0).map((color) => (
                  <em key={color} className={currentPlayer && currentPlayer.bonuses[color] >= noble.req[color] ? "met" : ""}>
                    <img src={TOKEN_IMAGES[color]} alt="" />
                    <b>{noble.req[color]}</b>
                    <small>{COLOR_LABELS[color]}</small>
                  </em>
                ))}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
