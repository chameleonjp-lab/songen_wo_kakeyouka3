# Songen wo Kakeyouka 3 — Barbarian Arena

Babylon.js と React で構築した、動物キャラクターによる三人称1対1ムソウ系アクションゲームのプロトタイプです。ガチョウをプレイヤーキャラクターとし、熊・ワニ・ゴリラ・カバ・ライオン・サイが順番に登場する敵として実装しています。

## 主な機能

- 弱攻撃・強攻撃、および弱→強、弱→弱→強の派生コンボ
- ジャストガード、カウンター攻撃、攻撃相殺、怒気ゲージ、怒破スペシャル
- 怒気最大時の敵輪郭強調と、発動前の範囲表示
- 1対1のラウンド進行、撃破後のNEXT CHALLENGER幕間、敵種別ごとの登場演出・挑発・咆哮
- PCとスマートフォンに対応した固定背後斜め上カメラ、ロックオン、タッチDパッド、アクションボタン、ハプティクス
- GLBアニメーション連動、攻撃タイミング同期、立体音響、次敵モデルのバックグラウンドプリロード
- Babylon.jsの遅延読み込みによる初期バンドル最適化

## 起動

```bash
pnpm install
pnpm dev
```

ブラウザで表示された開発サーバーのURLを開き、「ARENAへ入る」を選択してください。ゲームのGLB・テクスチャは `client/public/assets/` に同梱しているため、GitHubから取得した状態だけで参照できます。

## 検証

```bash
pnpm check
pnpm test
pnpm build
```

監査用クエリとして、`?demo`、`?demo&clashAudit`、`?demo&lockAudit`、`?demo&audioAudit&audioDebug`、`?demo&preloadAudit`、`?demo&adversarialAudit` などを利用できます。詳細な検証結果は `ADVERSARIAL_TEST_REPORT.md`、アニメーション対応表は `GLB_ANIMATION_CATALOG.md` と `ANIMATION_PHASE_VERIFICATION.md` を参照してください。

## ディレクトリ

- `client/src/game/`: Babylon.jsのゲームワールド、入力、カメラ、キャラクター、音響、アセット管理
- `client/src/components/GameCanvas.tsx`: Reactホスト、ランチャー、モバイルHUD
- `client/public/assets/`: ゲーム実行に必要な画像・GLBアセット
- `server/*.test.ts`: 戦闘、入力、カメラ、ラウンド進行、プリロードなどのVitest回帰テスト
- `todo.md`: 実装履歴と検証項目

## ライセンスと素材

このリポジトリに含まれるキャラクターGLB・画像素材の利用条件は、素材の提供元およびプロジェクトの管理者が定める条件に従ってください。
