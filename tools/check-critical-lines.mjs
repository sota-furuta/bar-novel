// 巻き戻しの自動検知（BAR NOVEL ホームページ）
//
// 並行作業の push が古いスナップショットを基にしていると、別の作業で
// 入れたはずの行が丸ごと消える「巻き戻し」が起きる。実際に、
// chip 編集ガイド行は並行 push で2回消え、初期ハイライトの
// スクロール完了待ちの仕組みも1回消えた。いずれも人の差分確認でしか
// 気づけなかった（2026-11-18〜19）。
// このスクリプトは「消えてはいけない行」の存続を grep 相当の
// 部分文字列チェックで機械的に確認し、巻き戻しを push 直後／
// 本番反映前に検知できるようにするもの
// （2026-11-19、改善提案台帳の採用を受けて追加）。
//
// 実行するタイミング:
// - verification ブランチへ push した後（push した本人の作業フォルダ
//   ではなく、リモートの最新を新しく取得したフォルダで実行する。
//   手元の古いフォルダで実行すると巻き戻しを見逃す）
// - 本番（main）へ反映する前（反映候補である verification の最新取得で
//   実行し、全合格を昇格の条件にする）
// - 本番へ反映した後にも確認したい場合は、下の --for-main の使い方で
//   実行する（任意。台帳に「本番反映済み」と記録する前の確認用）。
//
// 実行方法:
//   node tools/check-critical-lines.mjs
// 全項目が残っていれば終了コード 0、1件でも欠けていれば
// （または禁止パターンが残っていれば）終了コード 1 で終了する。
//
// 本番（main）で実行する場合の注意:
// - tools/ は verification 専用で main へは昇格しないため、main の
//   取得フォルダにはこのスクリプト自体がない。検証側からこのファイル
//   だけを main 取得フォルダの tools/ へ一時コピーして、
//     node tools/check-critical-lines.mjs --for-main
//   で実行すること。--for-main ではファイル存在チェック
//   （CRITICAL_FILES）を対象外（SKIP 表示）にする。
// - --for-main でも、まだ main へ昇格していない機能の項目は FAIL に
//   なる。それは巻き戻しではなく「未反映」を示すものなので、
//   昇格済みの機能の項目だけを合否の対象として読むこと。
//
// 項目の追加の仕方:
// - 「消えたら巻き戻し／退行と分かる行」が増えたら、CRITICAL に
//   1件足す。pattern は行全体ではなく、文言変更に強く巻き戻しには
//   弱くならない程度の短い部分文字列にする（関数名・定数名・
//   見出し文言など、その機能の目印になるもの）。
// - 同じ文が複数か所にあり片方の欠落も検知したい項目は、minCount に
//   出現回数の下限を指定する。コメント等にも同じ表記が現れて
//   データ／本体と区別できない場合は、本体側にしか現れない形まで
//   pattern を延ばす（例：chip データは cat との組み合わせで見る）。
// - 逆に「戻ってきたら退行と分かる旧形」は FORBIDDEN に足す
//   （例：初期ハイライトの 60ms 固定待ち）。空白などの表記ゆれが
//   ありうる場合は patternRegex で指定する。
// - 機能自体を意図的に廃止したときは、理由を台帳等に残したうえで
//   対応する項目をこのリストからも外す（残したままだと正当な
//   変更が毎回失敗扱いになる）。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 消えてはいけない行（file はリポジトリルートからの相対パス、
// pattern はそのファイルに含まれているはずの部分文字列）
const CRITICAL = [
  {
    file: "script.js",
    pattern: "chip は目次チップの短縮表示名",
    label: "chip 編集ガイド行（DRINK_LISTS のコメント）",
    reason: "並行 push で2回消えた当事者。カテゴリ追加・改名時の chip 付け忘れ防止の案内",
  },
  {
    file: "script.js",
    // 編集ガイドのコメントにも具体例として同じ chip 表記が併記されて
    // いるため、データ行にしか現れない形（cat との組み合わせ）で見る。
    // コメント側は「→ chip:」の形で、こちらには一致しない
    pattern: 'cat: "Canadian and Irish", chip: "Canadian/Irish"',
    label: "ウイスキーの chip 短縮表示データ",
    reason: "目次ラベル追加の push で巻き戻し、復旧した実データ",
  },
  {
    file: "script.js",
    pattern: "group.chip ||",
    label: "chip を使う目次チップの表示ロジック",
    reason: "chip データがあっても、この分岐が消えると短縮表示が効かなくなる",
  },
  {
    file: "script.js",
    pattern: 'if (group.chip) b.setAttribute("aria-label", group.cat);',
    label: "chip があるカテゴリの aria-label（正式名称の読み上げ）",
    reason: "表示ロジックと同一ハンクで入った行。単独で消えると読み上げだけが静かに退行する",
  },
  {
    file: "script.js",
    // デフォルト遅延（250）まで含めると、正当なチューニングでも
    // 失敗扱いになるため、定義の存在だけを見る
    pattern: "const onScrollSettled =",
    label: "共通ヘルパー onScrollSettled の定義",
    reason: "固定解除と初期ハイライトの「スクロールが止まったら実行」を一元化した受け口",
  },
  {
    file: "script.js",
    pattern: "pendingInitial = onScrollSettled(",
    label: "初期ハイライトのスクロール完了待ち",
    reason: "60ms 固定待ちから置き換えた仕組みそのもの。1回巻き戻って復旧した",
  },
  {
    file: "script.js",
    pattern: "cancelHoldRelease = onScrollSettled(",
    label: "固定解除側の onScrollSettled 呼び出し（scheduleHoldRelease）",
    reason: "一元化は初期ハイライト側だけでなく固定解除側も対象。こちらが旧タイマー形へ戻ると検知できないため併せて見る",
  },
  {
    file: "script.js",
    // この取り消し呼び出しはチップタップ時と toggle 時（前回保留の
    // 取り消し）の2か所に同文があり、片方だけの欠落も検知できるよう
    // 出現回数の下限で確認する
    pattern: "if (pendingInitial) pendingInitial();",
    minCount: 2,
    label: "初期ハイライト保留の取り消し（チップタップ時＋toggle 時の2か所）",
    reason: "タップ先が先頭で上書きされる競合への対策と、保留を常に1つに保つ後片付け。どちらが消えても競合・残留が再発する",
  },
  {
    file: "script.js",
    pattern: "const createVisibleTracker =",
    label: "両スパイ共通ヘルパー createVisibleTracker の定義",
    reason: "目次ハイライトとヘッダーナビで判定（文書順で最後）を揃えた共通化の受け口",
  },
  {
    file: "script.js",
    pattern: "ベースから探す",
    label: "カクテル目次の案内ラベル",
    reason: "目次チップの上に付ける案内ラベル（ウイスキーは「種類から探す」）",
  },
  {
    file: "script.js",
    pattern: "種類から探す",
    label: "ウイスキー目次の案内ラベル",
    reason: "目次チップの上に付ける案内ラベル（カクテルは「ベースから探す」）",
  },
  {
    file: "script.js",
    pattern: 'a.setAttribute("aria-current", "true")',
    label: "ヘッダーナビの aria-current 付与",
    reason: "目次チップと読み上げ表現を揃えるためにヘッダーナビへ広げた現在地表示",
  },
  {
    file: "script.js",
    pattern: "品数が増えたら目次の要否を再検討すること",
    label: "spirits 定義側の相互参照コメント",
    reason: "目次を付けない判断が陳腐化する前に再検討へ気づくための1行",
  },
  {
    file: "script.js",
    pattern: "スピリッツは6品のみで一覧が短いため目次を付けない",
    label: "スピリッツに目次を付けない判断のコメント（利用側）",
    reason: "目次条件の横に残した判断理由。消えると除外が意図か事故か分からなくなる",
  },
  {
    file: "functions/api/_date.js",
    pattern: "export function jstDays",
    label: "_date.js の jstDays",
    reason: "日付生成を1か所へ寄せた共通ヘルパー。stats.js が import して使う",
  },
  {
    file: "functions/api/_date.js",
    pattern: "export function utcDays",
    label: "_date.js の utcDays",
    reason: "同上（UTC 基準の集計用）",
  },
  {
    file: "functions/api/_date.js",
    pattern: "export function jstToday",
    label: "_date.js の jstToday",
    reason: "同上（track.js が import して使う）",
  },
  {
    file: "functions/api/stats.js",
    pattern: 'from "./_date.js"',
    label: "stats.js の _date.js import",
    reason: "共通化したのに import が消えると、その場の複製ロジックへ巻き戻る",
  },
  {
    file: "functions/api/track.js",
    pattern: 'from "./_date.js"',
    label: "track.js の _date.js import",
    reason: "同上",
  },
];

// ファイル自体が消えてはいけないもの（中身ではなく存在を確認する）
const CRITICAL_FILES = [
  {
    file: "tools/check-date-boundaries.mjs",
    label: "日付境界の確認スクリプト",
    reason: "境界ケースの固定確認の手段そのもの。消えると確認手順が形骸化する",
  },
  {
    file: "tools/check-critical-lines.mjs",
    label: "この巻き戻し検知スクリプト自身",
    reason: "検知手段自身が巻き戻しで消えたら、以降の検知ができなくなる",
  },
];

// 残っていたら（戻ってきたら）退行と分かる旧形
// patternRegex は空白の有無などの表記ゆれを吸収するためのもの
const FORBIDDEN = [
  {
    file: "script.js",
    patternRegex: /setTimeout\(\s*highlightOnOpen\s*,\s*60\s*\)/,
    label: "初期ハイライトの 60ms 固定待ち",
    reason: "スクロール完了待ち（onScrollSettled）へ置き換え済み。戻っていたら巻き戻し",
  },
];

const forMain = process.argv.includes("--for-main");

let failures = 0;
const cache = new Map();
function readTarget(file) {
  if (!cache.has(file)) {
    const path = join(root, file);
    cache.set(file, existsSync(path) ? readFileSync(path, "utf8") : null);
  }
  return cache.get(file);
}

for (const item of CRITICAL) {
  const source = readTarget(item.file);
  if (source === null) {
    failures++;
    console.log(`FAIL ${item.label}: ファイルがありません (${item.file})`);
    console.log(`     理由: ${item.reason}`);
    continue;
  }
  const count = source.split(item.pattern).length - 1;
  const need = item.minCount || 1;
  if (count < need) {
    failures++;
    console.log(`FAIL ${item.label}: 行が見つかりません (${item.file}: ${item.pattern}、出現 ${count} 回／必要 ${need} 回以上)`);
    console.log(`     理由: ${item.reason}`);
  } else {
    console.log(`PASS ${item.label}`);
  }
}

for (const item of CRITICAL_FILES) {
  if (forMain) {
    // tools/ は main へ昇格しないため、本番向け実行では対象外にする
    console.log(`SKIP ${item.label}（--for-main では対象外）`);
  } else if (existsSync(join(root, item.file))) {
    console.log(`PASS ${item.label}（ファイルあり）`);
  } else {
    failures++;
    console.log(`FAIL ${item.label}: ファイルがありません (${item.file})`);
    console.log(`     理由: ${item.reason}`);
  }
}

for (const item of FORBIDDEN) {
  const source = readTarget(item.file);
  const found = source !== null && (item.patternRegex ? item.patternRegex.test(source) : source.includes(item.pattern));
  if (found) {
    failures++;
    console.log(`FAIL ${item.label}: 禁止パターンが残っています (${item.file}: ${item.patternRegex || item.pattern})`);
    console.log(`     理由: ${item.reason}`);
  } else {
    console.log(`PASS ${item.label}（禁止パターンなし）`);
  }
}

if (failures > 0) {
  console.log(`\n結果: ${failures} 件の巻き戻し／退行の疑いがあります。push／本番反映の前に、消えた行が意図した変更かどうかを確認してください`);
  process.exit(1);
}
console.log("\n結果: 全項目合格（消えてはいけない行はすべて残っています）");
