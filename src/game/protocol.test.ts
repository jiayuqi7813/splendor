import assert from "node:assert/strict";
import { gameCommandSchema, roomIntentSchema, sendGameCommandInputSchema } from "./protocol";

assert.equal(gameCommandSchema.safeParse({ type: "takeGems", colors: ["red", "blue", "green"] }).success, true);
assert.equal(gameCommandSchema.safeParse({ type: "takeGems", colors: ["red", "cyan"] }).success, false);
assert.equal(gameCommandSchema.safeParse({ type: "buyCard", cardId: "", goldSubstitutions: {} }).success, false);
assert.equal(
  sendGameCommandInputSchema.safeParse({
    roomId: "ABC123",
    playerId: "player",
    reconnectToken: "token",
    command: { type: "discardTokens", tokens: { gold: 1 } },
  }).success,
  true,
);
assert.equal(roomIntentSchema.safeParse({ type: "hoverGem", color: "red", area: "bank" }).success, true);
assert.equal(roomIntentSchema.safeParse({ type: "paymentTarget", source: { type: "market", cardId: "c1" }, valid: true }).success, true);
assert.equal(roomIntentSchema.safeParse({ type: "gemSelection", colors: ["cyan"], valid: false }).success, false);

console.log("protocol schema tests passed");
