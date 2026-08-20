# GLB実データ監査報告

対象の16個（8種類×通常版/スムース版）のGLBを、glTF JSONチャンクとBINチャンクから直接読み取った監査結果です。レンダラーのロード結果や生成スクリプトの宣言値には依存していません。44アニメーションの内訳は基本4種＋パンチ20種＋キック20種、つまり40攻撃アニメーションです。

再生成コマンド: `python3 tools/audit_character_glbs.py`

## 結論

- 対象は **16ファイル**。全ファイルが19本のスキン骨、44アニメーション（基本4種＋攻撃40種）を持ちます。アニメーション名と長さは全16ファイルで一致: **True**。
- 通常版とスムース版は、頂点位置・法線・UV・インデックス、ノード名、アニメーション値が一致します。差分は実データ上の `JOINTS_0` / `WEIGHTS_0` と `asset.extras.model` です。
- 通常版は全頂点が1本の骨（1 influence）。スムース版は全頂点が2〜4本の骨で重み付けされ、最大4本です。頂点数・メッシュ数・材質数・テクスチャ数はペア内で変わりません。
- 埋め込み画像はガチョウとうんこ頭のみ（各12画像/12テクスチャ、各128×128 PNG）。クマ、ワニ、ゴリラ、カバ、ライオン、サイは画像0/テクスチャ0です。
- ルート骨名は `root`（nodes indexはファイル別表）。初期移動 (+0.000, +0.000, +0.000)、初期回転 quaternion (+0.000, +0.000, +0.000, +1.000)。全ファイルでルート移動/回転のキーフレーム構造は一致: **True**。

## ファイル別実測値

`vertices` は各 primitive の POSITION accessor の合計、`triangles` はインデックス数÷3です。`images/textures` はGLB内の images/textures 配列の件数です。

| 種類 | 版 | ファイル | bytes | nodes/meshes | vertices/triangles | 材質 | images/textures | bones | animations |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| ガチョウ | 通常 | `goose-heart-champion.glb` | 1,207,604 | 107/88 | 8,196/13,864 | 18 | 12/12 | 19 | 44 |
| ガチョウ | スムース | `goose-heart-champion-smooth.glb` | 1,207,608 | 107/88 | 8,196/13,864 | 18 | 12/12 | 19 | 44 |
| クマ | 通常 | `bear-heart-champion.glb` | 625,020 | 87/68 | 6,809/11,536 | 19 | 0/0 | 19 | 44 |
| クマ | スムース | `bear-heart-champion-smooth.glb` | 625,028 | 87/68 | 6,809/11,536 | 19 | 0/0 | 19 | 44 |
| ワニ | 通常 | `crocodile-heart-champion.glb` | 631,964 | 93/74 | 6,826/11,548 | 20 | 0/0 | 19 | 44 |
| ワニ | スムース | `crocodile-heart-champion-smooth.glb` | 631,972 | 93/74 | 6,826/11,548 | 20 | 0/0 | 19 | 44 |
| ゴリラ | 通常 | `gorilla-heart-champion.glb` | 630,572 | 88/69 | 6,886/11,656 | 19 | 0/0 | 19 | 44 |
| ゴリラ | スムース | `gorilla-heart-champion-smooth.glb` | 630,580 | 88/69 | 6,886/11,656 | 19 | 0/0 | 19 | 44 |
| カバ | 通常 | `hippopotamus-heart-champion.glb` | 627,324 | 88/69 | 6,827/11,552 | 19 | 0/0 | 19 | 44 |
| カバ | スムース | `hippopotamus-heart-champion-smooth.glb` | 627,332 | 88/69 | 6,827/11,552 | 19 | 0/0 | 19 | 44 |
| ライオン | 通常 | `lion-heart-champion.glb` | 642,084 | 88/69 | 7,082/12,016 | 20 | 0/0 | 19 | 44 |
| ライオン | スムース | `lion-heart-champion-smooth.glb` | 642,092 | 88/69 | 7,082/12,016 | 20 | 0/0 | 19 | 44 |
| サイ | 通常 | `rhinoceros-heart-champion.glb` | 630,280 | 89/70 | 6,861/11,632 | 19 | 0/0 | 19 | 44 |
| サイ | スムース | `rhinoceros-heart-champion-smooth.glb` | 630,284 | 89/70 | 6,861/11,632 | 19 | 0/0 | 19 | 44 |
| 共通うんこ頭 | 通常 | `poop-heart-champion.glb` | 1,071,032 | 81/62 | 6,606/11,276 | 12 | 12/12 | 19 | 44 |
| 共通うんこ頭 | スムース | `poop-heart-champion-smooth.glb` | 1,071,040 | 81/62 | 6,606/11,276 | 12 | 12/12 | 19 | 44 |

## 通常版/スムース版の実データ差分

`changed BIN bytes` はBINチャンク内の異なるバイト数です。JSON構造は `asset.extras.model` を除けば一致し、通常版/スムース版のファイルサイズ差はJSONのモデル名と4/8バイトのチャンクパディングによるものです。

| 種類 | geometry (POSITION/NORMAL/UV/indices) | animation data | nodes | JOINTS_0差分 | WEIGHTS_0差分 | 通常版 influence | スムース版 influence | changed BIN bytes | file delta |
|---|---|---|---|---|---|---|---|---:|---:|
| ガチョウ | True | True | True | True | True | 1本=8,196頂点 | 2本=3,694頂点, 3本=4,315頂点, 4本=187頂点 | 92,958 | +4 |
| クマ | True | True | True | True | True | 1本=6,809頂点 | 2本=2,699頂点, 3本=3,923頂点, 4本=187頂点 | 79,387 | +8 |
| ワニ | True | True | True | True | True | 1本=6,826頂点 | 2本=2,716頂点, 3本=3,923頂点, 4本=187頂点 | 79,526 | +8 |
| ゴリラ | True | True | True | True | True | 1本=6,886頂点 | 2本=2,776頂点, 3本=3,923頂点, 4本=187頂点 | 80,003 | +8 |
| カバ | True | True | True | True | True | 1本=6,827頂点 | 2本=2,717頂点, 3本=3,923頂点, 4本=187頂点 | 79,533 | +8 |
| ライオン | True | True | True | True | True | 1本=7,082頂点 | 2本=2,972頂点, 3本=3,923頂点, 4本=187頂点 | 81,571 | +8 |
| サイ | True | True | True | True | True | 1本=6,861頂点 | 2本=2,751頂点, 3本=3,923頂点, 4本=187頂点 | 79,801 | +4 |
| 共通うんこ頭 | True | True | True | True | True | 1本=6,606頂点 | 2本=2,530頂点, 3本=3,889頂点, 4本=187頂点 | 77,743 | +8 |

## ルート移動・回転

各クリップの `root T peak` は初期 root translation からの最大距離（m）と、その時点のΔベクトルです。`root R peak` は初期 quaternion からの最大軸角で、生成データはY軸回転なので実質的に符号付きyawです。

| ファイル | root node | base T | base R | translation channels | 最大T変位 | rotation channels | 最大R |
|---|---|---|---|---:|---|---:|---|
| `goose-heart-champion.glb` (ガチョウ) | `88:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |
| `bear-heart-champion.glb` (クマ) | `68:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |
| `crocodile-heart-champion.glb` (ワニ) | `74:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |
| `gorilla-heart-champion.glb` (ゴリラ) | `69:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |
| `hippopotamus-heart-champion.glb` (カバ) | `69:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |
| `lion-heart-champion.glb` (ライオン) | `69:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |
| `rhinoceros-heart-champion.glb` (サイ) | `70:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |
| `poop-heart-champion.glb` (共通うんこ頭) | `62:root` | (+0.000, +0.000, +0.000) | (+0.000, +0.000, +0.000, +1.000) | 41 | 0.756 m (`Kick_17_Flying`, Δ(+0.100, +0.620, +0.420)) | 23 | -49.27° (`Kick_11_Spin`) |

### 44アニメーションの名前・長さ・root motion（全ファイル共通）

| # | 名前 | 長さ (s) | root T peak | root R peak |
|---:|---|---:|---|---:|
| 1 | `Idle` | 1.600 | 0.025 m Δ(+0.000, +0.025, +0.000) | — |
| 2 | `Guard` | 0.360 | — | — |
| 3 | `Punch_R` | 0.720 | — | — |
| 4 | `Kick_L` | 0.820 | — | — |
| 5 | `Punch_01_Jab` | 0.485 | 0.140 m Δ(-0.000, +0.000, +0.140) | — |
| 6 | `Punch_02_Cross` | 0.730 | 0.250 m Δ(+0.000, +0.000, +0.250) | +5.73° |
| 7 | `Punch_03_Hook` | 0.655 | 0.120 m Δ(-0.000, +0.000, +0.120) | -13.75° |
| 8 | `Punch_04_Uppercut` | 0.770 | 0.184 m Δ(-0.000, +0.120, +0.140) | +5.73° |
| 9 | `Punch_05_Overhand` | 0.875 | 0.184 m Δ(+0.000, -0.040, +0.180) | +5.73° |
| 10 | `Punch_06_Backfist` | 0.620 | 0.080 m Δ(-0.000, +0.000, +0.080) | -29.79° |
| 11 | `Punch_07_LongJab` | 0.815 | 0.304 m Δ(+0.050, +0.000, +0.300) | — |
| 12 | `Punch_08_BodyHook` | 0.680 | 0.140 m Δ(-0.000, +0.000, +0.140) | -11.46° |
| 13 | `Punch_09_StraightBody` | 0.635 | 0.220 m Δ(+0.000, +0.000, +0.220) | — |
| 14 | `Punch_10_Elbow` | 0.590 | 0.100 m Δ(-0.000, +0.000, +0.100) | -16.04° |
| 15 | `Punch_11_SpinBackfist` | 0.935 | 0.100 m Δ(+0.000, +0.000, +0.100) | +44.69° |
| 16 | `Punch_12_DoubleJab` | 0.635 | 0.200 m Δ(+0.000, +0.000, +0.200) | — |
| 17 | `Punch_13_CrossHook` | 0.815 | 0.220 m Δ(+0.000, +0.000, +0.220) | +17.19° |
| 18 | `Punch_14_HookCross` | 0.885 | 0.260 m Δ(+0.000, +0.000, +0.260) | +19.48° |
| 19 | `Punch_15_OneTwo` | 0.740 | 0.240 m Δ(+0.000, +0.000, +0.240) | — |
| 20 | `Punch_16_RisingHook` | 0.710 | 0.156 m Δ(-0.000, +0.100, +0.120) | +6.88° |
| 21 | `Punch_17_LeapingPunch` | 0.775 | 0.525 m Δ(+0.000, +0.400, +0.340) | — |
| 22 | `Punch_18_ChargePunch` | 1.000 | 0.215 m Δ(-0.080, +0.000, +0.200) | -8.02° |
| 23 | `Punch_19_BurstPunch` | 0.710 | 0.335 m Δ(+0.100, +0.000, +0.320) | — |
| 24 | `Punch_20_HeavySmash` | 1.055 | 0.241 m Δ(-0.000, -0.180, +0.160) | -10.31° |
| 25 | `Kick_01_Front` | 0.660 | 0.180 m Δ(-0.000, +0.000, +0.180) | — |
| 26 | `Kick_02_Low` | 0.705 | 0.140 m Δ(+0.000, +0.000, +0.140) | +6.88° |
| 27 | `Kick_03_Mid` | 0.755 | 0.220 m Δ(-0.000, +0.000, +0.220) | — |
| 28 | `Kick_04_High` | 0.845 | 0.168 m Δ(+0.000, +0.050, +0.160) | — |
| 29 | `Kick_05_Roundhouse` | 0.830 | 0.120 m Δ(-0.000, +0.000, +0.120) | -28.65° |
| 30 | `Kick_06_Side` | 0.805 | 0.200 m Δ(+0.000, +0.000, +0.200) | +18.33° |
| 31 | `Kick_07_Back` | 0.895 | 0.080 m Δ(-0.000, +0.000, +0.080) | -32.09° |
| 32 | `Kick_08_Axe` | 0.935 | 0.172 m Δ(+0.000, +0.100, +0.140) | — |
| 33 | `Kick_09_Sweep` | 0.805 | 0.120 m Δ(-0.000, +0.000, +0.120) | -25.21° |
| 34 | `Kick_10_Thrust` | 0.695 | 0.260 m Δ(+0.000, +0.000, +0.260) | — |
| 35 | `Kick_11_Spin` | 0.960 | 0.140 m Δ(-0.000, +0.000, +0.140) | -49.27° |
| 36 | `Kick_12_Heel` | 0.860 | 0.134 m Δ(+0.000, +0.060, +0.120) | — |
| 37 | `Kick_13_Knee` | 0.620 | 0.204 m Δ(-0.000, +0.040, +0.200) | — |
| 38 | `Kick_14_JumpFront` | 0.780 | 0.600 m Δ(+0.000, +0.480, +0.360) | — |
| 39 | `Kick_15_JumpRound` | 0.920 | 0.608 m Δ(-0.000, +0.540, +0.280) | -33.23° |
| 40 | `Kick_16_Double` | 0.870 | 0.467 m Δ(+0.000, +0.320, +0.340) | — |
| 41 | `Kick_17_Flying` | 0.890 | 0.756 m Δ(+0.100, +0.620, +0.420) | +13.75° |
| 42 | `Kick_18_Heavy` | 1.055 | 0.269 m Δ(-0.000, -0.200, +0.180) | -12.61° |
| 43 | `Kick_19_Crescent` | 0.920 | 0.160 m Δ(+0.000, +0.000, +0.160) | +38.96° |
| 44 | `Kick_20_Burst` | 0.820 | 0.537 m Δ(+0.000, +0.380, +0.380) | — |

## 頭・心臓・胴体のノード候補

候補は各GLBの実ノード名から、メッシュノード（`mesh` を持つノード）とスキン骨を分けて抽出しました。番号はGLTF nodes配列のインデックスです。通常版/スムース版の候補名・番号は各ペアで一致します。

### ガチョウ — `goose-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:GooseHeadFace`, `35:GooseHeadCrown`, `36:GooseHeadCheek`, `37:GooseBeak`, `38:GooseBeakSeam`, `39:GooseNostril_L`, `40:GooseNostril_R`, `41:GooseEyeRing_L`, `42:GooseEyeSclera_L`, `43:GooseEyeIris_L`, `44:GooseEyePupil_L`, `45:GooseEyeGlint_L`, `46:GooseEyeRing_R`, `47:GooseEyeSclera_R`, `48:GooseEyeIris_R`, `49:GooseEyePupil_R`, `50:GooseEyeGlint_R`, `51:GooseBrowFeather_L`, `52:GooseBrowFeather_R`
- 頭・首の骨候補: `92:neck`, `93:head`
- 心臓/胸部メッシュ候補: `79:ChestCavity`, `80:ChestSkinOpening`, `81:HeartBody`, `82:HeartLeftLobe`, `83:HeartRightLobe`, `84:HeartAorta`, `85:HeartBlueVessel`, `86:HeartFrontVessel`, `87:HeartSideVessel`
- 心臓/胸部の骨候補: `91:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `88:root`, `89:pelvis`, `90:spine`, `91:chest`

### クマ — `bear-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:Bear_HeadFace`, `35:Bear_Muzzle`, `36:Bear_Nose`, `37:Bear_Ear_L`, `38:Bear_Ear_R`, `39:Bear_Eye_L`, `40:Bear_EyeGlint_L`, `41:Bear_Eye_R`, `42:Bear_EyeGlint_R`
- 頭・首の骨候補: `72:neck`, `73:head`
- 心臓/胸部メッシュ候補: `59:ChestCavity`, `60:ChestSkinOpening`, `61:HeartBody`, `62:HeartLeftLobe`, `63:HeartRightLobe`, `64:HeartAorta`, `65:HeartBlueVessel`, `66:HeartFrontVessel`, `67:HeartSideVessel`
- 心臓/胸部の骨候補: `71:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `68:root`, `69:pelvis`, `70:spine`, `71:chest`

### ワニ — `crocodile-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:Crocodile_HeadFace`, `35:Crocodile_Snout`, `36:Crocodile_Jaw`, `37:Crocodile_Nostril_L`, `38:Crocodile_Nostril_R`, `43:Crocodile_Ear_L`, `44:Crocodile_Ear_R`, `45:Crocodile_Eye_L`, `46:Crocodile_EyeGlint_L`, `47:Crocodile_Eye_R`, `48:Crocodile_EyeGlint_R`
- 頭・首の骨候補: `78:neck`, `79:head`
- 心臓/胸部メッシュ候補: `65:ChestCavity`, `66:ChestSkinOpening`, `67:HeartBody`, `68:HeartLeftLobe`, `69:HeartRightLobe`, `70:HeartAorta`, `71:HeartBlueVessel`, `72:HeartFrontVessel`, `73:HeartSideVessel`
- 心臓/胸部の骨候補: `77:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `74:root`, `75:pelvis`, `76:spine`, `77:chest`

### ゴリラ — `gorilla-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:Gorilla_HeadFace`, `35:Gorilla_Brow`, `36:Gorilla_Muzzle`, `37:Gorilla_Nose`, `38:Gorilla_Ear_L`, `39:Gorilla_Ear_R`, `40:Gorilla_Eye_L`, `41:Gorilla_EyeGlint_L`, `42:Gorilla_Eye_R`, `43:Gorilla_EyeGlint_R`
- 頭・首の骨候補: `73:neck`, `74:head`
- 心臓/胸部メッシュ候補: `60:ChestCavity`, `61:ChestSkinOpening`, `62:HeartBody`, `63:HeartLeftLobe`, `64:HeartRightLobe`, `65:HeartAorta`, `66:HeartBlueVessel`, `67:HeartFrontVessel`, `68:HeartSideVessel`
- 心臓/胸部の骨候補: `72:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `69:root`, `70:pelvis`, `71:spine`, `72:chest`

### カバ — `hippopotamus-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:Hippopotamus_HeadFace`, `35:Hippopotamus_Muzzle`, `36:Hippopotamus_Nostril_L`, `37:Hippopotamus_Nostril_R`, `38:Hippopotamus_Ear_L`, `39:Hippopotamus_Ear_R`, `40:Hippopotamus_Eye_L`, `41:Hippopotamus_EyeGlint_L`, `42:Hippopotamus_Eye_R`, `43:Hippopotamus_EyeGlint_R`
- 頭・首の骨候補: `73:neck`, `74:head`
- 心臓/胸部メッシュ候補: `60:ChestCavity`, `61:ChestSkinOpening`, `62:HeartBody`, `63:HeartLeftLobe`, `64:HeartRightLobe`, `65:HeartAorta`, `66:HeartBlueVessel`, `67:HeartFrontVessel`, `68:HeartSideVessel`
- 心臓/胸部の骨候補: `72:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `69:root`, `70:pelvis`, `71:spine`, `72:chest`

### ライオン — `lion-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:Lion_Mane`, `35:Lion_HeadFace`, `36:Lion_Muzzle`, `37:Lion_Nose`, `38:Lion_Ear_L`, `39:Lion_Ear_R`, `40:Lion_Eye_L`, `41:Lion_EyeGlint_L`, `42:Lion_Eye_R`, `43:Lion_EyeGlint_R`
- 頭・首の骨候補: `73:neck`, `74:head`
- 心臓/胸部メッシュ候補: `60:ChestCavity`, `61:ChestSkinOpening`, `62:HeartBody`, `63:HeartLeftLobe`, `64:HeartRightLobe`, `65:HeartAorta`, `66:HeartBlueVessel`, `67:HeartFrontVessel`, `68:HeartSideVessel`
- 心臓/胸部の骨候補: `72:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `69:root`, `70:pelvis`, `71:spine`, `72:chest`

### サイ — `rhinoceros-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:Rhinoceros_HeadFace`, `35:Rhinoceros_Muzzle`, `36:Rhinoceros_Nose`, `37:Rhinoceros_Horn_Large`, `38:Rhinoceros_Horn_Small`, `39:Rhinoceros_Ear_L`, `40:Rhinoceros_Ear_R`, `41:Rhinoceros_Eye_L`, `42:Rhinoceros_EyeGlint_L`, `43:Rhinoceros_Eye_R`, `44:Rhinoceros_EyeGlint_R`
- 頭・首の骨候補: `74:neck`, `75:head`
- 心臓/胸部メッシュ候補: `61:ChestCavity`, `62:ChestSkinOpening`, `63:HeartBody`, `64:HeartLeftLobe`, `65:HeartRightLobe`, `66:HeartAorta`, `67:HeartBlueVessel`, `68:HeartFrontVessel`, `69:HeartSideVessel`
- 心臓/胸部の骨候補: `73:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `70:root`, `71:pelvis`, `72:spine`, `73:chest`

### 共通うんこ頭 — `poop-heart-champion.glb`（通常/スムース共通）

- 頭メッシュ候補: `34:PoopHeadBase`, `35:PoopHeadMiddle`, `36:PoopHeadUpper`, `37:PoopHeadCrown`, `38:PoopHeadCurl`, `39:PoopHeadCurlTip`
- 頭・首の骨候補: `66:neck`, `67:head`
- 心臓/胸部メッシュ候補: `53:ChestCavity`, `54:ChestSkinOpening`, `55:HeartBody`, `56:HeartLeftLobe`, `57:HeartRightLobe`, `58:HeartAorta`, `59:HeartBlueVessel`, `60:HeartFrontVessel`, `61:HeartSideVessel`
- 心臓/胸部の骨候補: `65:chest`
- 胴体メッシュ候補: `0:Torso`, `1:Pelvis`, `2:Abdomen`, `3:Pectoral_0`, `4:Pectoral_1`, `5:Abdominal_0`, `6:Abdominal_1`, `7:Abdominal_2`
- 胴体の骨候補: `62:root`, `63:pelvis`, `64:spine`, `65:chest`

## 材質・テクスチャ実測値

### ガチョウ — 通常/スムース共通

- 材質 (18): `Golden skin`, `Golden shadow`, `Wing white`, `Wing pale blue`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Goose feather white`, `Goose feather highlight`, `Goose feather shadow`, `Goose bill warm orange`, `Goose bill seam`, `Goose eye ring`, `Goose eye sclera`, `Goose gray brown iris`, `Goose pupil`
- images/textures: 12/12
- 埋め込み画像: `gold-color-128px.png` (128×128, image/png), `gold-normal-128px.png` (128×128, image/png), `feather-color-128px.png` (128×128, image/png), `feather-normal-128px.png` (128×128, image/png), `heart-color-128px.png` (128×128, image/png), `heart-normal-128px.png` (128×128, image/png), `heart_blue-color-128px.png` (128×128, image/png), `heart_blue-normal-128px.png` (128×128, image/png), `eye-color-128px.png` (128×128, image/png), `eye-normal-128px.png` (128×128, image/png), `beak-color-128px.png` (128×128, image/png), `beak-normal-128px.png` (128×128, image/png)

### クマ — 通常/スムース共通

- 材質 (19): `Golden skin`, `Golden shadow`, `Goose mask white`, `Wing white`, `Wing pale blue`, `Goose beak orange`, `Mask eye opening`, `Mask strap`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Animal head strap`, `Animal eye glint`, `Bear brown fur`, `Bear muzzle`, `Bear nose`, `Bear eyes`
- images/textures: 0/0
- 埋め込み画像: なし

### ワニ — 通常/スムース共通

- 材質 (20): `Golden skin`, `Golden shadow`, `Goose mask white`, `Wing white`, `Wing pale blue`, `Goose beak orange`, `Mask eye opening`, `Mask strap`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Animal head strap`, `Animal eye glint`, `Crocodile green scales`, `Crocodile jaw scales`, `Crocodile eye and nostril`, `Crocodile teeth`, `Crocodile eyes`
- images/textures: 0/0
- 埋め込み画像: なし

### ゴリラ — 通常/スムース共通

- 材質 (19): `Golden skin`, `Golden shadow`, `Goose mask white`, `Wing white`, `Wing pale blue`, `Goose beak orange`, `Mask eye opening`, `Mask strap`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Animal head strap`, `Animal eye glint`, `Gorilla charcoal fur`, `Gorilla muzzle`, `Gorilla nose`, `Gorilla eyes`
- images/textures: 0/0
- 埋め込み画像: なし

### カバ — 通常/スムース共通

- 材質 (19): `Golden skin`, `Golden shadow`, `Goose mask white`, `Wing white`, `Wing pale blue`, `Goose beak orange`, `Mask eye opening`, `Mask strap`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Animal head strap`, `Animal eye glint`, `Hippopotamus purple gray skin`, `Hippopotamus muzzle`, `Hippopotamus nostrils`, `Hippopotamus eyes`
- images/textures: 0/0
- 埋め込み画像: なし

### ライオン — 通常/スムース共通

- 材質 (20): `Golden skin`, `Golden shadow`, `Goose mask white`, `Wing white`, `Wing pale blue`, `Goose beak orange`, `Mask eye opening`, `Mask strap`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Animal head strap`, `Animal eye glint`, `Lion mane`, `Lion tawny fur`, `Lion muzzle`, `Lion nose`, `Lion amber eyes`
- images/textures: 0/0
- 埋め込み画像: なし

### サイ — 通常/スムース共通

- 材質 (19): `Golden skin`, `Golden shadow`, `Goose mask white`, `Wing white`, `Wing pale blue`, `Goose beak orange`, `Mask eye opening`, `Mask strap`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Animal head strap`, `Animal eye glint`, `Rhinoceros gray skin`, `Rhinoceros muzzle`, `Rhinoceros horn`, `Rhinoceros eyes`
- images/textures: 0/0
- 埋め込み画像: なし

### 共通うんこ頭 — 通常/スムース共通

- 材質 (12): `Golden skin`, `Golden shadow`, `Wing white`, `Wing pale blue`, `Heart crimson`, `Heart cavity`, `Heart blue vessels`, `Exposed chest tissue`, `Eye glint`, `Poop glossy dark brown`, `Poop glossy brown`, `Poop glossy highlight brown`
- images/textures: 12/12
- 埋め込み画像: `gold-color-128px.png` (128×128, image/png), `gold-normal-128px.png` (128×128, image/png), `feather-color-128px.png` (128×128, image/png), `feather-normal-128px.png` (128×128, image/png), `heart-color-128px.png` (128×128, image/png), `heart-normal-128px.png` (128×128, image/png), `heart_blue-color-128px.png` (128×128, image/png), `heart_blue-normal-128px.png` (128×128, image/png), `eye-color-128px.png` (128×128, image/png), `eye-normal-128px.png` (128×128, image/png), `poop-color-128px.png` (128×128, image/png), `poop-normal-128px.png` (128×128, image/png)

## 監査の再実行

```sh
python3 tools/audit_character_glbs.py
python3 tools/audit_character_glbs.py --check
```

`--check` は16ファイルの存在、全ファイルの19骨/44アニメーション、アニメーション署名の一致、ペアの構造/ジオメトリ/アニメーションデータ一致、通常版とスムース版のJOINTS/WEIGHTS差分を検証します。

