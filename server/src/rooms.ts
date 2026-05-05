import { v4 as uuidv4 } from "uuid";
import { emptyCosts, emptyGems, GameRoom, GameState, PlayerState, createGame } from "./gameEngine";

export interface RoomState {
  roomId: string;
  hostId: string;
  players: PlayerState[];
  phase: "waiting" | "playing" | "finalRound" | "ended";
  started: boolean;
  createdAt: number;
  lastActivity: number;
}

export const rooms = new Map<string, GameRoom>();

const ROOM_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

type RoomJoinResult = {
  room?: GameRoom;
  playerId?: string;
  reconnectToken?: string;
  error?: string;
  reconnected?: boolean;
};

function makeRoomId(): string {
  return Array.from({ length: 6 }, () => ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)]).join("");
}

export function generateRoomId(): string {
  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();
  return id;
}

export function toRoomState(room: GameRoom): RoomState {
  const phase = room.gameState?.phase ?? "waiting";
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    players: room.players.map((player) => {
      const publicPlayer = { ...player };
      delete publicPlayer.socketId;
      return { ...publicPlayer, isHost: player.id === room.hostId };
    }),
    phase,
    started: phase !== "waiting",
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
  };
}

function makeLobbyPlayer(id: string, username: string, avatarId: number, isHost: boolean, socketId: string): PlayerState {
  return {
    id,
    username,
    avatarId,
    isHost,
    socketId,
    connected: true,
    gems: emptyGems(),
    bonuses: emptyCosts(),
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
    prestige: 0,
    turnsTaken: 0,
  };
}

export function touchRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room) room.lastActivity = Date.now();
}

export function createRoom(
  username: string,
  avatarId: number,
  socketId: string,
): { room: GameRoom; player: PlayerState; playerId: string; reconnectToken: string } | { error: string } {
  const cleanName = username.trim().slice(0, 16);
  if (!cleanName) return { error: "请输入用户名。" };
  const roomId = generateRoomId();
  const playerId = uuidv4();
  const reconnectToken = uuidv4();
  const player = makeLobbyPlayer(playerId, cleanName, avatarId, true, socketId);
  const room: GameRoom = {
    roomId,
    players: [player],
    hostId: playerId,
    reconnectTokens: {
      [playerId]: reconnectToken,
    },
    gameState: {
      roomId,
      phase: "waiting",
      currentPlayerId: "",
      turnOrder: [],
      finalRoundStarterId: null,
      bank: emptyGems(),
      tier1: { faceUp: [], deckCount: 0 },
      tier2: { faceUp: [], deckCount: 0 },
      tier3: { faceUp: [], deckCount: 0 },
      nobles: [],
      players: [player],
      myPlayerId: "",
      winner: null,
      lastAction: null,
    },
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(roomId, room);
  return { room, player, playerId, reconnectToken };
}

export function joinRoom(
  roomIdInput: string,
  username: string,
  avatarId: number,
  socketId: string,
): RoomJoinResult {
  const roomId = roomIdInput.trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!room) return { error: "房间不存在，请检查房间号。" };
  const cleanName = username.trim().slice(0, 16);
  if (!cleanName) return { error: "请输入用户名。" };
  room.reconnectTokens ??= {};

  const existing = room.players.find((player) => player.username === cleanName);
  if (existing) {
    if (existing.connected !== false && existing.socketId && existing.socketId !== socketId) {
      return { error: "这个昵称已经在房间中，请换一个昵称或刷新原来的窗口。" };
    }
    room.reconnectTokens[existing.id] ??= uuidv4();
    existing.socketId = socketId;
    existing.connected = true;
    existing.avatarId = avatarId;
    if (room.gameState) {
      const gamePlayer = room.gameState.players.find((player) => player.id === existing.id);
      if (gamePlayer) {
        gamePlayer.connected = true;
        gamePlayer.avatarId = avatarId;
      }
    }
    touchRoom(roomId);
    return { room, playerId: existing.id, reconnectToken: room.reconnectTokens[existing.id], reconnected: true };
  }

  if (room.gameState && room.gameState.phase !== "waiting" && room.gameState.currentPlayerId) {
    return { error: "游戏已经开始，只能使用原用户名重连。" };
  }
  if (room.players.length >= 4) return { error: "房间已满，最多 4 名玩家。" };

  const playerId = uuidv4();
  const reconnectToken = uuidv4();
  const player = makeLobbyPlayer(playerId, cleanName, avatarId, false, socketId);
  room.players.push(player);
  room.reconnectTokens[playerId] = reconnectToken;
  if (room.gameState?.phase === "waiting") room.gameState.players = room.players;
  touchRoom(roomId);
  return { room, playerId, reconnectToken, reconnected: false };
}

export function reconnectRoom(roomIdInput: string, playerId: string, reconnectToken: string, socketId: string): RoomJoinResult {
  const roomId = roomIdInput.trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!room) return { error: "房间不存在，请重新创建或加入。" };
  const expectedToken = room.reconnectTokens?.[playerId];
  if (!expectedToken || expectedToken !== reconnectToken) {
    return { error: "重连凭证已失效，请重新加入房间。" };
  }
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return { error: "这个座位已经不在房间中。" };

  player.socketId = socketId;
  player.connected = true;
  if (room.gameState) {
    const gamePlayer = room.gameState.players.find((entry) => entry.id === playerId);
    if (gamePlayer) {
      gamePlayer.socketId = socketId;
      gamePlayer.connected = true;
      gamePlayer.avatarId = player.avatarId;
    }
  }
  touchRoom(roomId);
  return { room, playerId, reconnectToken: expectedToken, reconnected: true };
}

export function startRoomGame(roomId: string, hostId: string): { room?: GameRoom; gameState?: GameState; error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "房间不存在。" };
  if (room.hostId !== hostId) return { error: "只有房主可以开始游戏。" };
  if (room.gameState && room.gameState.phase !== "waiting" && room.gameState.currentPlayerId) return { error: "游戏已经开始。" };
  const connectedPlayers = room.players.filter((player) => player.connected !== false);
  if (connectedPlayers.length < 2) return { error: "至少需要 2 名在线玩家才能开始。" };
  if (connectedPlayers.length > 4) return { error: "最多 4 名玩家。" };

  room.players = connectedPlayers;
  const gameRoom = createGame(room.players, room.players.length);
  const gameState = gameRoom.gameState!;
  gameState.roomId = room.roomId;
  room.players = room.players.map((player) => ({ ...player, isHost: player.id === room.hostId, connected: true }));
  gameState.players = room.players;
  room.gameState = gameState;
  touchRoom(roomId);
  return { room, gameState };
}

export function updateRoomFromGamePlayers(room: GameRoom): void {
  if (!room.gameState) return;
  room.players = room.gameState.players.map((player) => ({
    id: player.id,
    username: player.username,
    avatarId: player.avatarId,
    isHost: player.id === room.hostId,
    socketId: room.players.find((p) => p.id === player.id)?.socketId,
    connected: player.connected,
    gems: player.gems,
    bonuses: player.bonuses,
    purchasedCards: player.purchasedCards,
    reservedCards: player.reservedCards,
    nobles: player.nobles,
    prestige: player.prestige,
    turnsTaken: player.turnsTaken,
  }));
}

export function findRoomBySocket(socketId: string): GameRoom | undefined {
  return Array.from(rooms.values()).find((room) => room.players.some((player) => player.socketId === socketId));
}

export function getPlayerIdBySocket(room: GameRoom, socketId: string): string | undefined {
  return room.players.find((player) => player.socketId === socketId)?.id;
}

export function handleDisconnect(socketId: string): GameRoom | undefined {
  const room = findRoomBySocket(socketId);
  if (!room) return undefined;
  const player = room.players.find((p) => p.socketId === socketId);
  if (!player) return room;

  player.connected = false;
  player.socketId = undefined;
  const gamePlayer = room.gameState?.players.find((p) => p.id === player.id);
  if (gamePlayer) {
    gamePlayer.connected = false;
    gamePlayer.socketId = undefined;
  }
  touchRoom(room.roomId);
  return room;
}

export function cleanupRooms(now = Date.now()): void {
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > TWO_HOURS_MS) {
      rooms.delete(roomId);
    }
  }
}
