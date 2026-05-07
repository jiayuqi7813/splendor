import { BookOpen, MessageCircle, Menu, PanelBottomOpen, RotateCcw, Settings, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import type { GameCommand, RoomIntent, RoomIntentEvent } from "../shared/protocol";
import { AVATARS, BASIC_COLORS, cardImageUrl, colorLabelsFor, deckBackUrl, tokenImagesFor, variantName } from "../types";
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
  onCommand: (command: GameCommand) => void;
  onIntent?: (intent: RoomIntent) => void;
  remoteIntent?: RoomIntentEvent | null;
}

const tiers = [
  { key: "tier3", tier: 3, label: "III" },
  { key: "tier2", tier: 2, label: "II" },
  { key: "tier1", tier: 1, label: "I" },
] as const;

function totalTokens(gems: Gems) {
  return Object.values(gems).reduce((sum, amount) => sum + amount, 0);
}

function purchasedByColor(player: PlayerState) {
  return BASIC_COLORS.reduce<Record<BasicColor, Card[]>>((groups, color) => {
    groups[color] = player.purchasedCards.filter((card) => card.color === color);
    return groups;
  }, {} as Record<BasicColor, Card[]>);
}

function tokenSlotColors(gems: Gems): GemColor[] {
  const order: GemColor[] = ["white", "blue", "green", "red", "brown", "gold"];
  return order.flatMap((color) => Array.from({ length: gems[color] }, () => color));
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

function elementFitsVertically(element: HTMLElement | null, tolerance = 2) {
  if (!element) return false;
  return element.scrollHeight <= element.clientHeight + tolerance;
}

function childFitsInside(parent: HTMLElement, child: HTMLElement, tolerance = 2) {
  const parentRect = parent.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  return childRect.top >= parentRect.top - tolerance && childRect.bottom <= parentRect.bottom + tolerance;
}

function useWorkbenchMode(
  gameState: GameState,
  refs: {
    marketColumnRef: RefObject<HTMLElement | null>;
    developmentMarketRef: RefObject<HTMLElement | null>;
    marketTierListRef: RefObject<HTMLElement | null>;
    publicBankStripRef: RefObject<HTMLElement | null>;
  },
) {
  const [enabled, setEnabled] = useState(false);
  const probeIdRef = useRef(0);

  useEffect(() => {
    const marketFullyVisible = () => {
      const marketColumn = refs.marketColumnRef.current;
      const developmentMarket = refs.developmentMarketRef.current;
      const tierList = refs.marketTierListRef.current;
      const publicBank = refs.publicBankStripRef.current;
      if (!marketColumn || !developmentMarket || !tierList || !publicBank) return false;

      const topPanel = marketColumn.querySelector<HTMLElement>(".noble-panel");
      const tierRows = Array.from(tierList.querySelectorAll<HTMLElement>(".market-tier-row"));
      return (
        elementFitsVertically(marketColumn) &&
        elementFitsVertically(topPanel) &&
        elementFitsVertically(developmentMarket) &&
        elementFitsVertically(tierList) &&
        elementFitsVertically(publicBank) &&
        tierRows.length === 3 &&
        tierRows.every((row) => childFitsInside(tierList, row))
      );
    };

    const runProbe = () => {
      probeIdRef.current += 1;
      const probeId = probeIdRef.current;
      if (window.innerWidth < 1180) {
        setEnabled(false);
        return;
      }

      setEnabled(true);
      const verify = () => {
        if (probeId !== probeIdRef.current) return;
        if (!marketFullyVisible()) setEnabled(false);
      };
      requestAnimationFrame(() => requestAnimationFrame(verify));
      window.setTimeout(verify, 280);
      window.setTimeout(verify, 780);
    };

    runProbe();
    window.addEventListener("resize", runProbe);
    return () => {
      probeIdRef.current += 1;
      window.removeEventListener("resize", runProbe);
    };
  }, [gameState.roomId, gameState.variant, gameState.lastAction, refs.marketColumnRef, refs.developmentMarketRef, refs.marketTierListRef, refs.publicBankStripRef]);

  return enabled;
}

export function GameBoard({ gameState, pendingDiscardExcess, onCommand, onIntent, remoteIntent }: GameBoardProps) {
  const myPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId)!;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.currentPlayerId);

  const takeGems = (colors: GemColor[]) => {
    onCommand({ type: "takeGems", colors });
  };

  const reserveCard = (cardId: string | null, fromDeck: 1 | 2 | 3 | null) => {
    onCommand({ type: "reserveCard", cardId, fromDeck });
  };

  const buyCard = (cardId: string, goldSubstitutions: Partial<Record<BasicColor, number>>) => {
    onCommand({ type: "buyCard", cardId, goldSubstitutions });
  };

  const discardTokens = (tokens: Partial<Gems>) => {
    onCommand({ type: "discardTokens", tokens });
  };

  const evolvePokemon = (targetCardId: string | null, skip = false) => {
    onCommand({ type: "evolvePokemon", targetCardId, skip });
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
      onIntent={onIntent}
      remoteIntent={remoteIntent}
    >
      <GameTableContents gameState={gameState} />
    </BoardDragProvider>
  );
}

function GameTableContents({ gameState }: { gameState: GameState }) {
  const { activeDrag, activeDragPoint, selectedCard, setSelectedCard, stageTakeGem, stageReserveDeck, stagedTakeGems, isMyTurn, mustDiscard, remoteIntent } = useBoardDrag();
  const myPlayer = gameState.players.find((player) => player.id === gameState.myPlayerId)!;
  const currentPlayer = gameState.players.find((player) => player.id === gameState.currentPlayerId);
  const opponents = gameState.players.filter((player) => player.id !== gameState.myPlayerId);
  const roundText = gameState.players.reduce((max, player) => Math.max(max, player.turnsTaken ?? 0), 0) + 1;
  const resourceLabel = gameState.variant === "pokemon" ? "精灵球" : "宝石";
  const scoreLabel = gameState.variant === "pokemon" ? "奖杯" : "声望";
  const [myAreaOpen, setMyAreaOpen] = useState(true);
  const [opponentsOpen, setOpponentsOpen] = useState(true);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [dragAutoOpened, setDragAutoOpened] = useState(false);
  const marketColumnRef = useRef<HTMLElement | null>(null);
  const developmentMarketRef = useRef<HTMLElement | null>(null);
  const marketTierListRef = useRef<HTMLDivElement | null>(null);
  const publicBankStripRef = useRef<HTMLElement | null>(null);
  const workbenchMode = false;
  const wasDraggingRef = useRef(false);
  const suppressDrawerHeadClickUntilRef = useRef(0);
  const suppressOutsideClickUntilRef = useRef(0);
  const myTokenTotal = totalTokens(myPlayer.gems);
  const logs = actionLogEntries(gameState);
  const latestLog = logs[logs.length - 1];
  const turnToast = useTurnReminder(gameState, myPlayer, currentPlayer);
  const effectiveMyAreaOpen = workbenchMode || myAreaOpen;

  useEffect(() => {
    if (mustDiscard) {
      setMyAreaOpen(true);
    }
  }, [mustDiscard]);

  useEffect(() => {
    if (workbenchMode || !myAreaOpen || dragAutoOpened) return;

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
  }, [dragAutoOpened, myAreaOpen, workbenchMode]);

  useEffect(() => {
    if (workbenchMode) return;
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
  }, [activeDrag, activeDragPoint, dragAutoOpened, myAreaOpen, workbenchMode]);

  const handleSelectCard = (card: Card) => {
    setSelectedCard(card, "market");
    setMyAreaOpen(true);
  };

  const handleStageTakeGem = (color: GemColor) => {
    stageTakeGem(color);
  };

  const closeMyAreaFromTable = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (workbenchMode) return;
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
    if (workbenchMode) return;
    if (Date.now() < suppressDrawerHeadClickUntilRef.current) return;
    setMyAreaOpen((open) => !open);
  };

  return (
    <main
      className={`game-shell tabletop-shell focus-table-shell ${workbenchMode ? "workbench-mode" : ""} ${remoteIntent ? `remote-intent-active remote-intent-${remoteIntent.intent.type}` : ""} ${gameState.variant === "pokemon" ? "pokemon-shell" : "classic-shell"} ${
        effectiveMyAreaOpen ? "my-drawer-open" : ""
      } ${opponentsOpen ? "opponents-drawer-open" : ""} player-count-${gameState.players.length}`}
      data-trace-surface="game"
    >
      <header className="game-topbar tabletop-topbar">
        <nav className="tabletop-utility tabletop-utility-left" aria-label="快捷入口">
          <a href="#lobby" aria-label="打开大厅" data-cursor-anchor="ui:lobby">
            <Menu size={19} />
          </a>
          <a href="#rules" aria-label="查看规则" data-cursor-anchor="ui:rules">
            <BookOpen size={19} />
          </a>
        </nav>

        <div className="tabletop-title-stack" data-cursor-anchor="ui:title-stack">
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
            data-cursor-anchor="ui:opponents-toggle"
            onClick={() => setOpponentsOpen((open) => !open)}
          >
            <Users size={18} />
          </button>
          <button
            type="button"
            className={`drawer-toggle-button ${effectiveMyAreaOpen ? "active" : ""}`}
            aria-label={workbenchMode ? "我的区域已常驻显示" : effectiveMyAreaOpen ? "收起我的区域" : "展开我的区域"}
            aria-pressed={effectiveMyAreaOpen}
            data-cursor-anchor="ui:my-area-toggle"
            onClick={() => {
              if (!workbenchMode) setMyAreaOpen((open) => !open);
            }}
          >
            <PanelBottomOpen size={18} />
          </button>
          <button
            type="button"
            className={`drawer-toggle-button ${actionLogOpen ? "active" : ""}`}
            aria-label={actionLogOpen ? "收起操作记录" : "查看操作记录"}
            aria-pressed={actionLogOpen}
            data-cursor-anchor="ui:action-log-toggle"
            onClick={() => setActionLogOpen((open) => !open)}
          >
            <MessageCircle size={18} />
          </button>
          <button type="button" aria-label="刷新桌面" data-cursor-anchor="ui:refresh" onClick={() => window.location.reload()}>
            <RotateCcw size={18} />
          </button>
          <button type="button" aria-label="设置" data-cursor-anchor="ui:settings">
            <Settings size={18} />
          </button>
        </nav>
      </header>

      <ArenaOpponentSeats gameState={gameState} myPlayerId={myPlayer.id} />

      <div className="tabletop-board" onClickCapture={closeMyAreaFromTable}>
        <div className="player-corner-hud" data-cursor-anchor="ui:player-hud" aria-label={`我的${resourceLabel} ${myTokenTotal} 个，${scoreLabel} ${myPlayer.prestige} 分`}>
          <b>{resourceLabel} {myTokenTotal}</b>
          <b>{scoreLabel} {myPlayer.prestige}</b>
          <b>{gameState.variant === "pokemon" ? "保留" : "预留"} {myPlayer.reservedCards.length}/3</b>
          {latestLog ? <span title={latestLog.text}>{latestLog.text}</span> : null}
        </div>
        <section className="tabletop-main-column" aria-label="公共桌面">
          <section ref={marketColumnRef} className="market-column" aria-label={gameState.variant === "pokemon" ? "宝可梦市场" : "发展卡市场"}>
            {gameState.variant === "pokemon" ? (
              <PokemonSpecialRow gameState={gameState} onSelectCard={() => setMyAreaOpen(true)} />
            ) : (
              <NobleRow nobles={gameState.nobles} currentPlayer={myPlayer} />
            )}

            <section ref={developmentMarketRef} className="development-market">
              <div className="panel-heading slim">
                <h2>{gameState.variant === "pokemon" ? "宝可梦市场" : "发展卡市场"}</h2>
                <span>{gameState.variant === "pokemon" ? "点击或拖动选择，条件足够可直接捕捉" : "点击或拖动选择，条件足够可直接购买"}</span>
              </div>
              <div ref={marketTierListRef} className="market-tier-list">
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
                          key={`${row.key}-${index}`}
                          card={card}
                          tier={row.tier}
                          selected={Boolean(card && selectedCard?.id === card.id)}
                          onClick={card ? () => handleSelectCard(card as Card) : undefined}
                          variant={gameState.variant}
                          dealIndex={index}
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

          <section ref={publicBankStripRef} className="public-bank-strip" aria-label={gameState.variant === "pokemon" ? "公共精灵球池" : "公共宝石池"}>
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
        data-cursor-anchor="ui:opponents-tab"
        onClick={() => setOpponentsOpen((open) => !open)}
      >
        <Users size={17} />
        <span>玩家区</span>
        <strong>{opponents.length}</strong>
      </button>

      <aside className={`opponent-drawer ${opponentsOpen ? "open" : ""}`} aria-hidden={!opponentsOpen}>
        <button type="button" className="drawer-close opponent-drawer-close" aria-label="收起其他玩家" data-cursor-anchor="ui:opponents-close" onClick={() => setOpponentsOpen(false)}>
          <X size={17} />
        </button>
        <OpponentPanel players={gameState.players} myPlayerId={gameState.myPlayerId} currentPlayerId={gameState.currentPlayerId} variant={gameState.variant} />
      </aside>

      <aside className={`action-log-drawer ${actionLogOpen ? "open" : ""}`} data-cursor-anchor="ui:action-log-drawer" aria-hidden={!actionLogOpen}>
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

      <section className={`my-area-drawer ${effectiveMyAreaOpen ? "open" : ""} ${dragAutoOpened ? "drag-hot-open" : ""}`} data-cursor-anchor="ui:my-area-drawer" aria-label="我的宝石与行动抽屉">
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
          aria-expanded={effectiveMyAreaOpen}
        >
          <div className={`arena-self-identity ${isMyTurn ? "current" : ""}`}>
            <span className="arena-seat-avatar">{AVATARS[myPlayer.avatarId % AVATARS.length]}</span>
            <span className="arena-seat-name">
              <strong>{myPlayer.username}</strong>
              <em>{isMyTurn ? "你的回合" : "在线"}</em>
            </span>
            <span className="arena-seat-score">
              <b>{myPlayer.prestige}</b>
              <small>{scoreLabel}</small>
            </span>
          </div>
          <MyGemsZone player={myPlayer} className="my-drawer-gems" variant={gameState.variant} />
        </div>
        <div className="my-area-drawer-body" aria-hidden={!effectiveMyAreaOpen}>
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

function opponentSeatPositions(count: number) {
  if (count <= 1) return ["left"] as const;
  if (count === 2) return ["left", "right"] as const;
  return ["left", "right", "bottom-peer"] as const;
}

function ArenaOpponentSeats({ gameState, myPlayerId }: { gameState: GameState; myPlayerId: string }) {
  const opponents = gameState.players.filter((player) => player.id !== myPlayerId);
  const positions = opponentSeatPositions(opponents.length);
  return (
    <aside className={`arena-opponent-seats opponent-count-${opponents.length}`} aria-label="桌边玩家区">
      {opponents.map((player, index) => (
        <ArenaPlayerSeat
          key={player.id}
          player={player}
          position={positions[index] ?? "top"}
          current={player.id === gameState.currentPlayerId}
          variant={gameState.variant}
        />
      ))}
    </aside>
  );
}

function ArenaPlayerSeat({ player, position, current, variant }: { player: PlayerState; position: string; current: boolean; variant: GameState["variant"] }) {
  const tokenImages = tokenImagesFor(variant);
  const labels = colorLabelsFor(variant);
  const slots = tokenSlotColors(player.gems);
  const overflow = Math.max(0, slots.length - 10);
  const groups = purchasedByColor(player);
  const bonusTotal = BASIC_COLORS.reduce((sum, color) => sum + player.bonuses[color], 0);
  const latestCard = player.purchasedCards[player.purchasedCards.length - 1];

  return (
    <article className={`arena-seat arena-seat-${position} ${current ? "current" : ""} ${player.connected === false ? "offline" : ""}`}>
      <header className="arena-seat-head">
        <span className="arena-seat-avatar">{latestCard ? <img src={cardImageUrl(latestCard.id, latestCard)} alt="" /> : AVATARS[player.avatarId % AVATARS.length]}</span>
        <span className="arena-seat-name">
          <strong>{player.username}</strong>
          <em>{player.connected === false ? "离线" : current ? "行动中" : "在线"}</em>
        </span>
        <span className="arena-seat-score">
          <b>{player.prestige}</b>
          <small>{variant === "pokemon" ? "奖杯" : "声望"}</small>
        </span>
      </header>

      <div className="arena-token-slots" aria-label={`${player.username} 的资源槽`}>
        {Array.from({ length: 10 }, (_, index) => {
          const color = slots[index];
          return (
            <span key={index} className={`arena-token-slot ${color ? "filled" : ""}`}>
              {color ? <img src={tokenImages[color]} alt={labels[color]} /> : null}
            </span>
          );
        })}
        {overflow ? <strong className="arena-token-overflow">+{overflow}</strong> : null}
      </div>

      <div className="arena-seat-meta">
        <span>
          <b>{bonusTotal}</b>
          加成
        </span>
        <span>
          <b>{player.reservedCards.length}</b>
          {variant === "pokemon" ? "保留" : "预留"}
        </span>
        <span>
          <b>{player.purchasedCards.length}</b>
          {variant === "pokemon" ? "捕捉" : "已购"}
        </span>
      </div>

      <div className="arena-card-zones">
        <div className="arena-reserve-stack" aria-label={`${player.username} 的预留`}>
          {Array.from({ length: 3 }, (_, index) => {
            const card = player.reservedCards[index];
            return (
              <span key={index} className={card ? "has-card" : ""}>
                {card ? <img src={deckBackUrl(card.tier ?? 1, variant, card.deckKind ?? "common")} alt="" /> : null}
              </span>
            );
          })}
        </div>
        <div className="arena-bonus-stacks" aria-label={`${player.username} 的已购列`}>
          {BASIC_COLORS.map((color) => {
            const cards = groups[color];
            return (
              <span key={color} className={`arena-bonus-stack stack-${color}`}>
                <i style={{ background: `var(--gem-${color})` }} />
                <b>{cards.length}</b>
                {cards.slice(-2).map((card) => (
                  <img key={card.id} src={cardImageUrl(card.id, card)} alt="" />
                ))}
              </span>
            );
          })}
        </div>
      </div>
    </article>
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
