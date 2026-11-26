// Run from the repository root with: node tests/fixtures/capture-unmarked-rules.mjs ../original
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { webkit } = process.env.ORIGINAL_PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.ORIGINAL_PLAYWRIGHT_MODULE))
  : await import("@playwright/test");

const original = resolve(process.argv[2] ?? "../original");
const revision = "060b251a7016725bfd4e7886936eabf223b092d0";
if (execFileSync("git", ["-C", original, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== revision ||
    execFileSync("git", ["-C", original, "status", "--porcelain", "--", "index.html", "js"], { encoding: "utf8" }).trim()) {
  throw new Error("The original game must be checked out at the fixed revision with a clean working copy.");
}

const viewport = { width: 390, height: 844 };
const origin = "http://127.0.0.1:8767";
const press = (seat, key, ...ticks) => ticks.map((tick) => ({ seat, from: tick, to: tick, input: { [key]: true } }));
const hold = (seat, key, from, to) => ({ seat, from, to, input: { [key]: true } });

const scenarios = [
  ...[0, 1].map((attacker) => ({
    name: `front-arm, remaining guard and heart from seat ${attacker}`,
    inputs: [
      ...press(attacker, "attackPressed", 1, 50, 100, 150),
      ...press(1 - attacker, "guardPressed", 115),
    ],
    checkpoints: [1, 20, 69, 118, 119, 120, 150, 176, 177],
  })),
  {
    name: "low punches, one leg halves movement, two legs stop movement and jump",
    inputs: [
      ...press(0, "attackPressed", 1, 50, 100, 150),
      hold(0, "crouch", 1, 150),
      hold(1, "right", 72, 76),
      hold(1, "left", 77, 81),
      hold(1, "right", 172, 178),
      ...press(1, "jumpPressed", 73, 175),
    ],
    checkpoints: [1, 20, 69, 72, 73, 76, 81, 119, 169, 175, 178],
  },
  {
    name: "crouching exposes limbs and no arm prevents punching and guarding",
    inputs: [
      ...press(0, "attackPressed", 1, 50, 100, 150, 200, 400, 600, 800),
      hold(0, "crouch", 1, 850),
      hold(0, "right", 1, 25),
      hold(1, "crouch", 1, 850),
      ...press(1, "attackPressed", 720, 850),
      ...press(1, "guardPressed", 850),
    ],
    checkpoints: [69, 169, 420, 621, 720, 830, 850],
  },
  {
    name: "jump and punch together, repeated broken head hits",
    inputs: [
      ...press(0, "jumpPressed", 1),
      ...press(0, "attackPressed", 1, 50, 100, 150),
      hold(1, "crouch", 49, 177),
    ],
    checkpoints: [1, 20, 28, 49, 77, 127, 177],
  },
  {
    name: "same-height fists cancel before either can hit a part",
    inputs: [...press(0, "attackPressed", 1), ...press(1, "attackPressed", 1)],
    checkpoints: [1, 10, 14, 20],
  },
  {
    name: "two in-flight fists strike exposed hearts on the same tick",
    // The fists start past each other to exercise the original simultaneous-hit branch.
    setup: "crossedFists",
    inputs: [],
    checkpoints: [1],
  },
  {
    name: "idle 180-second draw",
    inputs: [],
    checkpoints: [10799, 10800, 10801],
  },
];

const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    return route.fulfill({ path: resolve(original, url.pathname.slice(1) || "index.html") });
  });

  await page.goto(origin);
  const stage = await page.evaluate(() => {
    showScreen("battle");
    state.running = true;
    initializeBattleActors({ playerSide: "left", playerHead: "😺", cpuHead: "🐶" });
    const floor = document.querySelector(".ground").getBoundingClientRect();
    return {
      ...state.stageRect,
      groundY: state.player.y,
      floorY: floor.top - state.stageRect.top,
      floorHeight: floor.height,
      hitXOffset: Object.fromEntries(["leftArm", "rightArm", "leftFoot", "rightFoot", "head", "heart"]
        .map((part) => [part, staticPartOffset(part)])),
      hitY: Object.fromEntries(["high", "mid", "low"].map((height) => [height, yForHeight(height, state.player)])),
    };
  });

  for (const scenario of scenarios) {
    const runs = await page.evaluate(({ inputs, checkpoints, setup }) => {
      const tidy = (value) => Math.round(value * 1e6) / 1e6;
      function simulate(side) {
        showScreen("battle");
        state.battleMode = BATTLE_MODE.local2p;
        state.running = true;
        state.ended = false;
        state.frame = 0;
        state.simulationTimeMs = 0;
        state.projectileSeq = 1;
        state.projectiles = [];
        state.inputLog = [];
        state.hashLog = [];
        lastResult = null;
        activePlay = SongenParticipation.begin("", BATTLE_MODE.local2p, () => "fixture");
        dom.stage.querySelectorAll(".projectile,.float-fx").forEach((element) => element.remove());
        initializeBattleActors({
          playerSide: side === 0 ? "left" : "right",
          playerName: "Fixture Player",
          cpuName: "Fixture Opponent",
          playerHead: "😺",
          cpuHead: "🐶",
        });
        keepFightersSeparated();
        renderAll();
        const seats = side === 0 ? [state.player, state.cpu] : [state.cpu, state.player];
        if (setup === "crossedFists") {
          for (const seat of [0, 1]) {
            const owner = seats[seat];
            const opponent = seats[1 - seat];
            owner.parts[seat === 0 ? "rightArm" : "leftArm"] = { damage: 2, broken: true };
            const dir = seat === 0 ? 1 : -1;
            const startX = opponent.x - dir * 2;
            state.projectiles.push({
              id: state.projectileSeq++, owner: owner.id, target: opponent.id, type: "fist", height: "mid",
              startX, endX: startX + dir * 144, previousX: startX, currentX: startX,
              y: owner.y, dir, createdAt: 0, durationMs: 500, progress: 0,
              removed: false, resolved: false, el: null,
            });
          }
        }
        const observations = [];
        const finalCheckpoint = Math.max(...checkpoints);
        for (let tick = 1; tick <= finalCheckpoint && !state.ended; tick += 1) {
          const active = [0, 1].map((seat) => Object.assign({}, ...inputs
            .filter(({ seat: owner, from, to }) => owner === seat && tick >= from && tick <= to)
            .map(({ input }) => input)));
          state.currentInputs = { player: cloneInput(active[side]), cpu: cloneInput(active[1 - side]) };
          tickSimulation();
          renderAll();
          if (!checkpoints.includes(tick) && !state.ended) continue;
          observations.push({
            tick,
            simulationTimeMs: tidy(state.simulationTimeMs),
            players: seats.map((fighter) => ({
              x: tidy(fighter.x),
              y: tidy(fighter.y),
              posture: postureOf(fighter),
              stamina: fighter.stamina,
              guardArm: fighter.guardUntil > getBattleNowMs() && !isJumping(fighter)
                ? selectedGuardArm(fighter, fighter === seats[0] ? seats[1] : seats[0])
                : null,
              damage: Object.values(fighter.parts).map((part) => part.damage),
            })),
            projectiles: state.projectiles.map((projectile) => ({
              owner: seats[0].id === projectile.owner ? 0 : 1,
              height: projectile.height,
              x: tidy(projectile.currentX),
              y: tidy(projectile.y),
            })).sort((a, b) => a.owner - b.owner),
            stats: { ...state.stats },
            final: lastResult ? { outcome: lastResult.outcome, score: lastResult.score, elapsedSec: lastResult.elapsedSec } : null,
          });
        }
        return observations;
      }
      return [simulate(0), simulate(1)];
    }, scenario);

    scenario.observations = runs[0].map(({ stats, final, ...checkpoint }, index) => {
      const mirrored = runs[1][index];
      if (checkpoint.tick !== mirrored.tick ||
          JSON.stringify(checkpoint.players) !== JSON.stringify(mirrored.players) ||
          JSON.stringify(checkpoint.projectiles) !== JSON.stringify(mirrored.projectiles)) {
        throw new Error(`Original comparison was asymmetric in ${scenario.name} at tick ${checkpoint.tick}.`);
      }
      return {
        ...checkpoint,
        statsBySeat: [stats, mirrored.stats],
        final: final && {
          outcomeBySeat: [final.outcome, mirrored.final.outcome],
          scoreBySeat: [final.score, mirrored.final.score],
          elapsedSec: final.elapsedSec,
        },
      };
    });
  }

  const metadata = { revision, browser: `Playwright WebKit ${browser.version()}`, viewport, stage };
  const formatted = scenarios.map(({ observations, ...scenario }) => {
    const header = JSON.stringify(scenario, null, 2).slice(0, -2);
    const rows = observations.map((observation) => `    ${JSON.stringify(observation)}`).join(",\n");
    return `${header},\n  "observations": [\n${rows}\n  ]\n}`;
  }).map((scenario) => scenario.replace(/^/gm, "    ")).join(",\n");
  const json = `${JSON.stringify(metadata, null, 2).slice(0, -2)},\n  "scenarios": [\n${formatted}\n  ]\n}\n`;
  writeFileSync(new URL("unmarked-rules.json", import.meta.url), json);
} finally {
  await browser.close();
}
