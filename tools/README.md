# tools/ 実行手順一覧

BAR NOVEL の検証用スタブテストと巻き戻し検知スクリプトの一覧。リポジトリ直下で
`node tools/<スクリプト名>.mjs` の形で実行する。全ケース合格なら終了コード 0、
1件でも失敗したら 1 で終了する。**tools/ は検証専用で、本番（main）へは昇格しない。**
いずれも Node.js のみで動き、追加の依存や npm install は不要です（ただし smoke-browser.mjs だけは Playwright＋Chromium が要る。詳しくは下の「実ブラウザのスモークテスト」を参照）。

| スクリプト | 対象 | 再実行するタイミング |
|---|---|---|
| check-initial-highlight.mjs | 目次チップの初期ハイライト（保留・取り消しの流れ） | script.js の初期ハイライト（highlightOnOpen / pendingInitial）や目次チップの click ハンドラ、スクロール停止判定の仕組みを触ったとき |
| check-header-spy.mjs | ヘッダーナビ／ハンバーガーメニュー／フッターナビの現在地表示（is-current・aria-current） | script.js のヘッダースパイ（末尾の IIFE）や共通ヘルパー、index.html のナビにリンクを増減したとき・index.html に新しいセクションを追加したとき |
| check-byid-guard-sensitivity.mjs | check-header-spy.mjs の byId ガードの感度（コードらしい再導入では落ち、コメントだけでは落ちないこと） | check-header-spy.mjs の byIdCodePattern やガードの対象範囲を触ったとき、script.js のヘッダースパイ IIFE の入口（const links の行）を触ったとき |
| check-date-boundaries.mjs | 日付の境界（JST 9:00 の前後・月末・年末・うるう年）と臨時休業帯の fmt ガード（不正日付→null で項目が落ちる） | functions/api/stats.js または track.js の日付生成・集計範囲を触ったとき（日付生成は functions/api/_date.js の共通ヘルパーに寄せてある）、script.js の臨時休業帯の fmt を触ったとき |
| check-critical-lines.mjs | 消えてはいけない行の存続（CRITICAL）と禁止パターン（FORBIDDEN）、recordSuccess の呼び出しは auth.js のみという構造ガード（functions/api 配下を走査） | verification へ push した後（リモートの最新を新しく取得したフォルダで実行する。手元の古いフォルダでは巻き戻しを見逃す）・本番反映前・functions/api 配下へ管理APIを増減したとき |
| check-forbidden-detection.mjs | FORBIDDEN 検知そのものの自己テスト（生成式による内部 export 検知5件などが、変異形を検知でき正当な形を誤検知しないこと） | check-critical-lines.mjs の FORBIDDEN や _date.js の公開／内部の境界を触ったとき・check-critical-lines.mjs へ push する前 |
| check-auth-guard.mjs | /admin ログイン試行制限のガード（IP単位の失敗カウント・15分ロック・全管理APIへの適用） | functions/api/_auth-guard.js や管理APIのパスワード照合を触ったとき |
| check-photos-caption.mjs | 写真のキャプション変更 API（PATCH /api/photos）の認証・バリデーション・索引更新 | functions/api/photos.js のキャプション変更を触ったとき |
| check-geo-consistency.mjs | JSON-LD の geo と地図埋め込み iframe の ll パラメータの一致 | index.html の JSON-LD や地図 iframe の座標を触ったとき |
| smoke-browser.mjs | 実ブラウザのスモークテスト（着地・確認モーダル・ハンバーガーメニュー。全17チェック） | 着地・モーダル・ハンバーガーまわりの script.js や index.html・style.css を触ったとき。Playwright＋Chromium が要る（下記参照） |

実行例：

```sh
node tools/check-initial-highlight.mjs
node tools/check-header-spy.mjs
node tools/check-byid-guard-sensitivity.mjs
node tools/check-date-boundaries.mjs
node tools/check-critical-lines.mjs
node tools/check-forbidden-detection.mjs
node tools/check-auth-guard.mjs
node tools/check-photos-caption.mjs
node tools/check-geo-consistency.mjs
node tools/smoke-browser.mjs
```

## 実ブラウザのスモークテスト

smoke-browser.mjs は Playwright＋Chromium（headless）で動く。導入はスクリプト先頭コメント
の手順どおり（Playwright は `~/workspace/bar-novel-smoke-deps`、ブラウザ本体は
`~/.cache/ms-playwright/chromium-1255`）。この VM ではブラウザからの外部接続が egress
プロキシで遮断されるため、既定ではリポジトリ直下のファイルをローカルで一時配信
（`http://127.0.0.1:<一時ポート>/`）して開く。ブラウザから外部へ出られる環境では、
プレビュー自体を直接開ける：

```sh
SMOKE_URL=https://verification.bar-novel.pages.dev/ node tools/smoke-browser.mjs
```

ローカル配信では `/api/*` は 404 を返すが、サイト側は取得失敗を無視する作りのため
判定に影響しない。Google フォント／地図 iframe の読み込みも同理由で失敗するが、判定には使わない。

SMOKE_URL でプレビューを直接開いたときは本物の API が動くため、ローカル配信時（`/api/*` は 404）とはお知らせ・統計の読み込み結果が変わる。判定には使っていないが、将来チェックを増やすときの前提になる。

本番（main）側で check-critical-lines.mjs を実行したい場合は、tools/ は
verification 専用のため main の取得フォルダにはスクリプト自体がない。検証側から
このファイルだけを main 取得フォルダの tools/ へ一時コピーしてから
`node tools/check-critical-lines.mjs --for-main` で実行すること。検証フォルダで
そのまま `--for-main` を付けても verification 側しか見ない。

新しいスタブテストを追加したら、この README の表にも1行追加すること。

## 実機・読み方のメモ

- フッターの項目を増減したときは、360／390／430px の各幅でフッターが切れていないか実機幅で確認する（スタブやコード確認では分からないため）。
- メニューの高さを確認するときは、PC幅（820px以上）でも確認する（メディアクエリの配置ミスはスタブでは検出できないため）。
- ハンバーガーメニュー経由を含む全ての tel: リンクのタップが、統計の「電話」件数に入る（導線ごとの区別はできない）。
