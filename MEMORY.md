# Barbarian Arena — 開発メモ

## 仕様の不変条件

- 正式なゲームループは6体の連続1対1。敵の同時生存数は最大1体。
- ロスター順は **GORILLA → CROCODILE → LION → BEAR → HIPPOPOTAMUS → RHINOCEROS**。開始待機は3秒、撃破後の幕間は1.8秒。
- プレイヤーの初期体力・尊厳は100、怒気の上限は100。敵を倒すと次の敵へ進み、6体撃破で勝利する。
- 旧版の「無限スポーン」「増え続ける群れ」「キルカウンターを無限に伸ばす」は正式仕様ではない。古い文言を実装根拠にしない。

## 実装方針

- Reactは起動画面、HUD、タッチUIを担当し、Babylon.jsはcanvas、Scene、カメラ、GLB、戦闘エフェクトを担当する。
- GameWorldの戦闘結果は `GameSession` に記録し、純粋な計算は `AttackCatalog`、`CombatBalance`、`HitLocations`、`Dignity`、`Score`、`EnemyRoster` に置く。
- 体力と尊厳を別に扱う。頭は尊厳への圧力、心臓は開放状態で大きな体力／得点、胴体は基準ダメージとする。心臓をノード名や高さだけで推測しない。
- 攻撃カタログはGLB監査に存在するパンチ20＋キック20の40クリップを名前付きで扱う。状態に対応するクリップがない場合はエイリアスまたは手続きメッシュへフォールバックする。
- GLBはsmooth版をランタイムで選び、通常版も同梱する。regular/smoothの差は主にスキニング influenceで、形状・アニメーション値は同一。
- カメラ位置は常にプレイヤー背後の固定三人称を基準にし、ロックオンは注視点だけを補助する。敵方向へカメラ位置を反転させない。

## 検証の事実

- `tools/audit_character_glbs.py --check` の対象は16ファイル、全ファイル19骨・44アニメーション。40個がパンチ／キック攻撃。
- `server/round-flow.test.ts` は3秒の初期待機、1.8秒幕間、敵1体制約を検証する。
- `server/gameplay-rules.test.ts` はロスター、ヒット位置、尊厳、スコア、入力キュー、40攻撃カタログを検証する。
- `server/mobile-input.test.ts` はDパッドの長押し・斜め入力、タッチカメラ、PC pointer、カメラ上下限、ハプティクスの安全な無効化を検証する。
- `server/combat-audio.test.ts`、`server/combat-clash.test.ts`、`server/fixed-third-person-camera.test.ts`、`server/character-preload.test.ts` は音響、相殺、カメラ、プリロードを検証する。

## 公開の不変条件

- `vite.config.ts` の `root=client`、`publicDir=client/public`、`base=./`、`build.outDir=dist/public` を維持する。
- `client/src/game/assets.ts` の公開アセットURLは `import.meta.env.BASE_URL` を経由する。先頭 `/` の素材URLへ戻さない。
- CIはpnpm 10.4.1、frozen install、check／test／build、GLB監査を実行する。Pagesは `dist/public` のみをartifactにする。

## 保留・注意

- ブラウザ実機での最終6戦クリア、iPhone Safari、GitHub Pagesのプロジェクトパスは、コード変更後に再確認する。`?demo` のPASSは本番機能の完成宣言ではない。
- オンラインランキング／アカウント／サーバー送信は未採用。個人ベストは端末内保存だけである。
- `package.json` のMIT表記はコードのメタデータ。GLB・画像・生成データのライセンスは別管理で、許諾不明のまま断定しない。
