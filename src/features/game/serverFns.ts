import { createServerFn } from "@tanstack/react-start";
import {
  createRoomInputSchema,
  joinRoomInputSchema,
  reconnectRoomInputSchema,
  sendGameCommandInputSchema,
  startGameInputSchema,
  type SeatResponse,
} from "~/shared/protocol";
import { createRoom, joinRoom, reconnectRoom, sendGameCommand as sendCommand, startRoomGame } from "~/server/gameStore";

export const createRoomFn = createServerFn({ method: "POST" })
  .inputValidator((data) => createRoomInputSchema.parse(data))
  .handler(({ data }): SeatResponse => {
    const result = createRoom(data.username, data.avatarId, data.variant);
    if ("error" in result) return { error: result.error };
    return { roomId: result.room.roomId, playerId: result.playerId, reconnectToken: result.reconnectToken, phase: "waiting" };
  });

export const joinRoomFn = createServerFn({ method: "POST" })
  .inputValidator((data) => joinRoomInputSchema.parse(data))
  .handler(({ data }): SeatResponse => {
    const result = joinRoom(data.roomId, data.username, data.avatarId);
    if (result.error || !result.room || !result.playerId || !result.reconnectToken) {
      return { error: result.error ?? "加入房间失败。" };
    }
    return {
      roomId: result.room.roomId,
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      reconnected: result.reconnected,
      phase: result.room.gameState?.phase ?? "waiting",
    };
  });

export const reconnectRoomFn = createServerFn({ method: "POST" })
  .inputValidator((data) => reconnectRoomInputSchema.parse(data))
  .handler(({ data }): SeatResponse => {
    const result = reconnectRoom(data);
    if (result.error || !result.room || !result.playerId || !result.reconnectToken) {
      return { error: result.error ?? "恢复房间失败。" };
    }
    return {
      roomId: result.room.roomId,
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      reconnected: true,
      phase: result.room.gameState?.phase ?? "waiting",
    };
  });

export const startGameFn = createServerFn({ method: "POST" })
  .inputValidator((data) => startGameInputSchema.parse(data))
  .handler(({ data }) => {
    const result = startRoomGame(data);
    return result.error ? { ok: false, error: result.error } : { ok: true };
  });

export const sendGameCommandFn = createServerFn({ method: "POST" })
  .inputValidator((data) => sendGameCommandInputSchema.parse(data))
  .handler(({ data }) => {
    const result = sendCommand({ credentials: data, command: data.command });
    return result.error ? { ok: false, error: result.error } : { ok: true };
  });
