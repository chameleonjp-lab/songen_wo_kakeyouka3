import { test } from 'vitest';
import assert from 'node:assert/strict';
import { RoomSession } from '../worker/room.js';
import { VERSION, emptyInput, normalizeCode, parseMessage, parseRegistration } from '../game/protocol.js';

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
