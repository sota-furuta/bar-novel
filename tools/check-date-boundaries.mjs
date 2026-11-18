// 日付境界の確認スクリプト（BAR NOVEL 管理画面の統計まわり）
//
//
// stats.js の日付生成（jstDays / utcDays）と track.js の jstToday は、
// 「JST の日」と「UTC の日」の境界が9時間ずれることが不具合の温床になる。
// この種のずれは通常表示では見えないため、境界ケースをモック時刻で固定確認できるよう、
// このスクリプトを残す（2026-11-18、改善提案台帳の採用を受けて追加）。
//
//
// - functions/api/stats.js または functions/api/track.js の日付生成・集計範囲を触ったとき
// - 「日付の基準（JST／UTC）を変える」変更をレビューするとき
//
//
// node tools/check-date-boundaries.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。
//
//
// テスト用の複製ロジックは持たない。対象ファイルのソースから
// jstDays / utcDays / jstToday の関数定義そのものを取り出して評価し、
// Date.now だけをモック時刻に差し替えて実行する。
// そのため、実装側の関数名や所在が変わると取り出しに失敗してエラーになる。
// その場合は実装の変更に合わせて、このスクリプトの対象定義も更新すること。
//
//
// 1. JST 9:00 の前後（UTC の日付が切り替わる瞬間。JST では朝9時に UTC 日が変わる）
// 2. JST 0:00 の前後（JST の日付が切り替わる瞬間）
// 3. 月末・月初（30日ウィンドウの先頭日と、短い月をまたぐ連続性）
// 4. 年末・年始（年をまたぐウィンドウ）
// 5. うるう年（2月29日を含む／含まない年の違い）
// あわせて全ケース共通で、30日分の長さ・書式（YYYY-MM-DD）・重複なし・
// 1日ずつ連続していること、jstDays の末尾と jstToday が一致することも確認する。

import { readFileSync} from "node:fs";
import { dirname, join} from "node:path";
import { fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function extractFunction(source, name, fileLabel) {
const start = source.indexOf(`function ${name}(`);
if (start < 0) throw new Error(`${fileLabel}: function ${name} が見つかりません（実装が変わった場合はこのスクリプトも更新してください）`);
const braceStart = source.indexOf("{", start);
let depth = 0;
for (let i = braceStart; i < source.length; i++) {
if (source[i] === "{") depth++;
else if (source[i] === "}") {
depth--;
if (depth === 0) return source.slice(start, i + 1);
}
}
throw new Error(`${fileLabel}: function ${name} の終端が見つかりません`);
}

function loadFn(file, name) {
const source = readFileSync(join(root, file), "utf8");
const code = extractFunction(source, name, file);
return new Function(`${code}\nreturn ${name};`)();
}

const jstDays = loadFn("functions/api/stats.js", "jstDays");
const utcDays = loadFn("functions/api/stats.js", "utcDays");
const jstToday = loadFn("functions/api/track.js", "jstToday");

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

if (failures > 0) {
console.log(`\n結果: ${failures} 件の確認が失敗しました`);
process.exit(1);
}
console.log("\n結果: 全ケース合格（日付境界の確認手順はこのスクリプトで固定化されています）");
