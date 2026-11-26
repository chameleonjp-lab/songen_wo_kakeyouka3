import { test } from 'vitest';
import assert from 'node:assert/strict';
import { queueRankingEvent, flushRankingEvents, RANKING_PREFIX } from '../worker/ranking.js';

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
const env = { RANKING_SUPABASE_URL: 'https://mlpnjgezrnhdxsxolyzj.supabase.co', RANKING_API_KEY: 'sb_secret_test' };

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
