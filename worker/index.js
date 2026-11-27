import {
  AUTH_TIMEOUT_MS,
  CODE_ALPHABET,
  MAX_PACKET_BYTES,
  VERSION,
  isKey,
  normalizeCode,
  parseMessage,
  parseRegistration,
} from '../game/protocol.js';
import { createMatchClock } from './clock.js';
import { RoomSession } from './room.js';
import { flushRankingEvents, queueRankingEvent, rankingReady, rankingsPublic, RANKING_PREFIX } from './ranking.js';

const encoder = new TextEncoder();
const persistedKey = 'room';
const SNAPSHOT_EVERY = 3;
const CHECKPOINT_EVERY = 60;
const MAX_PACKETS_PER_SECOND = 120;
const MAX_INPUTS_PER_SECOND = 90;
const RETRY_MS = 60_000;
let rankProbe;
const statusByError = { invalid: 400, version: 426, expired: 404, conflict: 409, full: 409,
  credentials: 403, rate_limit: 429, unavailable: 503 };

function reply(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function reject(code, headers) {
  return reply({ code }, statusByError[code] ?? 400, headers);
}

const encodeHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

async function digest(namespace, key) {
  return encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${namespace}:${key}`))));
}

async function deriveCode(secret, seatKey) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(seatKey)));
  return [...signed.slice(0, 12)].map(value => CODE_ALPHABET[value & 31]).join('');
}

async function readJSON(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(MAX_PACKET_BYTES);
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > MAX_PACKET_BYTES) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)));
  } catch {
    return null;
  }
}

function checkOrigin(request, env) {
  const origin = request.headers.get('Origin');
  return (env.ALLOWED_ORIGINS ?? '').split(',').map(entry => entry.trim()).includes(origin) ? origin : null;
}

function probeRanking(env) {
  const now = Date.now();
  if (!rankProbe || rankProbe.until <= now) {
    rankProbe = { until: now + 15_000, result: rankingReady(env) };
  }
  return rankProbe.result;
}

const canCreate = env => env.ACCEPT_NEW_ROOMS === 'true' && typeof env.ROOM_CODE_SECRET === 'string' &&
  env.ROOM_CODE_SECRET.length >= 32;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/v1/health' && request.method === 'GET') {
      const acceptingRooms = canCreate(env);
      const published = rankingsPublic(env);
      return reply({
        version: VERSION, acceptingRooms, rankingsPublic: published,
        rankingReady: published && await probeRanking(env),
      });
    }
    const origin = checkOrigin(request, env);
    if (!origin) return reject('credentials');
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const create = url.pathname === '/v1/rooms';
    const path = url.pathname.match(/^\/v1\/rooms\/([^/]{1,24})\/(join|leave|socket)$/);
    const code = path && normalizeCode(path[1]);
    if (!create && !code) return reject('expired', cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const socket = path?.[2] === 'socket';
    if (socket ? request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
      : request.method !== 'POST') return reject('invalid', cors);
    if (create && !canCreate(env)) return reject('unavailable', cors);
    const address = request.headers.get('CF-Connecting-IP') ?? 'local';
    const limiter = env.ENTRY_LIMIT.getByName(await digest('entry', address));
    const allowance = await limiter.fetch(`https://limit.internal/${socket ? 'socket' : 'registration'}`);
    if (!allowance.ok) return reject('rate_limit', cors);
    if (socket) {
      return env.MATCH_ROOMS.getByName(code).fetch(request);
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return reject('invalid', cors);
    }
    const body = await readJSON(request);
    if (path?.[2] === 'leave') {
      if (body?.version !== VERSION) return reject('version', cors);
      if (!isKey(body.seatKey)) return reject('invalid', cors);
      const response = await env.MATCH_ROOMS.getByName(code).fetch('https://room.internal/leave', {
        method: 'POST',
        body: JSON.stringify({ hash: await digest('seat', body.seatKey) }),
      });
      return reply(await response.json(), response.status, cors);
    }
    const parsed = parseRegistration(body);
    if (parsed.error) return reject(parsed.error, cors);
    const roomCode = create ? await deriveCode(env.ROOM_CODE_SECRET, parsed.seatKey) : code;
    const profile = {
      hash: await digest('seat', parsed.seatKey),
      name: parsed.name,
      faceId: parsed.faceId,
      playerId: parsed.name ? await digest('ranking', parsed.rankingKey) : null,
    };
    const response = await env.MATCH_ROOMS.getByName(roomCode).fetch(
      `https://room.internal/${create ? 'create' : 'join'}`,
      { method: 'POST', body: JSON.stringify({ code: roomCode, profile }) },
    );
    return reply(await response.json(), response.status, cors);
  },
};

export class EntryLimit {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const category = new URL(request.url).pathname;
    const limit = category === '/socket' ? 100 : 24;
    const now = Date.now();
    const handle = async transaction => {
      const bucket = await transaction.get(category);
      const current = bucket && bucket.until > now ? bucket : { until: now + 60_000, requests: 0 };
      if (current.requests >= limit) return false;
      current.requests += 1;
      await transaction.put(category, current);
      await transaction.setAlarm(now + 120_000);
      return true;
    };
    const allowed = await this.ctx.storage.transaction(handle);
    return reply({}, allowed ? 200 : 429);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export class MatchRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.serial = Promise.resolve();
    this.traffic = new WeakMap();
    this.pendingEvents = [];
    this.timerQueued = false;
    this.retryAt = null;
    this.timer = null;
    this.clock = createMatchClock({
      nowMs: Date.now,
      onTick: () => this.pendingEvents.push(...this.session.tick()),
      onLag: ticks => { this.peakLag = Math.max(this.peakLag, ticks); },
    });
    this.peakLag = 0;
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(persistedKey);
      this.session = new RoomSession(stored, { rankingsPublic: rankingsPublic(env) });
      if (rankingsPublic(env) && env.RANKING_API_KEY && (await ctx.storage.list({ prefix: RANKING_PREFIX, limit: 1 })).size) {
        this.retryAt = Date.now();
      }
      if (stored && ['playing', 'paused'].includes(this.session.phase)) {
        this.session.recover(Date.now());
        await this.commit();
        this.broadcastResult();
      }
    });
  }

  run(operation) {
    const completion = this.serial.then(operation);
    this.serial = completion.catch(() => {});
    return completion;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.run(async () => {
        await this.maintain(Date.now());
        if (this.ctx.getWebSockets('auth').filter(ws => !ws.deserializeAttachment().profile).length >= 8 ||
            this.ctx.getWebSockets().length >= 10) return reject('rate_limit');
        const { 0: client, 1: server } = new WebSocketPair();
        this.ctx.acceptWebSocket(server, ['auth']);
        const deadline = Date.now() + AUTH_TIMEOUT_MS;
        server.serializeAttachment({ deadline, profile: null });
        if (!this.session.data.code && !Object.keys(this.session.data.history).length) {
          this.drop(server, 'expired');
        } else {
          await this.schedule();
        }
        return new Response(null, { status: 101, webSocket: client });
      });
    }
    const { code, profile, hash } = await request.json();
    const action = new URL(request.url).pathname.slice(1);
    return this.run(async () => {
      const now = Date.now();
      await this.maintain(now);
      if (action === 'leave') {
        const before = this.session.phase;
        const seat = this.session.leaveByHash(hash, now);
        if (seat === null) return reject('credentials');
        if (seat === 0) this.closeCurrent('opponent_left', 1);
        this.closeCurrent('disconnected', seat);
        await this.transition(before, now);
        return reply({ left: true });
      }
      const result = this.session.register(action, code, profile, now);
      if (result.error) return reject(result.error);
      await this.commit();
      this.broadcastRoom();
      return reply(result);
    });
  }

  async webSocketMessage(ws, raw) {
    return this.run(async () => {
      const now = Date.now();
      const attachment = ws.deserializeAttachment();
      if (!attachment || attachment.closed) return;
      if (!this.admitPacket(ws, now)) {
        this.drop(ws, 'rate_limit');
        await this.onDisconnect(ws, now);
        return;
      }
      const message = parseMessage(raw);
      if (!attachment.profile) {
        await this.authenticate(ws, attachment, message, now);
        return;
      }
      if (message.error || message.type === 'auth') {
        this.send(ws, { type: 'error', code: message.error ?? 'invalid' });
        return;
      }
      const { seat, generation, historical } = attachment.profile;
      if (historical || generation !== message.generation) return;
      if (message.type === 'heartbeat') {
        this.session.heartbeat(seat, generation, message.matchId, now);
        await this.maintain(now);
        return;
      }
      await this.maintain(now);
      if (message.type === 'input') {
        if (this.traffic.get(ws).inputs++ >= MAX_INPUTS_PER_SECOND) return;
        this.session.acceptInput(seat, message, now);
        return;
      }
      let changed = false;
      const before = this.session.phase;
      switch (message.type) {
        case 'ready':
          changed = this.session.setReady(seat, generation, message.ready, now);
          break;
        case 'leave':
          changed = this.session.leave(seat, generation, now);
          if (changed && seat === 0) this.closeCurrent('opponent_left', 1);
          break;
        case 'suspend':
          if (message.matchId === this.session.matchId) {
            changed = this.session.disconnect(seat, generation, now);
            if (changed) {
              console.info('seat_disconnected', { reason: 'suspended' });
              this.drop(ws, 'disconnected');
            }
          }
          break;
        case 'forfeit':
          changed = this.session.forfeit(seat, generation, message.matchId, now);
          break;
        case 'returnToRoom':
          changed = this.session.returnToRoom(seat, generation, message.matchId, now);
          if (changed) this.detachGuest(message.matchId);
          else this.send(ws, { type: 'error', code: 'expired' });
          break;
      }
      if (changed) await this.transition(before, now);
    });
  }

  admitPacket(ws, now) {
    let current = this.traffic.get(ws);
    if (!current || now - current.start >= 1000) {
      current = { start: now, packets: 0, inputs: 0 };
      this.traffic.set(ws, current);
    }
    return ++current.packets <= MAX_PACKETS_PER_SECOND;
  }

  async authenticate(ws, attachment, message, now) {
    if (now >= attachment.deadline || message.type !== 'auth') {
      this.drop(ws, message.error ?? 'credentials');
      return;
    }
    const hash = await digest('seat', message.seatKey);
    await this.maintain(now);
    const profile = this.session.connect(hash, message.matchId, now);
    if (profile.error) {
      this.drop(ws, profile.error);
      return;
    }
    ws.serializeAttachment({ profile, historicalMatchId: profile.historical ? message.matchId : null });
    if (profile.historical) {
      this.send(ws, { ...this.session.result(message.matchId), seat: profile.seat });
      return;
    }
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) {
        const prior = other.deserializeAttachment()?.profile;
        if (prior?.seat === profile.seat && !prior.historical) this.drop(other, 'credentials');
      }
    }
    const before = this.session.phase;
    this.session.advancePresence(now);
    await this.transition(before, now);
    if (this.session.phase === 'finished') {
      this.send(ws, this.session.result(this.session.matchId));
    } else if (['playing', 'paused'].includes(this.session.phase) && before === this.session.phase) {
      this.send(ws, this.session.snapshot([]));
    }
  }

  detachGuest(matchId) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment?.profile?.seat !== 1 || attachment.profile.historical) continue;
      attachment.profile.historical = true;
      attachment.historicalMatchId = matchId;
      ws.serializeAttachment(attachment);
    }
  }

  webSocketClose(ws, code) {
    return this.run(async () => {
      try { ws.close(code === 1006 ? 1011 : code); } catch { /* already closed */ }
      await this.onDisconnect(ws, Date.now());
    });
  }

  webSocketError(ws) {
    return this.run(() => this.onDisconnect(ws, Date.now()));
  }

  async onDisconnect(ws, now) {
    const attachment = ws.deserializeAttachment();
    const profile = attachment?.profile;
    if (!profile || profile.historical) return;
    const before = this.session.phase;
    if (this.session.disconnect(profile.seat, profile.generation, now)) {
      if (['playing', 'paused'].includes(before)) console.info('seat_disconnected', { reason: 'closed' });
      await this.transition(before, now);
    }
  }

  async maintain(now) {
    const before = this.session.phase;
    const previouslyConnected = this.session.data.members.map(member => member?.seen != null);
    this.session.advancePresence(now);
    const timedOut = previouslyConnected.flatMap((connected, seat) => {
      return connected && this.session.data.members[seat]?.seen === null ? [seat] : [];
    });
    for (const seat of timedOut) {
      console.info('seat_disconnected', { reason: 'heartbeat_timeout' });
      this.closeCurrent('disconnected', seat);
    }
    if (this.session.phase === 'countdown' && now >= this.session.startAt) {
      this.session.start(crypto.randomUUID(), now);
    }
    if (this.session.phase !== before || timedOut.length) await this.transition(before, now);
  }

  async transition(before, now) {
    const phase = this.session.phase;
    if (phase === 'paused' && before === 'playing') this.clock.pause(now);
    if (phase === 'playing' && before === 'paused') this.clock.resume(now);
    if (phase === 'playing' && before === 'countdown') {
      this.peakLag = 0;
      this.lastSnapshotTick = 0;
      this.lastCheckpointTick = 0;
      this.pendingEvents = [];
      this.clock.start(now);
      console.info('match_started');
    }
    await this.commit();
    if (phase === 'finished' && before !== 'finished') {
      this.clock.stop();
      console.info('match_finished', { reason: this.session.result(this.session.matchId).reason, peakLagTicks: this.peakLag });
      this.broadcastResult();
    } else {
      this.broadcastRoom();
      if (phase !== before && ['paused', 'playing'].includes(phase)) {
        this.broadcast(this.session.snapshot(this.pendingEvents.splice(0)));
      }
    }
    if (phase === 'expired') this.closeCurrent();
    this.updateTimer();
  }

  updateTimer() {
    const active = ['countdown', 'playing', 'paused'].includes(this.session.phase);
    if (!active && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (active && this.timer === null) {
      this.timer = setInterval(() => {
        if (this.timerQueued) return;
        this.timerQueued = true;
        this.run(() => this.update()).catch(() => console.error('match_update_failed'))
          .finally(() => { this.timerQueued = false; });
      }, 1000 / 60);
    }
  }

  async update() {
    const now = Date.now();
    await this.maintain(now);
    if (this.session.phase !== 'playing') return;
    this.clock.update(now);
    const engine = this.session.data.engine;
    if (engine.final) {
      const resultEvents = this.pendingEvents.splice(0);
      this.session.finishOnce(this.session.matchId, engine.final.reason, engine.final.outcomeBySeat, now);
      this.session.result(this.session.matchId).events = resultEvents;
      await this.transition('playing', now);
      return;
    }
    if (engine.tick - this.lastSnapshotTick >= SNAPSHOT_EVERY) {
      this.lastSnapshotTick = engine.tick;
      this.broadcast(this.session.snapshot(this.pendingEvents.splice(0)));
    }
    if (engine.tick - this.lastCheckpointTick >= CHECKPOINT_EVERY) {
      this.lastCheckpointTick = engine.tick;
      await this.ctx.storage.put(persistedKey, this.session.data);
    }
  }

  async commit() {
    const events = [...this.session.events];
    const result = this.session.result(this.session.matchId);
    if (result?.rankingStatus === 'pending' && !events.length) {
      const unfinished = await this.ctx.storage.list({
        prefix: `${RANKING_PREFIX}${result.matchId}:`,
        limit: 1,
      });
      if (!unfinished.size) result.rankingStatus = 'sent';
    }
    const writes = { [persistedKey]: this.session.data };
    for (const event of events) {
      const [key, body] = queueRankingEvent(event);
      writes[key] = body;
    }
    try {
      await this.ctx.storage.put(writes);
    } catch {
      this.ctx.abort('Could not persist room state');
    }
    this.session.drainEvents();
    if (events.length && rankingsPublic(this.env) && this.env.RANKING_API_KEY) this.retryAt ??= Date.now();
    await this.schedule();
  }

  async schedule() {
    const data = this.session.data;
    const deadlines = Object.values(data.history).map(item => item.result.expiresAt);
    if (data.code && ['waiting', 'countdown'].includes(data.phase)) deadlines.push(data.expiresAt);
    if (this.retryAt !== null) deadlines.push(this.retryAt);
    for (const ws of this.ctx.getWebSockets('auth')) {
      const attachment = ws.deserializeAttachment();
      if (attachment?.deadline && !attachment.closed) deadlines.push(attachment.deadline);
    }
    if (!deadlines.length) {
      if (await this.ctx.storage.getAlarm() !== null) await this.ctx.storage.deleteAlarm();
      return;
    }
    const next = Math.min(...deadlines);
    if (await this.ctx.storage.getAlarm() !== next) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    const now = Date.now();
    const flush = await this.run(async () => {
      const phase = this.session.phase;
      const historyCount = Object.keys(this.session.data.history).length;
      this.session.prune(now);
      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment();
        if ((attachment?.deadline && attachment.deadline <= now && !attachment.closed) ||
            (attachment?.historicalMatchId && !this.session.result(attachment.historicalMatchId))) {
          this.drop(ws, 'expired');
        }
      }
      const pending = rankingsPublic(this.env) && this.env.RANKING_API_KEY &&
        (await this.ctx.storage.list({ prefix: RANKING_PREFIX, limit: 1 })).size > 0;
      const due = pending && (this.retryAt === null || this.retryAt <= now);
      this.retryAt = pending ? (due ? now + RETRY_MS : this.retryAt) : null;
      if (phase !== this.session.phase) {
        await this.transition(phase, now);
      } else if (historyCount !== Object.keys(this.session.data.history).length) {
        await this.commit();
      } else {
        await this.schedule();
      }
      return due;
    });
    if (flush) {
      await flushRankingEvents(this.ctx.storage, this.env);
      await this.run(() => this.refreshRanking());
    }
  }

  async refreshRanking() {
    const unsent = await this.ctx.storage.list({ prefix: RANKING_PREFIX });
    const matchIds = new Set([...unsent.values()].map(event => event.matchId));
    if (!unsent.size) this.retryAt = null;
    const changed = Object.values(this.session.data.history)
      .filter(({ result }) => result.rankingStatus === 'pending' && !matchIds.has(result.matchId));
    for (const { result } of changed) result.rankingStatus = 'sent';
    if (!changed.length) {
      await this.schedule();
      return;
    }
    await this.commit();
    for (const { result } of changed) {
      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment();
        if (attachment?.historicalMatchId === result.matchId ||
            (!attachment?.profile?.historical && this.session.matchId === result.matchId && attachment?.profile)) {
          this.send(ws, result);
        }
      }
    }
  }

  closeCurrent(code = 'expired', seat = null) {
    for (const ws of this.ctx.getWebSockets()) {
      const { profile, closed } = ws.deserializeAttachment() ?? {};
      if (!closed && !profile?.historical && (seat === null || profile?.seat === seat)) this.drop(ws, code);
    }
  }

  broadcastRoom() {
    for (const ws of this.ctx.getWebSockets()) {
      const { profile, closed } = ws.deserializeAttachment() ?? {};
      if (profile && !profile.historical && !closed) {
        this.send(ws, { ...this.session.roomPacket(profile.seat, profile.generation), serverNow: Date.now() });
      }
    }
  }

  broadcastResult() {
    this.broadcast(this.session.result(this.session.matchId));
  }

  broadcast(packet) {
    const raw = JSON.stringify(packet);
    for (const ws of this.ctx.getWebSockets()) {
      const { profile, closed } = ws.deserializeAttachment() ?? {};
      if (profile && !profile.historical && !closed) this.send(ws, raw);
    }
  }

  send(ws, packet) {
    try { ws.send(typeof packet === 'string' ? packet : JSON.stringify(packet)); } catch { /* connection closed */ }
  }

  drop(ws, code) {
    const attachment = ws.deserializeAttachment() ?? {};
    ws.serializeAttachment({ ...attachment, closed: true });
    this.send(ws, { type: 'error', code });
    try { ws.close(1008, code); } catch { /* already closed */ }
  }
}
