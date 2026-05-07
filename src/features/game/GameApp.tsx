import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameBoard } from "~/components/GameBoard";
import { GameOverModal } from "~/components/GameOverModal";
import LobbyScreen from "~/components/LobbyScreen";
import { WaitingRoom } from "~/components/WaitingRoom";
import { clearSeatSession, readSeatSession, saveSeatSession, type StoredSeatSession } from "./reconnectSession";
import { createRoomFn, joinRoomFn, reconnectRoomFn, sendGameCommandFn, startGameFn } from "./serverFns";
import type { GameCommand, RoomIntent, RoomIntentEvent, RoomStateEvent, SeatResponse, SseEnvelope } from "~/shared/protocol";
import type { GameOverPayload, GameState, GameVariant, RoomState } from "~/types";

type Screen = "lobby" | "waiting" | "game";

function inviteRoomFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase().slice(0, 6) ?? "";
}

function roomQueryKey(roomId: string, playerId: string) {
  return ["roomState", roomId, playerId] as const;
}

function gameQueryKey(roomId: string, playerId: string) {
  return ["gameState", roomId, playerId] as const;
}

type DeferredStateUpdate = {
  seq: number;
  room?: RoomState;
  state?: GameState;
  timer: number;
};

type PendingDeferredSubmit = {
  deferStateMs: number;
  deadlineMs: number;
  timer: number;
};

export function GameApp() {
  const queryClient = useQueryClient();
  const invitedRoomId = useMemo(() => inviteRoomFromUrl(), []);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [error, setError] = useState("");
  const [discardExcess, setDiscardExcess] = useState(0);
  const [lobbyUsername, setLobbyUsername] = useState("");
  const [lobbyAvatarId, setLobbyAvatarId] = useState(0);
  const [lobbyRoomCode, setLobbyRoomCode] = useState(invitedRoomId);
  const [lobbyVariant, setLobbyVariant] = useState<GameVariant>("classic");
  const [lobbyJoining, setLobbyJoining] = useState(Boolean(invitedRoomId));
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [activeSession, setActiveSession] = useState<StoredSeatSession | null>(null);
  const [remoteIntent, setRemoteIntent] = useState<RoomIntentEvent | null>(null);
  const seqRef = useRef(0);
  const roomStateRef = useRef<RoomState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const deferredStateRef = useRef<DeferredStateUpdate | null>(null);
  const pendingDeferredSubmitRef = useRef<PendingDeferredSubmit | null>(null);
  const remoteIntentTimerRef = useRef<number | null>(null);

  const { data: roomState = null } = useQuery({
    queryKey: roomQueryKey(roomId, playerId),
    queryFn: async () => null as RoomState | null,
    enabled: false,
    initialData: null,
  });
  const { data: gameState = null } = useQuery({
    queryKey: gameQueryKey(roomId, playerId),
    queryFn: async () => null as GameState | null,
    enabled: false,
    initialData: null,
  });

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventNativeDrag = (event: DragEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[data-allow-native-drag="true"]')) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("dragstart", preventNativeDrag);
    document.addEventListener("dragover", preventNativeDrag);
    document.addEventListener("drop", preventNativeDrag);
    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("dragstart", preventNativeDrag);
      document.removeEventListener("dragover", preventNativeDrag);
      document.removeEventListener("drop", preventNativeDrag);
    };
  }, []);

  const rememberSeat = (session: Omit<StoredSeatSession, "updatedAt">) => {
    saveSeatSession(session);
    const stored = readSeatSession();
    setActiveSession(stored);
    setLobbyUsername(session.username);
    setLobbyAvatarId(session.avatarId);
    setLobbyRoomCode(session.roomId);
    setLobbyJoining(true);
  };

  const leaveSeatLocally = (message?: string) => {
    clearSeatSession();
    setActiveSession(null);
    setRoomId("");
    setPlayerId("");
    setGameOver(null);
    setRemoteIntent(null);
    setDiscardExcess(0);
    seqRef.current = 0;
    roomStateRef.current = null;
    gameStateRef.current = null;
    window.clearTimeout(deferredStateRef.current?.timer);
    window.clearTimeout(pendingDeferredSubmitRef.current?.timer);
    window.clearTimeout(remoteIntentTimerRef.current ?? undefined);
    deferredStateRef.current = null;
    pendingDeferredSubmitRef.current = null;
    setLobbyBusy(false);
    setRestoringSession(false);
    setScreen("lobby");
    if (message) setError(message);
  };

  const applyAuthoritativeState = (seq: number, room?: RoomState, state?: GameState) => {
    seqRef.current = Math.max(seqRef.current, seq);
    if (room) {
      roomStateRef.current = room;
      queryClient.setQueryData(roomQueryKey(room.roomId, activeSession?.playerId ?? playerId), room);
      setRoomId(room.roomId);
      if (!room.started) setScreen("waiting");
    }
    if (state) {
      gameStateRef.current = state;
      queryClient.setQueryData(gameQueryKey(state.roomId, state.myPlayerId), state);
      setRoomId(state.roomId);
      setPlayerId(state.myPlayerId);
      setScreen("game");
      if (!state.pendingDiscardPlayerId) setDiscardExcess(0);
    }
  };

  const scheduleDeferredState = (seq: number, room: RoomState | undefined, state: GameState | undefined, delayMs: number) => {
    window.clearTimeout(deferredStateRef.current?.timer);
    seqRef.current = Math.max(seqRef.current, seq);
    deferredStateRef.current = {
      seq,
      room,
      state,
      timer: window.setTimeout(() => {
        if (deferredStateRef.current?.seq !== seq) return;
        applyAuthoritativeState(seq, room, state);
        deferredStateRef.current = null;
      }, Math.max(0, delayMs)),
    };
  };

  const flushDeferredStateBefore = (nextSeq: number) => {
    const deferred = deferredStateRef.current;
    if (!deferred || nextSeq <= deferred.seq) return;
    window.clearTimeout(deferred.timer);
    deferredStateRef.current = null;
    applyAuthoritativeState(deferred.seq, deferred.room, deferred.state);
  };

  const markPendingDeferredSubmit = (deferStateMs: number) => {
    window.clearTimeout(pendingDeferredSubmitRef.current?.timer);
    pendingDeferredSubmitRef.current = {
      deferStateMs,
      deadlineMs: performance.now() + deferStateMs,
      timer: window.setTimeout(() => {
        pendingDeferredSubmitRef.current = null;
      }, Math.max(1800, deferStateMs + 900)),
    };
  };

  const pendingDeferredDelay = (fallbackMs: number) => {
    const pending = pendingDeferredSubmitRef.current;
    if (!pending) return fallbackMs;
    return Math.max(0, pending.deadlineMs - performance.now());
  };

  const clearPendingDeferredSubmit = () => {
    window.clearTimeout(pendingDeferredSubmitRef.current?.timer);
    pendingDeferredSubmitRef.current = null;
  };

  const consumePendingDeferredState = (event: RoomStateEvent) => {
    const pending = pendingDeferredSubmitRef.current;
    if (!pending || event.seq <= seqRef.current) return false;
    const remainingMs = pendingDeferredDelay(pending.deferStateMs);
    clearPendingDeferredSubmit();
    scheduleDeferredState(event.seq, event.room, event.state, remainingMs);
    return true;
  };

  const applyRoomEventSideEffects = (event: RoomStateEvent) => {
    if (event.type === "actionRequired" && event.action?.type === "discard_tokens") {
      setDiscardExcess(event.action.excess);
    }
    if (event.type === "gameOver" && event.payload) {
      setGameOver(event.payload);
      setScreen("game");
    }
    if (event.type === "error") setError(event.message);
  };

  const applyRoomEvent = (event: RoomStateEvent) => {
    if (event.seq <= seqRef.current && !deferredStateRef.current) {
      applyRoomEventSideEffects(event);
      return;
    }
    flushDeferredStateBefore(event.seq);
    if (consumePendingDeferredState(event)) return;
    const shouldDefer = event.type === "action" || event.type === "gameOver";
    if (shouldDefer) {
      scheduleDeferredState(event.seq, event.room, event.state, 420);
    } else {
      applyAuthoritativeState(event.seq, event.room, event.state);
    }
    applyRoomEventSideEffects(event);
  };

  const handleRemoteIntent = (event: RoomIntentEvent) => {
    if (event.playerId === playerId) return;
    window.clearTimeout(remoteIntentTimerRef.current ?? undefined);
    if (event.intent.type === "clear") {
      setRemoteIntent(null);
      return;
    }
    setRemoteIntent(event);
    remoteIntentTimerRef.current = window.setTimeout(() => setRemoteIntent(null), 1800);
  };

  const refreshSnapshot = async (session: StoredSeatSession) => {
    const params = new URLSearchParams({ playerId: session.playerId, reconnectToken: session.reconnectToken });
    const response = await fetch(`/api/rooms/${encodeURIComponent(session.roomId)}/snapshot?${params.toString()}`);
    const data = (await response.json().catch(() => ({}))) as { seq?: number; room?: RoomState; state?: GameState; error?: string };
    if (!response.ok || data.error) throw new Error(data.error ?? "同步房间失败");
    if (typeof data.seq === "number") {
      flushDeferredStateBefore(data.seq);
      applyAuthoritativeState(data.seq, data.room, data.state);
    }
  };

  const applySeatResponse = (session: StoredSeatSession, response: SeatResponse) => {
    const nextRoomId = response.roomId ?? session.roomId;
    const nextPlayerId = response.playerId ?? session.playerId;
    const nextToken = response.reconnectToken ?? session.reconnectToken;
    rememberSeat({
      roomId: nextRoomId,
      playerId: nextPlayerId,
      reconnectToken: nextToken,
      username: session.username,
      avatarId: session.avatarId,
    });
    setRoomId(nextRoomId);
    setPlayerId(nextPlayerId);
    setError("");
    setScreen(response.phase === "waiting" ? "waiting" : "game");
  };

  const reconnectSeat = async (session: StoredSeatSession, showLoading: boolean) => {
    if (showLoading) {
      setRestoringSession(true);
      setLobbyBusy(true);
    }
    try {
      const response = await reconnectRoomFn({
        data: {
          roomId: session.roomId,
          playerId: session.playerId,
          reconnectToken: session.reconnectToken,
        },
      });
      if (response.error || !response.playerId || !response.reconnectToken) {
        leaveSeatLocally(response.error ?? "自动恢复房间失败，请重新加入。");
        setLobbyJoining(true);
        setLobbyRoomCode(session.roomId);
        return;
      }
      applySeatResponse(session, response);
    } catch {
      setError("自动恢复连接失败，请检查服务器后刷新页面或手动加入。");
    } finally {
      if (showLoading) {
        setRestoringSession(false);
        setLobbyBusy(false);
      }
    }
  };

  useEffect(() => {
    const session = readSeatSession();
    if (!session || (invitedRoomId && invitedRoomId !== session.roomId)) return;
    setLobbyUsername(session.username);
    setLobbyAvatarId(session.avatarId);
    setLobbyRoomCode(session.roomId);
    setLobbyJoining(true);
    void reconnectSeat(session, true);
  }, [invitedRoomId]);

  useEffect(() => {
    if (!activeSession) return;
    const params = new URLSearchParams({
      playerId: activeSession.playerId,
      reconnectToken: activeSession.reconnectToken,
      after: String(seqRef.current),
    });
    const source = new EventSource(`/api/rooms/${encodeURIComponent(activeSession.roomId)}/events?${params.toString()}`);
    const handleEnvelope = (envelope: SseEnvelope) => {
      if (envelope.type === "intent") handleRemoteIntent(envelope);
      if (envelope.type === "snapshot" || envelope.type === "joined" || envelope.type === "action" || envelope.type === "error" || envelope.type === "gameOver" || envelope.type === "actionRequired") {
        applyRoomEvent(envelope);
      }
      if (envelope.type === "sessionReplaced") {
        leaveSeatLocally("这个座位已在另一个窗口恢复连接，本窗口已退出桌局。");
      }
    };
    const parseEvent = (event: MessageEvent) => {
      try {
        handleEnvelope(JSON.parse(event.data) as SseEnvelope);
      } catch {
        setError("服务器推送数据解析失败。");
      }
    };
    source.addEventListener("open", () => void refreshSnapshot(activeSession).catch((err) => setError(err instanceof Error ? err.message : "同步房间失败")));
    source.addEventListener("room", parseEvent);
    source.onerror = () => setError("实时连接中断，正在尝试自动恢复。");
    return () => source.close();
  }, [activeSession?.roomId, activeSession?.playerId, activeSession?.reconnectToken, queryClient]);

  const myPlayer = useMemo(() => {
    if (gameState) return gameState.players.find((player) => player.id === gameState.myPlayerId) ?? null;
    if (roomState && playerId) return roomState.players.find((player) => player.id === playerId) ?? null;
    return null;
  }, [gameState, playerId, roomState]);

  const createRoom = async (username: string, avatarId: number) => {
    const cleanUsername = username.trim();
    setError("");
    if (!cleanUsername) {
      setError("请输入玩家昵称。");
      return;
    }
    setLobbyBusy(true);
    try {
      const response = await createRoomFn({ data: { username: cleanUsername, avatarId, variant: lobbyVariant } });
      if (response.error || !response.roomId || !response.playerId || !response.reconnectToken) {
        setError(response.error ?? "创建房间失败");
        return;
      }
      rememberSeat({ roomId: response.roomId, playerId: response.playerId, reconnectToken: response.reconnectToken, username: cleanUsername, avatarId });
      setRoomId(response.roomId);
      setPlayerId(response.playerId);
      setScreen("waiting");
    } finally {
      setLobbyBusy(false);
    }
  };

  const joinRoom = async (targetRoomId: string, username: string, avatarId: number) => {
    const cleanRoomId = targetRoomId.trim().toUpperCase();
    const cleanUsername = username.trim();
    setError("");
    if (!cleanUsername) {
      setError("请输入玩家昵称。");
      return;
    }
    if (!cleanRoomId) {
      setError("请输入邀请链接中的房间号。");
      return;
    }
    setLobbyBusy(true);
    try {
      const response = await joinRoomFn({ data: { roomId: cleanRoomId, username: cleanUsername, avatarId } });
      const responseRoomId = response.roomId ?? cleanRoomId;
      if (response.error || !response.playerId || !response.reconnectToken) {
        setError(response.error ?? "加入房间失败");
        return;
      }
      rememberSeat({ roomId: responseRoomId, playerId: response.playerId, reconnectToken: response.reconnectToken, username: cleanUsername, avatarId });
      setRoomId(responseRoomId);
      setPlayerId(response.playerId);
      setScreen(response.phase === "waiting" ? "waiting" : "game");
    } finally {
      setLobbyBusy(false);
    }
  };

  const startGame = async () => {
    const session = readSeatSession();
    setError("");
    if (!session) {
      setError("玩家连接状态不存在，请重新进入房间。");
      return;
    }
    const response = await startGameFn({ data: { roomId: session.roomId, playerId: session.playerId, reconnectToken: session.reconnectToken } });
    if (!response.ok) setError(response.error);
  };

  const sendCommand = async (command: GameCommand) => {
    const session = readSeatSession();
    if (!session) {
      setError("玩家连接状态不存在，请重新进入房间。");
      return;
    }
    markPendingDeferredSubmit(420);
    try {
      const response = await sendGameCommandFn({
        data: {
          roomId: session.roomId,
          playerId: session.playerId,
          reconnectToken: session.reconnectToken,
          command,
        },
      });
      if (!response.ok) {
        clearPendingDeferredSubmit();
        setError(response.error);
      }
    } catch {
      clearPendingDeferredSubmit();
      setError("行动提交失败。");
    }
  };

  const publishIntent = async (intent: RoomIntent) => {
    const session = readSeatSession();
    if (!session) return;
    await fetch(`/api/rooms/${encodeURIComponent(session.roomId)}/intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: session.playerId, reconnectToken: session.reconnectToken, intent }),
    }).catch(() => undefined);
  };

  const resetToLobby = () => {
    leaveSeatLocally();
    setError("");
    setLobbyRoomCode("");
    setLobbyJoining(false);
  };

  if (restoringSession) {
    return <main className="loading-shell">正在恢复你的宝石桌座位...</main>;
  }

  if (screen === "lobby") {
    return (
      <LobbyScreen
        username={lobbyUsername}
        avatarId={lobbyAvatarId}
        roomCode={lobbyRoomCode}
        joining={lobbyJoining}
        busy={lobbyBusy}
        error={error}
        onUsernameChange={setLobbyUsername}
        onAvatarChange={setLobbyAvatarId}
        onRoomCodeChange={(value) => setLobbyRoomCode(value.toUpperCase().slice(0, 6))}
        variant={lobbyVariant}
        onVariantChange={setLobbyVariant}
        onToggleJoin={() => setLobbyJoining(true)}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
    );
  }

  if (screen === "waiting" && roomState) {
    return <WaitingRoom roomState={roomState} playerId={playerId} onStart={startGame} error={error} />;
  }

  if (screen === "game" && gameState && myPlayer) {
    return (
      <>
        <GameBoard gameState={gameState} pendingDiscardExcess={discardExcess || null} onCommand={sendCommand} onIntent={publishIntent} remoteIntent={remoteIntent} />
        {gameOver ? <GameOverModal payload={gameOver} onReturnToLobby={resetToLobby} /> : null}
      </>
    );
  }

  return <main className="loading-shell">正在连接璀璨宝石桌局...</main>;
}
