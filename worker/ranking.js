export const RANKING_PREFIX = 'ranking:';

export function queueRankingEvent(event) {
  const order = event.kind === 'start' ? 0 : 1;
  return [`${RANKING_PREFIX}${event.matchId}:${order}:${event.seat}`, event];
}

function isServerKey(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = atob(parts[1].replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(payload).role === 'service_role';
  } catch {
    return false;
  }
}

function connection(env) {
  if (!env.RANKING_SUPABASE_URL || !isServerKey(env.RANKING_API_KEY)) return null;
  let url;
  try {
    url = new URL(env.RANKING_SUPABASE_URL);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    return null;
  }
  const headers = { 'Content-Type': 'application/json', apikey: env.RANKING_API_KEY };
  if (!env.RANKING_API_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${env.RANKING_API_KEY}`;
  return { url, headers };
}

async function rpc(config, functionName, body, sender) {
  const response = await sender(new URL(`/rest/v1/rpc/${functionName}`, config.url), {
    method: 'POST',
    headers: config.headers,
    signal: AbortSignal.timeout(3500),
    redirect: 'error',
    body: JSON.stringify(body),
  });
  return response;
}

export async function rankingReady(env, sender = fetch) {
  const config = connection(env);
  if (!config) return false;
  try {
    const response = await rpc(config, 'songen3_online_stats_v1', {}, sender);
    if (!response.ok) return false;
    const [row] = await response.json();
    return Number.isSafeInteger(row?.total_play_count) && row.total_play_count >= 0 &&
      Number.isSafeInteger(row.player_count) && row.player_count >= 0;
  } catch {
    return false;
  }
}

export async function flushRankingEvents(storage, env, sender = fetch) {
  const config = connection(env);
  if (!config) return { configured: false };
  const items = await storage.list({ prefix: RANKING_PREFIX, limit: 12 });
  for (const [key, event] of items) {
    if (event.kind === 'result') {
      const [startKey] = queueRankingEvent({ ...event, kind: 'start' });
      if (items.has(startKey)) continue;
    }
    try {
      const response = await rpc(config, 'record_songen3_online_event', { p_event: event }, sender);
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) break;
        continue;
      }
      await storage.delete(key);
      items.delete(key);
    } catch {
      break;
    }
  }
  return { configured: true };
}
