# GLB Animation Catalog

## 監査対象

対象は Goose、Gorilla、Crocodile、Lion、Bear、Hippopotamus、Rhinoceros、Poop head の8種類。それぞれ通常版と `-smooth` 版があり、計16ファイルです。`tools/audit_character_glbs.py --check` の実データ監査で、全ファイルに19本のスキン骨と44アニメーションがあることを確認しています。

44アニメーションの内訳は、基本状態4種と攻撃40種（パンチ20＋キック20）です。旧カタログの「4つしかない」という意味ではありません。4種はランタイムの基本状態aliasとして特に使われ、40種は [AttackCatalog.ts](client/src/game/AttackCatalog.ts) の名前付き攻撃カタログに対応します。

## 基本状態の共通名

| GLB | Idle | Guard | 基本ライト／カウンター | 基本ヘビー／敵strike |
|---|---|---|---|---|
| Goose（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Gorilla（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Crocodile（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Lion（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Bear（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Hippopotamus（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Rhinoceros（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |
| Poop head（通常／smooth） | `Idle` | `Guard` | `Punch_R` | `Kick_L` |

## 40攻撃アニメーション

| family | clips |
|---|---|
| Punch（20） | `Punch_01_Jab`, `Punch_02_Cross`, `Punch_03_Hook`, `Punch_04_Uppercut`, `Punch_05_Overhand`, `Punch_06_Backfist`, `Punch_07_LongJab`, `Punch_08_BodyHook`, `Punch_09_StraightBody`, `Punch_10_Elbow`, `Punch_11_SpinBackfist`, `Punch_12_DoubleJab`, `Punch_13_CrossHook`, `Punch_14_HookCross`, `Punch_15_OneTwo`, `Punch_16_RisingHook`, `Punch_17_LeapingPunch`, `Punch_18_ChargePunch`, `Punch_19_BurstPunch`, `Punch_20_HeavySmash` |
| Kick（20） | `Kick_01_Front`, `Kick_02_Low`, `Kick_03_Mid`, `Kick_04_High`, `Kick_05_Roundhouse`, `Kick_06_Side`, `Kick_07_Back`, `Kick_08_Axe`, `Kick_09_Sweep`, `Kick_10_Thrust`, `Kick_11_Spin`, `Kick_12_Heel`, `Kick_13_Knee`, `Kick_14_JumpFront`, `Kick_15_JumpRound`, `Kick_16_Double`, `Kick_17_Flying`, `Kick_18_Heavy`, `Kick_19_Crescent`, `Kick_20_Burst` |

監査レポートには各クリップの実測長、root translation／rotation、ノード候補を掲載しています。名前や長さを手書きで再定義せず、再生成・変更時は監査スクリプトを再実行してください。

## ランタイム対応

| ゲーム状態 | まず探す名前 | 現在のfallback |
|---|---|---|
| idle / spawn / recover | `Idle` | 手続きメッシュ |
| movement / approach | `Walk` / `Run` / `Move` | `Idle` または手続きメッシュ |
| guard / telegraph | `Guard` | 手続きメッシュ |
| player light | AttackCatalogのパンチ名 | `Punch_R` または手続きメッシュ |
| player heavy / enemy strike | AttackCatalogのキック名 | `Kick_L` または手続きメッシュ |
| counter | `Counter`、次に `Punch_R` | 手続きメッシュ |
| hurt / stagger / dead / musou | 将来の専用alias | `Guard`／`Idle`／手続きメッシュ |

`CharacterAnimator` は完全一致を優先し、次に大文字小文字を無視したalias／部分一致を使います。regularとsmoothはアニメーション値が一致するため、差は関節スキニングの滑らかさと負荷の選択です。実行時はsmoothを選択し、ロード失敗時もキャラクターを不可視にしません。
