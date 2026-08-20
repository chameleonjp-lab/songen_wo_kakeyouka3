# ブラウザゲーム敵対的検証レポート

> **履歴資料（2026-08-17時点）:** これは旧bear-first実装の検証記録であり、現在の6連戦ブランチの合格根拠ではありません。記載されたVitest件数、bundle容量、ERROR/404件数を現行値として引用しないでください。現行の未検証項目は [KNOWN_ISSUES.md](KNOWN_ISSUES.md) を参照してください。

**対象:** Barbarian Arena

**実施日:** 2026-08-17

## 実施した攻撃的ケース

| 領域 | 実行したケース | 観測結果 |
|---|---|---|
| 戦闘分岐 | `clashAudit`、`combatAudit`、`lockAudit`を同時実行 | 攻撃相殺で双方ダメージ0、ジャストガード、カウンター開始を確認 |
| 必殺技 | `autoMusou`と`adversarialAudit`を同時実行 | 怒破の怒気100消費と開始ログを確認 |
| 撃破境界 | 敵HPを1へ設定して通常の`takeDamage(1)`を実行 | 敵撃破と幕間開始を確認。ただし下記の高影響度問題を検出 |
| カメラ | 大きなPCマウスlook相当入力 | 背後基準を維持。orbitOffset=-0.720、beta=1.140 |
| 小型モバイル | 320x568、監査同時実行 | HUD、幕間、Dパッド、戦闘ボタンを同時表示。例外なし |
| ランタイム | ブラウザコンソール、ネットワーク、型チェック、Vitest | ERROR/WARN 0、4xx/5xx 0、Vitest 13件成功 |

## 発見事項

| 影響度 | 状態 | 内容 | 再現条件 | 影響 |
|---|---|---|---|---|
| **High** | **修正済み** | 撃破直前の敵を倒したフレームで、次敵が`NEXT CHALLENGER`の待機時間を待たずにスポーンする可能性があった | `?demo&autoMusou&adversarialAudit` | 更新順を修正し、撃破後に`challengeVisible=true`、その後に次敵スポーンとなることを確認 |
| **Low** | 改善候補 | 本番ビルドのBabylon.js主チャンクが約2.79 MB（gzip約699 KB）でサイズ警告を出す | 本番ビルド | 低速回線のモバイル初回読み込みが遅くなる可能性 |

## 高影響度問題の根拠

初回監査では、`prelethal target=bear health=1`の直後に`challengeVisible=false spawned=crocodile`が記録され、その後に`challengeVisible=true defeated=bear`が記録されました。敵更新より前にスポーン判定をしていたため、撃破報酬が`spawnClock`へ幕間時間を設定するより先に初期値0が消費される更新順の問題でした。

## 推奨対応

敵更新と撃破報酬の後にスポーン判定を実行するよう変更しました。`RoundFlow`回帰テストでは、撃破直後の`spawnClock=1.8`で新規スポーンしないこと、待機時間の満了後だけ出現することを固定しています。再監査では、`challengeVisible=true defeated=bear`が先に記録され、約1.8秒のゲーム内待機後に`challengeVisible=false spawned=crocodile`が記録されました。
