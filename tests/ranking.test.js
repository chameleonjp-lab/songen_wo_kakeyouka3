import { test } from 'vitest';
import assert from 'node:assert/strict';
import { queueRankingEvent, flushRankingEvents, rankingReady, RANKING_PREFIX } from '../worker/ranking.js';

const event = {
  matchId: '00000000-0000-4000-8000-000000000001',
  seat: 0,
  kind: 'start',
  playerId: null,
  displayName: null,
  startedAt: 1730000000000,
  outcome: null,
  finishReason: null,
  score: null,
};
const env = { RANKINGS_PUBLIC: 'true', RANKING_SUPABASE_URL: 'https://mlpnjgezrnhdxsxolyzj.supabase.co', RANKING_API_KEY: 'sb_secret_test' };

function createStorage() {
  const records = new Map();
  return {
    records,
    async list({ prefix, limit }) {
      return new Map([...records].filter(([key]) => key.startsWith(prefix)).slice(0, limit));
    },
    async delete(key) {
      return records.delete(key);
    },
  };
}

test('uses the same idempotency key for a replay and separates seats and event kinds', () => {
  const [key, value] = queueRankingEvent(event);
  assert.ok(key.startsWith(RANKING_PREFIX));
  assert.deepEqual(queueRankingEvent({ ...event }), [key, value]);
  assert.notEqual(queueRankingEvent({ ...event, seat: 1 })[0], key);
  assert.notEqual(queueRankingEvent({ ...event, kind: 'result' })[0], key);
});

test('retains failed events, then sends the identical body and removes it on acknowledgment', async () => {
  const storage = createStorage();
  const [key, item] = queueRankingEvent(event);
  storage.records.set(key, item);
  const calls = [];
  const sender = async (url, req) => {
    calls.push([url, req.body]);
    assert.equal(req.headers.apikey, 'sb_secret_test');
    assert.equal(req.headers.Authorization, undefined);
    return new Response(null, { status: calls.length === 1 ? 503 : 204 });
  };
  await flushRankingEvents(storage, env, sender);
  assert.equal(storage.records.has(key), true);
  await flushRankingEvents(storage, env, sender);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(JSON.parse(calls[0][1]), { p_event: event });
  assert.equal(storage.records.has(key), false);
});

test('public keys cannot make the writer health check pass', async () => {
  const sender = async () => {
    throw new Error('A public key must be rejected locally');
  };
  const publ = { ...env, RANKING_API_KEY: 'sb_publishable_test' };
  assert.equal(await rankingReady(publ, sender), false);
  assert.deepEqual(await flushRankingEvents(createStorage(), publ, sender), { configured: false });
});

test('a ranking hold skips health probes and leaves already queued entries unsent', async () => {
  const storage = createStorage();
  const [key, item] = queueRankingEvent(event);
  storage.records.set(key, item);
  const held = { ...env, RANKINGS_PUBLIC: 'false' };
  let requests = 0;
  const sender = async () => { requests += 1; return new Response(null, { status: 204 }); };
  assert.equal(await rankingReady(held, sender), false);
  assert.deepEqual(await flushRankingEvents(storage, held, sender), { configured: false });
  assert.equal(requests, 0);
  assert.equal(storage.records.has(key), true);
});
