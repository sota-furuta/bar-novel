# tools/ 実行手順一覧

BAR NOVEL の検証用スタブテストと巻き戻し検知スクリプトの一覧。リポジトリ直下で
`node tools/<スクリプト名>.mjs` の形で実行する。全ケース合格なら終了コード 0、
1件でも失敗したら 1 で終了する。**tools/ は検証専用で、本番（main）へは昇格しない。**

| スクリプト | 対象 | 再実行するタイミング |
|---|---|---|
| check-initial-highlight.mjs | 目次チップの初期ハイライト（保留・取り消しの流れ） | script.js の初期ハイライト（highlightOnOpen / pendingInitial）や目次チップの click ハンドラ、スクロール停止判定の仕組みを触ったとき |
| check-header-spy.mjs | ヘッダーナビ／ハンバーガーメニューの現在地表示（is-current・aria-current） | script.js のヘッダースパイ（末尾の IIFE）や共通ヘルパー、index.html のナビにリンクを増減したとき |
| check-date-boundaries.mjs | 日付の境界（JST 9:00 の前後・月末・年末・うるう年） | functions/api/_date.js や stats.js を触ったとき |
| check-critical-lines.mjs | 消えてはいけない行の存続（CRITICAL）と禁止パターン（FORBIDDEN） | 検証ブランチへの push 前・本番反映前に、巻き戻しの有無を確認するとき（`--for-main` を付けると main 側のファイルで確認する） |

実行例：

```sh
node tools/check-initial-highlight.mjs
node tools/check-header-spy.mjs
node tools/check-date-boundaries.mjs
node tools/check-critical-lines.mjs
```
