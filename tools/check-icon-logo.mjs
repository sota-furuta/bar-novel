// アイコンの片側更新検出（BAR NOVEL ホームページ）
//
// 検索結果のアイコンが旧ロゴのまま変わらなかった原因は、新ロゴ
// （デザインB）が icon-novel.png にだけ入り、icon-novel.svg が旧デザイン
// （地 #1a130c に銅色の「N」1文字）のまま残っていたことだった。ページは
// PNG と SVG の両方を icon として宣言しており、Google は SVG 側を
// 表示していたため、PNG の差し替えだけでは検索結果が変わらなかった
// （2026-11-26、ユーザー指摘で発覚し SVG も新ロゴへ差し替えた）。
// このスクリプトは icon-novel.svg に新ロゴの目印が残っているかを
// 機械的に確認し、片側だけの更新や巻き戻しを push 前に検知できる
// ようにするもの（2026-11-28、改善提案台帳の採用を受けて追加）。
//
// 再実行するタイミング:
// - icon-novel.svg／icon-novel.png などアイコンまわりを触ったとき
// - verification へ push する前
//
// 実行方法:
//   node tools/check-icon-logo.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "icon-novel.svg");

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`PASS ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}`);
  }
}

if (!existsSync(path)) {
  console.log("FAIL icon-novel.svg がありません");
  process.exit(1);
}
const svg = readFileSync(path, "utf8");

// 新ロゴ（デザインB）の目印: 地の色 #0c1210 と「NOVEL」の文字。
// 旧デザイン（地 #1a130c＋「N」1文字）へ戻ると両方とも消える。
check("icon-novel.svg に新ロゴの地の色 #0c1210 が含まれている", svg.includes("#0c1210"));
check("icon-novel.svg に新ロゴの「NOVEL」の文字が含まれている", svg.includes("NOVEL"));

if (failures > 0) {
  console.log(`\n結果: ${failures} 件の失敗があります。icon-novel.svg が旧ロゴへ巻き戻っていないか、PNG だけを差し替える片側更新になっていないかを確認してください`);
  process.exit(1);
}
console.log("\n結果: 全ケース合格（icon-novel.svg は新ロゴのままです）");
