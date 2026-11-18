// 日付生成の共通ヘルパー（stats.js / track.js から import する。ファイル名の
// 先頭が "_" のため、Cloudflare Pages Functions のルーティング対象にはならない）。
//
// 以前は stats.js の jstDays／utcDays と track.js の jstToday が、
// 「オフセットを足す → 86400秒刻みで遡る → UTC getter で YYYY-MM-DD に整形する」
// という同じ生成ロジックを別々に持っていた。日付境界は不具合の温床なので、
// 生成ロジックはこの1か所に寄せる（2026-11-19、改善提案台帳の採用を受けて共通化）。
// 境界ケースの確認は tools/check-date-boundaries.mjs でモック時刻により固定確認できる。
const DAY_MS = 86400 * 1000;
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// Date を UTC getter で YYYY-MM-DD に整形する。
function formatUtcDate(t) {
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${m}-${d}`;
}

// オフセット（ミリ秒）を加えた「今日」から n 日分を、古い順に返す。
// 基準時刻は1回だけ取る（日付の途中で現在時刻が進んでも、並びが崩れないように）。
export function daysWithOffset(n, offsetMs) {
  const days = [];
  const base = Date.now() + offsetMs;
  for (let i = n - 1; i >= 0; i--) {
    days.push(formatUtcDate(new Date(base - i * DAY_MS)));
  }
  return days;
}

// オフセット（ミリ秒）を加えた「今日」を YYYY-MM-DD で返す。
export function todayWithOffset(offsetMs) {
  return formatUtcDate(new Date(Date.now() + offsetMs));
}

// JST（UTC+9）の直近 n 日。
export function jstDays(n) {
  return daysWithOffset(n, JST_OFFSET_MS);
}

// UTC の直近 n 日。
export function utcDays(n) {
  return daysWithOffset(n, 0);
}

// JST の今日。
export function jstToday() {
  return todayWithOffset(JST_OFFSET_MS);
}
