// Bronze & Blood Arena asset registry — generated textures are intentionally used on the arena, enemies, and HUD.
export const publicAssetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

export const arenaAssets = {
  visualTarget: publicAssetUrl("assets/barbarian-arena-visual-target_4f9881a2.png"),
  barbarianSurface: publicAssetUrl("assets/barbarian-arena-barbarian-surface_e5c06636.png"),
  groundTile: publicAssetUrl("assets/ground-tile.webp"),
  sigil: publicAssetUrl("assets/barbarian-arena-sigil_c4031e62.png"),
} as const;

export const characterAssets = {
  goose: publicAssetUrl("assets/characters/goose-heart-champion-smooth.glb"),
  poop: publicAssetUrl("assets/characters/poop-heart-champion-smooth.glb"),
  bear: publicAssetUrl("assets/characters/bear-heart-champion-smooth.glb"),
  crocodile: publicAssetUrl("assets/characters/crocodile-heart-champion-smooth.glb"),
  gorilla: publicAssetUrl("assets/characters/gorilla-heart-champion-smooth.glb"),
  hippopotamus: publicAssetUrl("assets/characters/hippopotamus-heart-champion-smooth.glb"),
  lion: publicAssetUrl("assets/characters/lion-heart-champion-smooth.glb"),
  rhinoceros: publicAssetUrl("assets/characters/rhinoceros-heart-champion-smooth.glb"),
} as const;

export type CharacterKey = keyof typeof characterAssets;
export type EnemyCharacterKey = Exclude<CharacterKey, "goose" | "poop">;

/** The official six-duel order: fundamentals, spacing, speed, power, endurance, charge. */
export const enemyCharacterKeys: readonly EnemyCharacterKey[] = ["gorilla", "crocodile", "lion", "bear", "hippopotamus", "rhinoceros"];
