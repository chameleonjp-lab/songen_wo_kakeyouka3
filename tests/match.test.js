import { test } from 'vitest';
import assert from 'node:assert/strict';
import { RoomSession } from '../worker/room.js';
import { emptyInput, PAUSE_BUDGET_MS } from '../game/protocol.js';

const code = 'ABCDE0123FGH';
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

function setup(rankingsPublic = true) {
  const room = new RoomSession(undefined, { rankingsPublic });
  room.register('create', code, { hash: 'left', name: 'A', faceId: 1, playerId: 'a' }, 0);
  room.register('join', code, { hash: 'right', name: 'B', faceId: 2, playerId: 'b' }, 0);
  const left = room.connect('left', null, 0);
  const right = room.connect('right', null, 0);
  room.setReady(0, left.generation, true, 0);
  room.setReady(1, right.generation, true, 0);
  room.heartbeat(0, left.generation, null, 3000);
  room.heartbeat(1, right.generation, null, 3000);
  assert.equal(room.start(first, 3000), true);
  return { room, left, right };
}

function packet(generation, seq, input = {}, matchId = first) {
  return { matchId, generation, seq, input: { ...emptyInput(), ...input } };
}

test('applies edges even when the next packet releases the button', () => {
  const { room, left } = setup();
  assert.equal(room.acceptInput(0, packet(left.generation, 1, { attackPressed: true }), 3001), true);
  assert.equal(room.acceptInput(0, packet(left.generation, 2), 3002), true);
  assert.equal(room.acceptInput(0, packet(left.generation, 1), 3003), false);
  assert.equal(room.tick().some(event => event.type === 'attack'), true);
  const confirmed = room.snapshot([]);
  assert.deepEqual(confirmed.acks, [2, 0]);
  assert.equal(room.snapshot([]).snapshot.tick, 1);
});

test('takes a shared pause budget and clears held inputs and old socket generations', () => {
  const { room, left, right } = setup();
  room.acceptInput(0, packet(left.generation, 1, { right: true }), 3001);
  room.disconnect(0, left.generation, 3100);
  assert.equal(room.phase, 'paused');
  const renewed = room.connect('left', first, 7100);
  room.heartbeat(1, right.generation, first, 7100);
  room.advancePresence(7100);
  assert.equal(room.phase, 'playing');
  assert.equal(room.acceptInput(0, packet(left.generation, 2), 7101), false);
  assert.equal(room.snapshot([]).acks[0], 0);
  const x = room.snapshot([]).snapshot.players[0].x;
  room.tick();
  assert.equal(room.snapshot([]).snapshot.players[0].x, x);
  room.disconnect(0, renewed.generation, 7200);
  assert.equal(room.pauseDeadline, 7200 + PAUSE_BUDGET_MS - 4000);
  room.advancePresence(room.pauseDeadline);
  assert.equal(room.result(first).reason, 'interrupted');
  assert.deepEqual(room.result(first).scoreBySeat, [null, null]);
});

test('persists the sole outcome and retains a guest result after the host reopens the room', () => {
  const { room, left, right } = setup();
  assert.equal(room.drainEvents().filter(event => event.kind === 'start').length, 2);
  room.forfeit(1, right.generation, first, 3001);
  const finished = room.result(first);
  assert.equal(finished.reason, 'forfeit');
  assert.deepEqual(finished.outcomeBySeat, ['win', 'loss']);
  assert.equal(room.forfeit(0, left.generation, first, 3002), false);
  assert.equal(room.returnToRoom(1, right.generation, first, 3002), false);
  assert.equal(room.returnToRoom(0, left.generation, first, 3002), true);
  assert.equal(room.returnToRoom(0, left.generation, first, 3003), false);
  assert.equal(room.connect('right', first, 3003).historical, true);
  assert.deepEqual(room.result(first), finished);
  assert.equal(room.drainEvents().filter(event => event.kind === 'result').length, 2);
  room.register('join', code, { hash: 'new', name: 'C', faceId: 3, playerId: 'c' }, 3003);
  const replacement = room.connect('new', null, 3003);
  room.setReady(0, left.generation, true, 3003);
  room.setReady(1, replacement.generation, true, 3003);
  room.heartbeat(0, left.generation, null, 6003);
  room.heartbeat(1, replacement.generation, null, 6003);
  assert.equal(room.start(second, 6003), true);
  assert.equal(room.acceptInput(0, packet(left.generation, 1), 6004), false);
  assert.deepEqual(room.result(first), finished);
});

test('restart interrupts a running match but keeps a stored result', () => {
  const { room } = setup();
  const recovery = new RoomSession(structuredClone(room.data));
  recovery.recover(4000);
  assert.equal(recovery.result(first).reason, 'interrupted');
  assert.equal(recovery.drainEvents().length, 0);
  const restart = new RoomSession(structuredClone(recovery.data));
  restart.recover(4100);
  assert.deepEqual(restart.result(first), recovery.result(first));
});

test('will not return a finished result after its retention period, even if cleanup is late', () => {
  const { room, right } = setup();
  room.forfeit(1, right.generation, first, 3001);
  const { expiresAt } = room.result(first);
  assert.equal(room.connect('right', first, expiresAt - 1).seat, 1);
  assert.equal(room.connect('right', first, expiresAt).error, 'expired');
});

test('keeps scores but never queues ranking data when the match started during the hold', () => {
  const { room, right } = setup(false);
  assert.deepEqual(room.drainEvents(), []);
  const resumed = new RoomSession(structuredClone(room.data), { rankingsPublic: true });
  assert.equal(resumed.forfeit(1, right.generation, first, 3001), true);
  const result = resumed.result(first);
  assert.equal(result.rankingStatus, 'disabled');
  assert.equal(Number.isFinite(result.scoreBySeat[0]), true);
  assert.equal(result.finalSnapshot.matchId, first);
  assert.deepEqual(resumed.drainEvents(), []);
});
