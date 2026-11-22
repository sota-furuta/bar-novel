// FORBIDDEN 検知そのものの自己テスト（BAR NOVEL ホームページ）
//
// check-critical-lines.mjs の FORBIDDEN のうち、_date.js の内部 export
// 検知（5件）は、名前を引数に取る生成式 internalExportPattern に寄せて
// ある。生成式を将来壊すと5件すべてが静かに検知しなくなり、クリーンな
// ツリーでは check-critical-lines 自体は全 PASS のまま気づけない。
// このスクリプトは、生成式化のレビューで行った変異テスト相当を固定化し、
// 「検知できるはずの形を実際に検知できること」と「正当な形を誤検知
// しないこと」を機械的に確認するもの
// （2026-11-22、改善提案台帳の採用を受けて追加）。
//
// 再実行するタイミング:
// - check-critical-lines.mjs の FORBIDDEN（特に生成式
//   internalExportPattern）や _date.js の公開／内部の境界を触ったとき
// - check-critical-lines.mjs へ push する前（自己テストが落ちる場合は
//   検知網が壊れている可能性があるため、先に原因を確認すること）
//
// 実行方法:
//   node tools/check-forbidden-detection.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。
//
// 方式:
// テスト用の複製ロジックは持たない。check-critical-lines.mjs のソース
// から、生成式 internalExportPattern の定義と FORBIDDEN 配列の定義
// そのものを取り出して評価し、実際に使われている検知定義に対して
// ケースを当てる。そのため、生成式や FORBIDDEN の定義が壊れると
// このスクリプトが落ちて気づける。定義の所在・形が変わると取り出しに
// 失敗してエラーになる。その場合は定義の変更に合わせて、この
// スクリプトの取り出し範囲も更新すること。
//
// 確認ケース:
// 1. 内部 export 検知が5件あること（件数自体の減少も退行として見る）
// 2. 各内部名について、宣言形（export function／export const 等）と
//    再 export 形（export { 名前 }）の両方を検知できること
// 3. 空白ゆれ（余分な空白・改行・export{...} の詰め形）も検知できること
// 4. 誤検知しないこと: 内部宣言だけの形、正規のラッパー
//    （export function jstDays の本体が内部名を呼ぶ形）、似た名前
//    （内部名＋接尾辞）の export、実際の _date.js の内容
// 5. script.js 側の FORBIDDEN 2件（60ms 固定待ちの正規表現と
//    「新しいタブで開く」の文字列）も、検知できる形／できない形を
//    それぞれ確認する
// 6. 実際の script.js／_date.js に対して FORBIDDEN 全件が発火しない
//    こと（クリーンなツリーの陰性対照）

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const criticalSource = readFileSync(
  join(root, "tools/check-critical-lines.mjs"),
  "utf8",
);

// 生成式の定義開始から FORBIDDEN 配列の終端までを取り出して評価する。
// FORBIDDEN の各要素は label／reason を含む通常のオブジェクトリテラルで、
// この範囲の外への参照は生成式だけのはずである。
const genStart = criticalSource.indexOf("const internalExportPattern");
if (genStart < 0) {
  throw new Error(
    "check-critical-lines.mjs: 生成式 internalExportPattern が見つかりません（定義が変わった場合はこのスクリプトも更新してください）",
  );
}
const forbiddenStart = criticalSource.indexOf("const FORBIDDEN = [", genStart);
if (forbiddenStart < 0) {
  throw new Error(
    "check-critical-lines.mjs: FORBIDDEN 配列が見つかりません（定義が変わった場合はこのスクリプトも更新してください）",
  );
}
const forbiddenEnd = criticalSource.indexOf("\n];", forbiddenStart);
if (forbiddenEnd < 0) {
  throw new Error("check-critical-lines.mjs: FORBIDDEN 配列の終端が見つかりません");
}
const defsCode = criticalSource.slice(genStart, forbiddenEnd + 3);
const FORBIDDEN = new Function(`${defsCode}\nreturn FORBIDDEN;`)();

let failures = 0;
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`PASS ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}: 期待 ${expected}、実際 ${actual}`);
  }
}

function detect(item, source) {
  return item.patternRegex
    ? item.patternRegex.test(source)
    : source.includes(item.pattern);
}

// --- 内部 export 検知（_date.js 対象で patternRegex のもの） ---
const internalItems = FORBIDDEN.filter(
  (item) => item.file === "functions/api/_date.js" && item.patternRegex,
);
check("内部 export 検知の件数（5件）", internalItems.length, 5);

const INTERNAL_NAMES = [
  "daysWithOffset",
  "todayWithOffset",
  "JST_OFFSET_MS",
  "DAY_MS",
  "formatUtcDate",
];

// 各検知項目が、どの内部名を担当するかは、正準形への反応で特定する。
// 担当が特定できない（壊れている）項目は、その時点で失敗として扱う。
for (const item of internalItems) {
  const matched = INTERNAL_NAMES.filter((name) =>
    item.patternRegex.test(`export function ${name}(`),
  );
  check(`「${item.label}」の担当名の特定`, matched.length, 1);
  if (matched.length !== 1) continue;
  const name = matched[0];

  // 検知できるはずの形（変異テスト相当）
  const positives = [
    [`export function ${name}(`, "宣言形（function）"],
    [`export const ${name} =`, "宣言形（const）"],
    [`export let ${name} =`, "宣言形（let）"],
    [`export var ${name} =`, "宣言形（var）"],
    [`export class ${name}`, "宣言形（class）"],
    [`export { ${name} };`, "再 export 形"],
    [`export { jstDays, ${name} };`, "再 export 形（他の名前と併記）"],
    [`export{${name}}`, "空白ゆれ（詰め形）"],
    [`export\n  function\n  ${name}(`, "空白ゆれ（改行）"],
  ];
  // async／生成関数の形は、関数として使う内部名でのみ確認する
  // （定数名では文法的に不自然な形になるため）
  if (["daysWithOffset", "todayWithOffset", "formatUtcDate"].includes(name)) {
    positives.push(
      [`export async function ${name}(`, "宣言形（async function）"],
      [`export function* ${name}(`, "宣言形（生成関数）"],
    );
  }
  for (const [src, kind] of positives) {
    check(`${name}: ${kind}を検知する`, item.patternRegex.test(src), true);
  }

  // 誤検知してはいけない形
  const negatives = [
    [`function ${name}(`, "内部宣言のみ（export なし）"],
    [`const ${name} = 1;`, "内部宣言のみ（const）"],
    [
      `export function jstDays(n) { return ${name}(n, 0); }`,
      "正規のラッパー（本体で内部名を呼ぶ形）",
    ],
    [`export function ${name}Extra(`, "似た名前の export（接尾辞つき）"],
  ];
  for (const [src, kind] of negatives) {
    check(`${name}: ${kind}を誤検知しない`, item.patternRegex.test(src), false);
  }
}

// 5名すべてに担当項目があること（名前の取りこぼし検出）
for (const name of INTERNAL_NAMES) {
  const has = internalItems.some((item) =>
    item.patternRegex.test(`export function ${name}(`),
  );
  check(`内部名 ${name} の検知項目が存在する`, has, true);
}

// --- script.js 側の FORBIDDEN ---
const timeoutItem = FORBIDDEN.find(
  (item) => item.file === "script.js" && item.patternRegex,
);
if (!timeoutItem) {
  failures++;
  console.log("FAIL script.js 側の patternRegex 項目（60ms 固定待ち）が見つかりません");
} else {
  check(
    "60ms 固定待ち: 正準形を検知する",
    timeoutItem.patternRegex.test("setTimeout(highlightOnOpen, 60)"),
    true,
  );
  check(
    "60ms 固定待ち: 空白ゆれを検知する",
    timeoutItem.patternRegex.test("setTimeout( highlightOnOpen ,  60 )"),
    true,
  );
  check(
    "60ms 固定待ち: 別の待ち時間は誤検知しない",
    timeoutItem.patternRegex.test("setTimeout(highlightOnOpen, 250)"),
    false,
  );
}

const modalItem = FORBIDDEN.find(
  (item) => item.file === "script.js" && item.pattern === "新しいタブで開く",
);
if (!modalItem) {
  failures++;
  console.log("FAIL script.js 側の旧ボタン文言の項目が見つかりません");
} else {
  check(
    "旧ボタン文言: 含む文を検知する",
    detect(modalItem, "ボタン文言は「新しいタブで開く」"),
    true,
  );
  check(
    "旧ボタン文言: 現行文言は誤検知しない",
    detect(modalItem, "ボタン文言は「開く」"),
    false,
  );
}

// --- 陰性対照: 実際のファイルでは FORBIDDEN 全件が発火しない ---
for (const file of ["script.js", "functions/api/_date.js"]) {
  const source = readFileSync(join(root, file), "utf8");
  for (const item of FORBIDDEN.filter((i) => i.file === file)) {
    check(`陰性対照 ${file}: 「${item.label}」が発火しない`, detect(item, source), false);
  }
}

if (failures > 0) {
  console.log(
    `\n結果: ${failures} 件の失敗があります。FORBIDDEN の検知定義（生成式を含む）が壊れている可能性があるため、check-critical-lines.mjs の定義を確認してください`,
  );
  process.exit(1);
}
console.log("\n結果: 全ケース合格（FORBIDDEN の検知定義が変異形を検知し、正当な形を誤検知しません）");
