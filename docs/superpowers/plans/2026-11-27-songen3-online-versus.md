# 尊厳を賭けようか3 オンライン対戦 実装計画書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**目標**　無印の絵文字格闘を二人でオンライン対戦できる新しい『尊厳を賭けようか3』に入れ替える。

**構成**　GitHub Pagesに画面を配信し、Cloudflare Workersと部屋ごとのDurable Objectで席と試合を管理する。対戦計算を表示から切り離してサーバーとブラウザで共有する。実環境で通信と進行を測ってからCloudflareで試合を計算するか決める。

**技術**　JavaScriptモジュール、Node.js 22、pnpm 10.4.1、Vite、Vitest、Playwright WebKit、Cloudflare Wrangler、GitHub Actions。

**仕様**　[要件仕様書](../../online-versus-requirements.md)。各作業の R1〜R6 は同書の要件番号。

## 全作業の共通条件

- 無印の [060b251](https://github.com/chameleonjp-lab/songen_wo_kakeyouka/tree/060b251a7016725bfd4e7886936eabf223b092d0) を挙動の基準とする。既存3の置換前の基準は [ef0e1d4](https://github.com/chameleonjp-lab/songen_wo_kakeyouka3/tree/ef0e1d4e47dff003475edcf88a16bb4d52db29b9)。
- 二席、15言語、1秒に60回の対戦計算、180秒で時間切れ、カウントダウン3秒。再接続は一試合合計10秒、接続確認は1秒ごと、途絶判定は3秒。待機室の受付は10分、決着後にホストがルームへ戻れる期限と確定結果の保管は5分。
- 画面は①ホーム、②プレイヤー登録、③待機室、④ゲーム、⑤結果発表、⑥スコア結果の順。実験場はベストスコア・戦績・ソンカケptの3タブ。
- 招待は12文字、席の鍵は128ビット以上。試合は別回線のiPhone Safari同士で受け入れる。Cloudflareの試行には無料プランを使う。

## 初版から敵対的検証を経た修正

初版では、無印の対戦計算を移し、同じ部屋で二人をつなぎ、切断から復帰できるようにして既存の3を入れ替える方針とした。実装前に、無印の対戦ループ・命中・結果のコードと既存3の配信構成を読み、次の失敗を想定して修正した。実配備や端末試験の結果は、作業1と6で得る。

| 失敗の想定 | 修正版の対応と確認先 |
| --- | --- |
| 画面幅が異なると移動範囲も命中も変わる。再生用の要約では、再接続で元の状態を復元できない | 共通の座標と、しゃがみ・部位・飛んでいる拳・操作の受付番号までを含む完全な状態を定義。作業2で全状態が一致するか検査 |
| 部屋はつながるが、端末から入力がないと試合時間が進まない。タイマーが遅れ、費用も読めない | 作業1で実配備し、無操作180秒と試合中の間隔、別回線の遅れ、稼働量を測る。Cloudflareで計算できるかを先に判定 |
| 招待の再利用、別タブ、再戦後に届いた古い操作で席や試合の状態が変わる | 招待と席の鍵を分け、接続世代・試合ID・連番を照合。作業3と4で同時参加、再読込、前試合の送信を検査 |
| 勝敗と切断が競合する。サーバー更新後に同じ結果が二度記録される | 決着は一度だけ保存し、確定済みを優先。未確定の再起動は中断とし、作業4で開始と終了それぞれの保存境界を検査 |
| 旧3の配信処理が削除した3D素材を探す。対戦サーバーと画面の版が食い違う | 作業7で3D用の処理と配信物をまとめて入れ替え、新旧の版の組み合わせを確認。以前の配信物と復元工程を用意 |

### 6画面とランキングの追加検証

追加仕様の初版は、登録から対戦までを四画面で進め、結果を盤面とスコアの二画面に分ける形とした。無印の採点、実験場の作品指定、結果をサーバーで保存する既存計画を照らし、次の場面を修正版に反映した。

| 想定した場面 | 対応と検査先 |
| --- | --- |
| iPhoneでコピーに失敗し、相手へIDを伝えられない | IDを選択できる表示と手入力を用意し、作業3・6で招待と参加を確認する |
| 待機室と結果発表で左右が違う。または決着の帯が破損部位を隠す | 共通の左右と保存した最終盤面を使用し、⑤は手動で進む。作業4・6で短い縦画面を検査する |
| ホストが先に戻るとゲストの結果が消える。ゲストも戻る要求を送る | 決着の記録を試合IDごとに保存し、開き直しはホストの席だけに許可。作業4で古い操作と二重押しを確認する |
| 同名同士で戦績が混ざる。または結果の再送で通算が増える | ブラウザに保存した専用の資格で個人を識別し、同じ試合の各席を一度だけ反映。作業5で同名と再送を検査する |
| 1勝1試合の勝率100%が上位に来る。引き分けや負の累計が計算を壊す | 試合数を加味した戦績点を使用し、引き分けの分母、負の値、0試合、同順位を作業5で検査する |

## ファイルの役割

| パス | 役割 |
| --- | --- |
| `game/rules.js`, `game/protocol.js` | 描画を含まない試合計算、通信の型・検査 |
| `web/index.html`, `web/js/{app,match-client,view,result-view,messages,i18n,audio}.js` | ホームと試合画面、再接続、描画、翻訳と音。無印のコードを基にする |
| `worker/{index,room,clock}.js`, `wrangler.toml` | 入室と接続、試合・席の管理、試合の時刻管理、試行と本番の設定 |
| `worker/ranking.js`, `tests/ranking.test.js` | 実験場への開始・成績連携と再送、順位計算の確認 |
| `tests/{clock,rules,room,match,static}.test.js`, `tests/fixtures/unmarked-rules.json`, `tests/browser/online.spec.js` | サーバーの進行、無印との比較、入室・対戦・障害・配信物の回帰、2画面の通し試験 |
| `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `playwright.config.js`, `.github/workflows/{ci,pages}.yml` | ビルド、検査、本人のmainマージ後に使う配信手順 |

無印の [描画と戦闘が混ざる箇所](https://github.com/chameleonjp-lab/songen_wo_kakeyouka/blob/060b251a7016725bfd4e7886936eabf223b092d0/index.html#L2119-L2163) と [入力再生](https://github.com/chameleonjp-lab/songen_wo_kakeyouka/blob/060b251a7016725bfd4e7886936eabf223b092d0/index.html#L3096-L3125) を基に分割する。完全な試合状態には既存の比較用ハッシュを流用せず、新しい直列化の検査を設ける。

### 作業1　対戦の時刻と通信を確かめる（R3・R6）

- [ ] `tests/clock.test.js` に `advancesWithoutInput` と `boundsCatchUpAfterDelay` を追加。模擬時計で入力なし10,800回、短時間の遅れを補った後の残り時間、停止と再開で同じ計算回を二度処理しないことを検査する。対象だけを実行し、追加した検査が実装前に失敗することを確認する。
- [ ] `worker/clock.js` に `createMatchClock({nowMs, onTick})` を作り、`start()`、`pause()`、`resume()`、`stop()` を提供する。暦の時刻と試合内の計算回を分ける。遅れの埋め合わせは1回の呼び出しで最大5回に抑え、継続して追いつけない状態を記録する。
- [ ] `worker/index.js` と `worker/room.js` に2席の試行用経路を用意し、`pnpm exec wrangler deploy --env preview` で無料の試行環境へ配備する。運転中だけタイマーを持ち、待合中は休止可能な接続を使う。無操作で180秒±1秒になることと、別回線の2台で往復時間・試行用の確定応答・稼働量を計測する。試行で使った接続を閉じ、実測結果を実装PRに記録する。
- [ ] `pnpm exec vitest run tests/clock.test.js` を通す。Workersの実環境で安定しない場合は、同じ通信仕様を保てる常時稼働の対戦サーバーで比較し、採用理由を記録してから試合実装を続ける。

Workersの時刻と時間計測の制約、Durable Objectの稼働中の課金については [Workersのタイマー](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#timers)、[部屋の休止条件](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)、[料金](https://developers.cloudflare.com/durable-objects/platform/pricing/) を参照。

### 作業2　無印の対戦計算を共通化する（R2・R3）

- [ ] 無印の固定版を390×844の縦画面で実行し、ステージの実測寸法と、原本の操作と結果を `tests/fixtures/unmarked-rules.json` に保存する。中央の拳が前腕の破壊後に届くこと、残り腕のガード、腕がないと攻撃不可、破損後の移動とジャンプ、拳の相殺、同時心臓命中、180秒で引き分けを含める。
- [ ] `tests/rules.test.js` に左右両席の入力を使った原本照合、描画なしの実行、途中の状態を保存して続きの入力を再生したときの完全一致を追加する。対象を単独で実行し、実装前に失敗することを確認する。
- [ ] `game/rules.js` に `createMatch({matchId, players, stage}) → MatchState`、`stepMatch(state, [inputA, inputB]) → {state, events}`、`toSnapshot(state) → Snapshot` を実装する。入力は `left, right, crouch, jumpPressed, attackPressed, guardPressed`。画面固有の寸法、描画、音、現在時刻は計算の外に置く。状態には計算回、二人の座標・姿勢・部位とその耐久・各技の終端時刻、拳の進行、決着を含める。
- [ ] `pnpm exec vitest run tests/rules.test.js` を通す。無印との違いがある場合は、同じ入力の比較と修正理由を実装PRに記録する。

### 作業3　ホーム、プレイヤー登録、待機室を作る（R1・R5・R6）

- [ ] `tests/room.test.js` に初回と再送で同じ席を返す、二人目の同時参加は一件だけ成功する、三人目・期限切れ・版違いを拒否する、片方だけの準備では開始しない、両者に同じ左右が返るケースを追加する。対象を単独で実行し、実装前に失敗することを確認する。
- [ ] `game/protocol.js` と `worker/index.js` に次の入口を実装する。操作の送受信には両端で接続を維持する方式（WebSocket）を使う。

  | 入口 | 入出力 |
  | --- | --- |
  | `POST /v1/rooms` | `{seatKey, name?, faceId, rankingKey?, version}` → `{code, seat: 0, expiresAt}` |
  | `POST /v1/rooms/{code}/join` | `{seatKey, name?, faceId, rankingKey?, version}` → `{code, seat: 1, expiresAt}` |
  | `GET /v1/rooms/{code}/socket` | 暗号化した接続（WSS）を開き、最初に `{type: "auth", seatKey, version}`。成功時に席・左右・接続世代・部屋状態を返す |

- [ ] `worker/room.js` で招待を正規化し、予約の確認と保存を一つの処理として行う。ブラウザが作成した16バイトの安全な乱数を席の鍵にし、サーバーには照合用のハッシュを保存。新規作成時の合言葉はサーバー側の秘密値と作成者の鍵から英数字32種で12文字を導出し、再送で同じ部屋を返す。衝突時は別の鍵で作り直す。鍵はHTTPSの本文または認証メッセージだけで送る。通信版は1から始める。未認証の接続は5秒で閉じる。ホストを左、ゲストを右に割り当て、両席の準備完了後にサーバー時刻で3秒を設定し、開始前に片方が離れた場合はカウントダウンを取り消す。
- [ ] `web/js/app.js` に `home`、`register`、`lobby` の画面とボタン順を実装する。②に1名分の名前・顔、ID手入力、作成後のIDコピー・X共有・待機室への移動を置く。③は同じ左右で表示し、各自の側だけ「あなた」を付ける。招待コードは共有URLの `#room=` に入れ、席の鍵は同じタブの再読込で使える一時保存領域に置く。人数超過、期限切れ、通信失敗を区別して表示する。既知の配信元を許可し、部屋や席の権限は別途照合する。
- [ ] `pnpm exec vitest run tests/room.test.js` を通し、合言葉の手入力と招待リンクからの二人入室を試行環境で確認する。

### 作業4　対戦、結果発表、スコア結果をつなぐ（R1〜R5・R7）

- [ ] `tests/match.test.js` に両席の同じ確定状態、古い接続・再戦前の入力の拒否、押しっぱなしの解除、期限内復帰と期限切れ、決着と切断の競合、再起動後の結果再取得、ホストが先に戻ったときのゲストの結果、ゲストからの戻る要求と二重押し、開始計測の一意性を追加。対象を単独で実行し、実装前に失敗することを確認する。
- [ ] `game/protocol.js` にクライアント送信 `ready`、`input`、`heartbeat`、`suspend`、`forfeit`、`returnToRoom` とサーバー配信 `room`、`snapshot`、`finished`、`error` を定義する。操作の形は `{type: "input", matchId, generation, seq, input}`。席と接続世代は認証済みの接続から決め、試合中・試合後の要求すべてで試合IDを照合する。操作の連番・権限・頻度を検査する。部屋の新規作成・参加の連投、異なる型、上限を超える大きさと頻度の入力を拒否する検査もここで追加する。
- [ ] `worker/room.js` に `acceptInput(seat, message)` と `finishOnce(matchId, result)` を実装する。入力は次の計算回で適用し、押した瞬間の操作が上書きで消えないように扱う。計算は毎秒60回。確定状態は通常毎秒20回を初期値とし、試合開始・停止・再開・決着時は即時送る。確定状態には両席の処理済み連番を含める。開始時は試合IDをキーに開始時刻と参加席数2を一度保存し、決着は同IDで一度保存する。`finished` は `{matchId, finalSnapshot, outcomeBySeat, scoreBySeat, statsBySeat, reason}` を返す。 `returnToRoom` はホストの認証と終了済みの試合IDを照合し、同じルームIDの待機室を一度だけ開き直す。前試合の盤面・結果を保存したまま、ゲストの次戦用の席を空け、次戦に別の試合IDを割り当てる。
- [ ] `web/js/match-client.js` で自分の操作に即時反応し、処理済み連番を使って確定状態に合わせる。試合ID・計算回・イベントIDで重複や古い結果を除く。`view.js` で④と確定イベントの効果音を扱う。`result-view.js` に `showAnnouncement(result, seat)` と `showScore(result, seat, isHost)` を作る。⑤で `finalSnapshot` を固定表示し、盤面の外に「スコア結果へ」を置く。端末回転後も同じ最終状態を描く。⑥で自分側の内訳を表示し、ホストだけ「ルームに戻る」を最初に置き、続けてX共有・ホーム・ランキングを表示する。端末回転は表示だけを変更する。切断時はサーバーで入力を解除し、R4に従って両席の復帰を待つ。再起動からは開始記録と確定結果を読み、未確定試合を中断とする。期限を過ぎた部屋の招待・席・試合の情報を消す処理は、部屋の後片付け用の予約処理で行う。
- [ ] `pnpm exec vitest run tests/match.test.js tests/room.test.js tests/rules.test.js` を通す。接続が途中で失敗しても、両画面が同じ中断理由または確定済みの結果を出すことを確認する。

### 作業5　実験場と三つのランキングをつなぐ（R6・R7）

- [ ] `tests/ranking.test.js` に、6勝3敗1分・通算8,000点が戦績点3,000・2,400ptになる検査を追加する。1戦1勝は戦績点909、100戦60勝は5,454。負の通算と0勝のソンカケptは0。名無しの開始、同名の別人、降参のスコア除外と戦績加算、中断、同順位、開始と結果の再送も検査する。実装前に実行し、追加した検査が失敗することを確認する。
- [ ] `game/rules.js` に `totalMatchScore(stats, won, elapsedSec)` を追加する。無印の採点式を各席に適用し、`scoreBySeat` に入れる。過去の最高値と比較する前に、負点を含む元の確定点を保持する。
- [ ] `worker/ranking.js` に `queueRankingEvent({matchId, seat, kind, playerId, displayName, startedAt, outcome, finishReason, score})` と `flushRankingEvents()` を実装する。開始は名前の有無に関わらず、結果は名前を登録した席の確定内容を連携する。試合ID・席・イベント種別ごとの一意キーと再送用の記録を使う。名前付きの登録でランキング用の秘密鍵を同じブラウザに保存し、サーバーは照合して公開用の `playerId` を決める。表示名と鍵を分け、他のブラウザの同名ユーザーは別の記録にする。途中で連携先が落ちても⑤⑥へ進めるようにし、未送信イベントは部屋を閉じた後も送信完了まで保管する。集計には整数の値を使用する。
- [ ] 実験場側で `songen_wo_kakeyouka3_online` を登録し、三つの集計値とタブを実装する。名前だけで集計する既存の入口を流用できるか確認し、別人を混同する場合は本作専用の入口を用意する。連携はサーバー間で認証し、通算・戦績・順位は保存済みの確定結果から計算する。最高スコアの対象がまだない参加者はベストスコアの一覧から外し、順位の同点を区別しない。
- [ ] `pnpm exec vitest run tests/ranking.test.js` を通し、両方のランキングボタンから専用ページへ遷移して三つのタブが開くことを検証する。実験場側の変更は [chameleonjp_lab](https://github.com/chameleonjp-lab/chameleonjp_lab) の関連PRと連携し、試験は検証用データで行う。 [実験場の作品指定](https://github.com/chameleonjp-lab/chameleonjp_lab/blob/main/ranking.html#L2649-L2671)

### 作業6　iPhoneと公開用画面で受け入れる（R1・R2・R4・R6・R7）

- [ ] `tests/browser/online.spec.js` に二つの独立した画面で「ホーム → 登録 → 待機室 → 対戦 → 結果発表 → スコア結果」を追加。画面①・⑥のボタン順、③の左右、⑤で手動で進むまで最終盤面が残ること、⑥でホストだけが同じ部屋へ戻れることを検査する。短い縦画面・横画面と長い翻訳でも、対戦操作と⑤の両者の部位が見えることを確認する。
- [ ] `web/js/{messages,i18n,audio}.js` に既存15言語とオンライン表示、音設定の保存を組み込む。①の作品紹介、②のIDと招待リンク、⑥のスコア付き作品紹介を別の共有文にする。公開用サムネイルと、コピー失敗時にIDを選択・手入力できる導線を確認する。
- [ ] `pnpm exec playwright test --project=webkit` を通す。要件仕様の端末・通信条件で、別回線のiPhone Safari同士の試合数、遅れ、切断復帰、再戦を記録する。画面上の確定状態と結果を試合ID・計算回で照合し、宛先に試行環境を使ったことを確かめる。

### 作業7　既存3の中身と配信を切り替える（R6・R7）

- [ ] 現在のPages公開設定・直近の配信と配信物・実験場の作品リンクを確認し、戻せるコミットと取得できた配信物を実装PRに記録する。現状の[公開手順](https://github.com/chameleonjp-lab/songen_wo_kakeyouka3/blob/ef0e1d4e47dff003475edcf88a16bb4d52db29b9/PUBLISHING.md)にある旧ビルド、素材監査、旧3D画面の参照を列挙する。
- [ ] `tests/static.test.js` に配信物から公開URLのサブパスでゲームが開くこと、必要な素材と画面が揃うこと、対象の通信バージョンを含むことを検査する処理を追加する。GitHub Pagesへ渡すのは画面用の `dist/public` とし、対戦サーバーのコードや秘密値は別のビルドに置く。
- [ ] 同じ実装PRで旧3Dのアプリ、素材、専用ツール、旧説明・旧テストを対象ごとに削除し、Viteの出力、依存関係と固定ファイル、CI、Pages公開手順を新作に更新する。Git履歴から戻せるよう通常のコミットで扱う。
- [ ] `pnpm check`、`pnpm test`、`pnpm build`、WebKit試験を同じコミットで通す。公開前に本番の対戦サーバーが対応版を返すことを検査し、本人のmainマージ後にそのコミットの配信物を公開する。公開URLから二人で入室し、結果発表からスコア結果まで確認する。実験場への連携と3タブの表示を確認した上で、公開の受入とする。
- [ ] 部屋の作成入口だけを閉じる運用スイッチを設け、途中の試合を終えられるか試行環境で確認する。問題が出たら新規受付を止め、前の動く配信物を再配備できるか確認する。必要に応じて旧版の復元PRを作り、画面とサーバーで互換性のある組み合わせに戻す。

各作業は対象の試験を通してから、変更した範囲を一つのコミットとしてまとめる。作業2の無印比較、作業4の切断と決着、作業5の順位計算、作業6の実機結果、作業7の公開後確認を実装PRで追跡する。Pagesで使う権限とビルド成果物の扱いは [GitHubの公開手順](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) を参照。
