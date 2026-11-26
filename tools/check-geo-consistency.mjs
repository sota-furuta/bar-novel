// 座標の突合チェック: JSON-LD の geo と地図埋め込み iframe の ll が一致するかを確認する。
//
// 使い方:
//   node tools/check-geo-consistency.mjs [index.html へのパス]
//   引数を省略した場合はリポジトリ直下の index.html を見る。
// 一致すれば exit 0、不一致なら JSON-LD 側の値と iframe 側の値を両方出して exit 1。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const target = process.argv[2] ?? "index.html";
const html = readFileSync(resolve(target), "utf-8");

const ldMatch = html.match(/"latitude":\s*(-?[\d.]+),\s*"longitude":\s*(-?[\d.]+)/);
if (!ldMatch) {
  console.error("JSON-LD の geo (latitude / longitude) が見つかりません");
  process.exit(1);
}
const [, ldLat, ldLng] = ldMatch;

const iframeMatch = html.match(/<iframe[^>]*src="[^"]*[?&]ll=(-?[\d.]+),(-?[\d.]+)/);
if (!iframeMatch) {
  console.error("地図 iframe の ll パラメータが見つかりません");
  process.exit(1);
}
const [, mapLat, mapLng] = iframeMatch;

console.log(`JSON-LD geo: ${ldLat}, ${ldLng}`);
console.log(`地図 iframe ll: ${mapLat}, ${mapLng}`);

if (ldLat === mapLat && ldLng === mapLng) {
  console.log("一致しました");
  process.exit(0);
}

console.error(`不一致です: JSON-LD=${ldLat},${ldLng} / iframe ll=${mapLat},${mapLng}`);
process.exit(1);
