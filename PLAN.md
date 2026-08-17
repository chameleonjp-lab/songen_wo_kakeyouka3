# BARBARIAN ARENA — Production Plan

## Goal

Build a playable third-person Babylon.js combat prototype where a deliberately blocky player defeats constantly spawning humanoid barbarians inside a bounded arena using light and heavy attack combos.

## Core loop

Move inside a circular arena, acquire nearby enemies, chain light and heavy attacks, avoid telegraphed enemy swings, keep the kill counter rising, and survive against a growing group.

## Risk slices

| Slice | Risk | Success criterion |
|---|---|---|
| Camera + input | Third-person control can feel unstable in a browser | Keyboard movement and mouse camera keep the player readable at all times. |
| Combat timing | Attack hit windows can feel disconnected | □/J light and △/K heavy attacks have visible wind-up, hit, recovery, and a three-step combo chain. |
| Enemy crowd | Many enemies can overlap or fail to threaten | Enemies spawn continuously, keep separation, chase, telegraph, attack, stagger, and die. |
| Performance | Dense 3D enemy models can harm frame time | Enemies use procedural articulated meshes and shared materials; the active crowd is capped. |
| Visual clarity | Realistic-looking enemy request conflicts with procedural prototype | Generated warrior texture sheets are applied to segmented 3D enemy bodies; player remains intentionally blocky. |

## Acceptance criteria

The delivered page is a full-screen playable arena. It visibly contains a third-person player, textured humanoid barbarians, a bounded fighting area, health and rage HUD, attack controls, a growing kill counter, obvious melee impacts, and an autoplay `?demo` mode for visual verification.

## Asset assignments

The arena floor uses the generated cracked-earth texture tiled every 2.5m. Barbarian armor and skin use the generated surface sheet as a high-detail texture layer over articulated procedural body meshes. The title/HUD uses the transparent arena sigil. The generated visual-target image is the composition reference for the camera, density, color, and HUD placement.
