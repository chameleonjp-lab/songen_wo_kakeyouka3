# Barbarian Arena — 構成

## 実行時の流れ

```text
App.tsx
  ├─ GameLauncher.tsx（名前入力・起動）
  └─ lazy GameCanvas.tsx（起動後にゲーム部を読み込む）
       └─ createGameScene()
            └─ GameWorld
                 ├─ InputManager
                 ├─ FixedThirdPersonCamera / CameraRig
                 ├─ Player
                 ├─ BarbarianEnemy（常時最大1体）
                 ├─ CharacterLibrary（GLB + fallback）
                 ├─ GameSession（スコア・結果）
                 └─ CombatAudio / Haptics / effects
```

`App` とランチャーはReactの責務、BabylonのScene・カメラ・メッシュ・アニメーション・レンダーループは `GameWorld` の責務です。純粋なゲームルールはBabylonに依存しない `client/src/game/` のデータ／関数として分離されています。

## 主なファイル

| ファイル | 責務 |
|---|---|
| `client/src/App.tsx` | プレイヤー名、起動遅延ロード、再試行、demoフラグ |
| `client/src/components/GameCanvas.tsx` | canvasホスト、HUD、チャレンジャー幕間、タッチ操作 |
| `client/src/game/scene.ts` | Engine／Sceneを作り、GameWorldを接続 |
| `client/src/game/GameWorld.ts` | 6ラウンドの状態、敵1体制約、戦闘、カメラ、HUDイベント、後始末 |
| `client/src/game/InputManager.ts` | キーボード、canvas pointer、タッチイベント、demo入力を意味的操作へ変換 |
| `client/src/game/CharacterLibrary.ts` | smooth GLBのプリロード、インスタンス化、AnimationGroup、ロード失敗時のfallback |
| `client/src/game/EnemyRoster.ts` | 6敵の順番と個別の体力／攻撃／速度／予兆／スコア係数 |
| `client/src/game/AttackCatalog.ts` | 20パンチ＋20キックの40攻撃と選択条件 |
| `client/src/game/HitLocations.ts` | 頭・胴体・条件付き心臓の判定、ダメージ・尊厳・スコア係数 |
| `client/src/game/Score.ts` / `GameSession.ts` | 不変のスコア台帳、結果、個人ベスト（端末内） |
| `client/src/game/CameraRig.ts` / `FixedThirdPersonCamera.ts` | ロックオン中もプレイヤー背後を維持するカメラ制約 |
| `client/public/assets/` | Pagesでそのまま配信する画像、runtime用smooth 8 GLB、debug用静的ファイル（regular版は原本のみ） |
| `tools/audit_character_glbs.py` | GLBの19骨、44アニメーション、regular/smooth差分の監査 |

## 状態と境界

```text
run: launch → opening wait (3s) → duel
duel: spawn → approach → telegraph → strike → recover
                 └→ stagger / dead → NEXT CHALLENGER (1.8s) → next duel
run end: six defeats → victory / player health zero → defeat / retire → retired
```

これは1対1連戦の状態図であり、旧版の無限スポーンや群れの受け入れ条件を表しません。ロックオン対象が死ぬか幕間に入ると解除し、次の敵がapproachへ入った時点で再取得します。

## 静的公開の境界

Viteの `root` は `client/`、`publicDir` は `client/public/`、`base` は `./` です。`pnpm build` のWeb配信物は `dist/public/`、サーバー用の `pnpm build:server` は `dist/server/` に分離されています。GitHub Pages artifactには前者だけをアップロードします。
