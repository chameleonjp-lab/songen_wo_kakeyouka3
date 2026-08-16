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
- スキニング用の骨格は未設定。まずは静的表示・回転・パーツ単位の動きに対応

このモデルは、採用画像を基にした軽量なゲーム用3Dモデルです。画像から完全に同じ高精細メッシュを復元したものではありません。

## Three.jsでの読み込み例

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

loader.load('assets/characters/goose-heart-champion.glb', (gltf) => {
  const character = gltf.scene;
  character.scale.setScalar(1.0);
  scene.add(character);

  // 例: パーツを名前で取得して個別に動かす
  const wing = character.getObjectByName('Wing_Feather_8');
  if (wing) wing.rotation.z = 0.05;
});
```

## 生成元

`tools/build_goose_heart_glb.py` は、外部ライブラリなしでGLBを再生成するためのスクリプトです。
