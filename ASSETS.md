# Barbarian Arena — アセット台帳

## ランタイムで参照する画像

| ファイル | 用途 | 読み込み元 |
|---|---|---|
| `client/public/assets/barbarian-arena-visual-target_4f9881a2.png` | カメラ、構図、色の参考。ゲーム中の必須テクスチャではない | `arenaAssets.visualTarget` |
| `client/public/assets/barbarian-arena-barbarian-surface_e5c06636.png` | 手続きfallback敵の革・毛皮・金属表面 | `arenaAssets.barbarianSurface` |
| `client/public/assets/ground-tile.webp` | アリーナ床のタイル | `arenaAssets.groundTile` |
| `client/public/assets/barbarian-arena-sigil_c4031e62.png` | タイトル、HUD、favicon | `arenaAssets.sigil` |

画像とGLBのURLは `client/src/game/assets.ts` の `publicAssetUrl()` を経由し、Vite `BASE_URL`（GitHub Pagesのプロジェクトパスを含む）に追従します。

## GLB台帳

同梱GLBは8種類×通常版／スムース版の16ファイルです。通常版のファイル名には suffix がなく、滑らかなスキニング版には `-smooth` が付きます。

| 種類 | 通常版 | smooth版 | ゲーム内の役割 |
|---|---|---|---|
| Goose | `goose-heart-champion.glb` | `goose-heart-champion-smooth.glb` | プレイヤー |
| Gorilla | `gorilla-heart-champion.glb` | `gorilla-heart-champion-smooth.glb` | 1戦目 |
| Crocodile | `crocodile-heart-champion.glb` | `crocodile-heart-champion-smooth.glb` | 2戦目 |
| Lion | `lion-heart-champion.glb` | `lion-heart-champion-smooth.glb` | 3戦目 |
| Bear | `bear-heart-champion.glb` | `bear-heart-champion-smooth.glb` | 4戦目 |
| Hippopotamus | `hippopotamus-heart-champion.glb` | `hippopotamus-heart-champion-smooth.glb` | 5戦目 |
| Rhinoceros | `rhinoceros-heart-champion.glb` | `rhinoceros-heart-champion-smooth.glb` | 6戦目 |
| Poop head | `poop-heart-champion.glb` | `poop-heart-champion-smooth.glb` | 尊厳0時のプレイヤー変身用 |

実行時のレジストリは全種類で `-smooth.glb` を選択します。通常版は実GLB監査と将来の軽量設定用に原本ディレクトリへ保持しますが、現在のランタイムでは不要なため `client/public` へはコピーしません。これによりGitHub Pagesへ同じ形状の通常版を重複配信せず、GLB読み込み量を抑えます。GLBがロードできない場合、該当キャラクターの手続きBabylonメッシュを表示します。

## 監査済みの事実

`python3 tools/audit_character_glbs.py --check` は次を検証します。

- 16ファイルすべてに19本のスキン骨と44アニメーションがある
- 44の内訳は基本4（`Idle`, `Guard`, `Punch_R`, `Kick_L`）＋パンチ20＋キック20、つまり攻撃アニメーション40
- 通常版とsmooth版は、POSITION／NORMAL／UV／indices、ノード名、アニメーション値が一致する
- 通常版は全頂点が1 influence、smooth版は2〜4 influence（最大4本）へ重み付けされる
- 頂点数、メッシュ数、材質数、テクスチャ数はペア内で一致する。差分は主に `JOINTS_0`／`WEIGHTS_0` とモデル名メタデータ
- GooseとPoop headには各12枚の128×128 PNGがGLB内に埋め込まれ、他6動物は `images/textures=0/0`

数値表と全クリップの実測値は [GLB_REAL_DATA_AUDIT.md](GLB_REAL_DATA_AUDIT.md)、アニメーションのランタイム対応は [GLB_ANIMATION_CATALOG.md](GLB_ANIMATION_CATALOG.md) を参照してください。

## 原本と公開コピー

`assets/characters/` を通常版／smooth版を含むGLB原本、`client/public/assets/characters/` をsmooth版だけのVite配信コピーとして扱います。手動更新による片側だけの差分を防ぐため、次のコマンドを用意しています。通常版の完全性は `audit_character_glbs.py` が原本で検査し、公開同期は `sync_character_assets.py` がruntime対象だけを検査します。

```sh
python3 tools/sync_character_assets.py --sync
python3 tools/sync_character_assets.py --check
```

CIは `--check` を実行し、ファイル名、容量、SHA-256のいずれかが不一致なら失敗します。

## 権利の扱い

`package.json` のMIT表記はソースコードのメタデータであり、GLB・画像・テクスチャへ自動的に適用されません。各素材の提供元、生成入力、再配布条件、クレジット条件はこの台帳だけでは確定できないため、素材について特定のライセンスを断定しません。公開前に素材ごとの許諾を確認してください。
