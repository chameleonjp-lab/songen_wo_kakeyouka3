# 公開・CI・GitHub Pages

## ローカルの成果物

`package.json` の `build` は静的出力だけを行います。サーバーbundleは別scriptです。

1. `pnpm build` → `vite build` — `vite.config.ts` の `root=client`、`publicDir=client/public`、`outDir=dist/public` に従い静的サイトを生成。
2. `pnpm build:server` → `esbuild server/_core/index.ts ... --outdir=dist/server` — サーバーbundleを静的サイトとは別に生成。

GitHub Pagesで使うのは `dist/public/` のみです。`dist/server/` はNodeサーバー用で、Pagesのartifactへ含めません。

## CI

`.github/workflows/ci.yml` はpush、pull request、手動実行で次を行います。

- `pnpm/action-setup@v4` で pnpm **10.4.1** を固定
- Node.js 22をセットアップ
- `pnpm install --frozen-lockfile`
- `pnpm check`、`pnpm test`、`python3 tools/audit_character_glbs.py --check`、`pnpm build`
- `pnpm check:static` でHTMLの相対参照、登録済みruntime素材、JS内のroot-absolute素材URLを確認
- `dist/public/index.html` の存在を確認

CIは成果物を公開しません。失敗時はPagesデプロイも通さない運用にします。

## GitHub Pages

`.github/workflows/pages.yml` は `main` へのpushまたは `workflow_dispatch` で起動し、次の標準Actionsを使います。

1. `actions/configure-pages@v5`
2. `actions/upload-pages-artifact@v3`（path: `./dist/public`）
3. `actions/deploy-pages@v4`

workflowのビルド開始時にはPages APIをpreflightし、Pagesの設定を取得できない、またはSourceがGitHub Actionsでない場合は依存関係のインストール前に停止して設定手順を表示します。これはPagesを自動有効化する処理ではありません。APIの404だけで「Pages全体が無効」とは断定せず、既存のJekyll公開が見えている場合もSourceを確認します。

リポジトリ設定の Pages → Build and deployment → Source は **GitHub Actions** にします。公開URLがHTTP 200でも、README由来のJekyllページが返る場合はゲームが公開された状態ではありません。`actions/configure-pages@v5` がPages APIの404で停止する場合も、SourceをGitHub Actionsへ変更してからworkflowを再実行します。デプロイジョブには `pages: write` と `id-token: write`、ビルドジョブには依存関係インストールと静的出力検証が必要です。

`base: "./"` と `publicAssetUrl()` により、プロジェクトページのサブパスでもHTMLから画像・GLB・遅延chunkを相対参照します。公開後はプロジェクトURLの直下と、ブラウザのハードリロードの両方を確認してください。

## 公開前チェック

- CIのcheck／test／GLB監査／buildが同一commitで成功している
- artifactに `dist/public` 以外（サーバーbundle、環境変数、秘密情報）が入っていない
- favicon、画像、runtime用smooth 8 GLBのHTTP 200と相対URLを確認する。regular 8 GLBは原本監査用でPagesへは配信しない
- PC横画面、iPhone Safari縦画面、名前入力、初回遅延ロード、ページ再読込を確認する
- 素材の権利・クレジットをコードのMIT表記とは別に確認する

GitHub PagesはNodeサーバーを実行しないため、認証、DB、オンラインランキング、サーバーAPIはこの公開形態では提供されません。
