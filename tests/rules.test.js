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
  })), original.projectiles.map(projectile => ({
    ...projectile,
    // The online game uses the pose at launch, including the first tick after a pose change.
    y: { high: fixture.stage.groundY - 38, mid: fixture.stage.hitY.mid, low: fixture.stage.hitY.low + 10 }[projectile.height],
  })));

  if (!original.final) {
    assert.equal(state.final, null);
    const seconds = Math.floor(tick / 60);
    assert.deepEqual(state.statsBySeat, original.statsBySeat.map(stats => ({
      ...stats, elapsedSec: seconds, score: stats.score + 10 * (stats.elapsedSec - seconds),
    })));
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
  if (scenario.name.startsWith("low punches")) continue;
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
      // The last arm is already within reach here because it now moves to the front.
      if (scenario.name.startsWith("crouching exposes limbs") && tick === 621) {
        assert.equal(state.players[1].parts.rightArm.damage, 1);
        assert.equal(state.projectiles.length, 0);
      } else if (expected.has(tick)) {
        compareObservation(state, expected.get(tick), tick);
      }
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

test("charges each elapsed second exactly once at all 180 whole-second boundaries", () => {
  let state = start();
  for (let tick = 1; tick <= 10800; tick++) {
    state = stepMatch(state).state;
    if (tick % 60 > 1 && tick % 60 < 59) continue;
    const expected = Math.ceil(tick / 60);
    assert.equal(state.statsBySeat[1].elapsedSec, Math.floor(tick / 60));
    const result = resolveMatch(state, "forfeit", ["win", "loss"]);
    assert.equal(result.elapsedSec, expected);
    assert.equal(result.scoreBySeat[1], -10 * expected);
  }
});

test("launches the fist from the current pose on landing, crouching and standing up", () => {
  for (const seat of [0, 1]) {
    function act(state, input) {
      const inputs = [{}, {}];
      inputs[seat] = input;
      return stepMatch(state, inputs).state;
    }
    let airborne = act(start(), { jumpPressed: true });
    while (act(airborne, {}).players[seat].posture === "jump") airborne = act(airborne, {});
    const starts = [
      [airborne, { attackPressed: true }, "stand", "mid", "heart"],
      [start(), { crouch: true, attackPressed: true }, "crouch", "low", "leftFoot"],
      [act(start(), { crouch: true }), { attackPressed: true }, "stand", "mid", "heart"],
    ];
    for (const [state, input, posture, height, origin] of starts) {
      const shot = act(state, input);
      assert.equal(shot.players[seat].posture, posture);
      assert.equal(shot.projectiles[0].height, height);
      assert.equal(shot.projectiles[0].y, shot.players[seat].partPositions[origin].y);
    }
  }
});

function fightFrom(attacker) {
  const defender = 1 - attacker;
  let state = start();
  return {
    get target() { return state.players[defender]; },
    get state() { return state; },
    step(attack = {}, defense = {}) {
      const inputs = attacker === 0 ? [attack, defense] : [defense, attack];
      const next = stepMatch(state, inputs);
      state = next.state;
      return next.events;
    },
    punch(attack, defense) {
      const events = this.step({ ...attack, attackPressed: true }, defense);
      for (let tick = 0; tick < 60; tick++) events.push(...this.step(attack, defense));
      return events.find(({ type }) => type === "hit" || type === "heart");
    },
  };
}

test("feet sit under the heart and a surviving foot uses the forward hit position", () => {
  for (const attacker of [0, 1]) {
    const fight = fightFrom(attacker);
    const direction = attacker === 0 ? -1 : 1;
    const front = attacker === 0 ? "leftFoot" : "rightFoot";
    const back = attacker === 0 ? "rightFoot" : "leftFoot";
    assert.equal(fight.target.partPositions[front].x, fight.target.x + direction * 19);
    assert.equal(fight.target.partPositions[back].x, fight.target.x - direction * 19);

    for (const part of [front, front, back, back]) {
      const hit = fight.punch({ crouch: true }, {});
      assert.equal(hit.part, part);
      assert.equal(hit.x, fight.target.x + direction * 19);
      if (part === front && fight.target.parts[front].broken) {
        assert.equal(fight.target.partPositions[back].x, hit.x);
        const oldX = fight.target.x;
        fight.step({}, { [attacker === 0 ? "right" : "left"]: true, jumpPressed: true });
        assert.ok(Math.abs(Math.abs(fight.target.x - oldX) - 112 / 120) < 0.000001);
        assert.equal(fight.target.posture, "stand");
      }
    }
    const oldX = fight.target.x;
    fight.step({}, { [attacker === 0 ? "right" : "left"]: true, jumpPressed: true });
    assert.equal(fight.target.x, oldX);
    assert.equal(fight.target.posture, "stand");
  }
});

test("a crouching fighter exposes the last arm at the forward position after both feet break", () => {
  for (const attacker of [0, 1]) {
    const fight = fightFrom(attacker);
    const direction = attacker === 0 ? -1 : 1;
    const front = attacker === 0 ? "leftArm" : "rightArm";
    const back = attacker === 0 ? "rightArm" : "leftArm";
    fight.target.parts[front] = { damage: 2, broken: true };
    fight.target.parts.leftFoot = { damage: 2, broken: true };
    fight.step({}, { crouch: true });
    assert.equal(fight.target.partPositions[back].x, fight.target.x - direction * 38);

    fight.target.parts.rightFoot = { damage: 2, broken: true };
    fight.step();
    assert.equal(fight.target.partPositions[back].x, fight.target.x - direction * 38);
    fight.step({}, { crouch: true });
    assert.equal(fight.target.partPositions[back].x, fight.target.x + direction * 38);
    assert.equal(fight.target.guardArm, null);

    for (const damage of [1, 2]) {
      const hit = fight.punch({ crouch: true }, { crouch: true });
      assert.equal(hit.part, back);
      assert.equal(hit.x, fight.target.x + direction * 38);
      assert.equal(fight.target.parts[back].damage, damage);
      assert.equal(fight.state.final, null);
    }
    const finalHit = fight.punch({ crouch: true }, { crouch: true });
    assert.equal(finalHit.type, "heart");
    assert.equal(fight.state.final.outcomeBySeat[attacker], "win");
  }
});
