// byId ガードの感度確認（変異テスト）スクリプト
//
// tools/check-header-spy.mjs の構造ガード「byId 方式へ戻っていない」は、
// script.js のヘッダースパイ IIFE 内に byId マップらしいコードが再導入された
// ときだけ落ち、コメント中の "byId 方式" といった文字列だけでは落ちない
// ことが肝になっている。この感度は id 139 のレビューで手作業の変異テスト
// （IIFE 内へ注入して実行し直す）で確認したが、ガードのパターン
// （byIdCodePattern）を触るたびに同じ手作業を再現することになるため、
// その変異テスト自体をこのスクリプトに固定する
// （2026-11-22、改善提案台帳の採用を受けて追加）。
//
// 「コメントだけでは落ちない」が成り立つのは、素の言及（"byId 方式" のような
// 文字列）だけである。コメント内でも「// const byId = {}」のようなコードらしい
// 表記は検出対象になる（2026-11-26、改善提案台帳の採用を受けて明記）。
//
// 再実行するタイミング:
// - tools/check-header-spy.mjs の byIdCodePattern や、ガードの対象範囲
//   （spyIife の取り出し方）を触ったとき
// - script.js のヘッダースパイ IIFE の入口（const links の行）を触ったとき
//   ※ 注入位置は const links の行を目印にしているため、その行の書き方が
//   変わるとこのスクリプトは目印が見つからずエラーになる。その場合は
//   実装の変更に合わせて目印も更新すること。
//
// 実行方法:
//   node tools/check-byid-guard-sensitivity.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。
//
// 方式:
// リポジトリは書き換えない。script.js／index.html／tools/check-header-spy.mjs
// を一時フォルダへ複製し、複製側の script.js のヘッダースパイ IIFE 内
// （const links の行の直前）へ変異を注入して、複製側の check-header-spy.mjs
// を子プロセスで実行する。
// - 検出すべき変異: 終了コードが 0 でなく、出力にガードの NG 行
//   （「NG byId 方式へ戻っていない」）が含まれること。終了コードだけで
//   判定すると、注入したコードの実行時エラー等、ガード以外の理由で
//   落ちた場合も「検出できた」と誤読するため、NG 行まで確認する。
//   注入するコードは、実行されても無害な形（宣言と参照だけ）にしてある。
// - 検出してはいけない変異（コメントのみ）: 全ケース合格（終了コード 0）
//   であること。
// - 変異なし（ベースライン）: 全ケース合格であること。ベースラインが
//   落ちている状態では感度の判定ができないため、これもケースに含める。

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptJs = readFileSync(join(root, "script.js"), "utf8");

// 注入位置の目印: ヘッダースパイ IIFE の最初の行。この行の直前は IIFE の
// 内側なので、ここへ注入したコードはガードの検査対象（spyIife）に含まれる。
// 取り出し範囲（spyIife）が先頭側から狭まる変更を検出するため、
// IIFE 先頭（"(function () {" の直後）へ注入するケースもあり、その場合は
// runHeaderSpyWithMutation の insertIndex で注入位置を指定する
// （2026-11-26、改善提案台帳の採用を受けて追加）。
const ANCHOR = "  const links = document.querySelectorAll('.header-nav a[href^=\"#\"], .hamburger-menu a[href^=\"#\"], .footer-nav a[href^=\"#\"]');";
if (!scriptJs.includes(ANCHOR)) {
  console.log("NG 注入位置の目印（const links の行）が script.js に見つかりません。実装の変更に合わせてこのスクリプトの目印も更新してください。");
  process.exit(1);
}

const GUARD_NG_LABEL = "NG byId 方式へ戻っていない";

// IIFE 先頭の位置（"(function () {" の直後）。const links の行より前で、
// 取り出し範囲が先頭側から狭まるとここへ注入したコードは検査対象から外れる。
const SPY_IIFE_OPEN = "(function () {";
const spyIifeStart = scriptJs.lastIndexOf(SPY_IIFE_OPEN, scriptJs.indexOf(ANCHOR));
const IIFE_HEAD_INDEX = spyIifeStart + SPY_IIFE_OPEN.length;

// 各スニペットは、パターンの分岐（宣言／参照・代入）のうち1つだけに
// ヒットする形にする。複数分岐に同時にヒットする形だと、分岐が1つ
// 欠ける弱体化（例: 宣言分岐だけへの削減）を検出できずにすり抜けるため
// （2026-11-22、別担当レビューの指摘を受けて分離）。
// 参照・代入は呼ばれないアロー関数の中に置くことで、宣言分岐に
// ヒットさせず、実行されても無害にしている。
const DETECT_CASES = [
  ["let byId の宣言のみ", "  let byId;"],
  ["let byIdMap の宣言のみ", "  let byIdMap;"],
  // const は初期化なし宣言が書けないため、宣言分岐だけに当たるよう
  // 「= {}」との間へコメントを挟んで代入分岐に当たらない形にする
  // （2026-11-26、改善提案台帳の採用を受けて追加）。
  ["const byId の宣言のみ", "  const byId /* 宣言だけに当てる */ = {};"],
  ["const byIdMap の宣言のみ", "  const byIdMap /* 宣言だけに当てる */ = {};"],
  ["var byId の宣言のみ", "  var byId /* 宣言だけに当てる */ = {};"],
  ["var byIdMap の宣言のみ", "  var byIdMap /* 宣言だけに当てる */ = {};"],
  ["byId[ ] での参照のみ", "  const _probeBracket = () => byId[\"top\"];"],
  ["byId. での参照のみ", "  const _probeDot = () => byId.top;"],
  ["byId への代入のみ", "  const _probeAssign = () => { byId = {}; };"],
  ["byIdMap[ ] での参照のみ", "  const _probeMapBracket = () => byIdMap[\"top\"];"],
  ["byIdMap. での参照のみ", "  const _probeMapDot = () => byIdMap.top;"],
  ["byIdMap への代入のみ", "  const _probeMapAssign = () => { byIdMap = {}; };"],
  // 取り出し範囲が先頭側から狭まる変更を検出するケース。IIFE 先頭へ注入し、
  // insertIndex で注入位置を指定する（2026-11-26、改善提案台帳の採用を受けて追加）。
  ["範囲. IIFE 先頭の byId 参照のみ", "  const _probeRange = () => byId.top;", IIFE_HEAD_INDEX],
];
const NO_DETECT_CASES = [
  ["コメント中の byId 方式", "  // byId 方式に戻さない"],
  ["コメント中の byIdMap 方式", "  // byIdMap 方式に戻さない"],
];

let failures = 0;
function check(caseName, label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`  NG ${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
  return ok;
}
function runCase(name, fn) {
  const before = failures;
  try {
    fn();
  } catch (e) {
    failures++;
    console.log(`  NG 例外: ${e && e.message ? e.message : e}`);
  }
  console.log(`${failures === before ? "PASS" : "FAIL"} ${name}`);
}

// 変異入りの複製を作り、その中での check-header-spy.mjs の実行結果を返す。
// insertIndex を指定した場合はその位置へ注入し、省略時は ANCHOR（const links の行）の直前に注入する。
function runHeaderSpyWithMutation(snippet, insertIndex = scriptJs.indexOf(ANCHOR)) {
  const dir = mkdtempSync(join(tmpdir(), "byid-guard-"));
  try {
    cpSync(join(root, "index.html"), join(dir, "index.html"));
    cpSync(join(root, "tools", "check-header-spy.mjs"), join(dir, "tools", "check-header-spy.mjs"), { recursive: true });
    const mutated = snippet == null ? scriptJs : scriptJs.slice(0, insertIndex) + `${snippet}\n` + scriptJs.slice(insertIndex);
    if (snippet != null && mutated === scriptJs) throw new Error("変異を注入できませんでした");
    writeFileSync(join(dir, "script.js"), mutated);
    const r = spawnSync(process.execPath, [join(dir, "tools", "check-header-spy.mjs")], { encoding: "utf8" });
    if (r.error) throw r.error;
    return { status: r.status, stdout: `${r.stdout || ""}${r.stderr || ""}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

runCase("0. ベースライン（変異なしでは全ケース合格する）", () => {
  const r = runHeaderSpyWithMutation(null);
  check("0", "終了コード", r.status, 0);
});

DETECT_CASES.forEach(([label, snippet, insertIndex], i) => {
  runCase(`${i + 1}. 検出する: ${label}`, () => {
    const r = runHeaderSpyWithMutation(snippet, insertIndex);
    check(`${i + 1}`, "終了コードが 0 でない", r.status !== 0, true);
    check(`${i + 1}`, "ガードの NG 行が出力される", r.stdout.includes(GUARD_NG_LABEL), true);
  });
});

NO_DETECT_CASES.forEach(([label, snippet], i) => {
  runCase(`${DETECT_CASES.length + i + 1}. 検出しない: ${label}`, () => {
    const r = runHeaderSpyWithMutation(snippet);
    check(`${DETECT_CASES.length + i + 1}`, "終了コード", r.status, 0);
  });
});

if (failures > 0) {
  console.log(`\n結果: ${failures} 件の確認が失敗しました（byId ガードの感度が変わっている可能性があります。check-header-spy.mjs の byIdCodePattern を確認してください）`);
  process.exit(1);
}
console.log("\n結果: 全ケース合格（byId ガードは、コードらしい再導入では落ち、コメントだけでは落ちません）");
