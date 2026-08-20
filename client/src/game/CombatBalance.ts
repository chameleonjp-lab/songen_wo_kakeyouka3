// Pure combat tuning. Keep values here so the simulation can be tuned without
// making the Babylon scene or the React host responsible for game rules.

export type AttackBalanceKind = "light" | "heavy" | "counter" | "musou";

export type AttackBalance = Readonly<{
  damage: number;
  durationSeconds: number;
  hitAtFraction: number;
  range: number;
  arcDot: number;
  knockback: number;
}>;

export type CombatBalance = Readonly<{
  player: Readonly<{
    maxHealth: number;
    maxRage: number;
    dodgeRageCost: number;
  }>;
  attacks: Readonly<Record<AttackBalanceKind, AttackBalance>>;
  enemy: Readonly<{
    baseHealth: number;
    attackDamage: number;
    moveSpeed: number;
    attackRange: number;
    telegraphSeconds: number;
    targetFightSeconds: Readonly<{ min: number; max: number }>;
  }>;
  scoring: Readonly<{
    defeatBase: number;
    roundMultiplier: number;
  }>;
  inputBuffer: Readonly<{
    capacity: number;
    windowSeconds: number;
  }>;
}>;

export type CombatBalanceOverrides = {
  player?: Partial<CombatBalance["player"]>;
  attacks?: Partial<Record<AttackBalanceKind, Partial<AttackBalance>>>;
  enemy?: Partial<Omit<CombatBalance["enemy"], "targetFightSeconds">> & {
    targetFightSeconds?: Partial<CombatBalance["enemy"]["targetFightSeconds"]>;
  };
  scoring?: Partial<CombatBalance["scoring"]>;
  inputBuffer?: Partial<CombatBalance["inputBuffer"]>;
};

const DEFAULT_ATTACKS: Record<AttackBalanceKind, AttackBalance> = {
  light: {
    damage: 1.25,
    durationSeconds: 0.42,
    hitAtFraction: 0.43,
    range: 3,
    arcDot: 0.1,
    knockback: 0.8,
  },
  heavy: {
    damage: 3.8,
    durationSeconds: 0.78,
    hitAtFraction: 0.56,
    range: 4.1,
    arcDot: -0.18,
    knockback: 2.2,
  },
  counter: {
    damage: 11.5,
    durationSeconds: 0.72,
    hitAtFraction: 0.34,
    range: 6.7,
    arcDot: -0.78,
    knockback: 7.5,
  },
  musou: {
    damage: 8.7,
    durationSeconds: 1.42,
    hitAtFraction: 0.5,
    range: 5.8,
    arcDot: -1,
    knockback: 6.1,
  },
};

export const DEFAULT_COMBAT_BALANCE: CombatBalance = Object.freeze({
  player: Object.freeze({ maxHealth: 100, maxRage: 100, dodgeRageCost: 0 }),
  attacks: Object.freeze({
    light: Object.freeze({ ...DEFAULT_ATTACKS.light }),
    heavy: Object.freeze({ ...DEFAULT_ATTACKS.heavy }),
    counter: Object.freeze({ ...DEFAULT_ATTACKS.counter }),
    musou: Object.freeze({ ...DEFAULT_ATTACKS.musou }),
  }),
  enemy: Object.freeze({
    // The prototype's old 3.5 HP made a challenger disappear after a few
    // light hits. This larger baseline leaves room for the six profile
    // multipliers and a readable 25–60 second encounter tune.
    baseHealth: 64,
    attackDamage: 8.5,
    moveSpeed: 2.3,
    attackRange: 3.05,
    telegraphSeconds: 0.58,
    targetFightSeconds: Object.freeze({ min: 25, max: 60 }),
  }),
  scoring: Object.freeze({ defeatBase: 1000, roundMultiplier: 0 }),
  inputBuffer: Object.freeze({ capacity: 8, windowSeconds: 0.62 }),
});

const isFiniteNumber = (value: number) => Number.isFinite(value);

/**
 * Returns configuration errors instead of silently accepting a broken tune.
 * The caller can surface these in a development audit or fail a build-time
 * configuration check.
 */
export function validateCombatBalance(balance: CombatBalance): string[] {
  const errors: string[] = [];
  const positive = (value: number, path: string) => {
    if (!isFiniteNumber(value) || value <= 0) errors.push(`${path} must be greater than zero`);
  };
  const nonNegative = (value: number, path: string) => {
    if (!isFiniteNumber(value) || value < 0) errors.push(`${path} must be non-negative`);
  };

  positive(balance.player.maxHealth, "player.maxHealth");
  positive(balance.player.maxRage, "player.maxRage");
  nonNegative(balance.player.dodgeRageCost, "player.dodgeRageCost");

  (Object.keys(balance.attacks) as AttackBalanceKind[]).forEach((kind) => {
    const attack = balance.attacks[kind];
    positive(attack.damage, `attacks.${kind}.damage`);
    positive(attack.durationSeconds, `attacks.${kind}.durationSeconds`);
    positive(attack.range, `attacks.${kind}.range`);
    nonNegative(attack.knockback, `attacks.${kind}.knockback`);
    if (!isFiniteNumber(attack.hitAtFraction) || attack.hitAtFraction < 0 || attack.hitAtFraction > 1) {
      errors.push(`attacks.${kind}.hitAtFraction must be between zero and one`);
    }
    if (!isFiniteNumber(attack.arcDot) || attack.arcDot < -1 || attack.arcDot > 1) {
      errors.push(`attacks.${kind}.arcDot must be between -1 and one`);
    }
  });

  positive(balance.enemy.baseHealth, "enemy.baseHealth");
  positive(balance.enemy.attackDamage, "enemy.attackDamage");
  positive(balance.enemy.moveSpeed, "enemy.moveSpeed");
  positive(balance.enemy.attackRange, "enemy.attackRange");
  positive(balance.enemy.telegraphSeconds, "enemy.telegraphSeconds");
  positive(balance.enemy.targetFightSeconds.min, "enemy.targetFightSeconds.min");
  positive(balance.enemy.targetFightSeconds.max, "enemy.targetFightSeconds.max");
  if (balance.enemy.targetFightSeconds.max < balance.enemy.targetFightSeconds.min) {
    errors.push("enemy.targetFightSeconds.max must not be less than min");
  }
  positive(balance.scoring.defeatBase, "scoring.defeatBase");
  nonNegative(balance.scoring.roundMultiplier, "scoring.roundMultiplier");
  if (!Number.isInteger(balance.inputBuffer.capacity) || balance.inputBuffer.capacity < 1) {
    errors.push("inputBuffer.capacity must be a positive integer");
  }
  positive(balance.inputBuffer.windowSeconds, "inputBuffer.windowSeconds");
  return errors;
}

function assertValidBalance(balance: CombatBalance) {
  const errors = validateCombatBalance(balance);
  if (errors.length > 0) throw new Error(`Invalid combat balance: ${errors.join("; ")}`);
}

/** Create an immutable balance snapshot with only the requested fields changed. */
export function createCombatBalance(overrides: CombatBalanceOverrides = {}): CombatBalance {
  const attacks = (Object.keys(DEFAULT_ATTACKS) as AttackBalanceKind[]).reduce(
    (result, kind) => {
      result[kind] = Object.freeze({ ...DEFAULT_ATTACKS[kind], ...(overrides.attacks?.[kind] ?? {}) });
      return result;
    },
    {} as Record<AttackBalanceKind, AttackBalance>,
  );
  const balance: CombatBalance = {
    player: Object.freeze({ ...DEFAULT_COMBAT_BALANCE.player, ...(overrides.player ?? {}) }),
    attacks: Object.freeze(attacks),
    enemy: Object.freeze({
      ...DEFAULT_COMBAT_BALANCE.enemy,
      ...(overrides.enemy ?? {}),
      targetFightSeconds: Object.freeze({
        ...DEFAULT_COMBAT_BALANCE.enemy.targetFightSeconds,
        ...(overrides.enemy?.targetFightSeconds ?? {}),
      }),
    }),
    scoring: Object.freeze({ ...DEFAULT_COMBAT_BALANCE.scoring, ...(overrides.scoring ?? {}) }),
    inputBuffer: Object.freeze({ ...DEFAULT_COMBAT_BALANCE.inputBuffer, ...(overrides.inputBuffer ?? {}) }),
  };
  assertValidBalance(balance);
  return Object.freeze(balance);
}
