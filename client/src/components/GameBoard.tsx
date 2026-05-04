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
  { key: "tier3", tier: 3, title: "宫廷巨匠", subtitle: "III 级发展卡" },
  { key: "tier2", tier: 2, title: "工坊大师", subtitle: "II 级发展卡" },
  { key: "tier1", tier: 1, title: "商路学徒", subtitle: "I 级发展卡" }
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
    <main className="royal-bg min-h-screen p-3 text-[var(--parchment)] md:p-5">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-5">
        <header className="gilded-frame velvet-panel relative flex flex-col justify-between gap-4 overflow-hidden p-5 md:flex-row md:items-center">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gold-bright)] to-transparent opacity-70" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.45em] text-[var(--gold-bright)]">Renaissance Jewel Atelier · 房间 {gameState.roomId}</p>
            <h1 className="mt-1 font-serif text-3xl font-black text-[var(--parchment-light)] md:text-4xl">璀璨宝石商会桌</h1>
            <p className="mt-1 text-sm text-[var(--parchment-muted)]">收集宝石、资助工坊、赢得贵族青睐。</p>
          </div>
          <div className="rounded-[1.4rem] border border-[var(--gold)]/35 bg-black/30 px-5 py-3 text-sm text-[var(--parchment)] shadow-inner">
            <span className="text-[var(--parchment-muted)]">当前执掌商会：</span>
            <span className="ml-2 font-black text-[var(--gold-bright)]">{currentPlayer?.username ?? "未知玩家"}</span>
            {gameState.phase === "finalRound" && <span className="ml-3 text-red-200">最终轮进行中</span>}
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
          <aside className="space-y-3 xl:order-1">
            <div className="side-rail p-3">
              <h2 className="mb-3 px-2 font-serif text-xl font-black text-[var(--gold-bright)]">商会席位</h2>
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

            <div className="table-section space-y-4 p-4 shadow-2xl">
              {tiers.map((row) => {
                const tierState = gameState[row.key];
                return (
                  <div key={row.key} className="card-stage rounded-[1.5rem] p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-serif text-xl font-black text-[var(--parchment-light)]">{row.title}</h3>
                        <p className="text-xs uppercase tracking-[0.25em] text-[var(--gold-bright)]">{row.subtitle}</p>
                      </div>
                      <button
                        onClick={() => reserveFromDeck(row.tier)}
                        disabled={
                          gameState.currentPlayerId !== gameState.myPlayerId ||
                          myPlayer.reservedCards.length >= 3 ||
                          tierState.deckCount <= 0 ||
                          Boolean(pendingDiscardExcess)
                        }
                        className="ghost-gold-button rounded-full px-4 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        从牌堆保留
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 xl:gap-4">
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

        <section className="gilded-frame parchment-panel p-4">
          <h2 className="mb-3 font-serif text-2xl font-black text-[var(--ink)]">我的商会</h2>
          <PlayerPanel player={myPlayer} isCurrent={myPlayer.id === gameState.currentPlayerId} isMe detailed />
        </section>

        <footer className="parchment-panel rounded-[1.5rem] px-5 py-4 text-sm text-[var(--ink)]">
          <span className="font-black text-[var(--ruby)]">最近操作：</span>
          {gameState.lastAction ?? "游戏刚刚开始，等待第一位玩家行动。"}
        </footer>
      </div>
    </main>
  );
}
