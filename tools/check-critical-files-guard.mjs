// CRITICAL_FILES 件数・集合ガードそのものの自己テスト（BAR NOVEL ホームページ）
//
// check-critical-lines.mjs の件数・集合ガードは、クリーンなツリーでは
// 常に PASS になるため、ガードの判定ロジック自体が壊れても気づけない。
// 件数・集合ガード追加時（2026-11-26）には、作成者とレビュアーが別々に
// 手作業でコピーの変異テスト（追加／削除／改名／重複）を再実施した。
// このスクリプトはその変異ケースを固定化し、次の変更時にも同じ判定が
// 機械的に再確認できるようにするもの
// （2026-11-28、改善提案台帳の採用を受けて追加）。
//
// 再実行するタイミング:
// - check-critical-lines.mjs の件数・集合ガード
//   （evaluateCriticalFilesSet／CRITICAL_FILES）を触ったとき
// - tools/ へスクリプトを追加・削除・改名したとき
// - check-critical-lines.mjs へ push する前
//
// 実行方法:
//   node tools/check-critical-files-guard.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。
//
// 方式:
// テスト用の複製ロジックは持たない。check-critical-lines.mjs のソース
// から、純関数 evaluateCriticalFilesSet の定義と CRITICAL_FILES 配列の
// 定義そのものを取り出して評価し、実際に使われている判定に対して
// ケースを当てる。そのため、判定や一覧の定義が壊れるとこのスクリプト
// が落ちて気づける。定義の所在・形が変わると取り出しに失敗して
// エラーになる。その場合は定義の変更に合わせて、このスクリプトの
// 取り出し範囲も更新すること。
//
// 確認ケース:
// 1. 正常系: 実ファイル集合と CRITICAL_FILES が一致すれば ok
// 2. 追加: 一覧に無い実ファイルが増えると missing として検知する
// 3. 削除: 実ファイルが消えると extra として検知する
// 4. 改名: 旧名が extra、新名が missing として同時に検知する
// 5. 重複: CRITICAL_FILES に同じファイルが重複登録されると
//    duplicates として検知する（集合が一致していても ok にならない）
// 6. tools/ 以外の一覧項目は比較対象外であること（従来仕様の固定）
// 7. 陰性対照: 実際の tools/*.mjs と実際の CRITICAL_FILES が一致する

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const criticalSource = readFileSync(join(root, "tools/check-critical-lines.mjs"), "utf8");

// CRITICAL_FILES 配列の取り出し
const filesStart = criticalSource.indexOf("const CRITICAL_FILES = [");
if (filesStart < 0) throw new Error("check-critical-lines.mjs: CRITICAL_FILES 配列が見つかりません（定義が変わった場合はこのスクリプトも更新してください）");
const filesEnd = criticalSource.indexOf("\n];", filesStart);
if (filesEnd < 0) throw new Error("check-critical-lines.mjs: CRITICAL_FILES 配列の終端が見つかりません");
const CRITICAL_FILES = new Function(`${criticalSource.slice(filesStart, filesEnd + 3)}\nreturn CRITICAL_FILES;`)();

// 純関数 evaluateCriticalFilesSet の取り出し（定義末尾の "};" まで）
const fnStart = criticalSource.indexOf("const evaluateCriticalFilesSet");
if (fnStart < 0) throw new Error("check-critical-lines.mjs: evaluateCriticalFilesSet が見つかりません（定義が変わった場合はこのスクリプトも更新してください）");
const fnEnd = criticalSource.indexOf("\n};", fnStart);
if (fnEnd < 0) throw new Error("check-critical-lines.mjs: evaluateCriticalFilesSet の終端が見つかりません");
const evaluateCriticalFilesSet = new Function(`${criticalSource.slice(fnStart, fnEnd + 3)}\nreturn evaluateCriticalFilesSet;`)();

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`PASS ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}: 期待 ${e}、実際 ${a}`);
  }
}

const baseActual = ["tools/a.mjs", "tools/b.mjs", "tools/c.mjs"];
const baseListed = [...baseActual];

// 1. 正常系
{
  const r = evaluateCriticalFilesSet(baseActual, baseListed);
  check("正常系: 一致すれば ok", r.ok, true);
  check("正常系: missing は空", r.missing, []);
  check("正常系: extra は空", r.extra, []);
  check("正常系: duplicates は空", r.duplicates, []);
  check("正常系: 順序が違っても一致扱い", evaluateCriticalFilesSet([...baseActual].reverse(), [...baseListed].reverse()).ok, true);
}

// 2. 追加（一覧に無い実ファイルが増えた＝追加漏れ）
{
  const r = evaluateCriticalFilesSet([...baseActual, "tools/check-new.mjs"], baseListed);
  check("追加: ok にならない", r.ok, false);
  check("追加: 新ファイルが missing", r.missing, ["tools/check-new.mjs"]);
  check("追加: extra は空", r.extra, []);
}

// 3. 削除（実ファイルが消えた＝消し忘れ）
{
  const r = evaluateCriticalFilesSet(baseActual.slice(0, 2), baseListed);
  check("削除: ok にならない", r.ok, false);
  check("削除: 消えたファイルが extra", r.extra, ["tools/c.mjs"]);
  check("削除: missing は空", r.missing, []);
}

// 4. 改名（旧名 extra ＋ 新名 missing の同時検知）
{
  const renamed = ["tools/a.mjs", "tools/b.mjs", "tools/c-renamed.mjs"];
  const r = evaluateCriticalFilesSet(renamed, baseListed);
  check("改名: ok にならない", r.ok, false);
  check("改名: 新名が missing", r.missing, ["tools/c-renamed.mjs"]);
  check("改名: 旧名が extra", r.extra, ["tools/c.mjs"]);
}

// 5. 重複（CRITICAL_FILES への重複登録）
{
  const r = evaluateCriticalFilesSet(baseActual, [...baseListed, "tools/b.mjs"]);
  check("重複: ok にならない", r.ok, false);
  check("重複: 重複ファイルが duplicates", r.duplicates, ["tools/b.mjs"]);
  check("重複: missing は空", r.missing, []);
  check("重複: extra は空", r.extra, []);
}

// 6. tools/ 以外の一覧項目は比較対象外
{
  const r = evaluateCriticalFilesSet(baseActual, [...baseListed, "README.md"]);
  check("対象外: tools/ 以外の一覧項目があっても ok", r.ok, true);
  check("対象外: listed から除外される", r.listed, baseListed);
}

// 7. 陰性対照: 実際のツリー
{
  const toolsDir = join(root, "tools");
  const actual = existsSync(toolsDir)
    ? readdirSync(toolsDir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".mjs")).map((e) => `tools/${e.name}`)
    : [];
  const listedFiles = CRITICAL_FILES.map((item) => item.file);
  check("陰性対照: CRITICAL_FILES にこの自己テスト自身が含まれる", listedFiles.includes("tools/check-critical-files-guard.mjs"), true);
  const r = evaluateCriticalFilesSet(actual, listedFiles);
  check(`陰性対照: 実際の tools/*.mjs（${actual.length} 件）と CRITICAL_FILES が一致`, r.ok, true);
  check("陰性対照: missing は空", r.missing, []);
  check("陰性対照: extra は空", r.extra, []);
  check("陰性対照: duplicates は空", r.duplicates, []);
}

if (failures > 0) {
  console.log(`\n結果: ${failures} 件の失敗があります。件数・集合ガードの判定（evaluateCriticalFilesSet／CRITICAL_FILES）が壊れている可能性があるため、check-critical-lines.mjs の定義を確認してください`);
  process.exit(1);
}
console.log("\n結果: 全ケース合格（CRITICAL_FILES 件数・集合ガードが追加／削除／改名／重複を検知し、正常系を誤検知しません）");
