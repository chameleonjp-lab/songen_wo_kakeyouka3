# 尊厳を賭けようか3 — Barbarian Arena

Babylon.js と React で作る、動物キャラクターの三人称1対1アクションゲーム・プロトタイプです。プレイヤーはガチョウ。ゴリラ、ワニ、ライオン、クマ、カバ、サイと6ラウンド連続で一騎打ちします。

> 仕様上、旧資料にある「敵が無限に出現する集団戦」「常時増加する群れ」は正式なゲームループではありません。現在の正式仕様は、同時に1体だけ戦う6戦の連戦です。古い集団戦の記述は履歴または未採用案として扱ってください。

## 現在実装されている範囲

- 弱攻撃、強攻撃、弱→強／弱→弱→強の派生コンボ
- 攻撃相殺、通常ガード、0.16秒のジャストガード、カウンター、怒気100消費の怒破
- 頭・胴体・条件付きの心臓を狙うヒット位置、体力と尊厳の別メーター、コンボとスコア台帳
- 3秒の開始待機、撃破後1.8秒の `NEXT CHALLENGER` 幕間、6体固定ロスター、勝利／敗北／リタイア結果
- 固定背後斜め上の三人称カメラ、敵1体のロックオン、PCマウス視点、スマホのDパッド／タッチカメラ／ハプティクス
- ガチョウ（プレイヤー）と6種の敵GLB。GLBが読み込めない場合は手続きメッシュへフォールバック
- GLB実データ監査（16ファイル、19骨、44アニメーション、40攻撃アニメーション）と次敵モデルのプリロード
- スマートフォンは縦画面を正式なプレイレイアウトとし、横画面では縦画面へ戻す案内を表示

未完成の機能や検証待ちは [KNOWN_ISSUES.md](KNOWN_ISSUES.md) に分けて記録しています。検証用の `?demo` は、完成度を示すモードではなく、決定論的な画面・回帰監査用です。

## 起動

```bash
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install --frozen-lockfile
pnpm dev
```

開発サーバーのURLを開き、プレイヤー名を入力して「闘技場へ」を選択します。名前はこの端末の `localStorage` に保存され、アカウント登録やオンラインランキング送信はありません。

## 検証とビルド

```bash
pnpm check
pnpm test
python3 tools/audit_character_glbs.py --check
pnpm build
```

`pnpm build` はViteの静的出力を `dist/public/` に作ります。サーバー用バンドルが必要な環境だけ `pnpm build:server`（`dist/server/`）を別に実行します。GitHub Pagesへ公開するのは `dist/public/` だけです。ローカルで静的出力を確認する場合は `pnpm exec vite preview --host` を使えます。

監査用クエリの例:

- `?demo` — 決定論的な戦闘デモ
- `?demo&clashAudit` — 攻撃相殺
- `?demo&combatAudit` — ガード／ジャストガード／カウンター
- `?demo&lockAudit` — ロックオンとカメラ
- `?demo&audioAudit&audioDebug` — 敵登場咆哮、pan、reverb
- `?demo&preloadAudit` / `?demo&preloadFailureAudit` — プリロード成功／フォールバック
- `?demo&adversarialAudit` — 撃破境界と怒破
- `?demo&quickAudit` — 6連戦と結果画面を短時間で確認する開発用経路
- `?demo&animationTest=1&animationTestPhase=<idle|move|guard|light|heavy|hurt|dead>` — アニメーション検証

## 構成と資料

- [OPERATIONS.md](OPERATIONS.md) — PC、コントローラー表記、スマホ／iPhone操作、監査URL
- [SCORE.md](SCORE.md) — 体力、怒気、尊厳、スコア計算と結果
- [ENEMY_SPEC.md](ENEMY_SPEC.md) — 6敵の順番、行動特性、登場演出
- [PUBLISHING.md](PUBLISHING.md) — CI、GitHub Pages、静的公開範囲
- [IPHONE.md](IPHONE.md) — iPhone Safariの確認項目と制約
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — 未完成・検証待ち・既知の制約
- [GLB_REAL_DATA_AUDIT.md](GLB_REAL_DATA_AUDIT.md) — GLBの実データ監査詳細
- [GLB_ANIMATION_CATALOG.md](GLB_ANIMATION_CATALOG.md) — 44アニメーション／40攻撃の対応表
- [ANIMATION_PHASE_VERIFICATION.md](ANIMATION_PHASE_VERIFICATION.md) — 7フェーズの検証手順とフォールバック方針
- [ADVERSARIAL_TEST_REPORT.md](ADVERSARIAL_TEST_REPORT.md) — 旧実装に対する履歴監査（現行ブランチの合格根拠ではない）

主要ディレクトリは `client/src/game/`（ゲームルール、入力、カメラ、GLB、音響）、`client/src/components/`（ReactホストとHUD）、`client/public/assets/`（同梱素材）、`server/*.test.ts`（Vitest回帰テスト）です。

## ライセンスと素材

ソースコードのライセンス欄は `package.json` の `MIT` です。ただし、このリポジトリにはMIT本文の `LICENSE` ファイルは同梱されていません。GLB、画像、テクスチャ、生成元データの権利・利用条件はコードとは別管理で、現時点の資料だけでは個別のライセンスを確定できません。素材の再配布・商用利用を行う前に、提供元またはプロジェクト管理者の許諾とクレジット条件を確認してください。
