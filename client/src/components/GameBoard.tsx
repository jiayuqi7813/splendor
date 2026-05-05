import { BookOpen, MessageCircle, Menu, PanelBottomOpen, RotateCcw, Settings, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { socket } from "../socket";
import { variantName } from "../types";
import type { ActionLogEntry, BasicColor, Card, GameState, GemColor, Gems, PlayerState } from "../types";
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

function actionLogEntries(gameState: GameState): ActionLogEntry[] {
  if (gameState.actionLog?.length) return gameState.actionLog;
  if (!gameState.lastAction) return [];
  return [{ id: "latest", text: gameState.lastAction, at: Date.now(), playerId: null }];
}

function formatActionTime(at: number) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(at));
}

function useTurnReminder(gameState: GameState, me: PlayerState, currentPlayer?: PlayerState) {
  const previousPlayerRef = useRef<string | null>(gameState.currentPlayerId || null);
  const audioRef = useRef<AudioContext | null>(null);
  const titleRef = useRef(document.title);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const primeReminder = () => {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor && !audioRef.current) {
        audioRef.current = new AudioCtor();
      }
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => undefined);
      }
    };

    window.addEventListener("pointerdown", primeReminder, { once: true, passive: true });
    window.addEventListener("keydown", primeReminder, { once: true });
    return () => {
      window.removeEventListener("pointerdown", primeReminder);
      window.removeEventListener("keydown", primeReminder);
    };
  }, []);

  useEffect(() => {
    const previous = previousPlayerRef.current;
    const current = gameState.currentPlayerId || null;
    previousPlayerRef.current = current;
    if (!current || previous === current || current !== me.id) return;

    const message = `${currentPlayer?.username ?? me.username}，轮到你行动了`;
    setToast(message);
    const toastTimer = window.setTimeout(() => setToast(""), 4600);

    const audio = audioRef.current;
    if (audio) {
      const play = () => {
        const now = audio.currentTime;
        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.085, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
        gain.connect(audio.destination);

        [523.25, 659.25].forEach((frequency, index) => {
          const oscillator = audio.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, now + index * 0.1);
          oscillator.connect(gain);
          oscillator.start(now + index * 0.1);
          oscillator.stop(now + 0.34 + index * 0.1);
        });
      };
      if (audio.state === "suspended") audio.resume().then(play).catch(() => undefined);
      else play();
    }

    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
      const notification = new Notification("轮到你了", { body: message, tag: `splendor-turn-${gameState.roomId}`, silent: false });
      window.setTimeout(() => notification.close(), 5200);
    }

    document.title = `轮到你了 · ${titleRef.current}`;
    const titleTimer = window.setTimeout(() => {
      document.title = titleRef.current;
    }, 5200);

    return () => {
      window.clearTimeout(toastTimer);
      window.clearTimeout(titleTimer);
      document.title = titleRef.current;
    };
  }, [currentPlayer?.username, gameState.currentPlayerId, gameState.roomId, me.id, me.username]);

  return toast;
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

  const evolvePokemon = (targetCardId: string | null, skip = false) => {
    socket.emit("evolve_pokemon", { roomId: gameState.roomId, targetCardId, skip }, () => undefined);
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
      onEvolvePokemon={evolvePokemon}
    >
      <GameTableContents gameState={gameState} />
    </BoardDragProvider>
  );
}

function GameTableContents({ gameState }: { gameState: GameState }) {
  const { activeDrag, activeDragPoint, selectedCard, setSelectedCard, stageTakeGem, stageReserveDeck, stagedTakeGems, isMyTurn, mustDiscard } = useBoardDrag();
  const myPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId)!;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.currentPlayerId);
  const opponents = gameState.players.filter((player) => player.id !== gameState.myPlayerId);
  const roundText = gameState.players.reduce((max, player) => Math.max(max, player.turnsTaken ?? 0), 0) + 1;
  const resourceLabel = gameState.variant === "pokemon" ? "精灵球" : "宝石";
  const scoreLabel = gameState.variant === "pokemon" ? "奖杯" : "声望";
  const [myAreaOpen, setMyAreaOpen] = useState(false);
  const [opponentsOpen, setOpponentsOpen] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [dragAutoOpened, setDragAutoOpened] = useState(false);
  const wasDraggingRef = useRef(false);
  const suppressDrawerHeadClickUntilRef = useRef(0);
  const suppressOutsideClickUntilRef = useRef(0);
  const myTokenTotal = totalTokens(myPlayer.gems);
  const logs = actionLogEntries(gameState);
  const latestLog = logs[logs.length - 1];
  const turnToast = useTurnReminder(gameState, myPlayer, currentPlayer);

  useEffect(() => {
    if (mustDiscard) {
      setMyAreaOpen(true);
    }
  }, [mustDiscard]);

  useEffect(() => {
    if (!myAreaOpen || dragAutoOpened) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (Date.now() < suppressOutsideClickUntilRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".my-area-drawer")) return;
      if (target.closest(".drawer-toggle-button")) return;
      suppressOutsideClickUntilRef.current = Date.now() + 320;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setMyAreaOpen(false);
    };

    document.addEventListener("click", closeOnOutsideClick, true);
    return () => {
      document.removeEventListener("click", closeOnOutsideClick, true);
    };
  }, [dragAutoOpened, myAreaOpen]);

  useEffect(() => {
    if (!activeDrag) {
      if (wasDraggingRef.current) {
        suppressDrawerHeadClickUntilRef.current = Date.now() + 250;
        suppressOutsideClickUntilRef.current = Date.now() + 250;
        wasDraggingRef.current = false;
      }
      if (dragAutoOpened) {
        setMyAreaOpen(false);
        setDragAutoOpened(false);
      }
      return;
    }

    wasDraggingRef.current = true;
    const inBottomHotZone = (activeDragPoint?.y ?? 0) > 0.82;
    const shouldAutoOpenForDrag = activeDrag.kind !== "bank-gem";
    if (shouldAutoOpenForDrag && inBottomHotZone && !myAreaOpen) {
      setMyAreaOpen(true);
      setDragAutoOpened(true);
    }
  }, [activeDrag, activeDragPoint, dragAutoOpened, myAreaOpen]);

  const handleSelectCard = (card: Card) => {
    setSelectedCard(card, "market");
    setMyAreaOpen(true);
  };

  const handleStageTakeGem = (color: GemColor) => {
    stageTakeGem(color);
  };

  const closeMyAreaFromTable = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!myAreaOpen || dragAutoOpened) return;
    if (Date.now() < suppressOutsideClickUntilRef.current) return;
    suppressOutsideClickUntilRef.current = Date.now() + 320;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    setMyAreaOpen(false);
  };

  const handleStageReserveDeck = (tier: 1 | 2 | 3) => {
    stageReserveDeck(tier);
    setMyAreaOpen(true);
  };

  const toggleMyAreaFromHead = () => {
    if (Date.now() < suppressDrawerHeadClickUntilRef.current) return;
    setMyAreaOpen((open) => !open);
  };

  return (
    <main
      className={`game-shell tabletop-shell focus-table-shell ${gameState.variant === "pokemon" ? "pokemon-shell" : "classic-shell"} ${
        myAreaOpen ? "my-drawer-open" : ""
      } ${opponentsOpen ? "opponents-drawer-open" : ""}`}
    >
      <header className="game-topbar tabletop-topbar">
        <nav className="tabletop-utility tabletop-utility-left" aria-label="快捷入口">
          <a href="#lobby" aria-label="打开大厅">
            <Menu size={19} />
          </a>
          <a href="#rules" aria-label="查看规则">
            <BookOpen size={19} />
          </a>
        </nav>

        <div className="tabletop-title-stack">
          <div className="brand-lockup" aria-label="璀璨宝石 Splendor">
            <span className="gem-logo" aria-hidden="true" />
            <strong>璀璨宝石 {gameState.variant === "pokemon" ? "宝可梦" : "Splendor"}</strong>
          </div>
          <div className="round-indicator">
            <span>{gameState.phase === "finalRound" ? "最终轮" : "对局中"}</span>
            <b>/</b>
            <strong>第 {roundText} 回合</strong>
            <small>{variantName(gameState.variant)}</small>
          </div>
        </div>

        <nav className="tabletop-nav" aria-label="游戏导航">
          <button
            type="button"
            className={`drawer-toggle-button ${opponentsOpen ? "active" : ""}`}
            aria-label={opponentsOpen ? "收起其他玩家" : "展开其他玩家"}
            aria-pressed={opponentsOpen}
            onClick={() => setOpponentsOpen((open) => !open)}
          >
            <Users size={18} />
          </button>
          <button
            type="button"
            className={`drawer-toggle-button ${myAreaOpen ? "active" : ""}`}
            aria-label={myAreaOpen ? "收起我的区域" : "展开我的区域"}
            aria-pressed={myAreaOpen}
            onClick={() => setMyAreaOpen((open) => !open)}
          >
            <PanelBottomOpen size={18} />
          </button>
          <button
            type="button"
            className={`drawer-toggle-button ${actionLogOpen ? "active" : ""}`}
            aria-label={actionLogOpen ? "收起操作记录" : "查看操作记录"}
            aria-pressed={actionLogOpen}
            onClick={() => setActionLogOpen((open) => !open)}
          >
            <MessageCircle size={18} />
          </button>
          <button type="button" aria-label="刷新桌面" onClick={() => window.location.reload()}>
            <RotateCcw size={18} />
          </button>
          <button type="button" aria-label="设置">
            <Settings size={18} />
          </button>
        </nav>
      </header>

      <div className="tabletop-board" onClickCapture={closeMyAreaFromTable}>
        <div className="player-corner-hud" aria-label={`我的${resourceLabel} ${myTokenTotal} 个，${scoreLabel} ${myPlayer.prestige} 分`}>
          <b>{resourceLabel} {myTokenTotal}</b>
          <b>{scoreLabel} {myPlayer.prestige}</b>
          <b>{gameState.variant === "pokemon" ? "保留" : "预留"} {myPlayer.reservedCards.length}/3</b>
          {latestLog ? <span title={latestLog.text}>{latestLog.text}</span> : null}
        </div>
        <section className="tabletop-main-column" aria-label="公共桌面">
          <section className="market-column" aria-label={gameState.variant === "pokemon" ? "宝可梦市场" : "发展卡市场"}>
            {gameState.variant === "pokemon" ? (
              <PokemonSpecialRow gameState={gameState} onSelectCard={() => setMyAreaOpen(true)} />
            ) : (
              <NobleRow nobles={gameState.nobles} currentPlayer={myPlayer} />
            )}

            <section className="development-market">
              <div className="panel-heading slim">
                <h2>{gameState.variant === "pokemon" ? "宝可梦市场" : "发展卡市场"}</h2>
                <span>{gameState.variant === "pokemon" ? "点击或拖动选择，条件足够可直接捕捉" : "点击或拖动选择，条件足够可直接购买"}</span>
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
                        onClick={() => handleStageReserveDeck(row.tier)}
                        disabled={!isMyTurn || mustDiscard || myPlayer.reservedCards.length >= 3 || tierState.deckCount <= 0}
                        variant={gameState.variant}
                      />
                      {tierState.faceUp.map((card, index) => (
                        <CardSlot
                          key={card?.id ?? `${row.key}-${index}`}
                          card={card}
                          tier={row.tier}
                          selected={Boolean(card && selectedCard?.id === card.id)}
                          onClick={card ? () => handleSelectCard(card as Card) : undefined}
                          variant={gameState.variant}
                        />
                      ))}
                      <div className="market-drop-hint" aria-hidden="true">
                        {gameState.variant === "pokemon" ? "拖到行动区" : "拖到购买区"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>

          <section className="public-bank-strip" aria-label={gameState.variant === "pokemon" ? "公共精灵球池" : "公共宝石池"}>
            <GemBank bank={gameState.bank} selected={stagedTakeGems} onToggle={handleStageTakeGem} variant={gameState.variant} compact />
            <div className="turn-note">
              <strong>{isMyTurn ? "你的回合" : `等待 ${currentPlayer?.username ?? "玩家"}`}</strong>
              <span>{mustDiscard ? "请先弃置多余代币" : "拖动安排动作，双击目标确认"}</span>
            </div>
          </section>
        </section>
      </div>

      <button
        type="button"
        className={`opponent-drawer-tab ${opponentsOpen ? "open" : ""}`}
        aria-expanded={opponentsOpen}
        onClick={() => setOpponentsOpen((open) => !open)}
      >
        <Users size={17} />
        <span>其他玩家</span>
        <strong>{opponents.length}</strong>
      </button>

      <aside className={`opponent-drawer ${opponentsOpen ? "open" : ""}`} aria-hidden={!opponentsOpen}>
        <button type="button" className="drawer-close opponent-drawer-close" aria-label="收起其他玩家" onClick={() => setOpponentsOpen(false)}>
          <X size={17} />
        </button>
        <OpponentPanel players={gameState.players} myPlayerId={gameState.myPlayerId} currentPlayerId={gameState.currentPlayerId} variant={gameState.variant} />
      </aside>

      <aside className={`action-log-drawer ${actionLogOpen ? "open" : ""}`} aria-hidden={!actionLogOpen}>
        <div className="action-log-head">
          <strong>操作记录</strong>
          <span>{logs.length} 条</span>
        </div>
        <div className="action-log-feed">
          {logs.length ? (
            logs.slice().reverse().map((entry) => {
              const actor = gameState.players.find((player) => player.id === entry.playerId);
              return (
                <article key={entry.id} className={entry.id === latestLog?.id ? "current" : ""}>
                  <time>{formatActionTime(entry.at)}</time>
                  <p>{entry.text}</p>
                  {actor ? <em>{actor.username}</em> : null}
                </article>
              );
            })
          ) : (
            <p className="empty-log">游戏开始后会记录每一步操作。</p>
          )}
        </div>
      </aside>

      <section className={`my-area-drawer ${myAreaOpen ? "open" : ""} ${dragAutoOpened ? "drag-hot-open" : ""}`} aria-label="我的宝石与行动抽屉">
        <div
          className="my-area-drawer-head"
          onClick={toggleMyAreaFromHead}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleMyAreaFromHead();
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={myAreaOpen}
        >
          <MyGemsZone player={myPlayer} className="my-drawer-gems" variant={gameState.variant} />
        </div>
        <div className="my-area-drawer-body" aria-hidden={!myAreaOpen}>
          <MyAreaPanel player={myPlayer} variant={gameState.variant} />
        </div>
      </section>

      <div className="mobile-summary">
        <strong>{isMyTurn ? "轮到你了" : currentPlayer?.username ?? "当前玩家"}</strong>
        <span>{resourceLabel} {totalTokens(myPlayer.gems)}/10 · {scoreLabel} {myPlayer.prestige}</span>
      </div>
      {turnToast ? (
        <div className="turn-reminder-toast" role="status">
          <strong>轮到你了</strong>
          <span>{turnToast}</span>
        </div>
      ) : null}
    </main>
  );
}

function PokemonSpecialRow({ gameState, onSelectCard }: { gameState: GameState; onSelectCard: () => void }) {
  const { selectedCard, setSelectedCard, isMyTurn, mustDiscard } = useBoardDrag();
  const rows = [
    { label: "稀有宝可梦", state: gameState.rare, deckKind: "rare" as const },
    { label: "传说/幻之宝可梦", state: gameState.legendary, deckKind: "legendary" as const },
  ];
  return (
    <section className="noble-panel pokemon-special-panel">
      <div className="panel-heading slim">
        <h2>稀有与传说</h2>
        <span>不可保留，必须使用大师球捕捉</span>
      </div>
      <div className="pokemon-special-list">
        {rows.map((row) => (
          <div key={row.deckKind} className="pokemon-special-row">
            <strong>{row.label}</strong>
            {row.state?.faceUp.map((card, index) => (
              <CardSlot
                key={card?.id ?? `${row.deckKind}-${index}`}
                card={card}
                tier={3}
                selected={Boolean(card && selectedCard?.id === card.id)}
                onClick={card ? () => {
                  setSelectedCard(card as Card, "market");
                  onSelectCard();
                } : undefined}
                disabled={!isMyTurn || mustDiscard}
                variant="pokemon"
                deckKind={row.deckKind}
              />
            ))}
            <span>{row.state?.deckCount ?? 0} 张剩余</span>
          </div>
        ))}
      </div>
    </section>
  );
}
