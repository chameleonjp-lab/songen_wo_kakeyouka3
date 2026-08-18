// Bronze & Blood Arena asset registry — generated textures are intentionally used on the arena, enemies, and HUD.
export const arenaAssets = {
  visualTarget: "/assets/barbarian-arena-visual-target_4f9881a2.png",
  barbarianSurface: "/assets/barbarian-arena-barbarian-surface_e5c06636.png",
  groundTile: "/assets/ground-tile.webp",
  sigil: "/assets/barbarian-arena-sigil_c4031e62.png",
} as const;

export const characterAssets = {
  goose: "/assets/characters/goose-heart-champion-smooth.glb",
  bear: "/assets/characters/bear-heart-champion-smooth.glb",
  crocodile: "/assets/characters/crocodile-heart-champion-smooth.glb",
  gorilla: "/assets/characters/gorilla-heart-champion-smooth.glb",
  hippopotamus: "/assets/characters/hippopotamus-heart-champion-smooth.glb",
  lion: "/assets/characters/lion-heart-champion-smooth.glb",
  rhinoceros: "/assets/characters/rhinoceros-heart-champion-smooth.glb",
} as const;

export type CharacterKey = keyof typeof characterAssets;
export type EnemyCharacterKey = Exclude<CharacterKey, "goose">;
export const enemyCharacterKeys: EnemyCharacterKey[] = ["bear", "crocodile", "gorilla", "hippopotamus", "lion", "rhinoceros"];
