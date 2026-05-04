import { useState } from "react";
import { socket } from "../socket";
import { BasicColor, Card, GameState, GemColor, Gems } from "../types";
import ActionPanel from "./ActionPanel";
import { CardSlot } from "./CardSlot";
import { GemBank } from "./GemBank";
import { NobleRow } from "./NobleRow";
import { PlayerPanel } from "./PlayerPanel";

interface GameBoardProps {
  gameState: GameState;
  pendingDiscardExcess: number | null;
}

const tiers = [
  { key: "tier3", tier: 3, title: "三级发展卡" },
  { key: "tier2", tier: 2, title: "二级发展卡" },
  { key: "tier1", tier: 1, title: "一级发展卡" }
] as const;

export function GameBoard({ gameState, pendingDiscardExcess }: GameBoardProps) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const myPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId)!;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.currentPlayerId);
  const otherPlayers = gameState.players.filter((player) => player.id !== gameState.myPlayerId);

  const reserveFromDeck = (tier: 1 | 2 | 3) => {
    socket.emit("reserve_card", { roomId: gameState.roomId, cardId: null, fromDeck: tier }, () => undefined);
  };

  const takeGems = (colors: GemColor[]) => {
    socket.emit("take_gems", { roomId: gameState.roomId, colors }, () => undefined);
  };

  const reserveCard = (cardId: string | null, fromDeck: 1 | 2 | 3 | null) => {
    socket.emit("reserve_card", { roomId: gameState.roomId, cardId, fromDeck }, () => undefined);
  };

  const buyCard = (cardId: string, goldSubstitutions: Partial<Record<BasicColor, number>>) => {
    socket.emit("buy_card", { roomId: gameState.roomId, cardId, goldSubstitutions }, () => undefined);
  };

  const discardTokens = (tokens: Partial<Gems>) => {
    socket.emit("discard_tokens", { roomId: gameState.roomId, tokens }, () => undefined);
  };

  return (
    <main className="min-h-screen bg-[#0a0f1e] bg-[radial-gradient(circle_at_top,_rgba(255,215,0,0.13),_transparent_34%),linear-gradient(135deg,#08101f,#101d3a_45%,#060913)] p-3 text-slate-100 md:p-5">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <header className="flex flex-col justify-between gap-3 rounded-3xl border border-amber-400/20 bg-slate-950/60 p-4 shadow-2xl shadow-black/40 backdrop-blur md:flex-row md:items-center">
          <div>
            <p className="text-sm text-amber-200">房间 {gameState.roomId}</p>
            <h1 className="text-2xl font-black text-amber-100">璀璨宝石 · 在线桌面</h1>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-black/20 px-4 py-2 text-sm text-slate-200">
            当前回合：
            <span className="ml-2 font-bold text-amber-200">
              {gameState.players.find((player) => player.id === gameState.currentPlayerId)?.username ?? "未知玩家"}
            </span>
            {gameState.phase === "finalRound" && <span className="ml-3 text-red-200">最终轮进行中</span>}
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_260px]">
          <aside className="space-y-3 xl:order-1">
            <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-3">
              <h2 className="mb-3 text-lg font-bold text-amber-100">玩家</h2>
              <div className="space-y-3">
                {otherPlayers.map((player) => (
                  <PlayerPanel
                    key={player.id}
                    player={player}
                    isCurrent={player.id === gameState.currentPlayerId}
                    isMe={false}
                    compact
                  />
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-4 xl:order-2">
            <NobleRow nobles={gameState.nobles} currentPlayer={myPlayer} />

            <div className="space-y-4 rounded-3xl border border-amber-300/15 bg-slate-950/45 p-3 shadow-2xl">
              {tiers.map((row) => {
                const tierState = gameState[row.key];
                return (
                  <div key={row.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-bold text-amber-100">{row.title}</h3>
                      <button
                        onClick={() => reserveFromDeck(row.tier)}
                        disabled={
                          gameState.currentPlayerId !== gameState.myPlayerId ||
                          myPlayer.reservedCards.length >= 3 ||
                          tierState.deckCount <= 0 ||
                          Boolean(pendingDiscardExcess)
                        }
                        className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        从牌堆保留
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                      <CardSlot tier={row.tier} deck={tierState} mode="deck" disabled />
                      {tierState.faceUp.map((card, index) => (
                        <CardSlot
                          key={card?.id ?? `${row.key}-${index}`}
                          card={card}
                          tier={row.tier}
                          onClick={card ? () => setSelectedCard(card) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4 xl:order-3">
            <GemBank bank={gameState.bank} compact />
            <ActionPanel
              gameState={gameState}
              me={myPlayer}
              currentPlayer={currentPlayer}
              selectedCard={selectedCard}
              pendingDiscardExcess={pendingDiscardExcess}
              onTakeGems={takeGems}
              onReserveCard={reserveCard}
              onBuyCard={buyCard}
              onDiscardTokens={discardTokens}
              onCloseCard={() => setSelectedCard(null)}
            />
          </aside>
        </div>

        <section className="rounded-3xl border border-amber-300/15 bg-slate-950/65 p-4">
          <h2 className="mb-3 text-lg font-bold text-amber-100">我的商会</h2>
          <PlayerPanel player={myPlayer} isCurrent={myPlayer.id === gameState.currentPlayerId} isMe detailed />
        </section>

        <footer className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-300">
          <span className="text-amber-200">最近操作：</span>
          {gameState.lastAction ?? "游戏刚刚开始，等待第一位玩家行动。"}
        </footer>
      </div>
    </main>
  );
}
