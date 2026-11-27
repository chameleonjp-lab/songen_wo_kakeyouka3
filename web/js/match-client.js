import {
  AUTH_TIMEOUT_MS, HEARTBEAT_TIMEOUT_MS, PAUSE_BUDGET_MS, RESULT_LIFETIME_MS, ROOM_CODE_DIGITS, VERSION,
  isKey, isShortCode, normalizeCode
} from "../../game/protocol.js";

const SESSION_STORAGE_KEY = "songen3_active_room";
const RESERVATION_STORAGE_KEY = "songen3_room_request";
const RANKING_STORAGE_KEY = "songen3_ranking_key";
const heartbeatInterval = 1000;
const lobbyReconnectMs = 15000;
const matchPhases = new Set(["playing", "paused"]);
const fatalErrors = new Set(["expired", "credentials", "version", "opponent_left", "kicked"]);
const endpoint = import.meta.env.VITE_MATCH_SERVER_URL?.trim() ||
  (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

export function readStorage(key, storageName = "localStorage") {
  try { return window[storageName].getItem(key); } catch { return null; }
}

export function writeStorage(key, value, storageName = "localStorage") {
  try {
    if (value == null) window[storageName].removeItem(key);
    else window[storageName].setItem(key, value);
  } catch { /* The current page can still play. */ }
}

function readSessionObject(key) {
  try { return JSON.parse(readStorage(key, "sessionStorage")); } catch { return null; }
}

function saveSessionObject(key, value) {
  writeStorage(key, value == null ? null : JSON.stringify(value), "sessionStorage");
}

function newKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

let rankingKey;
function getRankingKey() {
  if (rankingKey) return rankingKey;
  const saved = readStorage(RANKING_STORAGE_KEY);
  rankingKey = isKey(saved) ? saved : newKey();
  writeStorage(RANKING_STORAGE_KEY, rankingKey);
  return rankingKey;
}

let lastReservation;
function registrationKey(route) {
  const existing = lastReservation ?? readSessionObject(RESERVATION_STORAGE_KEY);
  if (existing?.route === route && isKey(existing.seatKey)) return existing.seatKey;
  lastReservation = { route, seatKey: newKey() };
  saveSessionObject(RESERVATION_STORAGE_KEY, lastReservation);
  return lastReservation.seatKey;
}

export function clearReservation() {
  lastReservation = null;
  saveSessionObject(RESERVATION_STORAGE_KEY, null);
}

function serverUrl(path) {
  if (!endpoint) throw new Error("unavailable");
  return new URL(path, endpoint);
}

export async function registerRoom(kind, { code, name, faceId }) {
  const route = kind === "create" ? "/v1/rooms" : `/v1/rooms/${code}/join`;
  const url = serverUrl(route);
  const seatKey = registrationKey(route);
  const body = { seatKey, name, faceId, version: VERSION };
  if (kind === "create") body.roomCodeDigits = ROOM_CODE_DIGITS;
  if (name) body.rankingKey = getRankingKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const room = await response.json().catch(() => null);
    if (!response.ok || !normalizeCode(room?.code) || ![0, 1].includes(room?.seat)) {
      const reason = room?.code ?? "network";
      if (reason === "conflict" || reason === "expired") clearReservation();
      throw new Error(reason);
    }
    if (kind === "create" && !isShortCode(room.code)) {
      leaveRoom({ ...room, seatKey }).catch(() => {});
      clearReservation();
      throw new Error("version");
    }
    clearReservation();
    return { ...room, owner: room.owner ?? kind === "create", seatKey, matchId: null, screen: kind === "create" ? "register" : "lobby" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function leaveRoom(reservation) {
  if (!endpoint || !reservation) return;
  const url = serverUrl(`/v1/rooms/${reservation.code}/leave`);
  const body = JSON.stringify({ seatKey: reservation.seatKey, version: VERSION });
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("network");
}

export function loadSession() {
  const session = readSessionObject(SESSION_STORAGE_KEY);
  if (!normalizeCode(session?.code) || !isKey(session.seatKey)) return null;
  return session;
}

export function saveSession(session) {
  saveSessionObject(SESSION_STORAGE_KEY, session);
}

export function createMatchClient({ onRoom, onSnapshot, onFinish, onConnection, onError, onAck }) {
  let session;
  let socket;
  let room;
  let finished;
  let freshestTick = -1;
  let seq = 0;
  let lastAck = 0;
  let lastSnapshotAt = 0;
  let freshSnapshot = false;
  let disconnectedAt = 0;
  let generation = 0;
  let retryDelay = 180;
  let retryTimer;
  let authenticationTimer;
  let pulse;
  let active = false;
  let connection = "idle";
  let returned = false;
  let returnSentGeneration = 0;
  const pendingInputs = new Map();
  const eventIds = new Set();

  function updateConnection(next) {
    if (next === connection) return;
    connection = next;
    onConnection(next);
  }

  function resetMatch() {
    finished = null;
    freshestTick = -1;
    freshSnapshot = false;
    seq = 0;
    lastAck = 0;
    pendingInputs.clear();
    eventIds.clear();
  }

  function disconnect() {
    clearTimeout(retryTimer);
    clearTimeout(authenticationTimer);
    clearInterval(pulse);
    const previous = socket;
    socket = null;
    generation = 0;
    freshSnapshot = false;
    pendingInputs.clear();
    if (previous?.readyState < WebSocket.CLOSING) previous.close();
  }

  function sendRaw(packet) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(packet));
      return true;
    } catch {
      return false;
    }
  }

  function send(type, fields = {}) {
    if (!generation) return false;
    return sendRaw({ type, generation, ...fields });
  }

  function filterEvents(events = []) {
    return events.filter(event => {
      if (eventIds.has(event.id)) return false;
      eventIds.add(event.id);
      return true;
    });
  }

  function ack(value) {
    if (!Number.isSafeInteger(value) || value <= lastAck) return;
    lastAck = value;
    for (const [number, sentAt] of pendingInputs) {
      if (number > value) break;
      onAck({ seq: number, elapsedMs: performance.now() - sentAt, tick: freshestTick, matchId: room?.matchId });
      pendingInputs.delete(number);
    }
  }

  function handleRoom(packet) {
    if (![0, 1].includes(packet.seat) || packet.code !== session.code || !Number.isSafeInteger(packet.generation)) return;
    if (generation && generation !== packet.generation) return;
    if (!generation) {
      clearTimeout(authenticationTimer);
      generation = packet.generation;
      seq = 0;
      lastAck = 0;
      lastSnapshotAt = performance.now();
      retryDelay = 180;
      disconnectedAt = 0;
    }
    if (room?.matchId && packet.matchId !== room.matchId && packet.phase === "waiting" && !returned) return;
    if (packet.matchId && packet.matchId !== session.matchId) {
      if (session.matchId && !returned) return;
      resetMatch();
      session.matchId = packet.matchId;
    }
    if (packet.phase === "waiting" && returned) {
      resetMatch();
      session.matchId = null;
      session.returning = false;
      returned = false;
      returnSentGeneration = 0;
    }
    session.seat = packet.seat;
    session.owner = packet.owner ?? session.owner ?? packet.seat === 0;
    if (packet.expiresAt) session.expiresAt = packet.expiresAt;
    if (packet.phase === "expired") {
      if (!finished) fail("expired");
      return;
    }
    const previousRoom = room;
    room = packet;
    updateConnection("connected");
    onRoom(packet, previousRoom);
    if (returned && packet.phase === "finished") sendReturn();
  }

  function handleSnapshot(packet) {
    const state = packet.snapshot;
    if (!room?.matchId || room.matchId !== packet.matchId || state?.matchId !== packet.matchId || finished ||
        !Number.isSafeInteger(state.tick) || state.tick < freshestTick) return;
    freshestTick = state.tick;
    freshSnapshot = true;
    lastSnapshotAt = performance.now();
    room.phase = packet.phase;
    room.pauseDeadline = packet.pauseDeadline;
    ack(packet.acks?.[session.seat]);
    onSnapshot(packet, filterEvents(packet.events));
  }

  function handleFinish(packet) {
    if (packet.matchId !== (room?.matchId ?? session.matchId) ||
        packet.finalSnapshot?.matchId !== packet.matchId ||
        (packet.reason !== "interrupted" && packet.finalSnapshot.tick < freshestTick)) return;
    if (packet.seat != null && packet.seat !== session.seat) return;
    clearTimeout(authenticationTimer);
    disconnectedAt = 0;
    freshSnapshot = false;
    pendingInputs.clear();
    if (room) room.phase = "finished";
    const duplicate = Boolean(finished);
    if (!duplicate) finished = packet;
    else if (finished.rankingStatus !== "sent") finished = { ...finished, rankingStatus: packet.rankingStatus };
    session.expiresAt = packet.expiresAt;
    updateConnection("connected");
    onFinish(finished, duplicate, filterEvents(packet.events));
  }

  function sendReturn() {
    if (generation && generation !== returnSentGeneration && send("returnToRoom", { matchId: session.matchId })) {
      returnSentGeneration = generation;
      return true;
    }
    return false;
  }

  function fail(code, terminal = false) {
    if ((terminal || !endpoint || fatalErrors.has(code)) && !(code === "expired" && returned && finished)) {
      active = false;
      disconnect();
      updateConnection("failed");
    }
    if (returned && (terminal || !["network", "disconnected"].includes(code))) {
      returned = false;
      returnSentGeneration = 0;
      session.returning = false;
    }
    onError(code);
  }

  function heartbeat() {
    if (!generation || !room || document.hidden) return;
    if (room.phase === "playing" && performance.now() - lastSnapshotAt >= HEARTBEAT_TIMEOUT_MS) {
      suspend();
      return;
    }
    send("heartbeat", { matchId: room.matchId });
  }

  function scheduleReconnect() {
    if (!endpoint || !active || document.hidden) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(1500, retryDelay * 1.6);
  }

  function suspend() {
    if (room && matchPhases.has(room.phase) && room.matchId) {
      send("suspend", { matchId: room.matchId });
    }
    disconnect();
    if (active) {
      disconnectedAt ||= Date.now();
      updateConnection("reconnecting");
      scheduleReconnect();
    }
  }

  function connect() {
    if (!active || socket || document.hidden) return;
    if (disconnectedAt) {
      const elapsed = Date.now() - disconnectedAt;
      const recoveringMatch = session.matchId && session.screen !== "score" && session.screen !== "announcement";
      const budget = recoveringMatch ? PAUSE_BUDGET_MS + RESULT_LIFETIME_MS : lobbyReconnectMs;
      if (elapsed >= budget) {
        fail(recoveringMatch ? "expired" : "network", true);
        return;
      }
    }
    if (!navigator.onLine) {
      updateConnection("reconnecting");
      scheduleReconnect();
      return;
    }
    let current;
    try {
      const url = serverUrl(`/v1/rooms/${session.code}/socket`);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      current = new WebSocket(url);
    } catch {
      fail(endpoint ? "network" : "unavailable");
      scheduleReconnect();
      return;
    }
    socket = current;
    if (connection === "idle") updateConnection("connecting");
    authenticationTimer = setTimeout(() => {
      if (current !== socket) return;
      disconnect();
      disconnectedAt ||= Date.now();
      updateConnection("reconnecting");
      onError("network");
      scheduleReconnect();
    }, AUTH_TIMEOUT_MS + 1000);
    current.addEventListener("open", () => {
      if (current !== socket) return;
      const matchId = returned ? null : session.matchId;
      sendRaw({ type: "auth", seatKey: session.seatKey, version: VERSION, matchId });
    });
    current.addEventListener("message", event => {
      if (current !== socket) return;
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (packet?.type === "room") handleRoom(packet);
      else if (packet?.type === "snapshot") handleSnapshot(packet);
      else if (packet?.type === "finished") handleFinish(packet);
      else if (packet?.type === "error") fail(packet.code);
    });
    current.addEventListener("close", () => {
      if (current !== socket) return;
      const hadConnection = connection === "connected";
      disconnect();
      disconnectedAt ||= Date.now();
      updateConnection("reconnecting");
      if (!hadConnection && !room && !finished) onError("network");
      scheduleReconnect();
    });
    pulse = setInterval(heartbeat, heartbeatInterval);
  }

  document.addEventListener("visibilitychange", () => document.hidden ? suspend() : connect());
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", connect);
  window.addEventListener("offline", suspend);
  window.addEventListener("online", connect);

  return {
    open(reservation) {
      disconnect();
      room = null;
      resetMatch();
      session = reservation;
      active = true;
      returned = Boolean(reservation.returning);
      returnSentGeneration = 0;
      disconnectedAt = Date.now();
      retryDelay = 180;
      connection = "idle";
      connect();
    },
    close({ leave = false } = {}) {
      const sent = leave && send("leave");
      active = false;
      disconnect();
      room = null;
      resetMatch();
      updateConnection("idle");
      return sent;
    },
    ready() { return send("ready", { ready: true, layout: room?.layout }); },
    manage(type) { return send(type, { layout: room?.layout }); },
    get canPlay() { return connection === "connected" && freshSnapshot && room?.phase === "playing"; },
    get connected() { return connection === "connected"; },
    input(input) {
      if (!this.canPlay) return false;
      const number = ++seq;
      const sentAt = performance.now();
      if (!send("input", { matchId: room.matchId, seq: number, input })) return false;
      pendingInputs.set(number, sentAt);
      if (pendingInputs.size > 256) pendingInputs.delete(pendingInputs.keys().next().value);
      return true;
    },
    forfeit() {
      return Boolean(room?.matchId && send("forfeit", { matchId: room.matchId }));
    },
    returnToRoom() {
      if (!session.matchId) return false;
      returned = true;
      session.returning = true;
      active = true;
      if (sendReturn()) return true;
      disconnectedAt = Date.now();
      if (socket) disconnect();
      connect();
      return true;
    }
  };
}
