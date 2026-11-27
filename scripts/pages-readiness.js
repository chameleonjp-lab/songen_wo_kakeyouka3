import { ROOM_CODE_DIGITS, VERSION } from '../game/protocol.js';

const pagesOrigin = 'https://chameleonjp-lab.github.io';

export async function verifyPagesReadiness(matchOrigin, publishRankings, request = fetch) {
  let url;
  try {
    url = new URL(matchOrigin);
  } catch {
    throw new Error('VITE_MATCH_SERVER_URL must be set to the production Worker origin.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_MATCH_SERVER_URL must be an HTTPS origin.');
  }

  const response = await request(new URL('/v1/health', url), {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}.`);
  const health = await response.json();
  if (health.version !== VERSION) throw new Error(`The Worker must report protocol version ${VERSION}.`);
  if (health.roomCodeDigits !== ROOM_CODE_DIGITS) {
    throw new Error(`The Worker must support ${ROOM_CODE_DIGITS}-digit room codes before publishing.`);
  }
  if (typeof health.rankingsPublic !== 'boolean' ||
      (publishRankings !== undefined && health.rankingsPublic !== publishRankings)) {
    throw new Error('Pages VITE_RANKINGS_PUBLIC and the Worker RANKINGS_PUBLIC must agree.');
  }
  if (health.acceptingRooms !== true) throw new Error('The Worker is not accepting new rooms.');
  if (health.rankingsPublic && health.rankingReady !== true) throw new Error('The ranking service is not ready.');

  const preflight = await request(new URL('/v1/rooms', url), {
    method: 'OPTIONS',
    headers: {
      Origin: pagesOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!preflight.ok || preflight.headers.get('access-control-allow-origin') !== pagesOrigin) {
    throw new Error('The Worker must allow room requests from the GitHub Pages origin.');
  }
  return health.rankingsPublic;
}
