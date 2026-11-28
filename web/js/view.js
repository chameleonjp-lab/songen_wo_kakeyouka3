import { DEFAULT_STAGE, MATCH_DURATION_SEC, TICKS_PER_SECOND, STAMINA_MAX } from "../../game/rules.js";
import { language, t } from "./i18n.js";

export const FACES = ["𓃾", "𓃿", "𓄀", "𓄁", "𓄃", "𓄇", "𓅿", "𓆀", "𓆁", "🌕", "🌝", "🔵", "😺", "🐶", "🐯", "🦊", "🐹", "🐻"];

const cells = [null, "head", "wing", "leftArm", "heart", "rightArm", null, "leftFoot", "rightFoot"];
const cueFor = { attack: "attack", guard: "guard", hit: "hit", break: "break", heart: "hit", brokenPartHit: "hit", clash: "guard" };
const effectFor = { guard: "🛡️", hit: "•", break: "💥", heart: "💥", brokenPartHit: "•", clash: "💥" };

export const $ = (selector) => document.querySelector(selector);

function element(tag, className, text = "") {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
}

function text(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function data(node, key, value) {
  const next = String(value);
  if (node.dataset[key] !== next) node.dataset[key] = next;
}

export function displayName(player, seat) {
  return player?.name || t("player", { p0: seat + 1 });
}

export function faceGlyph(player) {
  return FACES[player?.faceId] ?? "？";
}

export function renderPlayers(container, players, self, mode = "lobby") {
  if (!container.children.length) {
    for (let seat = 0; seat < 2; seat++) {
      const card = element("div", "player");
      card.dataset.seat = seat;
      const face = element("span", "player-face");
      const name = element("b", "player-name");
      name.dir = "auto";
      const meta = element("div", "player-meta");
      const you = document.createElement("span");
      you.dataset.you = "";
      const ready = document.createElement("span");
      ready.dataset.ready = "";
      meta.append(you, ready);
      card.append(face, name, meta);
      container.append(card);
    }
  }
  for (const [index, card] of [...container.children].entries()) {
    const player = players?.[index];
    data(card, "local", index === self);
    data(card, "present", Boolean(player));
    text(card.querySelector(".player-face"), player ? faceGlyph(player) : "—");
    text(card.querySelector(".player-name"), displayName(player, index));
    const you = card.querySelector("[data-you]");
    text(you, t("you"));
    you.hidden = index !== self;
    const ready = card.querySelector("[data-ready]");
    text(ready, t("ready"));
    ready.hidden = mode !== "lobby" || !player?.ready;
  }
}

function buildFighter(seat) {
  const root = element("div", "fighter");
  root.dataset.seat = seat;
  const name = element("div", "fighter-name");
  name.dir = "auto";
  const body = element("div", "body-grid");
  const parts = {};
  for (const part of cells) {
    const node = element("span", "part");
    if (part) {
      node.dataset.part = part;
      parts[part] = node;
    } else {
      node.setAttribute("aria-hidden", "true");
    }
    body.append(node);
  }
  root.append(name, body);
  return { root, name, parts };
}

function place(node, x, y) {
  const left = `${x}px`;
  const top = `${y}px`;
  if (node.style.left !== left) node.style.left = left;
  if (node.style.top !== top) node.style.top = top;
}

function renderFighter(drawing, player, opponent, simulationTimeMs, final) {
  const hidden = !player;
  if (drawing.root.hidden !== hidden) drawing.root.hidden = hidden;
  if (!player) return;
  const { root, name, parts } = drawing;
  const broken = key => player.parts?.[key]?.broken ?? false;
  const front = opponent?.x >= player.x ? "right" : "left";
  const back = front === "right" ? "left" : "right";

  if (!final) place(root, player.x, player.y);
  data(root, "posture", player.posture);
  data(root, "hit", !final && player.hitInvulnerableUntil > simulationTimeMs);
  text(name, displayName(player, player.seat));

  const shown = {
    head: broken("head") ? "💩" : faceGlyph(player),
    wing: "🪽",
    heart: "🫀",
    leftArm: broken("leftArm") ? "" : "💪",
    rightArm: broken("rightArm") ? "" : "💪",
    leftFoot: broken("leftFoot") ? "" : "🦵",
    rightFoot: broken("rightFoot") ? "" : "🦵"
  };
  const frontArm = `${front}Arm`;
  const backArm = `${back}Arm`;
  const backArmX = player.partPositions?.[backArm]?.x;
  const crouchingArmInFront = player.posture === "crouch" && broken("leftFoot") && broken("rightFoot") &&
    broken(frontArm) && !broken(backArm) && Number.isFinite(backArmX) && backArmX === player.partPositions[frontArm]?.x;
  const guarding = !final && Boolean(player.guardArm);
  if (guarding || crouchingArmInFront) {
    shown[backArm] = "";
    shown[frontArm] = "💪";
  }
  if (!final && !shown[`${front}Foot`] && shown[`${back}Foot`]) {
    shown[`${front}Foot`] = shown[`${back}Foot`];
    shown[`${back}Foot`] = "";
  }
  for (const [part, node] of Object.entries(parts)) {
    data(node, "broken", broken(part));
    if (player.parts?.[part]) data(node, "damage", player.parts[part].damage);
    data(node, "guard", guarding && part === frontArm);
    data(node, "front", !final && part === `${front}Foot`);
    text(node, shown[part]);
  }
}

export function createPhoto(container) {
  const fighters = [buildFighter(0), buildFighter(1)];
  container.append(...fighters.map(fighter => fighter.root));
  return {
    render(snapshot) {
      data(container, "matchId", snapshot?.matchId ?? "");
      data(container, "tick", snapshot?.tick ?? "");
      const players = snapshot?.players ?? [];
      fighters.forEach((fighter, index) => renderFighter(fighter, players[index], players[1 - index], snapshot?.simulationTimeMs, true));
    }
  };
}

export function createBoard(container) {
  const plane = element("div", "stage-plane");
  const floor = element("div", "ground");
  floor.setAttribute("aria-hidden", "true");
  const fighters = [buildFighter(0), buildFighter(1)];
  const projectiles = element("div", "projectiles");
  const effects = element("div", "effects");
  projectiles.setAttribute("aria-hidden", "true");
  effects.setAttribute("aria-hidden", "true");
  plane.append(floor, ...fighters.map(fighter => fighter.root), projectiles, effects);
  container.append(plane);
  let stage = DEFAULT_STAGE;

  function fit() {
    if (!container.clientWidth || !container.clientHeight) return;
    const visibleHeight = stage.height - stage.groundY + 130;
    const scale = Math.min(1.4, container.clientWidth / stage.width, container.clientHeight / visibleHeight);
    plane.style.setProperty("--scale", scale);
  }
  new ResizeObserver(fit).observe(container);

  function setStage(value) {
    stage = value;
    plane.style.width = `${stage.width}px`;
    plane.style.height = `${stage.height}px`;
    floor.style.top = `${stage.floorY}px`;
    fit();
  }
  setStage(stage);

  const fistNodes = new Map();
  function renderFists(fists = []) {
    const active = new Set();
    for (const fist of fists) {
      active.add(fist.id);
      let node = fistNodes.get(fist.id);
      if (!node) {
        node = element("span", "projectile", fist.dir > 0 ? "🤜" : "🤛");
        fistNodes.set(fist.id, node);
        projectiles.append(node);
      }
      place(node, fist.currentX, fist.y);
    }
    for (const [id, node] of fistNodes) {
      if (active.has(id)) continue;
      node.remove();
      fistNodes.delete(id);
    }
  }

  function render(snapshot) {
    const { players = [], simulationTimeMs } = snapshot ?? {};
    const nextStage = snapshot?.stage ?? DEFAULT_STAGE;
    if (Object.keys(nextStage).some(key => nextStage[key] !== stage[key])) setStage(nextStage);
    data(container, "matchId", snapshot?.matchId ?? "");
    data(container, "tick", snapshot?.tick ?? "");
    fighters.forEach((fighter, index) => renderFighter(fighter, players[index], players[1 - index], simulationTimeMs, false));
    renderFists(snapshot?.projectiles);
  }

  function playEvents(events) {
    for (const event of events) {
      const sound = cueFor[event.type];
      if (sound) window.SongenAudio.play(sound);
      const glyph = effectFor[event.type];
      if (!glyph || !Number.isFinite(event.x) || !Number.isFinite(event.y) || (event.type === "hit" && event.broken)) continue;
      const node = element("span", "hit-effect", glyph);
      place(node, event.x, event.y);
      effects.append(node);
      node.addEventListener("animationend", () => node.remove(), { once: true });
    }
  }

  return {
    render,
    playEvents,
    clearEffects() { effects.replaceChildren(); }
  };
}

export function timeLeft(snapshot) {
  return Math.max(0, Math.ceil(MATCH_DURATION_SEC - (snapshot?.tick ?? 0) / TICKS_PER_SECOND));
}

export function renderHud(snapshot, seat) {
  const score = snapshot?.statsBySeat?.[seat]?.score ?? 0;
  const stamina = snapshot?.players?.[seat]?.stamina ?? STAMINA_MAX;
  const full = Math.floor(stamina);
  const partial = stamina > full ? "◧" : "";
  text($("#battle-time"), String(timeLeft(snapshot)));
  text($("#battle-score"), score.toLocaleString(language));
  text($("#stamina-value"), stamina.toFixed(1));
  text($("#stamina-bar"), "■".repeat(full) + partial + "□".repeat(STAMINA_MAX - full - partial.length));
}
