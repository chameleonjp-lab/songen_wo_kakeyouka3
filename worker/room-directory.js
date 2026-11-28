import { MAX_LISTED_ROOMS, isShortCode } from '../game/protocol.js';

// A dedicated instance of the existing SQLite-backed entry service owns the index.
export const directoryStub = env => env.ENTRY_LIMIT.getByName('open-room-directory');

export function openUntil(data, now) {
  const owner = data.members.find(member => member && member.hash === data.ownerHash);
  return owner?.seen != null && isShortCode(data.code) && data.phase === 'waiting' && data.members.includes(null) && data.expiresAt > now
    ? data.expiresAt : 0;
}

// Keep the change with the authoritative room until the index acknowledges it.
export function stageListing(data, now) {
  const expiresAt = openUntil(data, now);
  if (expiresAt !== (data.listing?.expiresAt ?? 0)) {
    data.listing = { code: data.code ?? data.listing.code, expiresAt, pending: true };
  }
}

export class RoomDirectory {
  constructor(sql) {
    this.sql = sql;
    sql.exec('CREATE TABLE IF NOT EXISTS open_rooms (code TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
    sql.exec('CREATE INDEX IF NOT EXISTS by_expiry ON open_rooms (expires_at DESC, code)');
  }

  list(exclude, now) {
    return this.sql.exec(
      'SELECT code FROM open_rooms WHERE expires_at > ? AND code != ? ORDER BY expires_at DESC, code LIMIT ?',
      now, exclude ?? '', MAX_LISTED_ROOMS,
    ).toArray().map(row => row.code);
  }

  update(code, expiresAt) {
    if (expiresAt > Date.now()) {
      this.sql.exec('INSERT INTO open_rooms (code, expires_at) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET expires_at = excluded.expires_at', code, expiresAt);
    } else {
      this.sql.exec('DELETE FROM open_rooms WHERE code = ?', code);
    }
  }
}
