import assert from "node:assert/strict";
import { POKEMON_DEVELOPMENT_CARDS, emptyCosts, emptyGems } from "./data/static";
import {
  PlayerState,
  applyBuy,
  applyEvolvePokemon,
  advanceTurn,
  createGame,
  validateBuy,
  validateReserve,
} from "./rules";

function player(id: string, username: string, isHost = false): PlayerState {
  return {
    id,
    username,
    avatarId: 0,
    isHost,
    gems: emptyGems(),
    bonuses: emptyCosts(),
    purchasedCards: [],
    reservedCards: [],
    tuckedCards: [],
    nobles: [],
    prestige: 0,
    connected: true,
    turnsTaken: 0,
  };
}

const players = () => [player("p1", "Ash", true), player("p2", "Misty")];

{
  const state = createGame(players(), 2, "classic").gameState!;
  assert.equal(state.variant, "classic");
  assert.equal(state.nobles.length, 3);
  assert.equal(state.rare, undefined);
  assert.equal(state.legendary, undefined);
}

{
  const state = createGame(players(), 2, "pokemon").gameState!;
  assert.equal(state.variant, "pokemon");
  assert.equal(state.nobles.length, 0);
  assert.equal(state.rare?.faceUp.length, 1);
  assert.equal(state.legendary?.faceUp.length, 1);

  const rare = state.rare!.faceUp[0]!;
  assert.equal(validateReserve(state, "p1", rare.id).valid, false);
  assert.equal(validateBuy(state, "p1", rare.id).valid, false);

  const ash = state.players[0];
  ash.gems.gold = rare.goldCost ?? 1;
  assert.equal(validateBuy(state, "p1", rare.id).valid, true);
  applyBuy(state, "p1", rare.id);
  assert.equal(ash.purchasedCards.some((card) => card.id === rare.id), true);
  assert.equal(ash.bonuses[rare.bonusColors![0]] >= 1, true);
  assert.equal(ash.bonuses[rare.bonusColors![1]] >= 1, true);
}

{
  const state = createGame(players(), 2, "pokemon").gameState!;
  const ash = state.players[0];
  const base = POKEMON_DEVELOPMENT_CARDS.find((card) => card.name === "迷你龙" && !card.evolvesFrom)!;
  const target = POKEMON_DEVELOPMENT_CARDS.find((card) => card.name === "哈克龙" && card.evolvesFrom === "迷你龙")!;

  ash.purchasedCards = [base];
  ash.prestige = base.prestige;
  ash.bonuses = { ...target.evolutionCost! };
  state._decks!.tier1.faceUp[0] = target;
  state.tier1.faceUp[0] = target;
  state.pendingEvolutionPlayerId = "p1";

  applyEvolvePokemon(state, "p1", target.id);
  assert.equal(ash.tuckedCards[0].id, base.id);
  assert.equal(ash.purchasedCards.some((card) => card.id === target.id), true);
  assert.equal(state.pendingEvolutionPlayerId, null);
}

{
  const state = createGame(players(), 2, "pokemon").gameState!;
  const ash = state.players[0];
  ash.prestige = 18;
  state.phase = "playing";
  state.currentPlayerId = "p1";
  state.turnOrder = ["p1", "p2"];
  advanceTurn(state);
  assert.equal(state.phase, "finalRound");
}

console.log("gameEngine variant tests passed");
