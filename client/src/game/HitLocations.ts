// Hit-location rules are intentionally independent of Babylon meshes. The
// renderer can translate a picked node/bone into one of these three semantic
// zones, then use the deterministic result for damage, score and dignity.

export type HitLocation = "head" | "torso" | "heart";
export type BodyPart = HitLocation;
export type HitLocationInput = HitLocation | "body" | "chest" | "core" | string;

export const BODY_PARTS: readonly BodyPart[] = Object.freeze(["head", "torso", "heart"]);

export type HitLocationTuning = Readonly<{
  location: HitLocation;
  label: string;
  damageMultiplier: number;
  scoreMultiplier: number;
  /** Amount removed from a dignity meter when this location is confirmed. */
  dignityDamage: number;
  staggerMultiplier: number;
  critical: boolean;
}>;

export type HitSample = Readonly<{
  nodeName?: string;
  meshName?: string;
  boneName?: string;
  /** Optional normalized vertical coordinate, where 0 is feet and 1 is top. */
  normalizedHeight?: number;
}>;

export type HitResolutionContext = Readonly<{ heartExposed?: boolean }>;

export type ResolvedHit = Readonly<{
  requestedLocation: HitLocation;
  location: HitLocation;
  baseDamage: number;
  damage: number;
  scoreMultiplier: number;
  dignityDamage: number;
  staggerMultiplier: number;
  critical: boolean;
  heartConfirmed: boolean;
}>;

export const DEFAULT_HIT_LOCATION_TUNING: Readonly<Record<HitLocation, HitLocationTuning>> = Object.freeze({
  head: Object.freeze({
    location: "head",
    label: "HEAD",
    // The head is a readable precision target, but is intentionally not the
    // highest-health damage zone. Its identity comes from dignity pressure.
    damageMultiplier: 0.75,
    scoreMultiplier: 1.55,
    dignityDamage: 6,
    staggerMultiplier: 1.35,
    critical: true,
  }),
  torso: Object.freeze({
    location: "torso",
    label: "TORSO",
    damageMultiplier: 1,
    scoreMultiplier: 1,
    dignityDamage: 1,
    staggerMultiplier: 1,
    critical: false,
  }),
  heart: Object.freeze({
    location: "heart",
    label: "HEART",
    damageMultiplier: 2.2,
    scoreMultiplier: 2.4,
    dignityDamage: 3,
    staggerMultiplier: 1.55,
    critical: true,
  }),
});

const HEAD_PATTERN = /head|skull|face|eye|jaw|beak|muzzle|horn|mane/i;
const HEART_PATTERN = /heart|cavity|aorta|pectoral|core/i;
const TORSO_PATTERN = /torso|chest|body|spine|abdomen|pelvis|belly|trunk/i;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeHitLocation(value: HitLocationInput | undefined | null): HitLocation {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "head" || normalized === "skull" || normalized === "face") return "head";
  if (normalized === "heart" || normalized === "core" || normalized === "cavity") return "heart";
  return "torso";
}

/**
 * Prefer explicit GLB node/bone evidence. Height is only a conservative
 * fallback; an unlabelled point defaults to torso and cannot accidentally
 * become a critical hit.
 */
export function classifyHitLocation(sample: HitSample | string | undefined | null): HitLocation {
  if (typeof sample === "string") {
    if (HEART_PATTERN.test(sample)) return "heart";
    if (HEAD_PATTERN.test(sample)) return "head";
    return "torso";
  }
  if (!sample) return "torso";
  const names = [sample.nodeName, sample.meshName, sample.boneName].filter((name): name is string => Boolean(name));
  if (names.some((name) => HEART_PATTERN.test(name))) return "heart";
  if (names.some((name) => HEAD_PATTERN.test(name))) return "head";
  if (names.some((name) => TORSO_PATTERN.test(name))) return "torso";
  if (Number.isFinite(sample.normalizedHeight)) {
    const height = clamp(sample.normalizedHeight as number, 0, 1);
    if (height >= 0.78) return "head";
  }
  return "torso";
}

export function hitLocationTuning(
  location: HitLocationInput | undefined | null,
  tuning: Readonly<Record<HitLocation, HitLocationTuning>> = DEFAULT_HIT_LOCATION_TUNING,
): HitLocationTuning {
  return tuning[normalizeHitLocation(location)] ?? tuning.torso;
}

export function isHeartHitConfirmed(location: HitLocationInput | undefined | null, context: HitResolutionContext = {}): boolean {
  return normalizeHitLocation(location) !== "heart" || context.heartExposed === true;
}

export function resolveHit(
  baseDamage: number,
  location: HitLocationInput | undefined | null,
  tuning: Readonly<Record<HitLocation, HitLocationTuning>> = DEFAULT_HIT_LOCATION_TUNING,
  options: HitResolutionContext = {},
): ResolvedHit {
  const safeBaseDamage = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  const requestedLocation = normalizeHitLocation(location);
  const heartConfirmed = isHeartHitConfirmed(requestedLocation, options);
  const effectiveLocation = requestedLocation === "heart" && !heartConfirmed ? "torso" : requestedLocation;
  const profile = hitLocationTuning(effectiveLocation, tuning);
  return Object.freeze({
    requestedLocation,
    location: profile.location,
    baseDamage: safeBaseDamage,
    damage: safeBaseDamage * profile.damageMultiplier,
    scoreMultiplier: profile.scoreMultiplier,
    dignityDamage: profile.dignityDamage,
    staggerMultiplier: profile.staggerMultiplier,
    critical: profile.critical,
    heartConfirmed,
  });
}
