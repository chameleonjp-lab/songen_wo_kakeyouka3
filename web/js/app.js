import "./audio.js";
import { normalizeCode, isShortCode, emptyInput } from "../../game/protocol.js";
import { applyLanguage, language, languages, setLanguage, t } from "./i18n.js";
import { clearReservation, createMatchClient, leaveRoom, loadSession, readStorage, registerRoom, saveSession, writeStorage } from "./match-client.js";
import { $, FACES, createBoard, createPhoto, renderHud, renderPlayers, timeLeft } from "./view.js";
import { createKeyboardSettings } from "./keyboard.js";
import { createRoomList } from "./room-list.js";
import { dignityText, formatScore, outcomeText, showAnnouncement, showScore } from "./result-view.js";

const publicUrl = "https://chameleonjp-lab.github.io/songen_wo_kakeyouka3/";
const rankingUrl = "https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=songen_wo_kakeyouka3_online";
const rankingsPublic = import.meta.env.VITE_RANKINGS_PUBLIC === "true";
const joinCodeKey = "songen3_last_join_code";
const photoDelayMs = 2500;
const browserNameKey = "songen_player_name";
const faceKey = "songen3_selected_face";
const audio = window.SongenAudio;
const screens = [...document.querySelectorAll("[data-screen]")];
const gameBoard = createBoard($("#game-board"));
const finalBoard = createPhoto($("#final-board"));
const controlButtons = [...document.querySelectorAll("[data-control]")];
const { controlFor } = createKeyboardSettings();
const heldControls = new Map();
const holdInputs = new Set(["left", "right", "crouch"]);
let shown = "home";
let session = null;
let room = null;
let lastSnapshot = null;
let result = null;
let roomClockOffset = 0;
let warningSecond = null;
let connectStatus = "idle";
let selectedFace = Number(readStorage(faceKey) ?? 12);
let busy = false;
let readyPending = false;
let forfeitPending = false;
let returnPending = false;
let managePending = false;
let leaving = false;
let photoTimer;
let registerStatus = "";
let copyStatus = "";
let ownLobbyStatus = "";
let scoreStatus = "";
let gameError = "";
let registrationAttempt = 0;
let leaveRetryTimer = 0;

$("#home-ranking").href = rankingUrl;
$("#name-disclosure").hidden = !rankingsPublic;
if (!rankingsPublic) $("#player-name").removeAttribute("aria-describedby");
for (const [locale, name] of Object.entries(languages)) {
  const option = new Option(name, locale);
  option.lang = locale;
  $("#language").add(option);
}

const client = createMatchClient({
  onRoom,
  onSnapshot,
  onFinish,
  onConnection(next) {
    connectStatus = next;
    if (next !== "connected") {
      clearControls();
      readyPending = false;
      forfeitPending = false;
    }
    refreshDynamic();
  },
  onError: showError,
  onAck(detail) {
    window.dispatchEvent(new CustomEvent("songen:input-confirmed", { detail }));
  }
});

const ownsRoom = () => session?.owner ?? session?.seat === 0;
const canReturnToLobby = () => isShortCode(session?.code) || ownsRoom();
const roomList = createRoomList({
  screen: $('[data-screen="register"]'),
  ownCode: () => ownsRoom() ? session?.code : null,
  isJoining: () => busy,
  onJoin: code => register("join", code),
});

function showScreen(name) {
  if (shown === "game" && name !== "game") {
    clearControls();
    if ($("#forfeit-dialog").open) $("#forfeit-dialog").close();
  }
  const changed = shown !== name;
  if (changed && shown === "register") roomList.close();
  shown = name;
  clearTimeout(photoTimer);
  if (name === "announcement") {
    session.photoReadyAt ??= Date.now() + photoDelayMs;
    photoTimer = setTimeout(() => { $("#show-score").disabled = false; }, Math.max(0, session.photoReadyAt - Date.now()));
  }
  for (const screen of screens) screen.hidden = screen.dataset.screen !== name;
  if (session) {
    session.screen = name;
    saveSession(session);
  }
  if (changed) {
    window.scrollTo(0, 0);
    if (name === "register") void roomList.refresh();
  }
  refreshDynamic();
}

function setStatus(element, key, error = false) {
  const text = key ? t(key) : "";
  if (element.textContent !== text) element.textContent = text;
  element.dataset.error = error;
}

function shareLink(text) {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", text);
  return url.href;
}

function refreshAudioText() {
  const button = $("#sound-toggle");
  button.textContent = `${t("m115")} ${t(audio.enabled ? "m117" : "m118")}`;
  button.setAttribute("aria-pressed", String(audio.enabled));
  $("#sound-volume").value = audio.volume;
}

function refreshFaces() {
  for (const [faceId, button] of [...$("#face-grid").children].entries()) {
    button.setAttribute("aria-label", t("selectFace", { p0: faceId + 1 }));
    button.setAttribute("aria-pressed", String(faceId === selectedFace));
    button.disabled = busy || (session?.screen === "register" && ownsRoom());
  }
}

function refreshRegister() {
  const created = session?.screen === "register" && ownsRoom();
  $("#created-room").hidden = !created;
  $("#create-room").disabled = busy || created;
  $("#player-name").disabled = busy || created;
  $("#join-button").disabled = busy;
  refreshJoinField();
  if (created) {
    $("#invite-code").value = session.code;
  }
  setStatus($("#register-status"), registerStatus, Boolean(registerStatus && registerStatus !== "connecting"));
  setStatus($("#copy-status"), copyStatus, copyStatus === "copyFailed");
  refreshFaces();
  roomList.update();
}

function updateLobbyClock() {
  if (shown !== "lobby") return;
  const countdown = $("#countdown");
  countdown.hidden = room?.phase !== "countdown" || !client.connected;
  if (!countdown.hidden) {
    const seconds = Math.max(1, Math.min(3, Math.ceil((room.startAt - Date.now() - roomClockOffset) / 1000)));
    if (countdown.textContent !== String(seconds)) countdown.textContent = String(seconds);
  }
}

function refreshLobby() {
  const seat = session?.seat;
  $("#lobby-code").textContent = session?.code ?? "";
  renderPlayers($("#lobby-players"), room?.players, seat);
  let message = null;
  if (ownLobbyStatus) message = ownLobbyStatus;
  else if (connectStatus !== "connected") message = connectStatus === "reconnecting" ? "reconnecting" : "connecting";
  else if (room?.phase !== "countdown") message = room?.players[1 - seat] ? "waitingReady" : "waiting";
  setStatus($("#lobby-status"), message, Boolean(ownLobbyStatus));
  $("#reload-lobby").hidden = connectStatus !== "reconnecting" && !["network", "disconnected", "version"].includes(ownLobbyStatus);
  $("#ready").disabled = !client.connected || Boolean(readyPending || room?.players[seat]?.ready) || room?.phase !== "waiting";
  const manages = ownsRoom() && isShortCode(session?.code);
  const waiting = room?.phase === "waiting";
  $("#owner-actions").hidden = !manages;
  const canManage = waiting && !managePending && client.connected && Boolean(room?.players[1 - seat]);
  $("#swap-seats").disabled = !canManage;
  $("#kick-guest").disabled = !canManage;
  $("#lobby-home").hidden = !ownsRoom();
  $("#leave-lobby").hidden = ownsRoom();
  $("#leave-lobby").disabled = leaving || !client.connected || !["waiting", "countdown"].includes(room?.phase);
  updateLobbyClock();
}

function updateGameClock() {
  if (shown !== "game") return;
  const status = $("#battle-status");
  let text = "";
  if (connectStatus === "failed") {
    text = t(gameError || "network");
  } else if (room?.phase === "paused" && Number.isFinite(room.pauseDeadline)) {
    const seconds = Math.max(0, Math.ceil((room.pauseDeadline - Date.now() - roomClockOffset) / 1000));
    text = t("paused", { p0: seconds });
  } else if (connectStatus !== "connected") {
    text = t("reconnecting");
  }
  status.hidden = !text;
  if (status.textContent !== text) status.textContent = text;
}

function refreshGame() {
  renderPlayers($("#game-players"), lastSnapshot?.players ?? room?.players, session?.seat, "game");
  renderHud(lastSnapshot, session?.seat);
  for (const button of controlButtons) button.disabled = !client.canPlay || forfeitPending;
  $("#forfeit").disabled = !client.connected || forfeitPending || !room?.matchId;
  $("#forfeit").hidden = connectStatus === "failed";
  $("#disconnected-home").hidden = connectStatus !== "failed";
  updateGameClock();
}

function refreshDynamic() {
  if (shown === "register") refreshRegister();
  else if (shown === "lobby") refreshLobby();
  else if (shown === "game") refreshGame();
  else if (result && session && shown === "announcement") {
    showAnnouncement(result, session.seat, finalBoard);
    $("#show-score").disabled = Date.now() < session.photoReadyAt;
  }
  else if (result && session && shown === "score") {
    showScore(result, session.seat, canReturnToLobby(), rankingsPublic);
    setStatus($("#score-status"), scoreStatus, Boolean(scoreStatus && scoreStatus !== "connecting"));
    $("#return-to-room").disabled = returnPending;
  }
}

function refreshLanguage() {
  $("#language").value = language;
  refreshAudioText();
  $("#home-share").href = shareLink([t("title"), t("intro"), publicUrl].join("\n"));
  refreshDynamic();
  if (shown === "game") gameBoard.render(lastSnapshot);
}

function activateRoom() {
  if (!session) return;
  registerStatus = "";
  copyStatus = "";
  ownLobbyStatus = "";
  showScreen("lobby");
  client.open(session);
}

function refreshJoinField() {
  $("#clear-join-code").hidden = !$("#join-code").value;
  $("#clear-join-code").disabled = busy;
}

function saveJoinCode(value) {
  writeStorage(joinCodeKey, isShortCode(value) ? value : null);
}

function goHome({ target = "home", leave = true } = {}) {
  if (shown === "game" && connectStatus !== "failed") return;
  registrationAttempt++;
  if (busy) clearReservation();
  busy = false;
  const leavingRoom = leave && (shown === "lobby" || shown === "register");
  if (!client.close({ leave: leavingRoom }) && leavingRoom) leaveRoom(session).catch(() => {});
  session = null;
  room = null;
  lastSnapshot = null;
  result = null;
  connectStatus = "idle";
  gameError = "";
  readyPending = false;
  returnPending = false;
  saveSession(null);
  managePending = false;
  leaving = false;
  showScreen(target);
}

async function register(kind, listedCode) {
  if (busy || (kind === "create" && session?.code)) return;
  const code = kind === "join" ? normalizeCode(listedCode ?? $("#join-code").value) : undefined;
  if (kind === "join" && !code) {
    registerStatus = "invalidCode";
    refreshRegister();
    $("#join-code").focus();
    return;
  }
  if (kind === "join" && code === session?.code) {
    activateRoom();
    return;
  }
  const name = $("#player-name").value.trim();
  if (kind === "join" && !listedCode) saveJoinCode(code);
  const attempt = ++registrationAttempt;
  writeStorage(browserNameKey, name);
  busy = true;
  registerStatus = "connecting";
  refreshRegister();
  try {
    const reservation = await registerRoom(kind, { code, name, faceId: selectedFace });
    if (attempt !== registrationAttempt) {
      leaveRoom(reservation).catch(() => {});
      return;
    }
    registerStatus = "";
    if (session?.code && session.code !== reservation.code) leaveRoom(session).catch(() => {});
    session = reservation;
    saveSession(session);
    if (kind === "join") {
      $("#join-code").value = code;
      if (listedCode) saveJoinCode(code);
      activateRoom();
    } else refreshRegister();
  } catch (error) {
    if (attempt !== registrationAttempt) return;
    registerStatus = error instanceof TypeError || error.name === "AbortError" ? "network" : error.message;
    if (listedCode && ["full", "expired"].includes(registerStatus)) roomList.remove(listedCode);
  } finally {
    if (attempt === registrationAttempt) {
      busy = false;
      if (shown === "register") refreshRegister();
    }
  }
}

function onRoom(packet, previous) {
  room = packet;
  managePending = false;
  if (previous?.layout !== packet.layout) readyPending = false;
  gameError = "";
  roomClockOffset = (packet.serverNow ?? Date.now()) - Date.now();
  if (ownLobbyStatus !== "opponentLeft" || packet.players[1 - session.seat]) ownLobbyStatus = "";
  if (readyPending && packet.players[session.seat]?.ready) readyPending = false;
  if (["waiting", "countdown"].includes(packet.phase)) {
    if (previous?.players[1 - previous.seat] && !packet.players[1 - session.seat] && !returnPending) ownLobbyStatus = "opponentLeft";
    result = null;
    delete session.result;
    delete session.photoReadyAt;
    lastSnapshot = null;
    delete session.lastSnapshot;
    gameBoard.render(null);
    forfeitPending = false;
    returnPending = false;
    warningSecond = null;
    gameBoard.clearEffects();
    showScreen("lobby");
  }
  if (["playing", "paused"].includes(packet.phase)) {
    if (packet.phase !== "playing") clearControls();
    showScreen("game");
  }
}

function onSnapshot(packet, events) {
  const snapshot = packet.snapshot;
  if (!lastSnapshot && snapshot.tick === 0 && packet.phase === "playing") audio.play("start");
  if (shown !== "game") showScreen("game");
  lastSnapshot = snapshot;
  if (packet.phase !== "playing") clearControls();
  gameBoard.render(snapshot);
  gameBoard.playEvents(events);
  const seconds = timeLeft(snapshot);
  if (packet.phase === "playing" && seconds > 0 && seconds <= 10 && seconds !== warningSecond) {
    warningSecond = seconds;
    audio.play("warning");
  }
  refreshGame();
}

function onFinish(final, duplicate, events) {
  clearTimeout(leaveRetryTimer);
  const alreadyShown = Boolean(result) && result.matchId === final.matchId;
  if (!alreadyShown) delete session.photoReadyAt;
  result = final;
  session.result = final;
  saveSession(session);
  forfeitPending = false;
  const outcome = final.outcomeBySeat[session.seat];
  if (!duplicate && !alreadyShown) {
    gameBoard.playEvents(events);
    if (outcome === "win" || outcome === "loss") audio.play(outcome);
  }
  showScreen(shown === "score" ? "score" : "announcement");
}

function showError(code) {
  if (code === "kicked" && session && shown !== "game") {
    registerStatus = "kicked";
    goHome({ target: "register", leave: false });
    return;
  }
  managePending = false;
  const key = code === "opponent_left" ? "opponentLeft" : code;
  if (shown === "register") registerStatus = key;
  if (shown === "lobby") ownLobbyStatus = key;
  if (shown === "score") scoreStatus = key;
  if (shown === "game" && connectStatus === "failed") gameError = key;
  readyPending = false;
  forfeitPending = false;
  returnPending = Boolean(session?.returning);
  if (session) saveSession(session);
  refreshDynamic();
}

function activeControls() {
  return new Set(heldControls.values());
}

function dispatchControls(pressed) {
  const input = emptyInput();
  for (const control of activeControls()) {
    if (holdInputs.has(control)) input[control] = true;
  }
  if (pressed && !holdInputs.has(pressed)) input[pressed] = true;
  client.input(input);
}

function displayControls() {
  const active = activeControls();
  for (const button of controlButtons) button.dataset.pressed = active.has(button.dataset.control);
}

function beginControl(source, control) {
  if (!client.canPlay || forfeitPending || $("#forfeit-dialog").open || heldControls.has(source)) return;
  const alreadyPressed = activeControls().has(control);
  const pressedAt = performance.now();
  heldControls.set(source, control);
  displayControls();
  if (alreadyPressed) return;
  dispatchControls(control);
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("songen:input-drawn", {
    detail: { control, elapsedMs: performance.now() - pressedAt }
  })));
}

function endControl(source) {
  const control = heldControls.get(source);
  if (!heldControls.delete(source)) return;
  displayControls();
  if (holdInputs.has(control) && !activeControls().has(control)) dispatchControls();
}

function clearControls() {
  if (!heldControls.size) return;
  heldControls.clear();
  displayControls();
  dispatchControls();
}

for (const button of controlButtons) {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    audio.unlock();
    beginControl(event.pointerId, control);
    try { button.setPointerCapture(event.pointerId); } catch { /* Window-level release still applies. */ }
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(event, event => endControl(event.pointerId));
  }
  button.addEventListener("contextmenu", event => event.preventDefault());
  button.addEventListener("click", event => {
    if (event.detail !== 0) return;
    audio.unlock();
    beginControl(button, control);
    if (heldControls.has(button)) setTimeout(() => endControl(button), 65);
  });
}
for (const event of ["pointerup", "pointercancel"]) {
  window.addEventListener(event, event => endControl(event.pointerId));
}
window.addEventListener("blur", clearControls);
window.addEventListener("keydown", event => {
  const control = controlFor(event.code);
  if (shown !== "game" || !control || $("#forfeit-dialog").open || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  if (event.repeat) return;
  audio.unlock();
  beginControl(event.code, control);
});
window.addEventListener("keyup", event => endControl(event.code));
window.addEventListener("pagehide", () => {
  if (session && shown === "game" && lastSnapshot) {
    session.lastSnapshot = lastSnapshot;
    saveSession(session);
  }
});

for (const [faceId, face] of FACES.entries()) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.faceId = faceId;
  button.textContent = face;
  button.addEventListener("click", () => {
    audio.unlock();
    audio.play("select");
    selectedFace = faceId;
    writeStorage(faceKey, String(faceId));
    refreshFaces();
  });
  $("#face-grid").append(button);
}
if (!FACES[selectedFace]) selectedFace = 12;
$("#player-name").value = readStorage(browserNameKey) ?? "";
$("#language").addEventListener("change", event => {
  setLanguage(event.target.value);
  refreshLanguage();
});
$("#sound-toggle").addEventListener("click", () => {
  audio.setEnabled(!audio.enabled);
  refreshAudioText();
});
$("#sound-volume").addEventListener("input", event => audio.setVolume(event.target.value));
$("#prepare").addEventListener("click", () => {
  audio.unlock();
  audio.play("select");
  registerStatus = "";
  showScreen("register");
});
for (const button of document.querySelectorAll("[data-home]")) button.addEventListener("click", () => goHome());
$("#profile-form").addEventListener("submit", event => {
  event.preventDefault();
  $("#face-grid button[aria-pressed='true']")?.focus();
});
$("#create-room").addEventListener("click", () => register("create"));
$("#join-room").addEventListener("submit", event => {
  event.preventDefault();
  register("join");
});
$("#join-code").addEventListener("input", event => {
  const field = event.currentTarget;
  field.value = field.value.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10))
    .replace(/[^0-9]/g, "").slice(0, 4);
  saveJoinCode(field.value);
  refreshJoinField();
});
$("#clear-join-code").addEventListener("click", () => {
  $("#join-code").value = "";
  saveJoinCode(null);
  clearReservation();
  registerStatus = "";
  refreshRegister();
  $("#join-code").focus();
});
$("#enter-lobby").addEventListener("click", activateRoom);
$("#copy-room").addEventListener("click", async () => {
  if (!session) return;
  try {
    await navigator.clipboard.writeText(session.code);
    copyStatus = "copied";
  } catch {
    const input = $("#invite-code");
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    copyStatus = "copyFailed";
  }
  refreshRegister();
});
$("#invite-code").addEventListener("click", event => event.currentTarget.select());
$("#invite-share").addEventListener("click", () => {
  if (!session?.code || !ownsRoom()) return;
  const invite = new URL(publicUrl);
  invite.hash = new URLSearchParams({ room: session.code }).toString();
  window.location.assign(shareLink([
    "私と尊厳を賭けようよ！", `ルームID：${session.code}`, "#尊厳を賭けようか3", invite.href
  ].join("\n")));
});
$("#score-share").addEventListener("click", () => {
  if (!result || !session) return;
  const seat = session.seat;
  const caption = dignityText(result, seat);
  window.location.assign(shareLink(t("scoreText", {
    p0: t("title"), p1: outcomeText(result, seat), p2: formatScore(result.scoreBySeat[seat]),
    p3: publicUrl, p4: caption ? caption + "\n" : "",
  })));
});
$("#reload-lobby").addEventListener("click", () => {
  saveSession(session);
  window.location.reload();
});
$("#ready").addEventListener("click", () => {
  audio.unlock();
  ownLobbyStatus = "";
  readyPending = client.ready();
  refreshLobby();
});

for (const [selector, type] of [["#swap-seats", "swapSeats"], ["#kick-guest", "kickGuest"]]) {
  $(selector).addEventListener("click", () => {
    managePending = client.manage(type);
    refreshLobby();
  });
}

$("#leave-lobby").addEventListener("click", async () => {
  if (!session || ownsRoom() || leaving) return;
  const reservation = session;
  leaving = true;
  refreshLobby();
  try {
    await leaveRoom(reservation);
    if (session !== reservation || shown !== "lobby") return;
    registerStatus = "";
    goHome({ target: "register", leave: false });
  } catch {
    if (session === reservation) {
      leaving = false;
      ownLobbyStatus = "network";
      refreshLobby();
    }
  }
});

$("#forfeit").addEventListener("click", () => {
  clearControls();
  $("#forfeit-dialog").showModal();
});
$("#cancel-forfeit").addEventListener("click", () => $("#forfeit-dialog").close());
$("#confirm-forfeit").addEventListener("click", () => {
  $("#forfeit-dialog").close();
  forfeitPending = client.forfeit();
  if (forfeitPending) {
    clearTimeout(leaveRetryTimer);
    leaveRetryTimer = setTimeout(() => {
      forfeitPending = false;
      if (shown === "game") refreshGame();
    }, 3000);
  }
  refreshGame();
});
$("#show-score").addEventListener("click", () => {
  if ($("#show-score").disabled || shown !== "announcement") return;
  scoreStatus = "";
  showScreen("score");
});
$("#return-to-room").addEventListener("click", () => {
  if (!canReturnToLobby() || !result) return;
  if (Number.isFinite(result.expiresAt) && result.expiresAt <= Date.now() + roomClockOffset) {
    scoreStatus = "expired";
  } else {
    returnPending = client.returnToRoom();
    scoreStatus = returnPending ? "connecting" : "network";
  }
  saveSession(session);
  refreshDynamic();
});

function invitedCode() {
  return normalizeCode(new URLSearchParams(location.hash.slice(1)).get("room"));
}

function consumeInvite(code) {
  $("#join-code").value = code;
  saveJoinCode(code);
  refreshJoinField();
  history.replaceState(null, "", location.pathname + location.search);
}

function keepsSeat(reservation, invite) {
  if (!invite || (reservation.screen === "game" && !reservation.result)) return true;
  return reservation.code === invite && ((reservation.owner ?? reservation.seat === 0) || !reservation.result);
}

window.addEventListener("hashchange", () => {
  const code = invitedCode();
  if (!code) return;
  if (session && keepsSeat(session, code)) {
    consumeInvite(code);
    return;
  }
  goHome();
  consumeInvite(code);
  showScreen("register");
});

function start() {
  $("#join-code").value = normalizeCode(readStorage(joinCodeKey)) ?? "";
  applyLanguage();
  refreshLanguage();
  const invite = invitedCode();
  const saved = loadSession();
  if (invite) consumeInvite(invite);
  if (saved && keepsSeat(saved, invite)) {
    session = saved;
    result = saved.result ?? null;
    lastSnapshot = saved.lastSnapshot ?? null;
    if (lastSnapshot) gameBoard.render(lastSnapshot);
    if (result) showScreen(saved.screen === "score" ? "score" : "announcement");
    else if (saved.screen === "register") showScreen("register");
    else showScreen(saved.screen === "game" ? "game" : "lobby");
    if (saved.screen !== "register") client.open(saved);
  } else if (invite) {
    if (saved && ["register", "lobby"].includes(saved.screen)) leaveRoom(saved).catch(() => {});
    saveSession(null);
    showScreen("register");
  }
}

setInterval(() => {
  updateLobbyClock();
  updateGameClock();
}, 150);
start();
