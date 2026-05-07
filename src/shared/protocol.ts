import { z } from "zod";
import type { GameOverPayload, GameState, GemColor, BasicColor, RoomState, Gems } from "./types";

export const basicColorSchema = z.enum(["white", "blue", "green", "red", "brown"]);
export const gemColorSchema = z.enum(["white", "blue", "green", "red", "brown", "gold"]);
export const gameVariantSchema = z.enum(["classic", "pokemon"]);

export const seatCredentialsSchema = z.object({
  roomId: z.string().trim().min(1).max(12),
  playerId: z.string().min(1),
  reconnectToken: z.string().min(1),
});

export const createRoomInputSchema = z.object({
  username: z.string().trim().min(1).max(32),
  avatarId: z.number().int().min(0).max(999),
  variant: gameVariantSchema.default("classic"),
});

export const joinRoomInputSchema = z.object({
  roomId: z.string().trim().min(1).max(12),
  username: z.string().trim().min(1).max(32),
  avatarId: z.number().int().min(0).max(999),
});

export const reconnectRoomInputSchema = seatCredentialsSchema;
export const startGameInputSchema = seatCredentialsSchema;

const goldSubstitutionsSchema = z.object({
  white: z.number().int().min(0).optional(),
  blue: z.number().int().min(0).optional(),
  green: z.number().int().min(0).optional(),
  red: z.number().int().min(0).optional(),
  brown: z.number().int().min(0).optional(),
});

const gemsSchema = z.object({
  white: z.number().int().min(0).optional(),
  blue: z.number().int().min(0).optional(),
  green: z.number().int().min(0).optional(),
  red: z.number().int().min(0).optional(),
  brown: z.number().int().min(0).optional(),
  gold: z.number().int().min(0).optional(),
});

export const gameCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("takeGems"), colors: z.array(gemColorSchema).min(1).max(3) }),
  z.object({
    type: z.literal("reserveCard"),
    cardId: z.string().min(1).nullable(),
    fromDeck: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  }),
  z.object({ type: z.literal("buyCard"), cardId: z.string().min(1), goldSubstitutions: goldSubstitutionsSchema.default({}) }),
  z.object({ type: z.literal("discardTokens"), tokens: gemsSchema.default({}) }),
  z.object({ type: z.literal("evolvePokemon"), targetCardId: z.string().min(1).nullable(), skip: z.boolean().default(false) }),
]);

export const sendGameCommandInputSchema = seatCredentialsSchema.extend({
  command: gameCommandSchema,
});

export type SeatCredentials = z.infer<typeof seatCredentialsSchema>;
export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomInputSchema>;
export type GameCommand = z.infer<typeof gameCommandSchema>;
export type SendGameCommandInput = z.infer<typeof sendGameCommandInputSchema>;

export type SeatResponse = {
  roomId?: string;
  playerId?: string;
  reconnectToken?: string;
  reconnected?: boolean;
  phase?: RoomState["phase"];
  error?: string;
};

export type GameCommandResult = { ok: true } | { ok: false; error: string };

export type SseEnvelope =
  | { type: "roomUpdated"; room: RoomState }
  | { type: "gameState"; state: GameState }
  | { type: "actionRequired"; action: { type: "discard_tokens"; excess: number } }
  | { type: "gameOver"; payload: GameOverPayload }
  | { type: "sessionReplaced" }
  | { type: "error"; message: string }
  | { type: "heartbeat"; at: number };

export type GoldSubstitutions = Partial<Record<BasicColor, number>>;
export type PartialGems = Partial<Record<GemColor, number>> | Partial<Gems>;
