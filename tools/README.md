# tools/ 実行手順一覧

BAR NOVEL の検証用スタブテストと巻き戻し検知スクリプトの一覧。リポジトリ直下で
`node tools/<スクリプト名>.mjs` の形で実行する。全ケース合格なら終了コード 0、
1件でも失敗したら 1 で終了する。**tools/ は検証専用で、本番（main）へは昇格しない。**
いずれも Node.js のみで動き、追加の依存や npm install は不要です。

| スクリプト | 対象 | 再実行するタイミング |
|---|---|---|
| check-initial-highlight.mjs | 目次チップの初期ハイライト（保留・取り消しの流れ） | script.js の初期ハイライト（highlightOnOpen / pendingInitial）や目次チップの click ハンドラ、スクロール停止判定の仕組みを触ったとき |
| check-header-spy.mjs | ヘッダーナビ／ハンバーガーメニューの現在地表示（is-current・aria-current） | script.js のヘッダースパイ（末尾の IIFE）や共通ヘルパー、index.html のナビにリンクを増減したとき・index.html に新しいセクションを追加したとき |
| check-byid-guard-sensitivity.mjs | check-header-spy.mjs の byId ガードの感度（コードらしい再導入では落ち、コメントだけでは落ちないこと） | check-header-spy.mjs の byIdCodePattern やガードの対象範囲を触ったとき、script.js のヘッダースパイ IIFE の入口（const links の行）を触ったとき |
| check-date-boundaries.mjs | 日付の境界（JST 9:00 の前後・月末・年末・うるう年） | functions/api/stats.js または track.js の日付生成・集計範囲を触ったとき（日付生成は functions/api/_date.js の共通ヘルパーに寄せてある） |
| check-critical-lines.mjs | 消えてはいけない行の存続（CRITICAL）と禁止パターン（FORBIDDEN） | verification へ push した後（リモートの最新を新しく取得したフォルダで実行する。手元の古いフォルダでは巻き戻しを見逃す）・本番反映前 |
| check-forbidden-detection.mjs | FORBIDDEN 検知そのものの自己テスト（生成式による内部 export 検知5件などが、変異形を検知でき正当な形を誤検知しないこと） | check-critical-lines.mjs の FORBIDDEN や _date.js の公開／内部の境界を触ったとき・check-critical-lines.mjs へ push する前 |

実行例：

```sh
node tools/check-initial-highlight.mjs
node tools/check-header-spy.mjs
node tools/check-byid-guard-sensitivity.mjs
node tools/check-date-boundaries.mjs
node tools/check-critical-lines.mjs
node tools/check-forbidden-detection.mjs
```

本番（main）側で check-critical-lines.mjs を実行したい場合は、tools/ は
verification 専用のため main の取得フォルダにはスクリプト自体がない。検証側から
このファイルだけを main 取得フォルダの tools/ へ一時コピーしてから
`node tools/check-critical-lines.mjs --for-main` で実行すること。検証フォルダで
そのまま `--for-main` を付けても verification 側しか見ない。

新しいスタブテストを追加したら、この README の表にも1行追加すること。
