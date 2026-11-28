import { test } from 'vitest';
import assert from 'node:assert/strict';
import { RoomSession } from '../worker/room.js';
import { VERSION, PAUSE_BUDGET_MS, emptyInput, normalizeCode, parseMessage, parseRegistration } from '../game/protocol.js';

const profile = (hash, name = '') => ({ hash, name, faceId: 0, playerId: name ? hash : null });

test('create and join retries return the original seat, and a third claimant cannot take it', () => {
  const room = new RoomSession();
  room.advancePresence(250);
  assert.equal(room.phase, 'waiting');
  assert.equal(room.register('create', 'ABCDE0123FGH', profile('left'), 0).seat, 0);
  assert.equal(room.register('create', 'ABCDE0123FGH', profile('left'), 1).seat, 0);
  assert.equal(room.register('join', 'ABCDE0123FGH', profile('right'), 2).seat, 1);
  assert.equal(room.register('join', 'ABCDE0123FGH', profile('right'), 3).seat, 1);
  assert.equal(room.register('join', 'ABCDE0123FGH', profile('third'), 4).error, 'full');
  assert.equal(room.register('join', 'ABCDE0123FGH', profile('right'), 600001).error, 'expired');
  room.advancePresence(600001);
  assert.equal(room.data.code, null);
  assert.equal(room.register('create', 'ABCDE0123FGH', profile('left'), 600001).error, 'expired');
});

test('requires both ready and preserves left/right placement', () => {
  const room = new RoomSession();
  room.register('create', 'ABCDE0123FGH', profile('left', 'Alpha'), 0);
  room.register('join', 'ABCDE0123FGH', profile('right', 'Beta'), 1);
  const left = room.connect('left', null, 2);
  const right = room.connect('right', null, 2);
  room.setReady(0, left.generation, true, 5);
  assert.equal(room.phase, 'waiting');
  room.setReady(1, right.generation, true, 6);
  assert.equal(room.phase, 'countdown');
  assert.equal(room.startAt, 3006);
  assert.deepEqual(room.publicPlayers().map(player => player.name), ['Alpha', 'Beta']);
  room.disconnect(1, right.generation, 10);
  assert.equal(room.phase, 'waiting');
});

test('checks the version, registration data and exact input shape', () => {
  const seatKey = 'f'.repeat(32);
  assert.equal(normalizeCode('abcd-e012 3fgh'), 'ABCDE0123FGH');
  assert.equal(parseRegistration({ version: VERSION + 1 }).error, 'version');
  assert.equal(parseRegistration({ version: VERSION, seatKey, name: 'Alpha', faceId: 0 }).error, 'invalid');
  assert.equal(parseRegistration({ version: VERSION, seatKey, faceId: 18 }).error, 'invalid');
  assert.equal(parseRegistration({ version: VERSION, seatKey, name: '', faceId: 17 }).faceId, 17);
  const input = { type: 'input', matchId: 'aaaa0000-0000-0000-0000-000000000000', generation: 1, seq: 2, input: emptyInput() };
  assert.deepEqual(parseMessage(JSON.stringify(input)), input);
  assert.equal(parseMessage(JSON.stringify({ ...input, input: { ...input.input, x: 1 } })).error, 'invalid');
});

test('a guest can leave a reserved seat before opening a socket', () => {
  const room = new RoomSession();
  room.register('create', 'ABCDE0123FGH', profile('left'), 1);
  room.register('join', 'ABCDE0123FGH', profile('right'), 2);
  assert.equal(room.leaveByHash('unrelated', 3), null);
  assert.equal(room.leaveByHash('right', 3), 1);
  assert.equal(room.register('join', 'ABCDE0123FGH', profile('new'), 4).seat, 1);
});

test('lets the owner swap seats and remove only the current guest', () => {
  const room = new RoomSession();
  room.register('create', '0038', profile('owner'), 1);
  room.register('join', '0038', profile('guest'), 2);
  const owner = room.connect('owner', null, 3);
  const guest = room.connect('guest', null, 3);
  const layout = room.data.layout;
  assert.equal(room.swapSeats(1, guest.generation, layout), false);
  room.setReady(1, guest.generation, true, 4, layout);
  assert.equal(room.swapSeats(0, owner.generation, layout), true);
  assert.equal(room.isOwner(1), true);
  assert.equal(room.setReady(0, guest.generation, true, 5, layout), false);
  assert.equal(room.publicPlayers()[0].ready, false);
  assert.equal(room.kickGuest(1, owner.generation, layout, 6), null);
  assert.equal(room.kickGuest(1, owner.generation, room.data.layout, 7), 'guest');
  assert.equal(room.connect('guest', null, 8).error, 'credentials');
  assert.equal(room.register('join', '0038', profile('new'), 9).seat, 0);
  assert.equal(room.leaveByHash('new', 10), 0);
  assert.equal(room.isOwner(1), true);
  assert.equal(room.leaveByHash('owner', 11), 1);
  assert.equal(room.register('create', '0038', profile('replacement'), 12).seat, 0);
});

test('retains both members when either returns from a four-digit room result', () => {
  const room = new RoomSession();
  room.register('create', '0038', profile('owner'), 0);
  room.register('join', '0038', profile('guest'), 0);
  const host = room.connect('owner', null, 0);
  const guest = room.connect('guest', null, 0);
  room.setReady(0, host.generation, true, 0);
  room.setReady(1, guest.generation, true, 0);
  const matchId = '00000000-0000-4000-8000-000000000001';
  assert.equal(room.start(matchId, 3000), true);
  assert.equal(room.forfeit(0, host.generation, matchId, 3001), true);
  assert.equal(room.returnToRoom(1, guest.generation, matchId, 3002), true);
  assert.equal(room.phase, 'waiting');
  assert.deepEqual(room.publicPlayers().map(p => p.ready), [false, false]);
  assert.equal(room.returnToRoom(0, host.generation, matchId, 3003), true);
  assert.equal(room.connect('guest', matchId, 3004).historical, true);
  assert.equal(normalizeCode('００３８'), '0038');
});

function finishedShortRoom() {
  const room = new RoomSession();
  room.register('create', '0038', profile('owner'), 0);
  room.register('join', '0038', profile('guest'), 0);
  const host = room.connect('owner', null, 0);
  const guest = room.connect('guest', null, 0);
  room.setReady(0, host.generation, true, 0);
  room.setReady(1, guest.generation, true, 0);
  const matchId = '00000000-0000-4000-8000-000000000001';
  assert.equal(room.start(matchId, 3000), true);
  assert.equal(room.forfeit(0, host.generation, matchId, 3001), true);
  return { room, host, guest, matchId };
}

test('allows the guest to spend time reading the result and be ready on the first attempt', () => {
  const { room, host, guest, matchId } = finishedShortRoom();
  room.returnToRoom(0, host.generation, matchId, 3100);
  const now = 10_000;
  room.heartbeat(0, host.generation, null, now);
  assert.equal(room.returnToRoom(1, guest.generation, matchId, now), true);
  room.setReady(0, host.generation, true, now);
  room.setReady(1, guest.generation, true, now);
  room.advancePresence(now + 1);
  assert.equal(room.phase, 'countdown');
});

test('releases a score seat in either order and leaves newer rounds and old results intact', () => {
  for (const hostReturnsFirst of [false, true]) {
    const { room, host, matchId } = finishedShortRoom();
    if (hostReturnsFirst) room.returnToRoom(0, host.generation, matchId, 3100);
    assert.equal(room.leaveByHash('guest', 3200, matchId), 1);
    assert.equal(room.connect('guest', matchId, 3201).historical, true);
    if (!hostReturnsFirst) room.returnToRoom(0, host.generation, matchId, 3300);
    assert.equal(room.register('join', '0038', profile('new'), 3400).seat, 1);
    const guest = room.connect('new', null, 3400);
    room.setReady(0, host.generation, true, 3400);
    room.setReady(1, guest.generation, true, 3400);
    const nextMatch = '00000000-0000-4000-8000-000000000002';
    assert.equal(room.start(nextMatch, 6400), true);
    assert.equal(room.leaveByHash('owner', 6401, matchId), null);
    assert.equal(room.matchId, nextMatch);
    assert.deepEqual(room.result(matchId).outcomeBySeat, ['loss', 'win']);
  }
});

test('reusing a room number gives the next match the full pause budget', () => {
  const { room, matchId } = finishedShortRoom();
  room.data.pauseRemaining = 2000;
  const now = room.result(matchId).expiresAt + 1;
  room.prune(now);
  room.register('create', '0038', profile('new-owner'), now);
  room.register('join', '0038', profile('new-guest'), now);
  const owner = room.connect('new-owner', null, now);
  const guest = room.connect('new-guest', null, now);
  room.setReady(0, owner.generation, true, now);
  room.setReady(1, guest.generation, true, now);
  assert.equal(room.start('00000000-0000-4000-8000-000000000002', now + 3000), true);
  room.disconnect(1, guest.generation, now + 3100);
  assert.equal(room.pauseDeadline, now + 3100 + PAUSE_BUDGET_MS);
});

test('only unconfirmed guests lose their reservation if a registration reply never arrives', () => {
  const room = new RoomSession();
  room.register('create', '0038', profile('owner'), 0);
  room.register('join', '0038', profile('guest'), 1);
  const deadline = room.data.members[1].joinDeadline;
  room.prune(deadline);
  assert.equal(room.seatFor('guest'), -1);
  room.register('join', '0038', profile('next'), deadline);
  room.connect('next', null, deadline + 1);
  room.prune(deadline * 2);
  assert.equal(room.seatFor('next'), 1);
});

test('both roles can rejoin their reopened room after result history expires', () => {
  for (const first of [0, 1]) {
    const room = new RoomSession();
    const match = '10000000-0000-4000-8000-000000000001';
    const members = ['owner', 'guest'].map((name, seat) => {
      room.register(seat ? 'join' : 'create', '0038', profile(name), 0);
      return room.connect(name, null, 1);
    });
    members.forEach(({ generation }, seat) => room.setReady(seat, generation, true, 1));
    room.start(match, 3001);
    room.forfeit(0, members[0].generation, match, 3002);
    const expires = room.result(match).expiresAt;
    assert.ok(room.returnToRoom(first, members[first].generation, match, 3010));
    room.prune(expires);
    assert.equal(room.result(match), null);
    assert.ok(room.returnToRoom(1 - first, members[1 - first].generation, match, expires + 1));
    assert.equal(room.canReturnToRoom(first, match, room.data.expiresAt), false);
  }
});

test('only a guest filling the empty seat can carry an earlier owner Ready into the new layout', () => {
  const room = new RoomSession();
  room.register('create', '0038', profile('host'), 0);
  const host = room.connect('host', null, 1);
  const empty = room.data.layout;
  room.register('join', '0038', profile('first'), 2);
  const first = room.connect('first', null, 3);
  assert.ok(room.setReady(1, first.generation, true, 4, room.data.layout));
  assert.ok(room.setReady(0, host.generation, true, 5, empty));
  assert.equal(room.phase, 'countdown');

  const firstPair = room.data.layout;
  room.leaveByHash('first', 6);
  assert.equal(room.publicPlayers()[0].ready, false);
  room.register('join', '0038', profile('next'), 7);
  room.connect('next', null, 8);
  assert.equal(room.setReady(0, host.generation, true, 9, firstPair), false);
  assert.equal(room.setReady(0, host.generation, true, 10, empty), false);
  const nextPair = room.data.layout;
  assert.ok(room.swapSeats(0, host.generation, nextPair));
  assert.equal(room.setReady(1, host.generation, true, 11, nextPair), false);
  assert.equal(room.phase, 'waiting');
});

test('the first punch in a tick keeps its crouch and jump ordering while the fighter follows the latest controls', () => {
  const cases = [
    [[{ crouch: true, attackPressed: true }, {}], 'low', 'stand'],
    [[{ attackPressed: true }, { crouch: true }], 'mid', 'crouch'],
    [[{ crouch: true, attackPressed: true }, { attackPressed: true }], 'low', 'stand'],
    [[{ attackPressed: true }, { jumpPressed: true }], 'mid', 'jump'],
    [[{ jumpPressed: true }, { attackPressed: true }], 'high', 'jump'],
    [[{ crouch: true, jumpPressed: true, attackPressed: true }], 'high', 'jump'],
  ];
  for (const [packets, lane, posture] of cases) {
    const room = new RoomSession();
    const matchId = '00000000-0000-4000-8000-000000000001';
    const members = ['owner', 'guest'].map((name, seat) => {
      room.register(seat ? 'join' : 'create', '0038', profile(name), 0);
      return room.connect(name, null, 1);
    });
    members.forEach(({ generation }, seat) => room.setReady(seat, generation, true, 1));
    assert.ok(room.start(matchId, 3001));
    packets.forEach((buttons, index) => {
      const input = { ...emptyInput(), ...buttons };
      assert.ok(room.acceptInput(0, { matchId, generation: members[0].generation, seq: index + 1, input }, 3002 + index));
    });
    assert.equal(room.tick().filter(e => e.type === 'attack').length, 1);
    assert.equal(room.data.engine.projectiles[0].height, lane);
    assert.equal(room.data.engine.players[0].posture, posture);
    assert.equal(room.tick().some(e => e.type === 'attack'), false);
  }
});
