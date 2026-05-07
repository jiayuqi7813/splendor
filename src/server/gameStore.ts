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
  cloneState,
} from "./gameEngine";
import type { BasicColor, GameVariant, GemColor } from "./gameData";
import type { GameOverPayload } from "~/shared/types";
import type { GameCommand, RoomIntent, RoomStateEvent, SeatCredentials, SseEnvelope } from "~/shared/protocol";

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
  room?: ManagedRoom;
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

type RoomEventRecord = {
  seq: number;
  type: RoomStateEvent["type"];
  message: string;
  room?: RoomState;
  state?: GameState;
  command?: GameCommand;
  payload?: GameOverPayload;
};

type ManagedRoom = GameRoom & {
  seq: number;
  events: RoomEventRecord[];
  connections: Record<string, number>;
};

const ROOM_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ROOM_EVENT_LIMIT = 250;
const rooms = new Map<string, ManagedRoom>();
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

export function getRoom(roomIdInput: string): ManagedRoom | undefined {
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
): { room: ManagedRoom; player: PlayerState; playerId: string; reconnectToken: string } | { error: string } {
  const cleanName = username.trim().slice(0, 16);
  if (!cleanName) return { error: "请输入用户名。" };
  const variant = normalizeVariant(variantInput);
  const roomId = generateRoomId();
  const playerId = uuidv4();
  const reconnectToken = uuidv4();
  const player = makeLobbyPlayer(playerId, cleanName, avatarId, true);
  const room: ManagedRoom = {
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
    seq: 0,
    events: [],
    connections: {},
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
    recordStateEvent(room, "joined", `${existing.username} 已重新连接。`);
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
  recordStateEvent(room, "joined", `${player.username} 已加入房间。`);
  return { room, playerId, reconnectToken, reconnected: false };
}

export function assertSeat(credentials: SeatCredentials): { room: ManagedRoom; player: PlayerState } | { error: string } {
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
  return { room: result.room, playerId: credentials.playerId, reconnectToken: credentials.reconnectToken, reconnected: true };
}

export function startRoomGame(credentials: SeatCredentials): { room?: ManagedRoom; gameState?: GameState; error?: string } {
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
  recordStateEvent(room, "snapshot", "游戏已开始。");
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

function actionRequiredEvent(room: ManagedRoom, playerId: string, seq: number): RoomStateEvent | null {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player || room.gameState?.pendingDiscardPlayerId !== playerId) return null;
  const total = Object.values(player.gems).reduce((sum, value) => sum + value, 0);
  return {
    seq,
    type: "actionRequired",
    message: "需要先弃置多余代币。",
    action: { type: "discard_tokens", excess: Math.max(0, total - 10) },
  };
}

function gameOverPayload(room: ManagedRoom): GameOverPayload | null {
  if (!room.gameState || room.gameState.phase !== "ended" || !room.gameState.winner) return null;
  return {
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
}

function eventForPlayer(record: RoomEventRecord, playerId: string): SseEnvelope {
  return {
    seq: record.seq,
    type: record.type,
    message: record.message,
    ...(record.room ? { room: record.room } : {}),
    ...(record.state ? { state: getPlayerView(record.state, playerId) } : {}),
    ...(record.command ? { command: record.command } : {}),
    ...(record.payload ? { payload: record.payload } : {}),
  };
}

function emitRecord(room: ManagedRoom, record: RoomEventRecord): void {
  emitToRoom(room.roomId, (subscriber) => {
    subscriber.emit(eventForPlayer(record, subscriber.playerId));
    const required = actionRequiredEvent(room, subscriber.playerId, record.seq);
    if (required) subscriber.emit(required);
    return null;
  });
}

function recordStateEvent(room: ManagedRoom, type: RoomEventRecord["type"], message: string, command?: GameCommand): RoomEventRecord {
  room.seq += 1;
  room.lastActivity = Date.now();
  const payload = gameOverPayload(room) ?? undefined;
  const record: RoomEventRecord = {
    seq: room.seq,
    type: payload ? "gameOver" : type,
    message: payload?.reason ?? message,
    room: toRoomState(room),
    state: room.gameState ? cloneState(room.gameState) : undefined,
    command,
    payload,
  };
  room.events.push(record);
  if (room.events.length > ROOM_EVENT_LIMIT) room.events.splice(0, room.events.length - ROOM_EVENT_LIMIT);
  emitRecord(room, record);
  return record;
}

export function publishRoom(roomIdInput: string): void {
  const room = getRoom(roomIdInput);
  if (!room) return;
  recordStateEvent(room, "snapshot", "房间状态已更新。");
}

export function publishGame(roomIdInput: string): void {
  const room = getRoom(roomIdInput);
  if (!room || !room.gameState) {
    publishRoom(roomIdInput);
    return;
  }
  recordStateEvent(room, "snapshot", "游戏状态已更新。");
}

export function subscribeToRoom(credentials: SeatCredentials, after: number, emit: (event: SseEnvelope) => void): { connectionId?: string; error?: string } {
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
      result.room.connections[result.playerId] = Math.max(0, (result.room.connections[result.playerId] ?? 1) - 1);
    }
  }
  roomSubscribers.set(connectionId, { connectionId, roomId, playerId: result.playerId, emit });
  result.room.connections[result.playerId] = (result.room.connections[result.playerId] ?? 0) + 1;
  const replay = result.room.events.filter((event) => event.seq > after);
  if (replay.length) {
    replay.forEach((record) => {
      emit(eventForPlayer(record, result.playerId!));
      const required = actionRequiredEvent(result.room!, result.playerId!, record.seq);
      if (required) emit(required);
    });
  } else {
    const seq = result.room.seq;
    emit({
      seq,
      type: "snapshot",
      message: "房间快照已同步。",
      room: toRoomState(result.room),
      ...(result.room.gameState && result.room.gameState.phase !== "waiting" ? { state: getPlayerView(result.room.gameState, result.playerId) } : {}),
    });
    const required = actionRequiredEvent(result.room, result.playerId, seq);
    if (required) emit(required);
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
  room.connections[playerId] = Math.max(0, (room.connections[playerId] ?? 1) - 1);
  if (room.connections[playerId] > 0) return;
  const player = room.players.find((entry) => entry.id === playerId);
  if (player) player.connected = false;
  const gamePlayer = room.gameState?.players.find((entry) => entry.id === playerId);
  if (gamePlayer) gamePlayer.connected = false;
  touchRoom(roomId);
  recordStateEvent(room, "snapshot", `${player?.username ?? "玩家"} 已离线。`);
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
      if (!validation.valid) return recordCommandError(room, validation.error || "取宝石失败。").errorResult;
      room.gameState = applyTakeGems(room.gameState, playerId, input.command.colors as GemColor[]);
      break;
    }
    case "reserveCard": {
      const validation = validateReserve(room.gameState, playerId, input.command.cardId, input.command.fromDeck);
      if (!validation.valid) return recordCommandError(room, validation.error || "保留卡牌失败。").errorResult;
      room.gameState = applyReserve(room.gameState, playerId, input.command.cardId, input.command.fromDeck);
      break;
    }
    case "buyCard": {
      const validation = validateBuy(room.gameState, playerId, input.command.cardId, input.command.goldSubstitutions as Partial<Record<BasicColor, number>>);
      if (!validation.valid) return recordCommandError(room, validation.error || "购买卡牌失败。").errorResult;
      room.gameState = applyBuy(room.gameState, playerId, input.command.cardId, input.command.goldSubstitutions as Partial<Record<BasicColor, number>>);
      break;
    }
    case "discardTokens": {
      try {
        room.gameState = applyDiscardTokens(room.gameState, playerId, input.command.tokens as Partial<Record<GemColor, number>>);
      } catch (error) {
        return recordCommandError(room, error instanceof Error ? error.message : "弃置代币失败。").errorResult;
      }
      break;
    }
    case "evolvePokemon": {
      const validation = validateEvolvePokemon(room.gameState, playerId, input.command.targetCardId, input.command.skip);
      if (!validation.valid) return recordCommandError(room, validation.error || "进化失败。").errorResult;
      room.gameState = applyEvolvePokemon(room.gameState, playerId, input.command.targetCardId, input.command.skip);
      break;
    }
  }

  touchRoom(room.roomId);
  recordStateEvent(room, "action", "行动已执行。", input.command);
  return {};
}

function recordCommandError(room: ManagedRoom, error: string): { errorResult: { error: string } } {
  recordStateEvent(room, "error", error);
  return { errorResult: { error } };
}

export function publishIntent(credentials: SeatCredentials, intent: RoomIntent): { error?: string } {
  const result = assertSeat(credentials);
  if ("error" in result) return result;
  const { room } = result;
  const gameState = room.gameState;
  if (!gameState || gameState.phase === "waiting" || gameState.phase === "ended") {
    return { error: "当前不能同步操作意图。" };
  }
  const mayAct = gameState.currentPlayerId === credentials.playerId || gameState.pendingDiscardPlayerId === credentials.playerId || gameState.pendingEvolutionPlayerId === credentials.playerId;
  if (!mayAct) return { error: "当前不能同步操作意图。" };
  room.seq += 1;
  room.lastActivity = Date.now();
  emitToRoom(room.roomId, (subscriber) =>
    subscriber.playerId === credentials.playerId
      ? null
      : {
          seq: room.seq,
          type: "intent",
          playerId: credentials.playerId,
          intent,
        },
  );
  return {};
}

export function getSnapshot(credentials: SeatCredentials): { seq?: number; room?: RoomState; state?: GameState; error?: string } {
  const result = assertSeat(credentials);
  if ("error" in result) return result;
  return {
    seq: result.room.seq,
    room: toRoomState(result.room),
    state: result.room.gameState ? getPlayerView(result.room.gameState, credentials.playerId) : undefined,
  };
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
