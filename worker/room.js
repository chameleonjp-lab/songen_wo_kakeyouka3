import {
  COUNTDOWN_MS,
  HEARTBEAT_TIMEOUT_MS,
  INVITE_LIFETIME_MS,
  PAUSE_BUDGET_MS,
  RESULT_LIFETIME_MS,
  emptyInput,
  isShortCode,
} from '../game/protocol.js';
import { createMatch, resolveMatch, stepMatch, toSnapshot } from '../game/rules.js';

const edges = ['jumpPressed', 'attackPressed', 'guardPressed'];
const seats = [0, 1];
const JOIN_CONFIRMATION_MS = 30_000;
const LOBBY_HEARTBEAT_TIMEOUT_MS = 15_000;

function initialData() {
  return {
    code: null,
    ownerHash: null,
    layout: 0,
    returningFrom: null,
    phase: 'waiting',
    expiresAt: 0,
    startAt: null,
    startedAt: null,
    rankMatch: false,
    matchId: null,
    members: [null, null],
    generations: [0, 0],
    engine: null,
    history: {},
    pauseDeadline: null,
    pauseRemaining: PAUSE_BUDGET_MS,
  };
}

function makeControl() {
  return { latest: emptyInput(), pending: emptyInput(), received: 0, ack: 0 };
}

function newMember(profile) {
  return { ...profile, seen: null, ready: false, previousMatch: null };
}

export class RoomSession {
  constructor(data = initialData(), { rankingsPublic = false } = {}) {
    this.data = data;
    this.data.ownerHash ??= data.members[0]?.hash ?? null;
    this.data.layout ??= 0;
    // Reopened rooms written by older versions did not store the previous match per seat.
    if (data.phase === 'waiting' && data.returningFrom) {
      const saved = data.history[data.returningFrom];
      for (const member of data.members) {
        if (member && member.previousMatch === undefined && (!saved || saved.memberHashes.includes(member.hash))) {
          member.previousMatch = data.returningFrom;
        }
      }
    }
    this.rankingsPublic = rankingsPublic;
    this.controls = [makeControl(), makeControl()];
    this.events = [];
  }

  get phase() { return this.data.phase; }
  get startAt() { return this.data.startAt; }
  get pauseDeadline() { return this.data.pauseDeadline; }
  get matchId() { return this.data.matchId; }

  publicPlayers() {
    return this.data.members.map(member => member && {
      name: member.name,
      faceId: member.faceId,
      ready: member.ready,
      connected: member.seen !== null,
    });
  }

  register(action, code, profile, now) {
    if (this.isLobbyExpired(now)) this.expire();
    if (this.phase === 'expired' && (!isShortCode(code) || action !== 'create')) return { error: 'expired' };
    if (!this.data.code) {
      if (action !== 'create') return { error: 'expired' };
      this.data.phase = 'waiting';
      this.data.code = code;
      this.data.expiresAt = now + INVITE_LIFETIME_MS;
      this.data.ownerHash = profile.hash;
      this.data.members[0] = newMember(profile);
      this.data.layout++;
      return this.registration(0);
    }
    const seat = this.seatFor(profile.hash);
    if (action === 'create') {
      return this.isOwner(seat) ? this.registration(seat) : { error: 'conflict' };
    }
    if (seat >= 0) return this.isOwner(seat) ? { error: 'credentials' } : this.registration(seat);
    const openSeat = this.data.members.indexOf(null);
    if (openSeat < 0 || this.phase !== 'waiting') return { error: 'full' };
    this.data.members[openSeat] = { ...newMember(profile), joinDeadline: now + JOIN_CONFIRMATION_MS };
    this.data.layout++;
    return this.registration(openSeat);
  }

  seatFor(hash) {
    if (!hash) return -1;
    return this.data.members.findIndex(member => member?.hash === hash);
  }

  isOwner(seat) {
    return Boolean(this.data.ownerHash) && this.data.members[seat]?.hash === this.data.ownerHash;
  }

  registration(seat) {
    return { code: this.data.code, seat, owner: this.isOwner(seat), expiresAt: this.data.expiresAt };
  }

  connect(hash, requestedMatch, now) {
    const seat = this.seatFor(hash);
    if (requestedMatch && (this.matchId !== requestedMatch || seat < 0)) {
      const item = this.data.history[requestedMatch];
      const resultSeat = item?.memberHashes.indexOf(hash) ?? -1;
      if (resultSeat >= 0 && item.result.expiresAt > now) {
        return { seat: resultSeat, generation: null, historical: true };
      }
      return { error: 'expired' };
    }
    if (this.phase === 'expired' || this.isLobbyExpired(now) ||
        (this.phase === 'finished' && this.result(this.matchId).expiresAt <= now)) {
      return { error: 'expired' };
    }
    if (seat < 0) return { error: this.data.code ? 'credentials' : 'expired' };
    const generation = ++this.data.generations[seat];
    delete this.data.members[seat].joinDeadline;
    this.data.members[seat].seen = now;
    this.controls[seat] = makeControl();
    return { seat, generation };
  }

  isCurrent(seat, generation) {
    return this.data.members[seat]?.seen != null && this.data.generations[seat] === generation;
  }

  isLobbyExpired(now) {
    return this.data.code !== null && ['waiting', 'countdown'].includes(this.phase) && now >= this.data.expiresAt;
  }

  roomPacket(seat, generation) {
    const result = this.result(this.matchId);
    return {
      type: 'room',
      code: this.data.code,
      seat,
      generation,
      owner: this.isOwner(seat),
      layout: this.data.layout,
      phase: this.phase,
      players: this.publicPlayers(),
      startAt: this.startAt,
      expiresAt: result?.expiresAt ?? this.data.expiresAt,
      matchId: this.matchId,
      pauseDeadline: this.pauseDeadline,
    };
  }

  heartbeat(seat, generation, matchId, now) {
    if (!this.isCurrent(seat, generation)) return false;
    const readingResult = this.phase === 'waiting' && matchId && this.data.members[seat].previousMatch === matchId;
    if (this.matchId !== matchId && !readingResult) return false;
    if (matchId && matchId === this.matchId) this.data.members[seat].confirmedMatchId = matchId;
    this.data.members[seat].seen = now;
    return true;
  }

  setReady(seat, generation, ready, now, layout) {
    if (layout !== undefined && layout !== this.data.layout) return false;
    if (!this.isCurrent(seat, generation) || !['waiting', 'countdown'].includes(this.phase)) return false;
    this.data.members[seat].ready = ready;
    if (this.data.members.every(member => member?.seen != null && member.ready)) {
      if (this.phase === 'waiting') {
        this.data.phase = 'countdown';
        this.data.startAt = now + COUNTDOWN_MS;
      }
    } else {
      this.cancelCountdown();
    }
    return true;
  }

  cancelCountdown() {
    if (this.phase !== 'countdown') return;
    this.data.phase = 'waiting';
    this.data.startAt = null;
  }

  clearInput(seat) {
    const control = this.controls[seat];
    control.latest = emptyInput();
    control.pending = emptyInput();
    control.ack = control.received;
  }

  disconnect(seat, generation, now) {
    if (!this.isCurrent(seat, generation)) return false;
    this.data.members[seat].seen = null;
    this.data.members[seat].ready = false;
    this.clearInput(seat);
    this.cancelCountdown();
    if (this.phase === 'playing') {
      this.data.phase = 'paused';
      this.data.pauseDeadline = now + this.data.pauseRemaining;
      this.controls.forEach((_, index) => this.clearInput(index));
    }
    return true;
  }

  leave(seat, generation, now) {
    if (!this.isCurrent(seat, generation)) return false;
    return this.leaveByHash(this.data.members[seat].hash, now) !== null;
  }

  leaveByHash(hash, now, matchId = null) {
    if (matchId) {
      const matchesFinishedRoom = this.phase === 'finished' && this.matchId === matchId;
      const matchesReopenedRoom = ['waiting', 'countdown'].includes(this.phase) && this.data.returningFrom === matchId;
      if (!matchesFinishedRoom && !matchesReopenedRoom) return null;
    } else if (!['waiting', 'countdown'].includes(this.phase)) return null;
    const seat = this.seatFor(hash);
    if (seat < 0) return null;
    this.disconnect(seat, this.data.generations[seat], now);
    if (this.isOwner(seat)) this.expire();
    else {
      this.data.members[seat] = null;
      this.data.layout++;
    }
    return seat;
  }

  canManage(seat, generation, layout) {
    return isShortCode(this.data.code) && this.phase === 'waiting' && this.data.members.every(Boolean) &&
      this.isOwner(seat) && this.isCurrent(seat, generation) && layout === this.data.layout;
  }

  swapSeats(seat, generation, layout) {
    if (!this.canManage(seat, generation, layout)) return false;
    this.data.members.reverse();
    this.data.generations.reverse();
    this.data.members.forEach(member => { member.ready = false; });
    this.data.layout++;
    return true;
  }

  kickGuest(seat, generation, layout, now) {
    if (!this.canManage(seat, generation, layout)) return null;
    const { hash } = this.data.members[1 - seat];
    this.leaveByHash(hash, now);
    return hash;
  }

  nextLobbyPresenceCheck() {
    if (this.phase !== 'waiting') return Infinity;
    const deadlines = this.data.members.filter(member => member?.seen != null)
      .map(member => member.seen + LOBBY_HEARTBEAT_TIMEOUT_MS);
    return Math.min(...deadlines);
  }

  advancePresence(now) {
    if (this.isLobbyExpired(now)) {
      this.expire();
      return;
    }
    if (!['waiting', 'countdown', 'playing', 'paused'].includes(this.phase)) return;
    const timeout = this.phase === 'waiting' ? LOBBY_HEARTBEAT_TIMEOUT_MS : HEARTBEAT_TIMEOUT_MS;
    for (const seat of seats) {
      const seen = this.data.members[seat]?.seen;
      if (seen != null && now - seen >= timeout) {
        this.disconnect(seat, this.data.generations[seat], now);
      }
    }
    if (this.phase !== 'paused') return;
    if (now >= this.pauseDeadline) {
      this.finishOnce(this.matchId, 'interrupted', ['interrupted', 'interrupted'], now);
    } else if (this.data.members.every(member => member?.seen != null)) {
      this.data.pauseRemaining = this.pauseDeadline - now;
      this.data.pauseDeadline = null;
      this.data.phase = 'playing';
    }
  }

  start(matchId, now) {
    if (this.phase !== 'countdown' || now < this.startAt || this.isLobbyExpired(now)) return false;
    this.data.phase = 'playing';
    this.data.startedCountdownAt = this.startAt;
    this.data.startAt = null;
    this.data.startedAt = now;
    this.data.rankMatch = this.rankingsPublic;
    this.data.pauseRemaining = PAUSE_BUDGET_MS;
    this.data.matchId = matchId;
    this.data.returningFrom = null;
    this.data.engine = createMatch({ matchId, players: this.publicPlayers() });
    this.controls = [makeControl(), makeControl()];
    for (const seat of seats) this.queueRankingEvent(seat, 'start');
    return true;
  }

  acceptInput(seat, packet, now) {
    const { generation, matchId, seq, input } = packet;
    if (this.phase !== 'playing' || this.matchId !== matchId || !this.isCurrent(seat, generation)) return false;
    const control = this.controls[seat];
    if (seq <= control.received) return false;
    this.data.members[seat].seen = now;
    this.data.members[seat].confirmedMatchId = matchId;
    control.received = seq;
    control.latest = input;
    for (const edge of edges) control.pending[edge] ||= input[edge];
    return true;
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const inputs = this.controls.map(control => {
      const input = { ...control.latest };
      for (const edge of edges) {
        input[edge] = control.pending[edge];
        control.pending[edge] = false;
      }
      control.ack = control.received;
      return input;
    });
    const { state, events } = stepMatch(this.data.engine, inputs);
    this.data.engine = state;
    return events;
  }

  snapshot(events) {
    return {
      type: 'snapshot',
      matchId: this.matchId,
      snapshot: toSnapshot(this.data.engine),
      acks: this.controls.map(control => control.ack),
      events,
      phase: this.phase,
      pauseDeadline: this.pauseDeadline,
    };
  }

  result(matchId) {
    return this.data.history[matchId]?.result ?? null;
  }

  finishOnce(matchId, reason, outcomeBySeat, now) {
    if (!['playing', 'paused'].includes(this.phase) || matchId !== this.matchId) return false;
    const final = this.data.engine.final ?? resolveMatch(this.data.engine, reason, outcomeBySeat);
    this.data.engine.final = final;
    this.data.engine.statsBySeat = final.statsBySeat;
    const rankMatch = this.rankingsPublic && this.data.rankMatch === true;
    const result = {
      type: 'finished',
      matchId,
      finalSnapshot: toSnapshot(this.data.engine),
      players: this.data.members.map(({ name, faceId }) => ({ name, faceId })),
      ...final,
      expiresAt: now + RESULT_LIFETIME_MS,
      rankingStatus: rankMatch ? 'pending' : 'disabled',
    };
    const memberHashes = this.data.members.map(member => member.hash);
    this.data.history[matchId] = { result, memberHashes };
    this.data.phase = 'finished';
    this.data.pauseDeadline = null;
    this.data.engine = null;
    for (const seat of seats) {
      if (outcomeBySeat[seat] !== 'interrupted' && this.data.members[seat].playerId) {
        this.queueRankingEvent(seat, 'result', result);
      }
    }
    return true;
  }

  finishCountdownExit(seat, countdownAt, now) {
    const member = this.data.members[seat];
    if (!member || countdownAt == null || countdownAt !== this.data.startedCountdownAt ||
        now - this.data.startedAt > PAUSE_BUDGET_MS || member.confirmedMatchId === this.matchId) return false;
    return this.finishOnce(this.matchId, 'interrupted', ['interrupted', 'interrupted'], now);
  }

  forfeit(seat, generation, matchId, now) {
    if (!this.isCurrent(seat, generation)) return false;
    const outcome = seat === 0 ? ['loss', 'win'] : ['win', 'loss'];
    return this.finishOnce(matchId, 'forfeit', outcome, now);
  }

  canReturnToRoom(seat, matchId, now) {
    const member = this.data.members[seat];
    const bothCanReturn = isShortCode(this.data.code);
    if (!member || (!bothCanReturn && !this.isOwner(seat))) return false;
    if (bothCanReturn && this.phase === 'waiting' && this.data.returningFrom === matchId && !this.isLobbyExpired(now)) {
      return member.previousMatch === matchId;
    }
    const saved = this.data.history[matchId];
    if (!saved || saved.result.expiresAt <= now || !saved.memberHashes.includes(member.hash)) return false;
    return this.phase === 'finished' && matchId === this.matchId;
  }

  returnToRoom(seat, generation, matchId, now) {
    if (!this.isCurrent(seat, generation) || !this.canReturnToRoom(seat, matchId, now)) return false;
    this.data.members[seat].seen = now;
    if (this.phase === 'waiting') return true;
    const bothCanReturn = isShortCode(this.data.code);
    this.data.phase = 'waiting';
    this.data.expiresAt = now + INVITE_LIFETIME_MS;
    this.data.startedAt = null;
    this.data.matchId = null;
    this.data.returningFrom = matchId;
    this.data.pauseRemaining = PAUSE_BUDGET_MS;
    if (!bothCanReturn) this.data.members[1 - seat] = null;
    for (const member of this.data.members) {
      if (member) {
        member.ready = false;
        member.previousMatch = matchId;
      }
    }
    this.data.layout++;
    this.controls = [makeControl(), makeControl()];
    return true;
  }

  recover(now) {
    if (['playing', 'paused'].includes(this.phase)) {
      this.finishOnce(this.matchId, 'interrupted', ['interrupted', 'interrupted'], now);
    }
  }

  prune(now) {
    for (const member of this.data.members) {
      if (member?.joinDeadline != null && now >= member.joinDeadline) this.leaveByHash(member.hash, now);
    }
    for (const [id, { result }] of Object.entries(this.data.history)) {
      if (now >= result.expiresAt) delete this.data.history[id];
    }
    if (this.isLobbyExpired(now) || (this.phase === 'finished' && !this.result(this.matchId))) {
      this.expire();
    }
  }

  expire() {
    this.data.phase = 'expired';
    this.data.code = null;
    this.data.ownerHash = null;
    this.data.returningFrom = null;
    this.data.layout++;
    this.data.members = [null, null];
    this.data.expiresAt = 0;
    this.data.startAt = null;
    this.data.startedAt = null;
    this.data.matchId = null;
  }

  queueRankingEvent(seat, kind, result) {
    if (!this.rankingsPublic || this.data.rankMatch !== true) return;
    const { playerId, name } = this.data.members[seat];
    this.events.push({
      matchId: this.matchId,
      seat,
      kind,
      playerId,
      displayName: name || null,
      startedAt: this.data.startedAt,
      outcome: result?.outcomeBySeat[seat] ?? null,
      finishReason: result?.reason ?? null,
      score: result?.scoreBySeat[seat] ?? null,
    });
  }

  drainEvents() {
    return this.events.splice(0);
  }
}
