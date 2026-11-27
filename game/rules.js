export const TICKS_PER_SECOND = 60;
export const MATCH_DURATION_SEC = 180;
export const DEFAULT_STAGE = Object.freeze({
  width: 390,
  height: 659.984375,
  groundY: 581.984375,
  floorY: 629.984375,
});

const TICK_MS = 1000 / TICKS_PER_SECOND;
const TICK_SEC = 1 / TICKS_PER_SECOND;
const MATCH_TICKS = MATCH_DURATION_SEC * TICKS_PER_SECOND;
export const STAMINA_MAX = 5;
const STAMINA_REGEN_MS = 3000;
const JUMP_MS = 800;
const ATTACK_COOLDOWN_MS = 650;
const GUARD_MS = 500;
const HIT_STUN_MS = 360;
const FIST_RANGE = 168;
const FIST_START = 24;
const FIST_LIFETIME_MS = 500;
const FIST_PADDING = 20;
const CLASH_DISTANCE = 28;
const MOVE_SPEED = 112;
const MIN_GAP = 100;
const PART_DURABILITY = { leftArm: 2, rightArm: 2, leftFoot: 2, rightFoot: 2, head: 3 };
const PART_OFFSET = { leftArm: -38, rightArm: 38, leftFoot: -38, rightFoot: 38, head: 0, heart: 0 };
const OPPOSITE_PART = { leftArm: "rightArm", rightArm: "leftArm", leftFoot: "rightFoot", rightFoot: "leftFoot" };
const LIMBS = Object.keys(OPPOSITE_PART);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function createFighter({ name = "", faceId = 0 } = {}, seat, stage) {
  const x = clamp(stage.width * (seat === 0 ? 0.28 : 0.72), 70, Math.max(70, stage.width - 70));
  return {
    seat,
    name,
    faceId,
    x,
    y: stage.groundY,
    posture: "stand",
    stamina: STAMINA_MAX,
    staminaCarry: 0,
    lastAttackAt: -9999,
    guardUntil: 0,
    guardStance: "mid",
    guardArm: null,
    jumpUntil: 0,
    hitInvulnerableUntil: 0,
    crouch: false,
    parts: Object.fromEntries(Object.keys(PART_DURABILITY).map((part) => [part, { damage: 0, broken: false }])),
    partPositions: {},
  };
}

function createStats() {
  return {
    attacks: 0,
    guardSuccess: 0,
    enemyPartsBroken: 0,
    playerPartsBroken: 0,
    enemyHeadBroken: 0,
    playerHeadBroken: 0,
    enemyBrokenPartHits: 0,
    playerBrokenPartHits: 0,
    elapsedSec: 0,
    score: 0,
  };
}

export function createMatch({ matchId, players = [], stage = DEFAULT_STAGE }) {
  const { width, height, groundY = clamp(height - 78, 132, height - 48), floorY = height - 30 } = stage;
  const arena = { width, height, groundY, floorY };
  const state = {
    matchId,
    tick: 0,
    simulationTimeMs: 0,
    stage: arena,
    players: [createFighter(players[0], 0, arena), createFighter(players[1], 1, arena)],
    projectiles: [],
    statsBySeat: [createStats(), createStats()],
    nextProjectileId: 1,
    final: null,
  };
  keepFightersSeparated(state);
  updatePositions(state);
  return state;
}

export function toSnapshot(state) {
  return structuredClone(state);
}

export function stepMatch(previous, inputs = []) {
  if (previous.final) return { state: previous, events: [] };

  const tick = previous.tick + 1;
  // Preserve the original combat timers, and finish at the exact 180-second tick.
  const timestamp = tick === MATCH_TICKS ? MATCH_DURATION_SEC * 1000 : previous.simulationTimeMs + TICK_MS;
  const state = {
    ...previous,
    tick,
    simulationTimeMs: timestamp,
    players: previous.players.map((fighter) => ({ ...fighter, parts: { ...fighter.parts } })),
    projectiles: previous.projectiles.map((projectile) => ({ ...projectile })),
    statsBySeat: previous.statsBySeat.map((stats) => ({ ...stats })),
  };
  const events = [];
  const emit = (type, details) => events.push({
    id: `${state.matchId}:${tick}:${events.length}`,
    tick,
    type,
    ...details,
  });

  for (const fighter of state.players) updateTimers(fighter, timestamp);
  for (const fighter of state.players) applyInput(state, fighter, inputs[fighter.seat], emit);

  const heartHits = updateProjectiles(state, emit);
  updatePositions(state);
  if (heartHits.size === 2) state.final = resolveMatch(state, "double-heart", ["draw", "draw"]);
  else if (heartHits.has(0)) state.final = resolveMatch(state, "heart", ["win", "loss"]);
  else if (heartHits.has(1)) state.final = resolveMatch(state, "heart", ["loss", "win"]);
  else if (tick === MATCH_TICKS) state.final = resolveMatch(state, "timeout", ["draw", "draw"]);

  if (state.final) {
    state.statsBySeat = state.final.statsBySeat;
  } else {
    const elapsedSec = Math.floor(timestamp / 1000);
    for (const stats of state.statsBySeat) {
      stats.elapsedSec = elapsedSec;
      stats.score = totalMatchScore(stats, false, elapsedSec);
    }
  }
  return { state, events };
}

export function totalMatchScore(stats, won, elapsedSec) {
  return (won ? 5000 : 0)
    - 30 * stats.attacks
    + 120 * stats.guardSuccess
    + 300 * Math.max(0, stats.enemyPartsBroken - stats.enemyHeadBroken)
    + 1000 * stats.enemyHeadBroken
    + 300 * stats.enemyBrokenPartHits
    - 500 * stats.playerPartsBroken
    - 300 * stats.playerBrokenPartHits
    - 10 * elapsedSec;
}

export function resolveMatch(state, reason, outcomeBySeat) {
  if (state.final) return state.final;
  const elapsedSec = clamp(Math.ceil(state.simulationTimeMs / 1000), 0, MATCH_DURATION_SEC);
  const scoreBySeat = state.statsBySeat.map((stats, seat) => {
    const outcome = outcomeBySeat[seat];
    return reason === "interrupted" || outcome === "interrupted" ? null : totalMatchScore(stats, outcome === "win", elapsedSec);
  });
  const statsBySeat = state.statsBySeat.map((stats, seat) => ({ ...stats, elapsedSec, score: scoreBySeat[seat] }));
  return { reason, outcomeBySeat: [...outcomeBySeat], elapsedSec, scoreBySeat, statsBySeat };
}

function updateTimers(fighter, timestamp) {
  fighter.staminaCarry += TICK_SEC * 1000;
  if (fighter.staminaCarry >= STAMINA_REGEN_MS) {
    fighter.staminaCarry -= STAMINA_REGEN_MS;
    fighter.stamina = Math.min(STAMINA_MAX, fighter.stamina + 1);
  }
  if (fighter.jumpUntil <= timestamp) fighter.jumpUntil = 0;
}

function applyInput(state, fighter, input = {}, emit) {
  const timestamp = state.simulationTimeMs;
  const dir = Number(Boolean(input.right)) - Number(Boolean(input.left));
  fighter.crouch = Boolean(input.crouch) && !isJumping(fighter, timestamp);
  if (dir) moveFighter(state, fighter, dir);
  if (input.jumpPressed && !isJumping(fighter, timestamp) && brokenFeet(fighter) === 0) {
    fighter.crouch = false;
    fighter.jumpUntil = timestamp + JUMP_MS;
    emit("jump", { seat: fighter.seat, x: fighter.x, y: fighter.y });
  }
  if (input.attackPressed) startAttack(state, fighter, emit);
  if (input.guardPressed && !isJumping(fighter, timestamp) && hasArm(fighter) && fighter.stamina >= 0.5) {
    fighter.stamina -= 0.5;
    fighter.guardUntil = timestamp + GUARD_MS;
    fighter.guardStance = fighter.crouch ? "low" : "mid";
  }
}

function brokenFeet(fighter) {
  return Number(fighter.parts.leftFoot.broken) + Number(fighter.parts.rightFoot.broken);
}

function moveFighter(state, fighter, dir) {
  const feet = brokenFeet(fighter);
  if (feet === 2) return;
  const speed = MOVE_SPEED * (feet === 1 ? 0.5 : 1);
  fighter.x = clamp(fighter.x + dir * speed * TICK_SEC, 48, state.stage.width - 48);
  keepFightersSeparated(state);
}

function keepFightersSeparated(state) {
  const [left, right] = state.players;
  const minX = 54;
  const maxX = Math.max(minX + 120, state.stage.width - minX);
  const gap = Math.min(MIN_GAP, Math.max(72, maxX - minX - 8));
  if (left.x > right.x - gap) {
    const center = (left.x + right.x) / 2;
    left.x = center - gap / 2;
    right.x = center + gap / 2;
  }
  if (left.x < minX) {
    right.x += minX - left.x;
    left.x = minX;
  }
  if (right.x > maxX) {
    left.x -= right.x - maxX;
    right.x = maxX;
  }
  left.x = clamp(left.x, minX, maxX - gap);
  right.x = clamp(right.x, left.x + gap, maxX);
}

function hasArm(fighter) {
  return !(fighter.parts.leftArm.broken && fighter.parts.rightArm.broken);
}

function isJumping(fighter, timestamp) {
  return fighter.jumpUntil > timestamp;
}

function postureOf(fighter, timestamp) {
  if (isJumping(fighter, timestamp)) return "jump";
  return fighter.crouch ? "crouch" : "stand";
}

function heightY(y, height) {
  if (height === "high") return y - 35;
  if (height === "low") return y + 34;
  return y;
}

function partHeight(part) {
  if (part === "head") return "high";
  if (part.endsWith("Foot")) return "low";
  return "mid";
}

function startAttack(state, fighter, emit) {
  const timestamp = state.simulationTimeMs;
  if (fighter.stamina < 1 || timestamp - fighter.lastAttackAt < ATTACK_COOLDOWN_MS || !hasArm(fighter)) return;

  fighter.stamina -= 1;
  fighter.lastAttackAt = timestamp;
  state.statsBySeat[fighter.seat].attacks += 1;
  const opponent = state.players[1 - fighter.seat];
  const dir = opponent.x > fighter.x ? 1 : -1;
  const posture = postureOf(fighter, timestamp);
  const height = { jump: "high", crouch: "low", stand: "mid" }[posture];
  const startX = fighter.x + dir * FIST_START;
  // The original resolves horizontal hits before repainting each fighter's vertical pose.
  const y = heightY(fighter.y, height === "high" ? "mid" : height);
  const id = state.nextProjectileId++;
  state.projectiles.push({
    id,
    owner: fighter.seat,
    target: opponent.seat,
    type: "fist",
    height,
    startX,
    endX: fighter.x + dir * FIST_RANGE,
    previousX: startX,
    currentX: startX,
    y,
    dir,
    createdAt: timestamp,
    durationMs: FIST_LIFETIME_MS,
    progress: 0,
  });
  emit("attack", { seat: fighter.seat, target: opponent.seat, projectileId: id, x: startX, y });
}

function nearPart(target, attacker, part) {
  return `${attacker.x < target.x ? "left" : "right"}${part}`;
}

function guardArmFor(target, attacker, timestamp, includeLastInstant = false) {
  const guardExpired = includeLastInstant ? target.guardUntil < timestamp : target.guardUntil <= timestamp;
  if (guardExpired || isJumping(target, timestamp)) return null;
  const front = nearPart(target, attacker, "Arm");
  const back = OPPOSITE_PART[front];
  if (!target.parts[back].broken) return back;
  return target.parts[front].broken ? null : front;
}

function partOffset(target, attacker, part, timestamp) {
  if (part.endsWith("Arm") && guardArmFor(target, attacker, timestamp) === part) {
    return PART_OFFSET[nearPart(target, attacker, "Arm")];
  }
  if (part.endsWith("Foot")) {
    const near = nearPart(target, attacker, "Foot");
    if (part !== near && target.parts[near].broken && !target.parts[part].broken) return PART_OFFSET[near];
  }
  return PART_OFFSET[part];
}

function updatePositions(state) {
  for (const fighter of state.players) {
    const timestamp = state.simulationTimeMs;
    const opponent = state.players[1 - fighter.seat];
    fighter.posture = postureOf(fighter, timestamp);
    fighter.y = state.stage.groundY + { stand: 0, crouch: 10, jump: -38 }[fighter.posture];
    fighter.guardArm = guardArmFor(fighter, opponent, timestamp);
    fighter.partPositions = Object.fromEntries(Object.keys(PART_OFFSET).map((part) => [
      part,
      {
        x: fighter.x + partOffset(fighter, opponent, part, timestamp),
        y: heightY(fighter.y, partHeight(part)),
      },
    ]));
  }
}

function nearestFoot(target, attacker) {
  const near = nearPart(target, attacker, "Foot");
  const far = OPPOSITE_PART[near];
  if (!target.parts[near].broken) return near;
  return target.parts[far].broken ? null : far;
}

function nearestLimb(target, attacker, timestamp) {
  let nearest = null;
  let distance = Infinity;
  // The original checks the arms before the feet when both share a horizontal position.
  for (const part of LIMBS) {
    if (target.parts[part].broken) continue;
    const currentDistance = Math.abs(target.x + partOffset(target, attacker, part, timestamp) - attacker.x);
    if (currentDistance < distance) {
      nearest = part;
      distance = currentDistance;
    }
  }
  return nearest;
}

function hitPart(target, attacker, height, timestamp) {
  const posture = postureOf(target, timestamp);
  if (posture === "jump") return nearestFoot(target, attacker);
  if (posture === "crouch") {
    if (height === "high") return null;
    if (height === "mid") return "head";
    return nearestLimb(target, attacker, timestamp) ?? "heart";
  }
  if (height === "high") return "head";
  if (height === "low") return nearestFoot(target, attacker);
  const front = nearPart(target, attacker, "Arm");
  return target.parts[front].broken ? "heart" : front;
}

function updateProjectiles(state, emit) {
  const timestamp = state.simulationTimeMs;
  const removed = new Set();
  const heartHits = new Set();
  for (const projectile of state.projectiles) {
    projectile.previousX = projectile.currentX;
    projectile.progress = (timestamp - projectile.createdAt) / projectile.durationMs;
    projectile.currentX = projectile.startX + (projectile.endX - projectile.startX) * clamp(projectile.progress, 0, 1);
  }

  for (const [index, first] of state.projectiles.entries()) {
    if (removed.has(first.id)) continue;
    for (let nextIndex = index + 1; nextIndex < state.projectiles.length; nextIndex += 1) {
      const second = state.projectiles[nextIndex];
      if (removed.has(second.id) || first.owner === second.owner || first.height !== second.height) continue;
      if (Math.abs(first.currentX - second.currentX) > CLASH_DISTANCE) continue;
      removed.add(first.id);
      removed.add(second.id);
      emit("clash", { x: (first.currentX + second.currentX) / 2, y: first.y });
    }
  }

  for (const projectile of state.projectiles) {
    if (removed.has(projectile.id)) continue;
    const impact = findImpact(state, projectile);
    if (impact && reachedImpact(projectile, impact.x)) {
      removed.add(projectile.id);
      const target = state.players[projectile.target];
      if (target.hitInvulnerableUntil > timestamp) {
        emit("miss", impact);
      } else if (impact.guarded) {
        target.stamina = Math.max(0, target.stamina - 0.5);
        state.statsBySeat[target.seat].guardSuccess += 1;
        emit("guard", { ...impact, seat: target.seat, target: projectile.owner });
      } else if (impact.part === "heart") {
        heartHits.add(projectile.owner);
        emit("heart", impact);
      } else {
        damagePart(state, target, impact, emit);
      }
    } else if (projectile.progress >= 1) {
      removed.add(projectile.id);
      emit("miss", { seat: projectile.owner, target: projectile.target, x: projectile.currentX, y: projectile.y });
    }
  }

  state.projectiles = state.projectiles.filter((projectile) => !removed.has(projectile.id));
  return heartHits;
}

function findImpact(state, projectile) {
  const attacker = state.players[projectile.owner];
  const target = state.players[projectile.target];
  const timestamp = state.simulationTimeMs;
  const arm = target.guardStance === projectile.height && guardArmFor(target, attacker, timestamp, true);
  const guarded = Boolean(arm);
  const part = guarded ? arm : hitPart(target, attacker, projectile.height, timestamp);
  if (!part) return null;
  return {
    seat: projectile.owner,
    target: projectile.target,
    part,
    guarded,
    x: target.x + partOffset(target, attacker, part, timestamp),
    y: heightY(target.y, guarded ? target.guardStance : partHeight(part)),
  };
}

function reachedImpact(projectile, impactX) {
  const minX = Math.min(projectile.previousX, projectile.currentX) - FIST_PADDING;
  const maxX = Math.max(projectile.previousX, projectile.currentX) + FIST_PADDING;
  if (impactX < minX || impactX > maxX) return false;
  return projectile.dir > 0 ? projectile.currentX + FIST_PADDING >= impactX : projectile.currentX - FIST_PADDING <= impactX;
}

function damagePart(state, target, impact, emit) {
  const { seat, part } = impact;
  const oldPart = target.parts[part];
  const attackerStats = state.statsBySeat[seat];
  const defenderStats = state.statsBySeat[target.seat];
  if (oldPart.broken) {
    if (part === "head") {
      target.hitInvulnerableUntil = state.simulationTimeMs + HIT_STUN_MS;
      attackerStats.enemyBrokenPartHits += 1;
      defenderStats.playerBrokenPartHits += 1;
      emit("brokenPartHit", impact);
    } else {
      emit("miss", impact);
    }
    return;
  }

  const damage = oldPart.damage + 1;
  const broken = damage >= PART_DURABILITY[part];
  target.parts[part] = { damage, broken };
  target.hitInvulnerableUntil = state.simulationTimeMs + HIT_STUN_MS;
  emit("hit", { ...impact, broken });
  if (!broken) return;
  attackerStats.enemyPartsBroken += 1;
  defenderStats.playerPartsBroken += 1;
  if (part === "head") {
    attackerStats.enemyHeadBroken += 1;
    defenderStats.playerHeadBroken += 1;
  }
  emit("break", impact);
}
