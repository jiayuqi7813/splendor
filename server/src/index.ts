import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { Server, Socket } from "socket.io";
import {
  applyBuy,
  applyDiscardTokens,
  applyReserve,
  applyTakeGems,
  getPlayerView,
  validateBuy,
  validateReserve,
  validateTakeGems,
} from "./gameEngine";
import { BasicColor, GemColor } from "./gameData";
import {
  createRoom,
  handleDisconnect,
  joinRoom,
  rooms,
  startRoomGame,
  toRoomState,
  touchRoom,
} from "./rooms";

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

app.use(express.json());
if (!isProduction) {
  app.use(cors({ origin: "http://localhost:5173" }));
}

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

const io = new Server(server, {
  cors: isProduction
    ? undefined
    : {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
      },
});

function emitRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("room_updated", toRoomState(room));
}

function socketForPlayer(playerId: string): Socket | undefined {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.playerId === playerId) {
      return socket;
    }
  }
  return undefined;
}

function emitGame(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room || !room.gameState) {
    emitRoom(roomId);
    return;
  }

  for (const player of room.players) {
    const socket = socketForPlayer(player.id);
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

io.on("connection", (socket) => {
  socket.on(
    "create_room",
    (payload: { username: string; avatarId: number }, cb: (response: { roomId?: string; playerId?: string; error?: string }) => void) => {
      const result = createRoom(payload.username, payload.avatarId, socket.id);
      if ("error" in result) return cb({ error: result.error });
      socket.data.playerId = result.playerId;
      socket.data.roomId = result.room.roomId;
      socket.join(result.room.roomId);
      cb({ roomId: result.room.roomId, playerId: result.playerId });
      emitRoom(result.room.roomId);
    }
  );

  socket.on(
    "join_room",
    (
      payload: { roomId: string; username: string; avatarId: number },
      cb: (response: { playerId?: string; error?: string }) => void
    ) => {
      const result = joinRoom(payload.roomId, payload.username, payload.avatarId, socket.id);
      if ("error" in result) return cb({ error: result.error });
      if (!result.room || !result.playerId) return cb({ error: "加入房间失败。" });
      socket.data.playerId = result.playerId;
      socket.data.roomId = result.room.roomId;
      socket.join(result.room.roomId);
      cb({ playerId: result.playerId });
      emitRoom(result.room.roomId);
      emitGame(result.room.roomId);
    }
  );

  socket.on("start_game", (payload: { roomId: string }, cb: (response: { error?: string }) => void) => {
    const playerId = socket.data.playerId;
    if (!playerId) return respondError(cb, "玩家连接状态不存在，请重新进入房间。", socket);
    const result = startRoomGame(payload.roomId, playerId);
    if (result.error) return respondError(cb, result.error, socket);
    socket.join(payload.roomId);
    emitRoom(payload.roomId);
    emitGame(payload.roomId);
    cb({});
  });

  socket.on("take_gems", (payload: { roomId: string; colors: GemColor[] }, cb: (response: { error?: string }) => void) => {
    const room = rooms.get(payload.roomId);
    const playerId = socket.data.playerId;
    if (!room?.gameState || !playerId) return respondError(cb, "房间或玩家状态不存在。", socket);
    const validation = validateTakeGems(room.gameState, playerId, payload.colors);
    if (!validation.valid) return respondError(cb, validation.error || "取宝石失败。", socket);
    room.gameState = applyTakeGems(room.gameState, playerId, payload.colors);
    touchRoom(room.roomId);
    cb({});
    emitGame(room.roomId);
  });

  socket.on(
    "reserve_card",
    (payload: { roomId: string; cardId: string | null; fromDeck: 1 | 2 | 3 | null }, cb: (response: { error?: string }) => void) => {
      const room = rooms.get(payload.roomId);
      const playerId = socket.data.playerId;
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
      const playerId = socket.data.playerId;
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
    const playerId = socket.data.playerId;
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

if (isProduction) {
  const publicDir = path.join(process.cwd(), "public");
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/socket.io") || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

server.listen(PORT, () => {
  console.log(`璀璨宝石服务器已启动：http://localhost:${PORT}`);
});
