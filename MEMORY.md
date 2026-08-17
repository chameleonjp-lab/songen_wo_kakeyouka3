# BARBARIAN ARENA — Memory

## Decisions

- Engine: Babylon.js inside a React full-screen canvas.
- Gameplay classes remain framework-agnostic under `client/src/game/`.
- The player uses intentionally blocky procedural geometry; barbarians use articulated procedural mesh groups with layered materials and attack animation.
- Use generated images for the visual target, the barbarian material direction, the arena material direction, and the brand sigil. Never place large asset files in the project tree.
- Desktop controls are WASD movement, mouse look, J/□ light attack, K/△ heavy attack, Space dodge, and Esc pause. On-screen labels also communicate controller mappings.

## Implemented and verified

- `GameWorld` now owns a bounded circular arena, a blocky player, procedural textured barbarians, crowd separation, continued spawning, player and enemy state machines, melee hit windows, knockback, defeat cleanup, rage, combo count, and combat effects.
- `?demo` supplies deterministic movement, nearest-target pursuit, opening enemies, and attacks so a screenshot shows active combat without manual input.
- The starting screen and demo screen were visually checked at 1280×720. The start state uses the generated scene image, bronze seal, tactical copy, and arena motif; the demo shows the HUD, dense enemy cluster, ground texture, and combat counter.
- `pnpm check` and `pnpm build` pass. The build warns only that the Babylon bundle exceeds Vite's default 500kB advisory threshold.

## Combo update

- Light attacks now keep a short input buffer for either another light or a heavy input. `weak → heavy` and `weak → weak → heavy` transition into dedicated finishing swings rather than resetting to a standalone heavy attack.
- Finishers have a longer wind-up, deeper forward step, larger 5.45m range, wider arc, greater damage and knockback, an enlarged impact ring, stronger camera shake, and a bronze HUD route readout.
- Demo input repeats these routes deterministically, and the visual check showed `WEAK · WEAK · HEAVY` alongside a live combo counter in the enemy crowd.

## Just guard update

- `L` is now a short guard action (displayed as L1 in the HUD). The first 0.16 seconds are the just-guard window; any later impact while the guard remains up blocks the hit without damage but does not enable the counter.
- A just guard gives rage, a bronze shock-ring, camera shake, 0.18 seconds of local combat slowdown, and staggers the attacker for 1.1 seconds. It opens a 0.72-second counter window.
- Pressing Heavy during the counter window triggers `JUST GUARD · COUNTER`: a 6.7m broad arc with high damage, high knockback, long forward step, and a stronger combat impact. The demo detects a strike impact and demonstrates the guard/counter path automatically.

## Rage release update

- `F` (R2 notation in the HUD) consumes 100 rage and triggers **怒破**. The attack rotates through four expanding full-circle pulses, each applying wide-area damage, escalating knockback, combat rings, camera shake, and a brief slow-motion beat.
- Every pulse emits a dense burst of DOM-projected `怒破` text cards from enemy hit locations and the player impact point. The effect uses only DOM/CSS positioning, avoiding runtime shader edits and preserving the 3D scene.
- Babylon's default vertex and fragment shader registration is explicitly imported in `GameWorld.ts`. This is required after clearing Vite's dependency optimizer cache; otherwise the preview browser may surface unresolved shader include syntax errors. `pnpm check` and `pnpm build` pass; the build still emits only the existing large-Babylon-bundle advisory.

## Rage-ready enemy outline update

- When rage reaches 100, every living barbarian mesh receives a bright bronze outline (`#FFE1A0`, width `0.085`) through Babylon's built-in outline pass. The highlight is recalculated after every player update and disables immediately when rage is spent by 怒破.
- Standard `?demo` now holds rage at 100 to inspect the ready-state outline. Add `autoMusou=1` to the demo query only when validating the automatic 怒破 sequence and its outline removal.

## Animal roster integration

- Uploaded repository-owned smooth GLBs to web storage and mapped the goose to the Player visual while cycling bear, crocodile, gorilla, hippopotamus, lion, and rhinoceros for BarbarianEnemy instances.
- Added `CharacterLibrary.ts` using Babylon GLTF loading and template cloning. Existing combat state, attack hitboxes, guard/counter, rage, rage-ready outlines, and 怒破 remain authoritative; procedural meshes are hidden after the corresponding GLB becomes ready.
- Latest browser verification loaded all seven GLBs with HTTP 200 responses. The preview showed the goose player silhouette and animal enemies in the Bronze & Blood arena. `pnpm check` and `pnpm build` pass; build retains the expected large Babylon bundle advisory.

## GLB animation integration

- `CharacterLibrary` loads each GLB instance with its AnimationGroups and maps `Idle`, `Guard`, `Punch_R`, and `Kick_L` to player and enemy states. Direct inspection confirmed that goose, bear, crocodile, gorilla, hippopotamus, lion, and rhinoceros all expose those four names.
- Player mapping: idle→Idle, guard→Guard, light/counter→Punch_R, heavy→Kick_L. Enemy mapping: idle/approach→Idle fallback, guard/telegraph→Guard, strike→Kick_L. Missing hurt/dead/musou groups reuse Guard/Idle/Kick aliases before falling back to procedural meshes, so the model never disappears.
- Added `?demo&animationTest=1&animationTestPhase=<idle|move|guard|light|heavy|hurt|dead>` for deterministic individual phase verification, plus `ANIMATION_PHASE_VERIFICATION.md` with the per-phase results. All seven fixed phases rendered without a blank scene.
- `pnpm check` and `pnpm build` pass. The build retains the existing Babylon bundle-size advisory. The dev log contains an older dotenv module warning from server tooling; no new browser/WebGL animation error appeared during the screenshots.
