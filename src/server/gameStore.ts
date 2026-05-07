import {
  applyBuy,
  applyDiscardTokens,
  applyEvolvePokemon,
  applyReserve,
  applyTakeGems,
  createGame,
  emptyCosts,
  emptyGems,
  getPlayerView,
  normalizeVariant,
  validateBuy,
  validateEvolvePokemon,
  validateReserve,
  validateTakeGems,
  type GameRoom,
  type GameState,
  type PlayerState,
} from "./gameEngine";
import type { BasicColor, GameVariant, GemColor } from "./gameData";
import type { GameCommand, SeatCredentials, SseEnvelope } from "~/shared/protocol";

export interface RoomState {
  roomId: string;
  variant: GameVariant;
  hostId: string;
  players: PlayerState[];
  phase: "waiting" | "playing" | "finalRound" | "ended";
  started: boolean;
  createdAt: number;
  lastActivity: number;
}

type RoomJoinResult = {
  room?: GameRoom;
  playerId?: string;
  reconnectToken?: string;
  error?: string;
  reconnected?: boolean;
};

type Subscriber = {
  connectionId: string;
  roomId: string;
  playerId: string;
  emit: (event: SseEnvelope) => void;
};

const ROOM_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const rooms = new Map<string, GameRoom>();
const subscribersByRoom = new Map<string, Map<string, Subscriber>>();

function uuidv4(): string {
  return crypto.randomUUID();
}

function makeRoomId(): string {
  return Array.from({ length: 6 }, () => ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)]).join("");
}

export function generateRoomId(): string {
  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();
  return id;
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase();
}

function makeLobbyPlayer(id: string, username: string, avatarId: number, isHost: boolean): PlayerState {
  return {
    id,
    username,
    avatarId,
    isHost,
    connected: true,
    gems: emptyGems(),
    bonuses: emptyCosts(),
    purchasedCards: [],
    reservedCards: [],
    tuckedCards: [],
    nobles: [],
    prestige: 0,
    turnsTaken: 0,
  };
}

export function getRoom(roomIdInput: string): GameRoom | undefined {
  return rooms.get(normalizeRoomId(roomIdInput));
}

export function toRoomState(room: GameRoom): RoomState {
  const phase = room.gameState?.phase ?? "waiting";
  return {
    roomId: room.roomId,
    variant: room.variant,
    hostId: room.hostId,
    players: room.players.map((player) => ({ ...player, isHost: player.id === room.hostId })),
    phase,
    started: phase !== "waiting",
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
  };
}

export function touchRoom(roomIdInput: string): void {
  const room = getRoom(roomIdInput);
  if (room) room.lastActivity = Date.now();
}

export function createRoom(
  username: string,
  avatarId: number,
  variantInput: GameVariant = "classic",
): { room: GameRoom; player: PlayerState; playerId: string; reconnectToken: string } | { error: string } {
  const cleanName = username.trim().slice(0, 16);
  if (!cleanName) return { error: "请输入用户名。" };
  const variant = normalizeVariant(variantInput);
  const roomId = generateRoomId();
  const playerId = uuidv4();
  const reconnectToken = uuidv4();
  const player = makeLobbyPlayer(playerId, cleanName, avatarId, true);
  const room: GameRoom = {
    roomId,
    variant,
    players: [player],
    hostId: playerId,
    reconnectTokens: { [playerId]: reconnectToken },
    gameState: {
      roomId,
      variant,
      phase: "waiting",
      currentPlayerId: "",
      turnOrder: [],
      finalRoundStarterId: null,
      bank: emptyGems(),
      tier1: { faceUp: [], deckCount: 0 },
      tier2: { faceUp: [], deckCount: 0 },
      tier3: { faceUp: [], deckCount: 0 },
      rare: variant === "pokemon" ? { faceUp: [], deckCount: 0 } : undefined,
      legendary: variant === "pokemon" ? { faceUp: [], deckCount: 0 } : undefined,
      nobles: [],
      players: [player],
      myPlayerId: "",
      winner: null,
      lastAction: null,
      actionLog: [],
      pendingEvolutionPlayerId: null,
    },
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(roomId, room);
  return { room, player, playerId, reconnectToken };
}

export function joinRoom(roomIdInput: string, username: string, avatarId: number): RoomJoinResult {
  const roomId = normalizeRoomId(roomIdInput);
  const room = rooms.get(roomId);
  if (!room) return { error: "房间不存在，请检查房间号。" };
  const cleanName = username.trim().slice(0, 16);
  if (!cleanName) return { error: "请输入用户名。" };
  room.reconnectTokens ??= {};

  const existing = room.players.find((player) => player.username === cleanName);
  if (existing) {
    room.reconnectTokens[existing.id] ??= uuidv4();
    existing.connected = true;
    existing.avatarId = avatarId;
    const gamePlayer = room.gameState?.players.find((player) => player.id === existing.id);
    if (gamePlayer) {
      gamePlayer.connected = true;
      gamePlayer.avatarId = avatarId;
    }
    touchRoom(roomId);
    publishRoom(roomId);
    return { room, playerId: existing.id, reconnectToken: room.reconnectTokens[existing.id], reconnected: true };
  }

  if (room.gameState && room.gameState.phase !== "waiting" && room.gameState.currentPlayerId) {
    return { error: "游戏已经开始，只能使用原用户名重连。" };
  }
  if (room.players.length >= 4) return { error: "房间已满，最多 4 名玩家。" };

  const playerId = uuidv4();
  const reconnectToken = uuidv4();
  const player = makeLobbyPlayer(playerId, cleanName, avatarId, false);
  room.players.push(player);
  room.reconnectTokens[playerId] = reconnectToken;
  if (room.gameState?.phase === "waiting") room.gameState.players = room.players;
  touchRoom(roomId);
  publishRoom(roomId);
  return { room, playerId, reconnectToken, reconnected: false };
}

export function assertSeat(credentials: SeatCredentials): { room: GameRoom; player: PlayerState } | { error: string } {
  const room = getRoom(credentials.roomId);
  if (!room) return { error: "房间不存在，请重新创建或加入。" };
  const expectedToken = room.reconnectTokens?.[credentials.playerId];
  if (!expectedToken || expectedToken !== credentials.reconnectToken) {
    return { error: "重连凭证已失效，请重新加入房间。" };
  }
  const player = room.players.find((entry) => entry.id === credentials.playerId);
  if (!player) return { error: "这个座位已经不在房间中。" };
  return { room, player };
}

export function reconnectRoom(credentials: SeatCredentials): RoomJoinResult {
  const result = assertSeat(credentials);
  if ("error" in result) return result;
  result.player.connected = true;
  const gamePlayer = result.room.gameState?.players.find((entry) => entry.id === credentials.playerId);
  if (gamePlayer) {
    gamePlayer.connected = true;
    gamePlayer.avatarId = result.player.avatarId;
  }
  touchRoom(result.room.roomId);
  publishRoom(result.room.roomId);
  publishGame(result.room.roomId);
  return { room: result.room, playerId: credentials.playerId, reconnectToken: credentials.reconnectToken, reconnected: true };
}

export function startRoomGame(credentials: SeatCredentials): { room?: GameRoom; gameState?: GameState; error?: string } {
  const result = assertSeat(credentials);
  if ("error" in result) return result;
  const { room } = result;
  if (room.hostId !== credentials.playerId) return { error: "只有房主可以开始游戏。" };
  if (room.gameState && room.gameState.phase !== "waiting" && room.gameState.currentPlayerId) return { error: "游戏已经开始。" };
  const connectedPlayers = room.players.filter((player) => player.connected !== false);
  if (connectedPlayers.length < 2) return { error: "至少需要 2 名在线玩家才能开始。" };
  if (connectedPlayers.length > 4) return { error: "最多 4 名玩家。" };

  room.players = connectedPlayers;
  const gameRoom = createGame(room.players, room.players.length, room.variant);
  const gameState = gameRoom.gameState!;
  gameState.roomId = room.roomId;
  room.players = room.players.map((player) => ({ ...player, isHost: player.id === room.hostId, connected: true }));
  gameState.players = room.players;
  room.gameState = gameState;
  touchRoom(room.roomId);
  publishRoom(room.roomId);
  publishGame(room.roomId);
  return { room, gameState };
}

function subscribers(roomId: string): Subscriber[] {
  return Array.from(subscribersByRoom.get(roomId)?.values() ?? []);
}

function emitToRoom(roomId: string, eventFactory: (subscriber: Subscriber) => SseEnvelope | null): void {
  for (const subscriber of subscribers(roomId)) {
    const event = eventFactory(subscriber);
    if (event) subscriber.emit(event);
  }
}

export function publishRoom(roomIdInput: string): void {
  const room = getRoom(roomIdInput);
  if (!room) return;
  const roomState = toRoomState(room);
  emitToRoom(room.roomId, () => ({ type: "roomUpdated", room: roomState }));
}

export function publishGame(roomIdInput: string): void {
  const room = getRoom(roomIdInput);
  if (!room || !room.gameState) {
    publishRoom(roomIdInput);
    return;
  }

  emitToRoom(room.roomId, (subscriber) => {
    const events: SseEnvelope[] = [{ type: "gameState", state: getPlayerView(room.gameState!, subscriber.playerId) as never }];
    const player = room.players.find((entry) => entry.id === subscriber.playerId);
    if (player && room.gameState?.pendingDiscardPlayerId === subscriber.playerId) {
      const total = Object.values(player.gems).reduce((sum, value) => sum + value, 0);
      events.push({ type: "actionRequired", action: { type: "discard_tokens", excess: Math.max(0, total - 10) } });
    }
    for (const event of events) subscriber.emit(event);
    return null;
  });

  if (room.gameState.phase === "ended" && room.gameState.winner) {
    const payload = {
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
    };
    emitToRoom(room.roomId, () => ({ type: "gameOver", payload }));
  }
}

export function subscribeToRoom(credentials: SeatCredentials, emit: (event: SseEnvelope) => void): { connectionId?: string; error?: string } {
  const result = reconnectRoom(credentials);
  if (!result.room || !result.playerId || result.error) return { error: result.error ?? "恢复房间失败。" };
  const roomId = result.room.roomId;
  const connectionId = uuidv4();
  const roomSubscribers = subscribersByRoom.get(roomId) ?? new Map<string, Subscriber>();
  subscribersByRoom.set(roomId, roomSubscribers);
  for (const [existingId, subscriber] of roomSubscribers) {
    if (subscriber.playerId === result.playerId) {
      subscriber.emit({ type: "sessionReplaced" });
      roomSubscribers.delete(existingId);
    }
  }
  roomSubscribers.set(connectionId, { connectionId, roomId, playerId: result.playerId, emit });
  emit({ type: "roomUpdated", room: toRoomState(result.room) });
  if (result.room.gameState && result.room.gameState.phase !== "waiting") {
    emit({ type: "gameState", state: getPlayerView(result.room.gameState, result.playerId) as never });
  }
  return { connectionId };
}

export function unsubscribeFromRoom(roomIdInput: string, playerId: string, connectionId: string): void {
  const roomId = normalizeRoomId(roomIdInput);
  const roomSubscribers = subscribersByRoom.get(roomId);
  if (roomSubscribers?.get(connectionId)?.playerId === playerId) {
    roomSubscribers.delete(connectionId);
  }
  const room = rooms.get(roomId);
  if (!room) return;
  const stillConnected = subscribers(roomId).some((subscriber) => subscriber.playerId === playerId);
  if (stillConnected) return;
  const player = room.players.find((entry) => entry.id === playerId);
  if (player) player.connected = false;
  const gamePlayer = room.gameState?.players.find((entry) => entry.id === playerId);
  if (gamePlayer) gamePlayer.connected = false;
  touchRoom(roomId);
  publishRoom(roomId);
  publishGame(roomId);
}

export function sendGameCommand(input: { credentials: SeatCredentials; command: GameCommand }): { error?: string } {
  const result = assertSeat(input.credentials);
  if ("error" in result) return result;
  const { room } = result;
  const playerId = input.credentials.playerId;
  if (!room.gameState) return { error: "房间或玩家状态不存在。" };

  switch (input.command.type) {
    case "takeGems": {
      const validation = validateTakeGems(room.gameState, playerId, input.command.colors as GemColor[]);
      if (!validation.valid) return { error: validation.error || "取宝石失败。" };
      room.gameState = applyTakeGems(room.gameState, playerId, input.command.colors as GemColor[]);
      break;
    }
    case "reserveCard": {
      const validation = validateReserve(room.gameState, playerId, input.command.cardId, input.command.fromDeck);
      if (!validation.valid) return { error: validation.error || "保留卡牌失败。" };
      room.gameState = applyReserve(room.gameState, playerId, input.command.cardId, input.command.fromDeck);
      break;
    }
    case "buyCard": {
      const validation = validateBuy(room.gameState, playerId, input.command.cardId, input.command.goldSubstitutions as Partial<Record<BasicColor, number>>);
      if (!validation.valid) return { error: validation.error || "购买卡牌失败。" };
      room.gameState = applyBuy(room.gameState, playerId, input.command.cardId, input.command.goldSubstitutions as Partial<Record<BasicColor, number>>);
      break;
    }
    case "discardTokens": {
      try {
        room.gameState = applyDiscardTokens(room.gameState, playerId, input.command.tokens as Partial<Record<GemColor, number>>);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "弃置代币失败。" };
      }
      break;
    }
    case "evolvePokemon": {
      const validation = validateEvolvePokemon(room.gameState, playerId, input.command.targetCardId, input.command.skip);
      if (!validation.valid) return { error: validation.error || "进化失败。" };
      room.gameState = applyEvolvePokemon(room.gameState, playerId, input.command.targetCardId, input.command.skip);
      break;
    }
  }

  touchRoom(room.roomId);
  publishGame(room.roomId);
  return {};
}

export function cleanupRooms(now = Date.now()): void {
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > TWO_HOURS_MS) {
      rooms.delete(roomId);
      subscribersByRoom.delete(roomId);
    }
  }
}

export function resetGameStoreForTests(): void {
  rooms.clear();
  subscribersByRoom.clear();
}

setInterval(() => cleanupRooms(), 10 * 60 * 1000).unref?.();
