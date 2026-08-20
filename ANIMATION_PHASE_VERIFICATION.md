# Animation Phase Verification

## 目的

`/?demo&animationTest=1&animationTestPhase=<phase>` でプレイヤーと敵の7フェーズを固定表示し、GLBの実アニメーションまたは意図したfallbackが選ばれ、画面が空白にならないことを確認する。これは表示／回帰監査であり、未実装の専用hurt／deadクリップを実装済みと宣言するものではありません。

| Phase | 要求状態 | 期待するGLB group | 現在の表示ポリシー | 記録 |
|---|---|---|---|---|
| idle | idle | `Idle` | `Idle` をループ | 既存の画面監査で表示維持を確認。最終コード変更後に再撮影 |
| move | move | `Walk`／`Run`／`Move`、なければ`Idle` | 今回のGLBは`Idle`を移動fallbackとしてループ | 同上 |
| guard | guard | `Guard` | `Guard` をループ | 同上 |
| light | light | 名前付きパンチ（fallback `Punch_R`） | AttackCatalogの40攻撃から選択し、未取得時は`Punch_R` | 同上 |
| heavy | heavy | 名前付きキック（fallback `Kick_L`） | AttackCatalogの40攻撃から選択し、未取得時は`Kick_L` | 同上 |
| hurt | hurt | `Hurt`／`HitReact`、なければ`Guard`／`Idle` | 専用groupがないため`Guard`または`Idle`へfallback | 専用hurtの完成宣言はしない |
| dead | dead | `Death`／`Dead`／`Fall`、なければ`Guard`／`Idle` | 専用groupがないため`Guard`または`Idle`へfallback | 専用deadの完成宣言はしない |

## 実行手順

1. `pnpm dev` またはPagesのプレビューを起動する。
2. 7つの `animationTestPhase` 値（`idle`, `move`, `guard`, `light`, `heavy`, `hurt`, `dead`）を個別に開く。
3. ブラウザconsoleでGLB 404、未処理Promise、shader errorがないことを確認する。
4. プレイヤーと敵の表示が残り、HUDのTESTラベルが対象phaseを示すことを確認する。
5. 最終コード変更後の結果を、この表の「記録」または監査レポートへ追記する。前回のPASSを新しいビルドの証拠として再利用しない。

## 実データとの関係

全16 GLBは19骨・44アニメーション（基本4＋攻撃40）を持ちますが、基本4以外の攻撃名はゲーム状態への割り当てが必要です。通常版とsmooth版の形状・アニメーション値は同じで、smooth版だけがJOINTS／WEIGHTSの複数bone influenceを使用します。詳細は [GLB_REAL_DATA_AUDIT.md](GLB_REAL_DATA_AUDIT.md) と [GLB_ANIMATION_CATALOG.md](GLB_ANIMATION_CATALOG.md) を参照してください。
