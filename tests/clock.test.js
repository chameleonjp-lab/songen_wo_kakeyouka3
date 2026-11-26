import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createMatchClock } from '../worker/clock.js';

test('advancesWithoutInput', () => {
  let now = 5000;
  const ticks = [];
  const clock = createMatchClock({ nowMs: () => now, onTick: tick => ticks.push(tick) });
  clock.start();
  for (let i = 1; i <= 10800; i++) {
    now = 5000 + Math.ceil(i * 1000 / 60);
    clock.update();
  }
  assert.equal(ticks.length, 10800);
  assert.equal(ticks.at(-1), 10800);
});

test('boundsCatchUpAfterDelay and resumes without replaying ticks', () => {
  let now = 0;
  const ticks = [];
  const backlog = [];
  const clock = createMatchClock({
    nowMs: () => now,
    onTick: tick => ticks.push(tick),
    onLag: ticksBehind => backlog.push(ticksBehind),
  });
  clock.start();
  now = 200;
  assert.equal(clock.update(), 5);
  assert.equal(clock.update(), 5);
  assert.equal(clock.update(), 2);
  assert.deepEqual(backlog, [7, 2]);
  clock.pause();
  now = 2000;
  assert.equal(clock.update(), 0);
  clock.resume();
  now = 2017;
  assert.equal(clock.update(), 1);
  assert.deepEqual(ticks, Array.from({ length: 13 }, (_, i) => i + 1));
  clock.stop();
  assert.equal(clock.update(), 0);
});
