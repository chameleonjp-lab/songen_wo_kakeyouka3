# Goose Heart Champion

採用したデザインを基にした、ブラウザゲーム用のGLBモデルです。

## ファイル

- `goose-heart-champion.glb`

## モデル仕様

- GLB 2.0
- Y軸が上方向
- 正面はおおむね +Z 方向
- 外部テクスチャなし
- 64個の独立したパーツで構成
- 心臓、ガチョウ部分、翼、腕、脚を個別に取得可能
- 19本の人型骨格を設定
- 全パーツをスキニング済み
- `Idle`、`Guard`、`Punch_R`、`Kick_L` の4アニメーションを収録

このモデルは、採用画像を基にした軽量な格闘ゲーム用3Dモデルです。画像から完全に同じ高精細メッシュを復元したものではありません。現在のスキニングは、パーツごとに1本の骨を割り当てる方式です。関節を滑らかに変形させる処理は、今後必要に応じて追加できます。

## Three.jsでの読み込み例

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

loader.load('assets/characters/goose-heart-champion.glb', (gltf) => {
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
