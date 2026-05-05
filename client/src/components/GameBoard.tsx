import { Gem, HelpCircle, Home } from "lucide-react";
import { socket } from "../socket";
import type { BasicColor, Card, GameState, GemColor, Gems } from "../types";
import { BoardDragProvider, useBoardDrag } from "./BoardDragProvider";
import { CardSlot } from "./CardSlot";
import { GemBank } from "./GemBank";
import { MyAreaPanel, MyGemsZone } from "./MyAreaPanel";
import { NobleRow } from "./NobleRow";
import { OpponentPanel } from "./OpponentPanel";

interface GameBoardProps {
  gameState: GameState;
  pendingDiscardExcess: number | null;
}

const tiers = [
  { key: "tier3", tier: 3, label: "III" },
  { key: "tier2", tier: 2, label: "II" },
  { key: "tier1", tier: 1, label: "I" },
] as const;

function totalTokens(gems: Gems) {
  return Object.values(gems).reduce((sum, amount) => sum + amount, 0);
}

export function GameBoard({ gameState, pendingDiscardExcess }: GameBoardProps) {
  const myPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId)!;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.currentPlayerId);

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
    <BoardDragProvider
      gameState={gameState}
      me={myPlayer}
      currentPlayer={currentPlayer}
      pendingDiscardExcess={pendingDiscardExcess}
      onTakeGems={takeGems}
      onReserveCard={reserveCard}
      onBuyCard={buyCard}
      onDiscardTokens={discardTokens}
    >
      <GameTableContents gameState={gameState} />
    </BoardDragProvider>
  );
}

function GameTableContents({ gameState }: { gameState: GameState }) {
  const { selectedCard, setSelectedCard, stageTakeGem, stageReserveDeck, isMyTurn, mustDiscard } = useBoardDrag();
  const myPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId)!;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.currentPlayerId);
  const roundText = gameState.players.reduce((max, player) => Math.max(max, player.turnsTaken ?? 0), 0) + 1;

  return (
    <main className="game-shell tabletop-shell">
      <header className="game-topbar tabletop-topbar">
        <div className="brand-lockup" aria-label="璀璨宝石 Splendor">
          <span className="gem-logo" aria-hidden="true" />
          <strong>璀璨宝石 Splendor</strong>
        </div>

        <div className="round-indicator">
          <span>{gameState.phase === "finalRound" ? "最终轮" : "对局中"}</span>
          <b>/</b>
          <strong>第 {roundText} 回合</strong>
        </div>

        <nav className="tabletop-nav" aria-label="游戏导航">
          <a href="#lobby">
            <Home size={18} />
            大厅
          </a>
          <a href="#rules">
            <HelpCircle size={18} />
            规则
          </a>
        </nav>
      </header>

      <div className="tabletop-board">
        <aside className="gem-pool-column">
          <GemBank bank={gameState.bank} onToggle={stageTakeGem} />
          <MyGemsZone player={myPlayer} className="sidebar-my-gems" />
          <div className="turn-note">
            <Gem size={18} />
            <strong>{isMyTurn ? "轮到你了" : `等待 ${currentPlayer?.username ?? "玩家"}`}</strong>
            <span>{mustDiscard ? "请先弃置多余代币" : "拖动组件安排动作，双击目标确认"}</span>
          </div>
        </aside>

        <section className="market-column" aria-label="发展卡市场">
          <NobleRow nobles={gameState.nobles} currentPlayer={myPlayer} />

          <section className="development-market">
            <div className="panel-heading slim">
              <h2>发展卡市场</h2>
              <span>拖卡到预留区，拖宝石到卡牌支付</span>
            </div>
            <div className="market-tier-list">
              {tiers.map((row) => {
                const tierState = gameState[row.key];
                return (
                  <div key={row.key} className="market-tier-row">
                    <div className={`tier-ribbon tier-${row.tier}`}>
                      <span>{row.label}</span>
                    </div>
                    <CardSlot
                      tier={row.tier}
                      deck={tierState}
                      mode="deck"
                      onClick={() => stageReserveDeck(row.tier)}
                      disabled={!isMyTurn || mustDiscard || myPlayer.reservedCards.length >= 3 || tierState.deckCount <= 0}
                    />
                    {tierState.faceUp.map((card, index) => (
                      <CardSlot
                        key={card?.id ?? `${row.key}-${index}`}
                        card={card}
                        tier={row.tier}
                        selected={Boolean(card && selectedCard?.id === card.id)}
                        onClick={card ? () => setSelectedCard(card as Card, "market") : undefined}
                      />
                    ))}
                    <div className="market-drop-hint" aria-hidden="true">
                      拖宝石到卡牌
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </section>

        <OpponentPanel players={gameState.players} myPlayerId={gameState.myPlayerId} currentPlayerId={gameState.currentPlayerId} />
      </div>

      <MyAreaPanel player={myPlayer} />

      <div className="mobile-summary">
        <strong>{isMyTurn ? "轮到你了" : currentPlayer?.username ?? "当前玩家"}</strong>
        <span>宝石 {totalTokens(myPlayer.gems)}/10 · 声望 {myPlayer.prestige}</span>
      </div>
    </main>
  );
}
