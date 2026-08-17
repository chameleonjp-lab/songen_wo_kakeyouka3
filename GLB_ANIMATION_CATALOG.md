# GLB Animation Catalog

The seven repository-owned smooth GLBs were inspected from their glTF JSON chunks. Every model exposes the same four `AnimationGroup` names: `Idle`, `Guard`, `Punch_R`, and `Kick_L`.

| Model | Idle | Guard | Light / counter | Heavy / enemy strike |
|---|---|---|---|---|
| Goose | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Bear | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Crocodile | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Gorilla | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Hippopotamus | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Lion | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Rhinoceros | `Idle` | `Guard` | `Punch_R` | `Kick_L` |

`CharacterAnimator` resolves exact names first, then case-insensitive partial aliases. `Walk`/`Run`/`Move` and hurt/death/special aliases are supported when a future GLB adds them. If no matching group exists for a requested state, the corresponding procedural mesh remains visible as a visual fallback instead of hiding the character.

## Runtime mapping

| Game state | Player | Enemy |
|---|---|---|
| Idle / spawn / recover | `Idle` | `Idle` |
| Movement / approach | fallback unless a locomotion group exists | fallback unless a locomotion group exists |
| Guard / telegraph | `Guard` | `Guard` |
| Light attack | `Punch_R` | — |
| Heavy attack / strike | `Kick_L` | `Kick_L` |
| Counter | `Punch_R` | — |
| Hurt / stagger / dead / Musou | fallback until a matching future group exists | fallback until a matching future group exists |
