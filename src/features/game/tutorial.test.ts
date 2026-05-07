import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectTutorialStep } from "./tutorial";
import type { GameState, Gems, PlayerState } from "~/types";

const emptyGems = (): Gems => ({ white: 0, blue: 0, green: 0, red: 0, brown: 0, gold: 0 });

const player = (id: string): PlayerState => ({
  id,
  username: id,
  avatarId: 0,
  isHost: id === "p1",
  gems: emptyGems(),
  bonuses: { white: 0, blue: 0, green: 0, red: 0, brown: 0 },
  purchasedCards: [],
  reservedCards: [],
  tuckedCards: [],
  nobles: [],
  prestige: 0,
  connected: true,
  turnsTaken: 0,
});

function baseState(): GameState {
  return {
    roomId: "ROOM",
    variant: "classic",
    phase: "playing",
    currentPlayerId: "p1",
    turnOrder: ["p1", "p2"],
    finalRoundStarterId: null,
    bank: { white: 4, blue: 4, green: 4, red: 4, brown: 4, gold: 5 },
    tier1: { deckCount: 30, faceUp: [{ id: "c1", tier: 1, color: "white", prestige: 0, cost: { white: 0, blue: 0, green: 0, red: 0, brown: 0 } }] },
    tier2: { deckCount: 20, faceUp: [] },
    tier3: { deckCount: 20, faceUp: [] },
    nobles: [],
    players: [player("p1"), player("p2")],
    myPlayerId: "p1",
    winner: null,
    lastAction: null,
  };
}

describe("tutorial selector", () => {
  it("does not show for waiting games or non-current players", () => {
    const state = baseState();
    state.phase = "waiting";
    assert.equal(selectTutorialStep(state, "p1"), undefined);
    state.phase = "playing";
    assert.equal(selectTutorialStep(state, "p2"), undefined);
  });

  it("prioritizes pending discard and evolution prompts", () => {
    const discardState = baseState();
    discardState.pendingDiscardPlayerId = "p1";
    discardState.players[0].gems = { white: 8, blue: 3, green: 0, red: 0, brown: 0, gold: 0 };
    assert.equal(selectTutorialStep(discardState, "p1")?.kind, "discardTokens");

    const evolutionState = baseState();
    evolutionState.variant = "pokemon";
    evolutionState.pendingEvolutionPlayerId = "p1";
    assert.equal(selectTutorialStep(evolutionState, "p1")?.kind, "evolvePokemon");
  });

  it("selects buy, reserve, and take prompts by available action", () => {
    const buyState = baseState();
    assert.equal(selectTutorialStep(buyState, "p1")?.kind, "buyCard");

    const reserveState = baseState();
    reserveState.tier1.faceUp = [{ id: "c2", tier: 1, color: "blue", prestige: 1, cost: { white: 9, blue: 9, green: 9, red: 9, brown: 9 } }];
    assert.equal(selectTutorialStep(reserveState, "p1")?.kind, "reserveCard");

    const takeState = baseState();
    takeState.players[0].reservedCards = [{ id: "h1", hidden: true }, { id: "h2", hidden: true }, { id: "h3", hidden: true }];
    takeState.tier1.faceUp = [];
    assert.equal(selectTutorialStep(takeState, "p1")?.kind, "takeGems");
  });

  it("hides common prompts when display counts reach their limit", () => {
    const state = baseState();
    assert.equal(selectTutorialStep(state, "p1", { buyCard: 3 })?.kind, "reserveCard");
    assert.equal(selectTutorialStep(state, "p1", { buyCard: 3, reserveCard: 3, takeGems: 3, turnOverview: 3 }), undefined);
  });
});
