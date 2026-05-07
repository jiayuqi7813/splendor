import assert from "node:assert/strict";
import {
  cleanupRooms,
  createRoom,
  getRoom,
  joinRoom,
  reconnectRoom,
  resetGameStoreForTests,
  sendGameCommand,
  startRoomGame,
  subscribeToRoom,
  unsubscribeFromRoom,
  publishIntent,
  getSnapshot,
} from "./gameStore";
import type { SeatCredentials, SseEnvelope } from "../shared/protocol";

function mustSeat(result: ReturnType<typeof createRoom> | ReturnType<typeof joinRoom>): SeatCredentials & { username?: string; avatarId?: number } {
  assert.ok(!("error" in result), "expected room operation to succeed");
  assert.ok(result.room);
  assert.ok(result.playerId);
  assert.ok(result.reconnectToken);
  const player = result.room.players.find((entry) => entry.id === result.playerId);
  return {
    roomId: result.room.roomId,
    playerId: result.playerId,
    reconnectToken: result.reconnectToken,
    username: player?.username,
    avatarId: player?.avatarId,
  };
}

resetGameStoreForTests();

const host = mustSeat(createRoom("host", 0, "classic"));
const guest = mustSeat(joinRoom(host.roomId, "guest", 1));
assert.equal(getRoom(host.roomId)?.players.length, 2);

const badReconnect = reconnectRoom({ ...host, reconnectToken: "bad-token" });
assert.equal(Boolean(badReconnect.error), true);

const hostEvents: SseEnvelope[] = [];
const firstSubscription = subscribeToRoom(host, 0, (event: SseEnvelope) => hostEvents.push(event));
assert.ok(firstSubscription.connectionId);
assert.equal(hostEvents[0]?.type, "joined");

const replacementEvents: SseEnvelope[] = [];
const secondSubscription = subscribeToRoom(host, 0, (event: SseEnvelope) => replacementEvents.push(event));
assert.ok(secondSubscription.connectionId);
assert.equal(hostEvents.some((event) => event.type === "sessionReplaced"), true);

const started = startRoomGame(host);
assert.equal(started.error, undefined);
assert.equal(replacementEvents.some((event) => event.type === "snapshot"), true);

const intentEvents: SseEnvelope[] = [];
const guestSubscription = subscribeToRoom(guest, 0, (event: SseEnvelope) => intentEvents.push(event));
assert.ok(guestSubscription.connectionId);
const intentResult = publishIntent(
  started.gameState!.currentPlayerId === host.playerId ? host : guest,
  { type: "hoverGem", color: "red", area: "bank" },
);
assert.equal(intentResult.error, undefined);
assert.equal([...intentEvents, ...replacementEvents].some((event) => event.type === "intent"), true);

const currentPlayerId = started.gameState!.currentPlayerId;
const nonCurrent = currentPlayerId === host.playerId ? guest : host;
const rejected = sendGameCommand({
  credentials: nonCurrent,
  command: { type: "takeGems", colors: ["red", "blue", "green"] },
});
assert.equal(Boolean(rejected.error), true);
assert.equal(replacementEvents.some((event) => event.type === "error"), true);

const snapshot = getSnapshot(host);
assert.equal(snapshot.error, undefined);
assert.equal(snapshot.seq! > 0, true);
assert.ok(snapshot.room);

unsubscribeFromRoom(host.roomId, host.playerId, secondSubscription.connectionId!);
assert.equal(getRoom(host.roomId)?.players.find((player) => player.id === host.playerId)?.connected, false);

const room = getRoom(host.roomId);
assert.ok(room);
room.lastActivity = Date.now() - 3 * 60 * 60 * 1000;
cleanupRooms();
assert.equal(getRoom(host.roomId), undefined);

console.log("gameStore tests passed");
