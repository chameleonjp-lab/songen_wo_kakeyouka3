import { test } from 'vitest';
import assert from 'node:assert/strict';
import { EntryLimit } from '../worker/index.js';

test('probes past a collision and retries the same number after a lost reply', async () => {
  const records = new Map();
  const called = [];
  const storage = {
    get: key => records.get(key),
    put: (key, value) => records.set(key, value),
    setAlarm() {},
  };
  const matches = {
    getByName(code) {
      called.push(code);
      return {
        fetch() {
          if (code === '0002') return new Response(null, { status: 409 });
          if (called.length === 2) throw new Error('lost reply');
          return Response.json({ code });
        },
      };
    },
  };
  const allocator = new EntryLimit({ storage }, { MATCH_ROOMS: matches });
  const request = () => new Request('https://limit.internal/allocate', {
    method: 'POST', body: JSON.stringify({ profile: { hash: 'owner' }, start: 2, stepSeed: 2 }),
  });
  await assert.rejects(allocator.fetch(request()), /lost reply/);
  const retried = await allocator.fetch(request());
  assert.deepEqual(called, ['0002', '0009', '0009']);
  assert.deepEqual(await retried.json(), { code: '0009' });
});
