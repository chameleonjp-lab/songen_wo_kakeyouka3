# PR #17後 要件・実装監査

## 対象と判定基準

- 対象基準: PR #17 merge commit `dcdd113`
- 正式仕様: [PLAN.md](PLAN.md)、[README.md](README.md)、[OPERATIONS.md](OPERATIONS.md)、[ENEMY_SPEC.md](ENEMY_SPEC.md)、[SCORE.md](SCORE.md)、[IPHONE.md](IPHONE.md)
- 合格条件: 実装経路、回帰試験、配布物検査を分け、実機でしか確定できない項目を合格扱いにしない

## 要件照合

| 要件 | 実装根拠 | 自動検査 | 判定 |
|---|---|---|---|
| 3秒待機、1.8秒幕間、同時敵1体、6体で勝利 | `GameWorld.ts`, `RoundFlow.ts` | 低fps分割、同フレーム遷移、最終撃破を検査 | コード合格・実ブラウザ6連戦待ち |
| 弱→強／弱→弱→強、入力順、0.62秒バッファ | `ComboRules.ts`, `InputManager.ts`, `GameWorld.ts` | 3回目の弱を破棄し、強は追越し不可 | 合格 |
| 通常ガード、0.16秒JG、0.72秒カウンター、相殺、怒破 | `CombatTiming.ts`, `CombatClash.ts`, `GameWorld.ts` | 境界値、通常strike、サイchargeを検査 | 合格 |
| 6体固有数値と行動 | `EnemyRoster.ts`, `EnemyCombat.ts` | 順番、倍率、接敵距離≤命中距離、固有分岐を検査 | 合格 |
| 体力、尊厳、Poop変身、得点台帳 | `Dignity.ts`, `Score.ts`, `GameSession.ts`, `GameWorld.ts` | 0境界、オーバーキル、尊厳損失の出所を検査 | 合格 |
| GLB読込、プリロード、失敗時の手続き表示 | `CharacterLibrary.ts`, `scene.ts` | timeout、rollback、fallback、16 GLB実データを検査 | コード合格・実WebGL表示待ち |
| 縦画面、タッチ、safe area、キーボード／支援技術 | `GameCanvas.tsx`, `InputManager.ts`, `index.css` | 入力解除、Tab、dialog、44px操作面を検査 | コード合格・iPhone実機待ち |
| 静的Pages配布 | `vite.config.ts`, `check_static_output.py` | 登録12素材、相対URL、デバッグ資産不在を検査 | 生成物合格・再配信待ち |

## 検出・対応一覧

| ID | PR #17後に残っていた問題 | 対応 |
|---|---|---|
| R-01 | 低fpsで経過時間を捨て、開始待機や幕間が実時間より遅れる | 最大0.05秒の分割更新で0.25秒まで保持 |
| R-02 | 2回目以降の更新／描画例外で進行とカメラが停止し得る | 手続き表示への一度限りの復旧と専用致命エラーを追加 |
| R-03 | WebGL初期化失敗が汎用ErrorBoundaryへ落ちる | Engine生成を捕捉し、ゲーム専用案内へ変更 |
| R-04 | WebGL切断復旧前の再描画と複数render loopが競合し得る | context状態とloop開始を単一管理し、自動pause後に復旧 |
| R-05 | 復旧、結果、停止画面が重なり、背後へフォーカスが残る | 優先順位付き単一modalとfocus trapへ統合 |
| R-06 | GLB読込／プリロードが無期限に待機する | 8秒timeoutと遅延完了物の破棄を追加 |
| R-07 | キャッシュ破棄が表示中cloneと共有する材質を壊し得る | clone材質を分離し、テンプレート破棄と独立化 |
| R-08 | clone生成途中の例外が未処理PromiseやScene残骸を残し得る | attach全体をtransaction化し、node／骨／animationをrollback |
| R-09 | 1件の破棄例外が後続破棄とcache clearを止める | 終了、fallback、cache、Animatorをbest-effort破棄へ統一 |
| R-10 | 手続き表示へ切替後もGLB再読込を続ける | fallback-only状態を追加し、再試行を停止 |
| R-11 | 尊厳0のPoop外見がGLB成功に依存し、遅延読込と競合する | 即時の手続きPoop頭部とrevision検査を追加 |
| R-12 | 敵撃破フレームを幕間時間へ二重計上し、1.8秒を短縮する | 遷移開始フレームを幕間から除外 |
| R-13 | 勝敗確定が倒れ演出を途中で止める | fallen／dead演出完了後に結果を確定 |
| R-14 | 最終撃破で敵の除去前に勝利へ進み得る | dead敵の完了と除去を確認してから勝利へ遷移 |
| R-15 | 撃破報酬が演出／振動／先読み失敗で失われ得る | 進行と台帳を先に確定し、任意演出を分離 |
| R-16 | 通常敵とカバが命中範囲外で攻撃を始め、永久に空振りし得る | 接敵距離と命中距離を共通データ化 |
| R-17 | Bearの攻撃中断条件が被ダメージ量依存だった | プレイヤーの弱攻撃を受けた場合だけ攻撃を継続する固有契約へ変更 |
| R-18 | Crocodile防御中に軽減後HP／尊厳0でも終端判定を飛ばす | 防御return前に撃破／変身を確定 |
| R-19 | Crocodile防御崩し1.15秒が共通よろめき0.22秒で上書きされる | 防御崩し専用の早期returnで保持 |
| R-20 | プレイヤーがガード削りでHP0でも戦闘を継続できる | 削り後に即時fallenへ遷移 |
| R-21 | 尊厳0時のJGで怒気倍率分岐へ到達できない | JG回復前の尊厳状態で倍率を判定 |
| R-22 | 相殺が60fpsのサンプリング位相で窓を飛び越える | 前フレームからの窓侵入を判定 |
| R-23 | Rhinoceros chargeが通常相殺窓とJGへ到達できない | charge接触を相殺／JGの実判定へ接続 |
| R-24 | 停止／入力解除前の予約コンボが再開後に復活する | pause時に入力queueと攻撃予約を破棄 |
| R-25 | 3回目の弱入力が2段目終了後の新コンボとして残る | 2段目中の追加弱だけを破棄し、強フィニッシュは保持 |
| R-26 | 最終オーバーキルを残HP以上の与／被ダメージとして計上する | 台帳へ記録するdamageを残HPで上限化 |
| R-27 | 敵へ与えた尊厳damageをプレイヤーの尊厳損失へ流せる未使用項目がある | 被弾側の専用eventへ一本化 |
| R-28 | ヒット、JG、相殺、結果が音声／演出例外で未確定になり得る | 論理・台帳を先にcommitし、任意表示を安全実行 |
| R-29 | ロック時カメラ補間の重複とdemo接近の座標系不一致 | カメラ更新を一経路へ統合し、world座標で接近 |
| R-30 | Tabとbutton上のSpaceをゲームが奪い、modal操作を妨げる | Tabをブラウザへ返し、form／dialog上のキーを除外 |
| R-31 | 合成clickでタッチ操作が発火せず、小画面D-padが40pxになる | 支援技術click経路と最小44px操作面を追加 |
| R-32 | 本番publicへ開発用debug collectorと不要Vite pluginが混入する | 公開資産と依存を削除し、静的検査で再混入を禁止 |

## 実測した自動検査

- TypeScript厳格検査: 合格
- Vitest: 18ファイル、95テスト合格
- pnpm 10.4.1 clean install／frozen lockfile: 合格
- GLB監査: 16ファイル合格、smooth版8ファイルと公開コピーが一致
- 本番build: 合格、`dist/public` の登録済みruntime素材12件を確認
- 主ゲーム遅延bundle: 1,751,673 bytes、gzip換算425,771 bytes。Viteの未圧縮500KB警告は残るため、iPhone実測を未検証扱いとする
- Nodeサーバーbundle: 生成合格（実行環境での起動確認は未実施）
- 開発用debug collector／不要runtime plugin: 生成物と依存の双方で0件

## 未検証として残す項目

- このブランチをWebGL対応ブラウザで開始し、6連戦、勝敗、全GLB、Console 0件を通すこと
- iPhone Safari縦画面で、6アクション、音声、振動、バックグラウンド復帰を通すこと
- GLB、画像、テクスチャ、生成元データの権利・クレジットを権利者記録で確定すること
- 静的Pagesで使わないNodeサーバー経路を、採用環境がある場合に別途検証すること

公開中のPR #17版はランチャーまで確認したものの、監査ブラウザにWebGLがなく、ゲーム開始時に汎用エラーとなりました。この再現結果をR-03の修正根拠には使いますが、修正ブランチの実WebGL合格根拠には使いません。
