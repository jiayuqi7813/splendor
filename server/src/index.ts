import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { Server, Socket } from "socket.io";
import {
  applyBuy,
  applyDiscardTokens,
  applyEvolvePokemon,
  applyReserve,
  applyTakeGems,
  GameRoom,
  getPlayerView,
  validateEvolvePokemon,
  validateBuy,
  validateReserve,
  validateTakeGems,
} from "./gameEngine";
import { ALL_COLORS, BasicColor, Card, GameVariant, GemColor } from "./gameData";
import {
  cleanupRooms,
  createRoom,
  handleDisconnect,
  joinRoom,
  reconnectRoom,
  rooms,
  startRoomGame,
  toRoomState,
  touchRoom,
} from "./rooms";

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const devOrigins = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];

app.use(express.json());
if (!isProduction) {
  app.use(cors({ origin: devOrigins }));
}

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

const io = new Server(server, {
  cors: isProduction
    ? undefined
    : {
        origin: devOrigins,
        methods: ["GET", "POST"],
      },
});

function emitRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("room_updated", toRoomState(room));
}

function socketForPlayer(room: GameRoom, playerId: string): Socket | undefined {
  const player = room.players.find((entry) => entry.id === playerId);
  return player?.socketId ? io.sockets.sockets.get(player.socketId) : undefined;
}

function emitGame(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room || !room.gameState) {
    emitRoom(roomId);
    return;
  }

  for (const player of room.players) {
    const socket = socketForPlayer(room, player.id);
    if (socket) {
      socket.emit("game_state", getPlayerView(room.gameState, player.id));
      if (room.gameState.pendingDiscardPlayerId === player.id) {
        const total = Object.values(player.gems).reduce((sum, value) => sum + value, 0);
        socket.emit("action_required", { type: "discard_tokens", excess: Math.max(0, total - 10) });
      }
    }
  }

  if (room.gameState.phase === "ended" && room.gameState.winner) {
    io.to(roomId).emit("game_over", {
      winner: room.gameState.winner,
      finalScores: [...room.gameState.players].sort((a, b) => {
        if (b.prestige !== a.prestige) return b.prestige - a.prestige;
        if (room.gameState?.variant === "pokemon") {
          if (b.tuckedCards.length !== a.tuckedCards.length) return b.tuckedCards.length - a.tuckedCards.length;
          return b.purchasedCards.length - a.purchasedCards.length;
        }
        return a.purchasedCards.length - b.purchasedCards.length;
      }),
      reason: room.gameState.gameOverReason || "游戏结束，已按声望与购卡数量结算胜者。",
    });
  }
}

function respondError(cb: ((response: { error?: string }) => void) | undefined, message: string, socket?: Socket) {
  if (cb) cb({ error: message });
  if (socket) socket.emit("error", { message });
}

function bindPlayerSocket(socket: Socket, roomId: string, playerId: string): void {
  for (const existingSocket of io.sockets.sockets.values()) {
    if (existingSocket.id === socket.id) continue;
    if (existingSocket.data.roomId === roomId && existingSocket.data.playerId === playerId) {
      existingSocket.leave(roomId);
      existingSocket.data.roomId = undefined;
      existingSocket.data.playerId = undefined;
      existingSocket.emit("session_replaced");
    }
  }
  socket.data.playerId = playerId;
  socket.data.roomId = roomId;
  socket.join(roomId);
}

function getActivePlayerId(room: GameRoom, socket: Socket): string | null {
  const playerId = typeof socket.data.playerId === "string" ? socket.data.playerId : "";
  if (!playerId || socket.data.roomId !== room.roomId) return null;
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player || player.socketId !== socket.id) return null;
  return playerId;
}

type TracePhase = "start" | "move" | "end" | "cancel";
type TraceItemInput =
  | { kind: "cursor" }
  | { kind: "bank-gem" | "my-gem"; color?: GemColor }
  | { kind: "market-card"; cardId?: string }
  | { kind: "reserved-card"; tier?: 1 | 2 | 3 }
  | { kind: "deck"; tier?: 1 | 2 | 3 };

type PublicTraceItem =
  | { kind: "cursor" }
  | { kind: "bank-gem" | "my-gem"; color: GemColor }
  | { kind: "market-card"; cardId: string; color: Card["color"]; prestige: number; tier: 1 | 2 | 3; image?: string; name?: string }
  | { kind: "reserved-card"; tier: 1 | 2 | 3 }
  | { kind: "deck"; tier: 1 | 2 | 3 };

function clampUnit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function isTracePhase(value: unknown): value is TracePhase {
  return value === "start" || value === "move" || value === "end" || value === "cancel";
}

function isTier(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function findPublicMarketCard(roomId: string, cardId: string): Card | null {
  const room = rooms.get(roomId);
  const gameState = room?.gameState;
  if (!gameState) return null;
  const cards = [
    ...gameState.tier1.faceUp,
    ...gameState.tier2.faceUp,
    ...gameState.tier3.faceUp,
    ...(gameState.rare?.faceUp ?? []),
    ...(gameState.legendary?.faceUp ?? []),
  ];
  return cards.find((card) => card?.id === cardId) ?? null;
}

function sanitizeTraceItem(roomId: string, item: TraceItemInput | undefined): PublicTraceItem | null {
  if (!item || typeof item.kind !== "string") return null;
  if (item.kind === "cursor") {
    return { kind: "cursor" };
  }
  if ((item.kind === "bank-gem" || item.kind === "my-gem") && item.color && ALL_COLORS.includes(item.color)) {
    return { kind: item.kind, color: item.color };
  }
  if (item.kind === "deck" && isTier(item.tier)) {
    return { kind: "deck", tier: item.tier };
  }
  if (item.kind === "reserved-card") {
    return { kind: "reserved-card", tier: isTier(item.tier) ? item.tier : 1 };
  }
  if (item.kind === "market-card" && typeof item.cardId === "string") {
    const card = findPublicMarketCard(roomId, item.cardId);
    if (!card) return null;
    return { kind: "market-card", cardId: card.id, color: card.color, prestige: card.prestige, tier: card.tier, image: card.image, name: card.name };
  }
  return null;
}

io.on("connection", (socket) => {
  socket.on(
    "create_room",
    (
      payload: { username: string; avatarId: number; variant?: GameVariant },
      cb: (response: { roomId?: string; playerId?: string; reconnectToken?: string; error?: string }) => void
    ) => {
      const result = createRoom(payload.username, payload.avatarId, socket.id, payload.variant);
      if ("error" in result) return cb({ error: result.error });
      bindPlayerSocket(socket, result.room.roomId, result.playerId);
      cb({ roomId: result.room.roomId, playerId: result.playerId, reconnectToken: result.reconnectToken });
      emitRoom(result.room.roomId);
    }
  );

  socket.on(
    "join_room",
    (
      payload: { roomId: string; username: string; avatarId: number },
      cb: (response: { roomId?: string; playerId?: string; reconnectToken?: string; reconnected?: boolean; error?: string }) => void
    ) => {
      const result = joinRoom(payload.roomId, payload.username, payload.avatarId, socket.id);
      if ("error" in result) return cb({ error: result.error });
      if (!result.room || !result.playerId || !result.reconnectToken) return cb({ error: "加入房间失败。" });
      bindPlayerSocket(socket, result.room.roomId, result.playerId);
      cb({
        roomId: result.room.roomId,
        playerId: result.playerId,
        reconnectToken: result.reconnectToken,
        reconnected: result.reconnected,
      });
      emitRoom(result.room.roomId);
      if (result.room.gameState?.phase !== "waiting") {
        emitGame(result.room.roomId);
      }
    }
  );

  socket.on(
    "reconnect_room",
    (
      payload: { roomId: string; playerId: string; reconnectToken: string },
      cb: (response: { roomId?: string; playerId?: string; reconnectToken?: string; phase?: string; error?: string }) => void
    ) => {
      const result = reconnectRoom(payload.roomId, payload.playerId, payload.reconnectToken, socket.id);
      if ("error" in result) return cb({ error: result.error });
      if (!result.room || !result.playerId || !result.reconnectToken) return cb({ error: "恢复房间失败。" });
      bindPlayerSocket(socket, result.room.roomId, result.playerId);
      const phase = result.room.gameState?.phase ?? "waiting";
      cb({ roomId: result.room.roomId, playerId: result.playerId, reconnectToken: result.reconnectToken, phase });
      emitRoom(result.room.roomId);
      if (phase !== "waiting") {
        emitGame(result.room.roomId);
      }
    }
  );

  socket.on("start_game", (payload: { roomId: string }, cb: (response: { error?: string }) => void) => {
    const room = rooms.get(payload.roomId);
    const playerId = room ? getActivePlayerId(room, socket) : null;
    if (!playerId) return respondError(cb, "玩家连接状态不存在，请重新进入房间。", socket);
    const result = startRoomGame(payload.roomId, playerId);
    if (result.error) return respondError(cb, result.error, socket);
    socket.join(payload.roomId);
    emitRoom(payload.roomId);
    emitGame(payload.roomId);
    cb({});
  });

  socket.on(
    "evolve_pokemon",
    (
      payload: { roomId: string; targetCardId?: string | null; skip?: boolean },
      cb: (response: { error?: string }) => void
    ) => {
      const room = rooms.get(payload.roomId);
      const playerId = room ? getActivePlayerId(room, socket) : null;
      if (!room?.gameState || !playerId) return respondError(cb, "房间或玩家状态不存在。", socket);
      const validation = validateEvolvePokemon(room.gameState, playerId, payload.targetCardId, payload.skip);
      if (!validation.valid) return respondError(cb, validation.error || "进化失败。", socket);
      room.gameState = applyEvolvePokemon(room.gameState, playerId, payload.targetCardId, payload.skip);
      touchRoom(room.roomId);
      cb({});
      emitGame(room.roomId);
    }
  );

  socket.on("take_gems", (payload: { roomId: string; colors: GemColor[] }, cb: (response: { error?: string }) => void) => {
    const room = rooms.get(payload.roomId);
    const playerId = room ? getActivePlayerId(room, socket) : null;
    if (!room?.gameState || !playerId) return respondError(cb, "房间或玩家状态不存在。", socket);
    const validation = validateTakeGems(room.gameState, playerId, payload.colors);
    if (!validation.valid) return respondError(cb, validation.error || "取宝石失败。", socket);
    room.gameState = applyTakeGems(room.gameState, playerId, payload.colors);
    touchRoom(room.roomId);
    cb({});
    emitGame(room.roomId);
  });

  socket.on(
    "player_trace",
    (payload: {
      roomId: string;
      traceId: string;
      phase: TracePhase;
      x: number;
      y: number;
      item?: TraceItemInput;
      targetId?: string;
    }) => {
      const room = rooms.get(payload.roomId);
      const playerId = room ? getActivePlayerId(room, socket) : null;
      if (!room?.gameState || !playerId) return;
      const player = room.gameState.players.find((entry) => entry.id === playerId);
      if (!player) return;
      if (!isTracePhase(payload.phase)) return;
      const x = clampUnit(payload.x);
      const y = clampUnit(payload.y);
      const item = sanitizeTraceItem(room.roomId, payload.item);
      if (x === null || y === null || !item) return;
      const mayOperate = room.gameState.currentPlayerId === playerId || room.gameState.pendingDiscardPlayerId === playerId;
      if (item.kind !== "cursor" && !mayOperate) return;
      const traceId = typeof payload.traceId === "string" ? payload.traceId.slice(0, 80) : "";
      if (!traceId) return;

      socket.to(room.roomId).emit("player_trace", {
        roomId: room.roomId,
        traceId,
        phase: payload.phase,
        playerId,
        username: player.username,
        avatarId: player.avatarId,
        x,
        y,
        item,
        targetId: typeof payload.targetId === "string" ? payload.targetId.slice(0, 80) : undefined,
        at: Date.now(),
      });
    }
  );

  socket.on(
    "reserve_card",
    (payload: { roomId: string; cardId: string | null; fromDeck: 1 | 2 | 3 | null }, cb: (response: { error?: string }) => void) => {
      const room = rooms.get(payload.roomId);
      const playerId = room ? getActivePlayerId(room, socket) : null;
      if (!room?.gameState || !playerId) return respondError(cb, "房间或玩家状态不存在。", socket);
      const validation = validateReserve(room.gameState, playerId, payload.cardId, payload.fromDeck);
      if (!validation.valid) return respondError(cb, validation.error || "保留卡牌失败。", socket);
      room.gameState = applyReserve(room.gameState, playerId, payload.cardId, payload.fromDeck);
      touchRoom(room.roomId);
      cb({});
      emitGame(room.roomId);
    }
  );

  socket.on(
    "buy_card",
    (payload: { roomId: string; cardId: string; goldSubstitutions: Partial<Record<BasicColor, number>> }, cb: (response: { error?: string }) => void) => {
      const room = rooms.get(payload.roomId);
      const playerId = room ? getActivePlayerId(room, socket) : null;
      if (!room?.gameState || !playerId) return respondError(cb, "房间或玩家状态不存在。", socket);
      const validation = validateBuy(room.gameState, playerId, payload.cardId, payload.goldSubstitutions || {});
      if (!validation.valid) return respondError(cb, validation.error || "购买卡牌失败。", socket);
      room.gameState = applyBuy(room.gameState, playerId, payload.cardId, payload.goldSubstitutions || {});
      touchRoom(room.roomId);
      cb({});
      emitGame(room.roomId);
    }
  );

  socket.on("discard_tokens", (payload: { roomId: string; tokens: Partial<Record<GemColor, number>> }, cb: (response: { error?: string }) => void) => {
    const room = rooms.get(payload.roomId);
    const playerId = room ? getActivePlayerId(room, socket) : null;
    if (!room?.gameState || !playerId) return respondError(cb, "房间或玩家状态不存在。", socket);
    try {
      room.gameState = applyDiscardTokens(room.gameState, playerId, payload.tokens || {});
      touchRoom(room.roomId);
      cb({});
      emitGame(room.roomId);
    } catch (error) {
      respondError(cb, error instanceof Error ? error.message : "弃置代币失败。", socket);
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const changed = handleDisconnect(socket.id);
    if (changed && roomId && rooms.has(roomId)) {
      emitRoom(roomId);
      emitGame(roomId);
    }
  });
});

setInterval(() => cleanupRooms(), 10 * 60 * 1000).unref();

if (isProduction) {
  const publicDir =
    process.env.PUBLIC_DIR ??
    (process.cwd().endsWith(`${path.sep}server`) ? path.join(process.cwd(), "..", "public") : path.join(process.cwd(), "client", "dist"));
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/socket.io") || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

server.listen(PORT, () => {
  console.log(`璀璨宝石服务器已启动：http://localhost:${PORT}`);
});
