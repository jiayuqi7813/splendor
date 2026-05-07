import { useEffect, useMemo, useState } from "react";
import type { Noble, PlayerState } from "~/game/types";
import { BASIC_COLORS, COLOR_LABELS, nobleImageUrl, TOKEN_IMAGES } from "~/game/types";

interface NobleRowProps {
  nobles: Noble[];
  currentPlayer?: PlayerState;
}

function canVisit(noble: Noble, player?: PlayerState) {
  if (!player) return false;
  return BASIC_COLORS.every((color) => player.bonuses[color] >= noble.req[color]);
}

function missingBonusCount(noble: Noble, player?: PlayerState) {
  if (!player) return BASIC_COLORS.reduce((sum, color) => sum + noble.req[color], 0);
  return BASIC_COLORS.reduce((sum, color) => sum + Math.max(0, noble.req[color] - player.bonuses[color]), 0);
}

export function NobleRow({ nobles, currentPlayer }: NobleRowProps) {
  const [selectedNobleId, setSelectedNobleId] = useState<string | null>(null);
  const selectedNoble = useMemo(() => nobles.find((noble) => noble.id === selectedNobleId) ?? null, [nobles, selectedNobleId]);
  const selectedMissing = selectedNoble ? missingBonusCount(selectedNoble, currentPlayer) : 0;
  const headingStatus = selectedNoble ? (selectedMissing === 0 ? "已满足" : `还差 ${selectedMissing}`) : `${nobles.length} 张`;

  useEffect(() => {
    if (selectedNobleId && !nobles.some((noble) => noble.id === selectedNobleId)) {
      setSelectedNobleId(null);
    }
  }, [nobles, selectedNobleId]);

  return (
    <section className="noble-panel">
      <div className="panel-heading slim">
        <h2>贵族</h2>
        <span>{headingStatus}</span>
      </div>
      <div className="noble-list">
        {nobles.map((noble) => {
          const ready = canVisit(noble, currentPlayer);
          const selected = selectedNobleId === noble.id;
          return (
            <button
              key={noble.id}
              type="button"
              className={`noble-tile ${ready ? "ready" : ""} ${selected ? "selected" : ""}`}
              aria-pressed={selected}
              aria-label={`查看贵族，${noble.prestige} 分，${ready ? "已满足条件" : `还差 ${missingBonusCount(noble, currentPlayer)} 张永久加成`}`}
              onClick={() => setSelectedNobleId((current) => (current === noble.id ? null : noble.id))}
            >
              <strong className="noble-score">{noble.prestige}</strong>
              <img src={nobleImageUrl(noble.id)} alt="" />
              <div className="noble-info">
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
            </button>
          );
        })}
      </div>
    </section>
  );
}
