export const VERSION = 1;
export const ROOM_CODE_DIGITS = 4;
export const MAX_LISTED_ROOMS = 9;
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const MAX_PACKET_BYTES = 2048;
export const FACE_COUNT = 18;
export const INVITE_LIFETIME_MS = 10 * 60 * 1000;
export const RESULT_LIFETIME_MS = 5 * 60 * 1000;
export const COUNTDOWN_MS = 3000;
export const HEARTBEAT_TIMEOUT_MS = 3000;
export const PAUSE_BUDGET_MS = 10000;
export const AUTH_TIMEOUT_MS = 5000;

const fields = ['left', 'right', 'crouch', 'jumpPressed', 'attackPressed', 'guardPressed'];
const keyPattern = /^[0-9a-f]{32}$/;
const codePattern = new RegExp(`^[${CODE_ALPHABET}]{12}$`);
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const controlCharacters = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

export const emptyInput = () => Object.fromEntries(fields.map(key => [key, false]));

export const isShortCode = value => typeof value === 'string' && /^[0-9]{4}$/.test(value);

export function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10));
  if (isShortCode(trimmed)) return trimmed;
  const legacy = trimmed.toUpperCase().replaceAll(/[ -]/g, '');
  return codePattern.test(legacy) ? legacy : null;
}

export async function digest(namespace, key) {
  const bytes = new TextEncoder().encode(`${namespace}:${key}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function isExitToken(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function isKey(value) {
  return typeof value === 'string' && keyPattern.test(value);
}

export function isMatchId(value) {
  return typeof value === 'string' && idPattern.test(value);
}

export function parseRegistration(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') return { error: 'invalid' };
  if (body.version !== VERSION) return { error: 'version' };
  const { seatKey, rankingKey = null, faceId, name = '', roomCodeDigits = null } = body;
  if ((roomCodeDigits !== null && roomCodeDigits !== ROOM_CODE_DIGITS) || !isKey(seatKey) || !Number.isInteger(faceId) || faceId < 0 || faceId >= FACE_COUNT ||
      typeof name !== 'string' || controlCharacters.test(name) || [...name.trim()].length > 24 ||
      (rankingKey !== null && !isKey(rankingKey)) || (name.trim() && !rankingKey)) {
    return { error: 'invalid' };
  }
  return { seatKey, faceId, name: name.trim(), rankingKey, roomCodeDigits };
}

export function parseMessage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_PACKET_BYTES) return { error: 'invalid' };
  if (new TextEncoder().encode(raw).length > MAX_PACKET_BYTES) return { error: 'invalid' };
  let packet;
  try {
    packet = JSON.parse(raw);
  } catch {
    return { error: 'invalid' };
  }
  if (!packet || Array.isArray(packet) || typeof packet !== 'object') return { error: 'invalid' };
  const { type, generation, matchId } = packet;
  if (type === 'auth') {
    if (packet.version !== VERSION) return { error: 'version' };
    if (!isKey(packet.seatKey) || (matchId != null && !isMatchId(matchId))) return { error: 'invalid' };
    return { type, seatKey: packet.seatKey, matchId: matchId ?? null };
  }
  if (!Number.isSafeInteger(generation) || generation < 1) return { error: 'invalid' };
  if (type === 'leave') return { type, generation };
  const { layout } = packet;
  if (['swapSeats', 'kickGuest'].includes(type)) {
    return Number.isSafeInteger(layout) && layout >= 0 ? { type, generation, layout } : { error: 'invalid' };
  }
  if (type === 'ready') {
    return typeof packet.ready === 'boolean' && (layout === undefined || (Number.isSafeInteger(layout) && layout >= 0))
      ? { type, generation, ready: packet.ready, layout } : { error: 'invalid' };
  }
  if (type === 'heartbeat' && matchId === null) return { type, generation, matchId };
  if (!isMatchId(matchId)) return { error: 'invalid' };
  if (['heartbeat', 'suspend', 'forfeit', 'returnToRoom'].includes(type)) return { type, generation, matchId };
  if (type !== 'input' || !Number.isSafeInteger(packet.seq) || packet.seq < 1) return { error: 'invalid' };
  const { input, seq } = packet;
  if (!input || Array.isArray(input) || typeof input !== 'object' ||
      Object.keys(input).length !== fields.length || fields.some(key => typeof input[key] !== 'boolean')) {
    return { error: 'invalid' };
  }
  return { type, generation, matchId, input, seq };
}
