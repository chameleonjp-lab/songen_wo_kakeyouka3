import { describe, expect, it } from 'vitest';
import { VERSION } from '../game/protocol.js';
import { verifyPagesReadiness } from '../scripts/pages-readiness.js';

const workerOrigin = 'https://songen3-online.chameleonjp-lab.workers.dev';
const pagesOrigin = 'https://chameleonjp-lab.github.io';
const hold = { version: VERSION, roomCodeDigits: 4, acceptingRooms: true, rankingsPublic: false, rankingReady: false };

function responder(health, allowedOrigin = pagesOrigin, directory = { rooms: [] }) {
  return async (url, init) => {
    expect(url.origin).toBe(workerOrigin);
    if (url.pathname === '/v1/health') return Response.json(health);
    expect(url.pathname).toBe('/v1/rooms');
    if (init.method === 'GET') {
      expect(init.headers.Origin).toBe(pagesOrigin);
      return Response.json(directory, { headers: { 'Access-Control-Allow-Origin': allowedOrigin } });
    }
    expect(init.method).toBe('OPTIONS');
    expect(init.headers.Origin).toBe(pagesOrigin);
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': allowedOrigin } });
  };
}

describe('Pages release readiness', () => {
  it('allows playable production with rankings on hold', async () => {
    await expect(verifyPagesReadiness(workerOrigin, false, responder(hold))).resolves.toBe(false);
  });

  it('uses a healthy public Worker setting when no override is configured', async () => {
    await expect(verifyPagesReadiness(workerOrigin, undefined, responder(hold))).resolves.toBe(false);
    await expect(verifyPagesReadiness(workerOrigin, undefined,
      responder({ ...hold, rankingsPublic: true, rankingReady: true }))).resolves.toBe(true);
    await expect(verifyPagesReadiness(workerOrigin, undefined,
      responder({ ...hold, rankingsPublic: true }))).rejects.toThrow('ranking service');
  });

  it('blocks mismatched or unhealthy ranking publication', async () => {
    await expect(verifyPagesReadiness(workerOrigin, true, responder(hold))).rejects.toThrow('must agree');
    const publicRankings = { ...hold, rankingsPublic: true };
    await expect(verifyPagesReadiness(workerOrigin, true, responder(publicRankings))).rejects.toThrow('ranking service');
    await expect(verifyPagesReadiness(workerOrigin, true,
      responder({ ...publicRankings, rankingReady: true }))).resolves.toBe(true);
  });

  it('requires compatible, reachable rooms even during the ranking hold', async () => {
    await expect(verifyPagesReadiness(workerOrigin, false,
      responder({ ...hold, version: VERSION + 1 }))).rejects.toThrow('protocol version');
    await expect(verifyPagesReadiness(workerOrigin, false,
      responder({ ...hold, acceptingRooms: false }))).rejects.toThrow('not accepting');
    await expect(verifyPagesReadiness(workerOrigin, false,
      responder(hold, 'https://other.example'))).rejects.toThrow('allow room requests');
    await expect(verifyPagesReadiness(workerOrigin, false,
      responder(hold, pagesOrigin, { code: 'invalid' }))).rejects.toThrow('available room list');
  });
});
