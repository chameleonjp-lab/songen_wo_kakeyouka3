# 操作・監査ガイド

## 起動

1. ランチャーでプレイヤー名を入力する（最大12文字、空欄は不可）。
2. 「闘技場へ」を押す。ゲーム部は遅延ロードされ、最初の敵は3秒後に登場する。
3. 名前と個人ベストは `localStorage` に保存される。保存できない環境でもプレイは継続する。

## PC／コントローラー表記

| 操作 | キーボード | HUDのコントローラー表記 |
|---|---|---|
| 移動 | W/A/S/D | — |
| 弱攻撃 | J または canvas左クリック | □ |
| 強攻撃 | K または canvas右クリック | △ |
| ガード | L（押下中） | L1 |
| 怒破 | F（怒気100以上） | R2 |
| 回避 | Space | — |
| 狙い切替 | Q または Tab | — |
| 一時停止 | Esc | — |
| リスタート | R | — |
| 視点 | canvas上でpointerをドラッグ | — |

弱攻撃中に次の弱／強を短い入力バッファへ入れると、弱→弱→弱または弱→強のルートになります。ジャストガードはガード開始直後の約0.16秒、成功後のカウンター受付は約0.72秒です。攻撃相殺の判定窓は攻撃進行度0.40〜0.68です。

## スマホ／iPhone

画面下のDパッドを長押しして移動し、右側の「回避」「防御」「怒破」「弱攻撃」「強攻撃」をタップします。Dパッドとカメラ用の空き面は分離されています。空き面のスワイプで視点を動かし、カメラはプレイヤー背後の範囲から外れません。

pointer cancel、画面離脱、visibility変更、orientation変更では押下状態をリセットします。`prefers-reduced-motion` または `navigator.vibrate` 非対応時は振動を使いません。詳細な実機項目は [IPHONE.md](IPHONE.md) を参照してください。

## デモ／回帰監査URL

ベースURLに次のクエリを追加します。監査ログはブラウザconsole、HUD、または `audioDebug` パネルで確認します。

| URL | 目的 |
|---|---|
| `?demo` | 決定論的な敵配置、移動、攻撃、怒気を使う画面デモ |
| `?demo&clashAudit` | 同時攻撃を発生させ、双方ダメージ0の相殺を記録 |
| `?demo&combatAudit` | ガード、ジャストガード、カウンターの経路を記録 |
| `?demo&lockAudit` | ロック対象の取得／解除／再取得、orbit／beta制限を記録 |
| `?demo&audioAudit&audioDebug` | 6種の登場咆哮、pan、reverbを記録 |
| `?demo&preloadAudit` | 次敵のrequested／ready／consumedを記録 |
| `?demo&preloadFailureAudit` | プリロード失敗から通常ロードへfallbackする経路 |
| `?demo&adversarialAudit` | 撃破直前、幕間、怒破の境界 |
| `?demo&quickAudit` | 各敵の体力を1に固定し、6連戦と結果画面を短時間で確認 |
| `?demo&animationTest=1&animationTestPhase=idle` | `idle`等7フェーズを固定表示 |

監査は機械的な検証用であり、demo画面の敵数や自動攻撃を正式な難易度・集団戦仕様と解釈しません。
