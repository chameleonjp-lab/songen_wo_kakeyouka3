# BARBARIAN ARENA — Structure

## Runtime composition

React owns the full-screen frame and accessible HUD. Babylon.js owns the canvas, scene, cameras, materials, meshes, particles, and render loop. The game mechanics remain framework-agnostic TypeScript under `client/src/game/`.

```text
GameCanvas.tsx
  └─ createGameScene(engine, canvas)
       └─ GameWorld
            ├─ InputManager
            ├─ ThirdPersonCamera
            ├─ Player
            ├─ EnemySpawner
            │    └─ BarbarianEnemy[]
            ├─ ArenaEnvironment
            └─ CombatFX
```

## Core objects

| Object | Responsibility |
|---|---|
| `GameWorld` | Owns scene time, game state, player, enemy collection, HUD events, and cleanup. |
| `InputManager` | Converts keyboard, pointer, and demo autopilot input into semantic movement and combat actions. |
| `Player` | Owns the blocky fighter mesh, movement, facing, combo state machine, health, rage, attack hit windows, and dodge state. |
| `BarbarianEnemy` | Owns articulated mesh parts, deterministic idle/walk/attack/stagger/death animation, separation steering, and damageability. |
| `EnemySpawner` | Maintains a readable capped crowd and spawns enemies at the arena boundary. |
| `ArenaEnvironment` | Builds the arena floor, stone border, banners, braziers, and lighting from procedural geometry and generated textures. |
| `CombatFX` | Handles impact rings, short-lived dust, hit flashes, camera shake requests, and damage-number events. |

## State machines

`Player`: `idle → move → light-1 → light-2 → light-3 | heavy → recover | dodge → idle`.

`BarbarianEnemy`: `spawn → approach → telegraph → strike → recover | stagger → death → remove`.

## Asset hints

Use the generated ground texture on a tiled StandardMaterial ground surface. The barbarian-surface image supplies the detailed surface language for a shared enemy material and for UI background accents. Geometry remains procedural: cylinders, boxes, spheres, extruded straps, and planes are sufficient for the prototype and support code-driven attacks without a rigged GLB pipeline.
