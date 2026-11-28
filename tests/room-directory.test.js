import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, vi } from 'vitest';
import { INVITE_LIFETIME_MS } from '../game/protocol.js';
import { MatchRoom } from '../worker/index.js';
import { RoomDirectory, stageListing } from '../worker/room-directory.js';
import { RoomSession } from '../worker/room.js';

test('lists at most nine unexpired numbers, fills past exclusions, and handles closure and ID reuse', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const directory = new RoomDirectory({ exec(query, ...params) {
      const rows = db.prepare(query).all(...params);
      return { toArray: () => rows };
    } });
    const now = Date.now() + 1000;
    const codes = Array.from({ length: 12 }, (_, i) => String(i).padStart(4, '0'));
    codes.forEach((code, i) => directory.update(code, now + i + 1));
    const newest = [...codes].reverse();
    assert.deepEqual(directory.list('', now), newest.slice(0, 9));
    assert.deepEqual(directory.list(newest[0], now), newest.slice(1, 10));
    directory.update(newest[0], 0);
    assert.deepEqual(directory.list('', now + 9), newest.slice(1, 3));
    directory.update('0000', now + 100);
    assert.deepEqual(directory.list('', now + 12), ['0000']);
    assert.deepEqual(directory.list('', now + 100), []);
  } finally { db.close(); }
});

test('indexes only joinable numbered rooms, even when the owner is in the second seat', () => {
  const room = new RoomSession();
  const owner = { hash: 'host' };
  const guest = { hash: 'guest' };
  room.register('create', '0042', owner, 100);
  const until = 100 + INVITE_LIFETIME_MS;
  stageListing(room.data, 100);
  assert.equal(room.data.listing, undefined);
  room.connect(owner.hash, null, 101);
  stageListing(room.data, 101);
  assert.deepEqual(room.data.listing, { code: '0042', expiresAt: until, pending: true });
  room.register('join', '0042', guest, 102);
  stageListing(room.data, 103);
  assert.equal(room.data.listing.expiresAt, 0);
  const { generation } = room.connect(owner.hash, null, 104);
  assert.ok(room.swapSeats(0, generation, room.data.layout));
  assert.equal(room.leaveByHash(guest.hash, 105), 0);
  stageListing(room.data, 106);
  assert.equal(room.data.listing.expiresAt, until);
  room.disconnect(1, generation, 107);
  stageListing(room.data, 107);
  assert.equal(room.data.listing.expiresAt, 0);
  room.connect(owner.hash, null, 108);
  stageListing(room.data, 108);
  assert.equal(room.data.listing.expiresAt, until);
  room.leaveByHash(owner.hash, 109);
  stageListing(room.data, 108);
  assert.deepEqual(room.data.listing, { code: '0042', expiresAt: 0, pending: true });
  const legacy = new RoomSession();
  legacy.register('create', 'ABCDEFGHJKMN', owner, 100);
  stageListing(legacy.data, 101);
  assert.equal(legacy.data.listing, undefined);
});

test('keeps the seat usable when the index is down and retries the latest state after restarting', async () => {
  const records = new Map();
  let alarm = null;
  const storage = {
    get: async key => structuredClone(records.get(key)),
    put: async (key, value) => {
      for (const [k, v] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) records.set(k, structuredClone(v));
    },
    getAlarm: async () => alarm, setAlarm: async at => { alarm = at; }, deleteAlarm: async () => { alarm = null; },
  };
  const write = vi.fn().mockRejectedValueOnce(new Error('directory offline'))
    .mockResolvedValue(new Response(null, { status: 204 }));
  async function restart() {
    let init;
    const room = new MatchRoom({ storage, getWebSockets: () => [], blockConcurrencyWhile: fn => { init = fn(); } },
      { ENTRY_LIMIT: { getByName: () => ({ fetch: write }) } });
    await init;
    return room;
  }
  const room = await restart();
  const register = (target, action, hash) => target.fetch(new Request('https://room.internal/' + action, {
    method: 'POST', body: JSON.stringify({ code: '0001', profile: { hash } }),
  }));
  assert.equal((await register(room, 'create', 'owner')).status, 200);
  room.session.connect('owner', null, Date.now());
  await room.commit();
  assert.equal(records.get('room').listing.pending, true);
  assert.ok(alarm < records.get('room').expiresAt);
  const resumed = await restart();
  assert.equal((await register(resumed, 'join', 'guest')).status, 200);
  assert.deepEqual(JSON.parse(write.mock.lastCall[1].body), { code: '0001', expiresAt: 0 });
  assert.equal(records.get('room').listing, undefined);
  assert.equal((await register(resumed, 'join', 'late')).status, 409);
});

test('a silent host is removed on the lobby presence deadline and listed again on reconnect', () => {
  const room = new RoomSession();
  room.register('create', '0042', { hash: 'host' }, 100);
  const { generation } = room.connect('host', null, 100);
  const deadline = room.nextLobbyPresenceCheck();
  room.heartbeat(0, generation, null, 150);
  room.advancePresence(deadline);
  assert.equal(room.isCurrent(0, generation), true);
  stageListing(room.data, deadline);
  assert.ok(room.data.listing.expiresAt > deadline);
  const lastDeadline = room.nextLobbyPresenceCheck();
  room.advancePresence(lastDeadline);
  stageListing(room.data, lastDeadline);
  assert.equal(room.data.listing.expiresAt, 0);
  assert.equal(room.nextLobbyPresenceCheck(), Infinity);
  room.connect('host', null, lastDeadline + 1);
  stageListing(room.data, lastDeadline + 1);
  assert.ok(room.data.listing.expiresAt > lastDeadline);
});
