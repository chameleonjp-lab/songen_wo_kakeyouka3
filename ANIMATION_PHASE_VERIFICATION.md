# Animation Phase Verification

検証URLは `/?demo&animationTest=1&animationTestPhase=<phase>`。7パスを個別に撮影し、画面が崩れずプレイヤー表示が維持されることを確認した。

| Phase | Requested state | Expected GLB group | Actual display policy | Result |
|---|---|---|---|---|
| 1 | idle | `Idle` | GLB `Idle` をループ再生 | PASS |
| 2 | move | `Walk` / `Run` / `Move`、無ければ `Idle` | 今回のGLBは `Idle` を移動フォールバックとして再生 | PASS |
| 3 | guard | `Guard` | GLB `Guard` をループ再生 | PASS |
| 4 | light | `Punch_R` | GLB `Punch_R` を再生 | PASS |
| 5 | heavy | `Kick_L` | GLB `Kick_L` を再生 | PASS |
| 6 | hurt | `Hurt` / `HitReact`、無ければ `Guard` / `Idle` | 今回のGLBは `Guard` を怯みフォールバックとして再生 | PASS |
| 7 | dead | `Death` / `Dead` / `Fall`、無ければ `Guard` / `Idle` | 今回のGLBは `Guard` を撃破フォールバックとして再生 | PASS |

7種（ガチョウ、熊、ワニ、ゴリラ、カバ、ライオン、サイ）の実GLBはすべて `Idle`, `Guard`, `Punch_R`, `Kick_L` を持つ。アニメーションが将来追加された場合はエイリアスが優先的に選択され、該当グループがない場合は手続きメッシュを残してキャラクターを不可視にしない。
