# Goose Heart Champion

採用したデザインを基にした、ブラウザゲーム用のGLBモデルです。

## ファイル

- `goose-heart-champion.glb`
- `goose-heart-champion-smooth.glb`

## 使い分け

### `goose-heart-champion.glb`

軽量版です。各パーツを主に1本の骨へ割り当てています。パーツを独立して動かしやすく、簡単な表示や処理負荷を抑えたい場面に向いています。

### `goose-heart-champion-smooth.glb`

スムース版です。関節付近の頂点を最大4本の骨で補間しています。腕を伸ばす、脚を蹴り出す、胴体をひねるといった格闘ゲームの動きに向いています。

両方とも同じ19本の骨格と44種類のアニメーションを持ちます。関節の見た目を優先するときは`-smooth`版、軽量さを優先するときは通常版を選んでください。

## モデル仕様

- GLB 2.0
- Y軸が上方向
- 正面はおおむね +Z 方向
- 外部テクスチャなし
- ガチョウ版は88個の独立したメッシュパーツで構成
- 心臓、ガチョウ頭部、首、翼、腕、脚を個別に取得可能
- 19本の人型骨格を設定
- 全パーツをスキニング済み
- `Idle`、`Guard`、`Punch_R`、`Kick_L`、パンチ20種、キック20種の合計44アニメーションを収録

このモデルは、採用画像を基にした格闘ゲーム用3Dモデルです。画像から完全に同じ高精細メッシュを復元したものではありません。スムース版も、ブラウザで扱いやすい軽量さを優先した構成です。

## ガチョウ頭部の更新

ガチョウ版は、アヒルや動物マスクに見えにくいよう、頭部と首を作り直しています。

- 黒いマスク用ストラップと、目の黒い開口部を削除
- 頭から鎖骨まで続く長い白い首を追加
- 細長いオレンジ色のくちばし、くちばしの境目、左右の鼻孔を追加
- 目元を、目の周囲・白目・灰褐色の虹彩・瞳孔・ハイライトに分けて立体化
- 首と鎖骨に羽毛パーツを重ね、白・薄い影色・ハイライトで羽毛の立体感を追加

このGLBは画像を平面テクスチャとして貼る方式ではなく、材質の色と立体パーツで表現しています。そのため、頭部を回転させても黒背景や元画像の輪郭が残りません。

## Three.jsでの読み込み例

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

const modelPath = 'assets/characters/goose-heart-champion-smooth.glb';

loader.load(modelPath, (gltf) => {
  const character = gltf.scene;
  character.scale.setScalar(1.0);
  scene.add(character);

  // GLB内のアニメーションを再生する
  const mixer = new THREE.AnimationMixer(character);
  const idle = gltf.animations.find((clip) => clip.name === 'Idle');
  if (idle) mixer.clipAction(idle).play();

  // 格闘アクションへ切り替える例
  function playAction(name) {
    const clip = gltf.animations.find((item) => item.name === name);
    if (!clip) return;
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
  }

  // 例: playAction('Punch_R');

  // 毎フレーム呼び出す
  function update(deltaSeconds) {
    mixer.update(deltaSeconds);
  }
});
```

## 生成元

`tools/build_goose_heart_glb.py` は、外部ライブラリなしで、骨格・スキニング・基本アニメーションを含むGLBを再生成するためのスクリプトです。

## 動物頭部バリエーション

採用したゴールデンボディ、胸部の小型の露出心臓、画面右側の翼、ポーズを共通にして、頭部だけを差し替えた6種類を追加しています。

| 動物 | 通常版 | スムース版 |
| --- | --- | --- |
| ライオン | `lion-heart-champion.glb` | `lion-heart-champion-smooth.glb` |
| サイ | `rhinoceros-heart-champion.glb` | `rhinoceros-heart-champion-smooth.glb` |
| ワニ | `crocodile-heart-champion.glb` | `crocodile-heart-champion-smooth.glb` |
| ゴリラ | `gorilla-heart-champion.glb` | `gorilla-heart-champion-smooth.glb` |
| クマ | `bear-heart-champion.glb` | `bear-heart-champion-smooth.glb` |
| カバ | `hippopotamus-heart-champion.glb` | `hippopotamus-heart-champion-smooth.glb` |

各ファイルはガチョウ版と同じ19本の骨格、44アニメーションを持ちます。通常版は軽量なパーツ単位の割り当て、`-smooth`版は関節周辺を最大4本の骨で補間する構成です。

## 共通格闘モーション

動物ごとに分けず、全GLBへ同じ格闘モーションを収録しています。家庭用の無双系3D格闘ゲームを想定し、特定作品のモーションをそのまま複製せず、踏み込み・大きな溜め・広い振り抜き・打ち上げ・空中追撃・締め技という共通の演出文法で、パンチ20種類とキック20種類を作成しています。

各攻撃は概ね「windup（溜め）→ impact（ヒット）→ hold（短いヒットストップ）→ recovery（戻り）」の4段階です。前進するルートモーション、回転技のルート回転、連打系の左右の時間差も含めています。頭部バリエーションを差し替えても同じアニメーション名で動かせます。

パンチ: `Punch_01_Jab`, `Punch_02_Cross`, `Punch_03_Hook`, `Punch_04_Uppercut`, `Punch_05_Overhand`, `Punch_06_Backfist`, `Punch_07_LongJab`, `Punch_08_BodyHook`, `Punch_09_StraightBody`, `Punch_10_Elbow`, `Punch_11_SpinBackfist`, `Punch_12_DoubleJab`, `Punch_13_CrossHook`, `Punch_14_HookCross`, `Punch_15_OneTwo`, `Punch_16_RisingHook`, `Punch_17_LeapingPunch`, `Punch_18_ChargePunch`, `Punch_19_BurstPunch`, `Punch_20_HeavySmash`

キック: `Kick_01_Front`, `Kick_02_Low`, `Kick_03_Mid`, `Kick_04_High`, `Kick_05_Roundhouse`, `Kick_06_Side`, `Kick_07_Back`, `Kick_08_Axe`, `Kick_09_Sweep`, `Kick_10_Thrust`, `Kick_11_Spin`, `Kick_12_Heel`, `Kick_13_Knee`, `Kick_14_JumpFront`, `Kick_15_JumpRound`, `Kick_16_Double`, `Kick_17_Flying`, `Kick_18_Heavy`, `Kick_19_Crescent`, `Kick_20_Burst`

合計で44アニメーション（基本4種＋パンチ20種＋キック20種）です。

各モーションには `extras.category`、`extras.style`、`extras.motionFamily`、`extras.phaseModel`、`extras.powerLevel` を付けています。`extras.motionFamily` は `musou-inspired` です。例えば、Three.jsでは `gltf.animations.find((clip) => clip.name === 'Punch_04_Uppercut')` のように取得できます。
