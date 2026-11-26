# 試行・公開・復元

## 手元での検証

```sh
corepack pnpm check
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright install --with-deps webkit
corepack pnpm test:browser
```

GitHub Pagesに渡すのは `dist/public` です。画面の通信仕様は番号1です。対戦サーバーは `wrangler.toml` と `worker/` から配備します。

## Cloudflareの試行環境と本番環境

試行環境には `wrangler deploy --env preview` を使います。本番とは別の名前と部屋を使い、`ROOM_CODE_SECRET` に32文字以上のランダムな値を登録します。試行環境からランキングを連携する場合は、検証用データベースの `RANKING_SUPABASE_URL` と `RANKING_API_KEY` を設定します。

本番でも `ROOM_CODE_SECRET` を環境の秘密値として記録します。実験場で専用ランキングが受け付けられるようになった後、連携の資格を `RANKING_API_KEY` として登録します。対戦サーバーには本番の公開ページから接続を許可します。サーバーからの開始・決着の連携は試合IDと席ごとに送り、障害時は保存した内容を再送します。ランキング画面は開始回数と三つの順位表を読み取ります。

`ACCEPT_NEW_ROOMS` の初期設定は本番で `false` です。新規受付を開ける本番配備では `true` にし、`GET /v1/health` が `version: 1`・`acceptingRooms: true`・`rankingReady: true` を返すことを確認します。障害時は同じ部屋の保存先で、この値を `false` に戻します。参加・復帰と進行中の試合は続けられます。

試行では、無操作180秒の計測、別回線の端末間の往復と入力確認、同じWi-FiとWi-Fi対モバイル回線の各5試合、再接続と再戦を記録します。iPhone 17 Proでは縦・横・短い縦表示を確認します。合格条件は[要件仕様書](docs/online-versus-requirements.md)を参照します。

## GitHub Pagesの切り替え

試行環境で実機の受入条件を確認し、[実験場のランキング連携](https://github.com/chameleonjp-lab/chameleonjp_lab/pull/76)を反映してから、GitHubのリポジトリ変数 `VITE_MATCH_SERVER_URL` に本番の対戦サーバーのHTTPSアドレスを登録します。Pagesの公開元に **GitHub Actions** を選びます。mainの更新でPagesの処理が動き、同じコミットの試験、通信仕様、接続元の許可、ランキングの応答を確認してから画面を公開します。公開URLから二人で入り、決着とランキングを確認します。

## 復元

入れ替え前に確認した公開物は、タイトル「尊厳を賭けようか3」の3D版で、公開HTMLは `assets/index-CCRou19y.js` を参照していました。復元元は [ef0e1d4](https://github.com/chameleonjp-lab/songen_wo_kakeyouka3/tree/ef0e1d4e47dff003475edcf88a16bb4d52db29b9) です。直前の配信物を使える場合はそれを再配備します。ソースから復元する場合は、このコミットを基に復元用のプルリクエストを作り、当時の設定で再ビルドします。実験場の新作の記録は専用の識別子に保存されます。
