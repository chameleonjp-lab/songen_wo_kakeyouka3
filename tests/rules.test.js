import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { createMatch, DEFAULT_STAGE, resolveMatch, stepMatch, toSnapshot, totalMatchScore } from "../game/rules.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/unmarked-rules.json", import.meta.url)));
const registered = [
  { name: "Left", faceId: 12, seatKey: "not game state" },
  { name: "Right", faceId: 13, seatKey: "not game state" },
];
const start = () => createMatch({ matchId: "fixture", players: registered });

function fixtureInput(scenario, tick) {
  return [0, 1].map((seat) => Object.assign({}, ...scenario.inputs
    .filter(({ seat: owner, from, to }) => owner === seat && tick >= from && tick <= to)
    .map(({ input }) => input)));
}

function fixtureStart(scenario) {
  const state = start();
  if (scenario.setup !== "crossedFists") return state;
  state.players[0].parts.rightArm = { damage: 2, broken: true };
  state.players[1].parts.leftArm = { damage: 2, broken: true };
  state.projectiles = [0, 1].map((owner) => {
    const target = 1 - owner;
    const dir = owner === 0 ? 1 : -1;
    const startX = state.players[target].x - dir * 2;
    return {
      id: owner + 1, owner, target, type: "fist", height: "mid", dir,
      startX, endX: startX + dir * 144, previousX: startX, currentX: startX,
      y: state.players[owner].y, createdAt: 0, durationMs: 500, progress: 0,
    };
  });
  state.nextProjectileId = 3;
  return state;
}

const tidy = (value) => Math.round(value * 1e6) / 1e6;

function compareObservation(state, original, tick) {
  assert.equal(state.tick, tick);
  assert.equal(tidy(state.simulationTimeMs), tick === 10800 ? 180000 : original.simulationTimeMs);
  assert.deepEqual(state.players.map((fighter) => ({
    x: tidy(fighter.x),
    y: tidy(fighter.y),
    posture: fighter.posture,
    stamina: fighter.stamina,
    guardArm: fighter.guardArm,
    damage: Object.values(fighter.parts).map((part) => part.damage),
  })), original.players);
  assert.deepEqual(state.projectiles.map((projectile) => ({
    owner: projectile.owner,
    height: projectile.height,
    x: tidy(projectile.currentX),
    y: tidy(projectile.y),
  })), original.projectiles);

  if (!original.final) {
    assert.equal(state.final, null);
    assert.deepEqual(state.statsBySeat, original.statsBySeat);
    return;
  }

  assert.deepEqual(state.final.outcomeBySeat, original.final.outcomeBySeat);
  assert.deepEqual(state.final.scoreBySeat, original.final.scoreBySeat);
  assert.equal(state.final.elapsedSec, original.final.elapsedSec);
  // The original page overwrites only the displayed provisional score on the winning tick.
  assert.deepEqual(state.statsBySeat, original.statsBySeat.map((stats, seat) => ({
    ...stats, score: original.final.scoreBySeat[seat], elapsedSec: original.final.elapsedSec,
  })));
}

test("uses the fixed WebKit stage measured in a 390×844 viewport", () => {
  const { width, height, groundY, floorY } = fixture.stage;
  assert.deepEqual(DEFAULT_STAGE, { width, height, groundY, floorY });
  const state = start();
  assert.deepEqual(state.stage, DEFAULT_STAGE);
  assert.equal(state.players[0].y, fixture.stage.hitY.mid);
  assert.equal(state.players[0].partPositions.head.y, fixture.stage.hitY.high);
  assert.equal(state.players[0].partPositions.leftFoot.y, fixture.stage.hitY.low);
  assert.equal(state.players[0].partPositions.leftArm.x - state.players[0].x, fixture.stage.hitXOffset.leftArm);
  assert.equal(state.players[1].partPositions.rightArm.x - state.players[1].x, fixture.stage.hitXOffset.rightArm);
});

for (const scenario of fixture.scenarios) {
  test(`matches original 060b251 in WebKit for ${scenario.name}`, () => {
    let state = fixtureStart(scenario);
    const ending = scenario.observations.at(-1);
    const isTimeout = ending.tick === 10801;
    const expected = new Map(scenario.observations.map((original) => [original.tick, original]));
    if (isTimeout) {
      // Original cumulative addition runs one tick over 180 seconds. Online ends at exactly 10,800.
      assert.equal(expected.get(10800).final, null);
      expected.set(10800, ending);
    }
    const events = [];
    const lastTick = isTimeout ? 10800 : ending.tick;
    for (let tick = 1; tick <= lastTick; tick += 1) {
      const next = stepMatch(state, fixtureInput(scenario, tick));
      state = next.state;
      events.push(...next.events);
      if (expected.has(tick)) compareObservation(state, expected.get(tick), tick);
    }
    if (isTimeout) assert.equal(state.final.reason, "timeout");
    if (scenario.setup === "crossedFists") {
      assert.equal(state.final.reason, "double-heart");
      assert.deepEqual(events.filter(({ type }) => type === "heart").map(({ seat }) => seat), [0, 1]);
    }
    if (scenario.name.includes("remaining guard")) {
      assert.equal(state.final.reason, "heart");
      assert.equal(events.filter(({ type }) => type === "guard").length, 1);
      assert.equal(events.filter(({ type }) => type === "heart").length, 1);
    }
    if (scenario.name.includes("fists cancel")) assert.equal(events.filter(({ type }) => type === "clash").length, 1);
    assert.equal(new Set(events.map(({ id }) => id)).size, events.length);
    if (state.final) assert.deepEqual(stepMatch(state, [{ attackPressed: true }, {}]), { state, events: [] });
  });
}

test("runs without browser globals and keeps every detail needed to resume in JSON", () => {
  assert.equal(typeof document, "undefined");
  const scenario = fixture.scenarios[0];
  let state = start();
  for (let tick = 1; tick <= 118; tick += 1) state = stepMatch(state, fixtureInput(scenario, tick)).state;

  const serialized = JSON.stringify(toSnapshot(state));
  assert.equal(serialized.includes("seatKey"), false);
  assert.equal(state.players[1].guardArm, "rightArm");
  assert.equal(state.projectiles.length, 1);
  assert.ok(state.players[0].staminaCarry > 0);

  const input = fixtureInput(scenario, 119);
  const first = stepMatch(state, input);
  assert.equal(JSON.stringify(state), serialized);
  const snapshot = toSnapshot(state);
  snapshot.players[1].parts.leftArm.damage = 0;
  snapshot.projectiles[0].currentX = 123;
  snapshot.statsBySeat[0].attacks = 0;
  assert.equal(JSON.stringify(state), serialized);

  let restored = JSON.parse(serialized);
  for (let tick = 119; tick <= 177; tick += 1) {
    const original = tick === 119 ? first : stepMatch(state, fixtureInput(scenario, tick));
    const resumed = stepMatch(restored, fixtureInput(scenario, tick));
    assert.deepEqual(resumed, original);
    state = original.state;
    restored = resumed.state;
  }
  assert.deepEqual(toSnapshot(restored), toSnapshot(state));
});

test("keeps exact negative scores and omits scores for interrupted games", () => {
  const state = start();
  const stats = {
    ...state.statsBySeat[0],
    attacks: 4,
    guardSuccess: 2,
    enemyPartsBroken: 3,
    playerPartsBroken: 2,
    enemyHeadBroken: 1,
    playerHeadBroken: 1,
    enemyBrokenPartHits: 4,
    playerBrokenPartHits: 1,
  };
  assert.equal(totalMatchScore(stats, true, 25), 6370);
  assert.equal(totalMatchScore(state.statsBySeat[0], false, 180), -1800);

  const next = stepMatch(state, [{ attackPressed: true }, {}]).state;
  assert.deepEqual(resolveMatch(next, "forfeit", ["loss", "win"]).scoreBySeat, [-40, 4990]);
  assert.deepEqual(resolveMatch(next, "interrupted", ["interrupted", "interrupted"]).scoreBySeat, [null, null]);
  assert.equal(next.final, null);
});
