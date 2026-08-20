const PLAYER_NAME_KEY = "songen3.playerName";
const PERSONAL_BEST_KEY = "songen3.personalBest";
const RETRY_KEY = "songen3.retry";

export const PLAYER_NAME_MAX_LENGTH = 12;

export function sanitizePlayerName(value: string) {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>"'`&]/g, "")
    .trim();
  return Array.from(cleaned).slice(0, PLAYER_NAME_MAX_LENGTH).join("");
}

export function loadPlayerName(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
  if (!storage) return "";
  try {
    return sanitizePlayerName(storage.getItem(PLAYER_NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function savePlayerName(name: string, storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
  const sanitized = sanitizePlayerName(name);
  if (!storage || !sanitized) return sanitized;
  try {
    storage.setItem(PLAYER_NAME_KEY, sanitized);
  } catch {
    // Private browsing and storage quotas must not block play.
  }
  return sanitized;
}

export function loadPersonalBest(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
  if (!storage) return 0;
  try {
    const value = Number(storage.getItem(PERSONAL_BEST_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function savePersonalBest(score: number, storage: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
  const next = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  const previous = loadPersonalBest(storage);
  const best = Math.max(previous, next);
  if (!storage) return best;
  try {
    storage.setItem(PERSONAL_BEST_KEY, String(best));
  } catch {
    // A result remains valid even when local persistence is unavailable.
  }
  return best;
}

export function requestLocalRetry(storage: Pick<Storage, "setItem"> | null = typeof sessionStorage === "undefined" ? null : sessionStorage) {
  try {
    storage?.setItem(RETRY_KEY, "1");
  } catch {
    // A reload still safely returns to the launcher when session storage fails.
  }
}

export function consumeLocalRetryRequest(storage: Pick<Storage, "getItem" | "removeItem"> | null = typeof sessionStorage === "undefined" ? null : sessionStorage) {
  if (!storage) return false;
  try {
    const requested = storage.getItem(RETRY_KEY) === "1";
    storage.removeItem(RETRY_KEY);
    return requested;
  } catch {
    return false;
  }
}

export const playerProfileStorageKeys = {
  playerName: PLAYER_NAME_KEY,
  personalBest: PERSONAL_BEST_KEY,
  retry: RETRY_KEY,
} as const;
