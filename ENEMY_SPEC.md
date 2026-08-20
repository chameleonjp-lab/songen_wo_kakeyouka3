# 敵仕様

## 連戦順

同時に戦う敵は常に1体です。次の順番で6ラウンドを行います。

| Round | variant | behavior | HP倍率 | 攻撃倍率 | 速度倍率 | 予兆倍率 | 得点倍率 | 尊厳圧力 |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Gorilla | power | 1.12 | 1.30 | 0.88 | 0.96 | 1.18 | 1.18 |
| 2 | Crocodile | guard | 0.82 | 1.16 | 0.82 | 1.08 | 1.08 | 1.08 |
| 3 | Lion | rush | 0.70 | 0.96 | 1.24 | 1.12 | 1.12 | 1.04 |
| 4 | Bear | balanced | 0.90 | 1.04 | 0.94 | 1.00 | 1.00 | 1.00 |
| 5 | Hippopotamus | tank | 1.26 | 1.38 | 0.72 | 0.90 | 1.30 | 1.26 |
| 6 | Rhinoceros | charger | 1.40 | 1.50 | 0.80 | 0.84 | 1.42 | 1.35 |

基準敵HPは64、基準攻撃力は8.5、基準移動速度は2.3、攻撃範囲は3.05、基準予兆は0.58秒です。各倍率はゲームデザイン用の数値で、現実の動物の能力を表すものではありません。

## 行動状態

`spawn → approach → telegraph → strike → recover` が基本経路です。被弾すると `stagger`、体力0で `dead` となり、撃破処理後に1.8秒の幕間へ移ります。プレイヤーが敵をロックオンしている間も、カメラはプレイヤー背後基準を維持します。

敵は接近、攻撃予兆、攻撃、回復を行います。相手のstrikeとプレイヤー攻撃が同時のimpact窓（進行度0.40〜0.68）に入ると攻撃相殺となり、双方のダメージを発生させません。

## 登場演出

| 敵 | 表示名 | 挑発 | 基本登場モーション |
|---|---|---|---|
| Gorilla | GORILLA | 「拳で語れ。」 | counter |
| Crocodile | CROCODILE | 「噛み砕いてやる。」 | guard |
| Lion | LION | 「王の前に跪け。」 | light |
| Bear | BEAR | 「その翼、へし折る。」 | heavy |
| Hippopotamus | HIPPOPOTAMUS | 「踏み潰して進む。」 | heavy |
| Rhinoceros | RHINOCEROS | 「正面から来い。」 | heavy |

登場時は敵ごとの咆哮を一度だけ鳴らし、位置からpanを計算して簡易reverb経路へ送ります。`?demo&audioDebug` で6種のcount、pan、reverbを確認できます。

## 予兆と固有傾向

- Gorillaはpower型、Lionはrush型で、接近と攻撃頻度の差を見せる。
- Crocodileはguard型、Rhinocerosはcharger型で、前方の攻撃予兆を読む設計。
- Hippopotamusはtank型で広い円形予兆、Bearはbalanced型で標準的な予兆を使う。
- GLBの心臓ノード／胸部候補は監査レポートに記録される。心臓ヒットは開放確認が必要で、未確認の胸部を自動的に心臓扱いしない。

## 非仕様

敵群、常時無限スポーン、複数敵の同時攻撃、旧版のcrowd survivalは現在の敵仕様ではありません。
