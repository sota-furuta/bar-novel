// 日付境界の確認スクリプト（BAR NOVEL 管理画面の統計まわり）
//
//
// 日付生成は functions/api/_date.js の共通ヘルパーに寄せてあり、
// stats.js（jstDays / utcDays）と track.js（jstToday）はそれを使う。
// 「JST の日」と「UTC の日」の境界が9時間ずれることが不具合の温床になる。
// この種のずれは通常表示では見えないため、境界ケースをモック時刻で固定確認できるよう、
// このスクリプトを残す（2026-11-18、改善提案台帳の採用を受けて追加）。
//
//
// - functions/api/stats.js または functions/api/track.js の日付生成・集計範囲を触ったとき
// - 「日付の基準（JST／UTC）を変える」変更をレビューするとき
// - script.js の臨時休業帯の fmt（日付整形と不正日付のガード）を触ったとき
//
//
// node tools/check-date-boundaries.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。
//
//
// テスト用の複製ロジックは持たない。共通ヘルパー（functions/api/_date.js）を
// そのまま import し、Date.now だけをモック時刻に差し替えて実行する。
// そのため、実装側の関数名や所在が変わると import に失敗してエラーになる。
// その場合は実装の変更に合わせて、このスクリプトの対象定義も更新すること。
//
//
// 1. JST 9:00 の前後（UTC の日付が切り替わる瞬間。JST では朝9時に UTC 日が変わる）
// 2. JST 0:00 の前後（JST の日付が切り替わる瞬間）
// 3. 月末・月初（30日ウィンドウの先頭日と、短い月をまたぐ連続性）
// 4. 年末・年始（年をまたぐウィンドウ）
// 5. うるう年（2月29日を含む／含まない年の違い）
// 6. 臨時休業帯の fmt ガード（script.js の fmt。不正な日付は null になり、その項目は帯に出ない）
//    防御的ガードは将来のリファクタで静かに消えやすいため、ケースで固定する
//    （2026-11-25、改善提案台帳の採用を受けて追加。第1弾の別担当レビューから）。
//    fmt の定義そのものを script.js から取り出して実行し、複製ロジックは持たない。
//    項目が落ちる側は、収集部の「if (t) closureItems.push(t);」が closures 収集ブロック内
//    （const closureItems = []; から closureItems.slice(0, 2) まで）に残っていることの
//    構造ガードと、取り出した fmt を使った収集の再現で確認する。
//    注：fmt の取り出しは波括弧の単純カウントのため、文字列・コメント内の不釣り合いな
//    括弧には弱い。将来 fmt 内に「}」を含む文字列等が入ると抽出がずれる
//    （2026-11-26、改善提案台帳の採用を受けて追加）。
// 7. 繰り上がり日付（2026-02-30、2026-11-31 等の存在しない日付）の扱い
//    仕様は「fmt 側で弾く（null）」に決定（2026-11-26、改善提案台帳の採用）。
//    Date は月末超過を別日へ繰り上げて表示してしまうため、誤った休業日を
//    帯に出さない。うるう年で実在する 2024-02-29 はケース6の有効側で固定済み。
// あわせて全ケース共通で、30日分の長さ・書式（YYYY-MM-DD）・重複なし・
// 1日ずつ連続していること、jstDays の末尾と jstToday が一致することも確認する。

import { readFileSync } from "node:fs";
import { dirname, join} from "node:path";
import { fileURLToPath, pathToFileURL} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 共通ヘルパーをそのまま読み込む（複製ロジックは持たない）。
const { jstDays, utcDays, jstToday } = await import(
pathToFileURL(join(root, "functions/api/_date.js")).href
);

// JST の壁時計時刻を UTC ミリ秒に変換する（JST = UTC+9、夏時間なし）
const jstMs = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) - 9 * 60 * 60 * 1000;

const realNow = Date.now;
function withMockedNow(ms, fn) {
Date.now = () => ms;
try {
return fn();
} finally {
Date.now = realNow;
}
}

let failures = 0;
function check(caseName, label, actual, expected) {
const ok = JSON.stringify(actual) === JSON.stringify(expected);
if (!ok) {
failures++;
console.log(` NG ${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}
return ok;
}

// 全ケース共通の不変条件: 長さ・書式・連続性・jstToday との一致
function checkInvariants(caseName, nowMs) {
const jst = withMockedNow(nowMs, () => jstDays(30));
const utc = withMockedNow(nowMs, () => utcDays(30));
const today = withMockedNow(nowMs, () => jstToday());
for (const [label, days] of [["jstDays", jst], ["utcDays", utc]]) {
check(caseName, `${label} length`, days.length, 30);
check(caseName, `${label} format`, days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), true);
check(caseName, `${label} unique`, new Set(days).size, days.length);
const consecutive = days.every((d, i) => {
if (i === 0) return true;
const prev = Date.parse(days[i - 1] + "T00:00:00Z");
const cur = Date.parse(d + "T00:00:00Z");
return cur - prev === 86400 * 1000;
});
check(caseName, `${label} consecutive`, consecutive, true);
}
check(caseName, "jstDays last == jstToday", jst[jst.length - 1], today);
return { jst, utc, today};
}

function runCase(name, nowMs, expectations) {
const before = failures;
const res = checkInvariants(name, nowMs);
for (const [label, actual, expected] of expectations(res)) {
check(name, label, actual, expected);
}
console.log(`${failures === before? "PASS": "FAIL"} ${name}`);
}

runCase("JST 9:00 の直前（UTC日は前日のまま）", jstMs(2026, 1, 1, 8, 59, 59), ({ jst, utc}) => [
["jst last", jst.at(-1), "2026-01-01"],
["utc last", utc.at(-1), "2025-12-31"],
]);

runCase("JST 9:00 ちょうど（UTC日が切り替わる）", jstMs(2026, 1, 1, 9, 0, 0), ({ jst, utc}) => [
["jst last", jst.at(-1), "2026-01-01"],
["utc last", utc.at(-1), "2026-01-01"],
]);

runCase("JST 0:00 の直前（年末 23:59:59）", jstMs(2025, 12, 31, 23, 59, 59), ({ jst, utc}) => [
["jst last", jst.at(-1), "2025-12-31"],
["utc last", utc.at(-1), "2025-12-31"],
]);

runCase("JST 0:00 ちょうど（年始、年またぎ）", jstMs(2026, 1, 1, 0, 0, 0), ({ jst, utc, today}) => [
["jst last", jst.at(-1), "2026-01-01"],
["utc last", utc.at(-1), "2025-12-31"],
["jstToday", today, "2026-01-01"],
["jst includes prev year-end", jst.includes("2025-12-31"), true],
]);

runCase("月末（1月31日、ウィンドウ先頭は1月2日）", jstMs(2026, 1, 31, 12, 0, 0), ({ jst}) => [
["jst last", jst.at(-1), "2026-01-31"],
["jst first", jst[0], "2026-01-02"],
]);

runCase("短い月の翌月1日（2026年2月は28日まで）", jstMs(2026, 3, 1, 12, 0, 0), ({ jst}) => [
["jst last", jst.at(-1), "2026-03-01"],
["jst first", jst[0], "2026-01-31"],
["includes Feb 28", jst.includes("2026-02-28"), true],
["no Feb 29", jst.includes("2026-02-29"), false],
]);

runCase("うるう年（2024年2月29日当日）", jstMs(2024, 2, 29, 12, 0, 0), ({ jst, today}) => [
["jst last", jst.at(-1), "2024-02-29"],
["jstToday", today, "2024-02-29"],
]);

runCase("うるう年の3月1日（2月29日を含むウィンドウ）", jstMs(2024, 3, 1, 12, 0, 0), ({ jst}) => [
["jst last", jst.at(-1), "2024-03-01"],
["jst first", jst[0], "2024-02-01"],
["includes Feb 29", jst.includes("2024-02-29"), true],
]);

runCase("年またぎウィンドウ（1月15日の先頭は前年12月17日）", jstMs(2026, 1, 15, 12, 0, 0), ({ jst, utc}) => [
["jst first", jst[0], "2025-12-17"],
["utc first", utc[0], "2025-12-17"],
]);

// --- 臨時休業帯の fmt ガード（script.js） ---
// fmt は端末のタイムゾーンで曜日・日を取り出すため、実行環境で結果が割れないよう
// この節の実行前にタイムゾーンを Asia/Tokyo へ固定する（帯の利用者は日本国内が前提）。
process.env.TZ = "Asia/Tokyo";
const scriptSource = readFileSync(join(root, "script.js"), "utf8");
function extractFmt(sourceText) {
const marker = "const fmt = (c) => {";
const start = sourceText.indexOf(marker);
if (start < 0) {
throw new Error("script.js: fmt が見つかりません（実装が変わった場合はこのスクリプトも更新してください）");
}
const braceStart = sourceText.indexOf("{", start);
let depth = 0;
for (let i = braceStart; i < sourceText.length; i++) {
if (sourceText[i] === "{") depth++;
else if (sourceText[i] === "}") {
depth--;
if (depth === 0) return sourceText.slice(start, i + 1) + ";";
}
}
throw new Error("script.js: fmt の終端が見つかりません");
}
const fmt = new Function(`${extractFmt(scriptSource)} return fmt;`)();

function runFmtCase(name, expectations) {
const before = failures;
for (const [label, actual, expected] of expectations) {
check(name, label, actual, expected);
}
console.log(`${failures === before? "PASS": "FAIL"} ${name}`);
}

runFmtCase("fmt: 有効な日付は整形される", [
["plain", fmt({ date: "2026-11-25" }), "11月25日（水）は臨時休業です"],
["with note", fmt({ date: "2026-11-22", note: "貸切" }), "11月22日（日）は臨時休業です（貸切）"],
["leap day", fmt({ date: "2024-02-29" }), "2月29日（木）は臨時休業です"],
]);

runFmtCase("fmt: 不正な日付は null になる", [
["not a date", fmt({ date: "not-a-date" }), null],
["empty string", fmt({ date: "" }), null],
["month 13", fmt({ date: "2026-13-01" }), null],
["date missing", fmt({}), null],
["date null", fmt({ date: null }), null],
]);

runFmtCase("fmt: 繰り上がり日付（存在しない日付）は null になる", [
["Feb 30", fmt({ date: "2026-02-30" }), null],
["Nov 31", fmt({ date: "2026-11-31" }), null],
["Feb 29 in non-leap year", fmt({ date: "2026-02-29" }), null],
["Feb 30 in leap year", fmt({ date: "2024-02-30" }), null],
["Apr 31", fmt({ date: "2026-04-31" }), null],
["rollover with note also null", fmt({ date: "2026-02-30", note: "貸切" }), null],
["Feb 29 in year 0099", fmt({ date: "0099-02-29" }), null],
]);

runFmtCase("fmt: 年 0〜99 の実在日付は整形される（Date.UTC の 1900+年 解釈に引きずられない）", [
["leap day in year 0000", fmt({ date: "0000-02-29" }), "2月29日（火）は臨時休業です"],
["plain in year 0001", fmt({ date: "0001-01-01" }), "1月1日（月）は臨時休業です"],
["leap day in year 0096", fmt({ date: "0096-02-29" }), "2月29日（水）は臨時休業です"],
["plain in year 0099", fmt({ date: "0099-01-15" }), "1月15日（木）は臨時休業です"],
]);

runFmtCase("fmt: 繰り上がり日付の項目は収集から落ち、有効な月末日は残る", [
["collected items", (() => {
const closureItems = [];
[{ date: "2026-02-30" }, { date: "2026-02-28" }, { date: "2026-11-31" }, { date: "2026-11-30" }].forEach((c) => {
const t = fmt(c);
if (t) closureItems.push(t);
});
return closureItems;
})(), ["2月28日（土）は臨時休業です", "11月30日（月）は臨時休業です"]],
]);

// closures 収集ブロック（const closureItems = []; から closureItems.slice(0, 2) まで）
// の範囲を取り出す。ファイル内のどこかに文字列があるだけの判定だと、ガード行が
// コメントアウトされて残った場合にすり抜けるため、ブロック内にあることを見る
// （2026-11-26、改善提案台帳の採用を受けて変更）。
function closureCollectionBlock(sourceText) {
const start = sourceText.indexOf("const closureItems = [];");
const end = sourceText.indexOf("closureItems.slice(0, 2)", start);
if (start < 0 || end < 0) return null;
return sourceText.slice(start, end);
}

runFmtCase("fmt: 不正な日付の項目は収集から落ち、有効な項目だけが残る", [
["collection guard in script.js", (() => { const block = closureCollectionBlock(scriptSource); return block !== null && block.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n").includes("if (t) closureItems.push(t);"); })(), true],
["collected items", (() => {
const closureItems = [];
[{ date: "not-a-date" }, { date: "2026-11-25" }, { date: "" }, { date: "2026-11-22", note: "貸切" }].forEach((c) => {
const t = fmt(c);
if (t) closureItems.push(t);
});
return closureItems;
})(), ["11月25日（水）は臨時休業です", "11月22日（日）は臨時休業です（貸切）"]],
]);

if (failures > 0) {
console.log(`\n結果: ${failures} 件の確認が失敗しました`);
process.exit(1);
}
console.log("\n結果: 全ケース合格（日付境界の確認手順はこのスクリプトで固定化されています）");
