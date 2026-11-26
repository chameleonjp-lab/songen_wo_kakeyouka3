# 尊厳を賭けようか3

絵文字の顔を選び、友だちとオンラインで戦うブラウザゲームです。左右の腕・足と頭の耐久を削りながら、相手の心臓に拳を当てた側が勝ちです。二人の心臓へ同時に命中した場合と、3分の時間切れは引き分けになります。

## 遊び方

1. 「ゲームの準備」で顔を選びます。名前は空欄でも遊べます。
2. どちらかが「ルームを立てる」を押し、相手にルームIDまたは招待リンクを渡します。相手は招待リンクを開くか、IDを入力して「参加する」を押します。
3. 待機室で二人とも「準備完了」を押します。先に部屋を作った人は左、参加した人は右です。
4. 移動、しゃがみ、ジャンプ、拳、ガードを使って戦います。決着後は最終盤面を撮影できます。「スコア結果へ」で得点の内訳を見ることができ、部屋を作った人は同じIDの待機室に戻れます。

名前を入れた試合の決着は、[実験場の詳細ランキング](https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=songen_wo_kakeyouka3_online)で、ベストスコア・戦績・ソンカケptに反映されます。ルールの原本は[無印のゲーム](https://github.com/chameleonjp-lab/songen_wo_kakeyouka/tree/060b251a7016725bfd4e7886936eabf223b092d0)です。

## 開発

Node.js 22とpnpm 10.4.1を使います。ローカルでの試行には別々のブラウザ画面を開きます。

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm dev
corepack pnpm exec wrangler dev --env preview --port 8787 --var ROOM_CODE_SECRET:local-test-secret-only-32-characters
```

[公開手順](PUBLISHING.md)と[要件仕様書](docs/online-versus-requirements.md)に、検証・公開に必要な設定を記載しています。
