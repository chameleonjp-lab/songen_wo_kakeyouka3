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

試行環境には `wrangler deploy --env preview` を使います。本番とは別の名前と部屋を使い、`ROOM_CODE_SECRET` に32文字以上のランダムな値を登録します。試行環境でランキングを検証する場合は `RANKINGS_PUBLIC` を `true` にし、検証用データベースの `RANKING_SUPABASE_URL` と `RANKING_API_KEY` を設定します。

本番でも `ROOM_CODE_SECRET` を環境の秘密値として記録します。ランキングの送信には [専用のデータベース変更](supabase/migrations/202611270001_songen3_scoped_ranking_writer.sql) を適用し、`RANKING_PUBLISHABLE_KEY` と、このゲーム専用に生成した `RANKING_INGEST_KEY` を Worker に設定します。データベースに保存するのは送信用キーのSHA-256ハッシュです。対戦サーバーには本番の公開ページから接続を許可します。サーバーからの開始・決着の連携は試合IDと席ごとに送り、障害時は保存した内容を再送します。ランキング画面は開始回数と三つの順位表を読み取ります。

`ACCEPT_NEW_ROOMS` の初期設定は本番で `false` です。新規受付を開ける本番配備では `true` にし、`GET /v1/health` が `version: 1` と `acceptingRooms: true` を返すことを確認します。ランキング保留中は `rankingsPublic: false` が返ります。障害時は同じ部屋の保存先で、この値を `false` に戻します。参加・復帰と進行中の試合は続けられます。

試行では、無操作180秒の計測、別回線の端末間の往復と入力確認、同じWi-FiとWi-Fi対モバイル回線の各5試合、再接続と再戦を記録します。iPhone 17 Proでは縦・横・短い縦表示を確認します。合格条件は[要件仕様書](docs/online-versus-requirements.md)を参照します。

## GitHub Pagesの切り替え

退出・再戦に関わる変更は、更新した対戦サーバーを先に配備してから、画面を公開します。本番のルーム受付、ランキング設定、保存先を引き継いでください。マージ後はGitHub Actionsが画面を配信します。

試行環境で実機の受入条件を確認し、Pagesの公開元に **GitHub Actions** を選びます。mainが更新されたら、GitHub Actionsが同じコミットを試験します。本番の対戦サーバーには既定で `https://songen3-online.chameleonjp-lab.workers.dev` が使われます。接続先を移す場合は、リポジトリ変数 `VITE_MATCH_SERVER_URL` を設定します。対戦サーバーでルーム受付、通信仕様、GitHub Pagesからの接続許可、ランキング設定が確認できたら配信します。公開URLから二人で入り、決着と再戦を確認します。

実験場の掲載を再開するときは、閲覧用の2関数を公開し、Workerの `RANKINGS_PUBLIC` を `true` にします。ゲームの公開処理はサーバーで記録と閲覧ができることを確認し、画面に公開状態を反映します。リポジトリ変数 `VITE_RANKINGS_PUBLIC` を明示する場合はサーバーの状態と一致させます。実験場ではオンライン版の掲載行だけを有効にします。

## 復元

入れ替え前に確認した公開物は、タイトル「尊厳を賭けようか3」の3D版で、公開HTMLは `assets/index-CCRou19y.js` を参照していました。復元元は [ef0e1d4](https://github.com/chameleonjp-lab/songen_wo_kakeyouka3/tree/ef0e1d4e47dff003475edcf88a16bb4d52db29b9) です。直前の配信物を使える場合はそれを再配備します。ソースから復元する場合は、このコミットを基に復元用のプルリクエストを作り、当時の設定で再ビルドします。実験場の新作の記録は専用の識別子に保存されます。
