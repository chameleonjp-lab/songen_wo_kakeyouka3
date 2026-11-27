import { describe, expect, it } from 'vitest';
import { VERSION } from '../game/protocol.js';
import { verifyPagesReadiness } from '../scripts/pages-readiness.js';

const workerOrigin = 'https://songen3-online.chameleonjp-lab.workers.dev';
const pagesOrigin = 'https://chameleonjp-lab.github.io';
const hold = { version: VERSION, roomCodeDigits: 4, acceptingRooms: true, rankingsPublic: false, rankingReady: false };

function responder(health, allowedOrigin = pagesOrigin) {
  return async (url, init) => {
    expect(url.origin).toBe(workerOrigin);
    if (url.pathname === '/v1/health') return Response.json(health);
    expect(url.pathname).toBe('/v1/rooms');
    expect(init.method).toBe('OPTIONS');
    expect(init.headers.Origin).toBe(pagesOrigin);
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': allowedOrigin } });
  };
}

describe('Pages release readiness', () => {
  it('allows playable production with rankings on hold', async () => {
    await expect(verifyPagesReadiness(workerOrigin, false, responder(hold))).resolves.toBeUndefined();
  });

  it('blocks mismatched or unhealthy ranking publication', async () => {
    await expect(verifyPagesReadiness(workerOrigin, true, responder(hold))).rejects.toThrow('must agree');
    const publicRankings = { ...hold, rankingsPublic: true };
    await expect(verifyPagesReadiness(workerOrigin, true, responder(publicRankings))).rejects.toThrow('ranking service');
    await expect(verifyPagesReadiness(workerOrigin, true,
      responder({ ...publicRankings, rankingReady: true }))).resolves.toBeUndefined();
  });

  it('requires compatible, reachable rooms even during the ranking hold', async () => {
    await expect(verifyPagesReadiness(workerOrigin, false,
      responder({ ...hold, version: VERSION + 1 }))).rejects.toThrow('protocol version');
    await expect(verifyPagesReadiness(workerOrigin, false,
      responder({ ...hold, acceptingRooms: false }))).rejects.toThrow('not accepting');
    await expect(verifyPagesReadiness(workerOrigin, false,
      responder(hold, 'https://other.example'))).rejects.toThrow('allow room requests');
  });
});
