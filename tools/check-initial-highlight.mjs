// 初期ハイライトの保留・取り消しの確認スクリプト（BAR NOVEL ドリンク目次）
//
// 一覧を開いた直後の初期ハイライトは、自動スクロールが止まってから
// 先頭のチップを点ける仕組みになっている（scrollend 対応ブラウザでは scrollend が主経路、
// 未対応ブラウザでは SCROLL_SETTLED_DELAY のデバウンス＋scroll リスナーがフォールバック。
// 対応ブラウザでもスクロールが無い場合はデバウンスが保険）。
// その保留中に目次チップをタップした場合は、保留を取り消して
// タップ先のハイライトを維持しなければならない。
//
// この競合はリスナー登録順とタイマー発火順に依存する性質で、
// 2026-11-18 の改修ではコード通読でしか検出できなかった。
// また同日には、スクロール完了待ちの仕組み自体が別の push で
// 60ms固定待ちへ巻き戻る退行も起きた。
// 同種の退行を次回改修時に機械的に検出できるよう、このスクリプトを残す
// （2026-11-19、改善提案台帳の採用を受けて追加）。
// IntersectionObserver の判定側を対象とするスパイ用テストとは別に、
// 本スクリプトはタイマー／リスナーのライフサイクル側を対象とする。
//
// 再実行するタイミング:
// - script.js の初期ハイライト（highlightOnOpen / pendingInitial）や
//   目次チップの click ハンドラを触ったとき
// - 「スクロールが止まったら実行する」処理のデバウンスや
//   scroll リスナーの登録・解除を触ったとき
//
// 実行方法:
//   node tools/check-initial-highlight.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。
//
// 方式:
// テスト用の複製ロジックは持たない。script.js のソースから
// 共通ヘルパー onScrollSettled（スクロールが止まったら実行する仕組み）と
// 初期ハイライト専用の onScrollEndOrSettled（scrollend 主経路＋デバウンスの
// フォールバック／保険で、初期ハイライトの保留はこの関数の取り消し関数が
// 受け口になる）と highlightOnOpen の定義、toggle ハンドラ・
// チップ click ハンドラの登録コードそのものを取り出して、スタブ環境で実行する。
// スタブ環境は、フェイクタイマー（手動時計）と、登録順どおりに
// リスナーを呼ぶフェイク window（scroll）だけを用意し、
// setCurrent の呼び出し列でハイライトの遷移を判定する。
// scheduleHoldRelease（チップ固定の解除）は本スクリプトの対象外のため、
// 着地したケース（ハイライトを書き換えずフォーカス移動のみ）として
// 記録だけするスタブに置く。対象はあくまで初期ハイライトの
// 保留・取り消し・完了のライフサイクルである。
// 実装側の関数名や所在が変わると取り出しに失敗してエラーになる。
// その場合は実装の変更に合わせて、このスクリプトの対象定義も更新すること。
//
// 確認ケース:
// 1. 開く→タップなし→スクロールなし: 保険タイマーで先頭が点く
// 2. 開く→スクロール継続: 止まるまで先頭は点かず、止まってから点く
// 3. 開く→保留中にチップタップ: タップ先が維持され、先頭で上書きされない
// 4. 開く→保留中にタップ→その後もスクロール: 初期ハイライトは復活しない
// 5. 開き直し: 前回の保留は取り消され、最新の保留だけが発火する
// 6. 保留中に閉じる: 完了処理は後片付けだけ行い、先頭は点けない
// 7. 閉じたまま保険タイマーが発火した後に開き直す（ケース5の派生）:
//    閉じる toggle では保留は取り消されず、閉じたまま発火して自己解消する。
//    その後の開き直しでは取り消すべき保留が無い（pendingInitial は null）
//    分岐を通り、新しい保留だけが発火して先頭が1回だけ点く
// あわせて構造ガードとして、60ms固定待ちへの巻き戻しと、
// チップ側の取り消し呼び出しの順序（setCurrent より前）も確認する。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "script.js"), "utf8");

// --- ソースからの取り出し（括弧の対応で終端を決める） ---

function extractFrom(sourceText, marker, label) {
  const start = sourceText.indexOf(marker);
  if (start < 0) {
    throw new Error(`script.js: ${label} が見つかりません（実装が変わった場合はこのスクリプトも更新してください）: ${marker}`);
  }
  const braceStart = sourceText.indexOf("{", start);
  if (braceStart < 0) throw new Error(`script.js: ${label} の開始括弧が見つかりません`);
  let depth = 0;
  for (let i = braceStart; i < sourceText.length; i++) {
    if (sourceText[i] === "{") depth++;
    else if (sourceText[i] === "}") {
      depth--;
      if (depth === 0) {
        // 本体の閉じ括弧の直後にある ");" や ";" まで含めて1文として返す
        let end = i + 1;
        if (sourceText.slice(end, end + 2) === ");") end += 2;
        else if (sourceText[end] === ";") end += 1;
        return sourceText.slice(start, end);
      }
    }
  }
  throw new Error(`script.js: ${label} の終端が見つかりません`);
}

const settledDelayMarker = "const SCROLL_SETTLED_DELAY = 250;";
const settledDelayStart = source.indexOf(settledDelayMarker);
if (settledDelayStart < 0) {
  throw new Error(`script.js: SCROLL_SETTLED_DELAY が見つかりません（実装が変わった場合はこのスクリプトも更新してください）: ${settledDelayMarker}`);
}
const settledDelayCode = source.slice(settledDelayStart, settledDelayStart + settledDelayMarker.length);
const settledCode = extractFrom(source, "const onScrollSettled = (callback, delay = SCROLL_SETTLED_DELAY) => {", "onScrollSettled");
const scrollEndCode = extractFrom(source, "const onScrollEndOrSettled = (callback) => {", "onScrollEndOrSettled");
const highlightCode = extractFrom(source, "const highlightOnOpen = () => {", "highlightOnOpen");
const toggleCode = extractFrom(source, 'detailEl.addEventListener("toggle", () => {', "初期ハイライトの toggle ハンドラ");
const chipCode = extractFrom(source, 'b.addEventListener("click", () => {\n        if (!catEls[gi]) return;', "目次チップの click ハンドラ");

// --- スタブ環境 ---

function makeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let earliest = null;
        for (const [id, t] of timers) {
          if (t.at <= target && (!earliest || t.at < earliest.t.at || (t.at === earliest.t.at && id < earliest.id))) {
            earliest = { id, t };
          }
        }
        if (!earliest) break;
        now = earliest.t.at;
        timers.delete(earliest.id);
        earliest.t.fn();
      }
      now = target;
    },
    pendingCount() {
      return timers.size;
    },
  };
}

function makeWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatch(type) {
      // 登録順に呼ぶ（登録順への依存こそが今回の競合の本質）
      [...(listeners.get(type) || [])].forEach((fn) => fn());
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

function makeHarness(tappedGi = 2, { scrollEndSupported = false } = {}) {
  const clock = makeClock();
  const win = makeWindow();
  // scrollend 対応ブラウザの再現: "onscrollend" in window が true になるよう、
  // プロパティだけを用意する（実際の発火は dispatch("scrollend") で行う）
  if (scrollEndSupported) win.onscrollend = null;
  const detailEl = {
    open: false,
    handlers: {},
    addEventListener(type, fn) {
      this.handlers[type] = fn;
    },
    fireToggle() {
      if (this.handlers.toggle) this.handlers.toggle();
    },
  };
  const b = {
    handlers: {},
    addEventListener(type, fn) {
      this.handlers[type] = fn;
    },
    click() {
      if (this.handlers.click) this.handlers.click();
    },
  };
  const scrolls = [];
  const catEls = [0, 1, 2, 3].map((i) => ({
    scrollIntoView(opts) {
      scrolls.push({ i, opts });
    },
  }));
  const body = `
    let pendingInitial = null;
    let holdGi = null;
    const calls = { current: null, history: [], holdRelease: 0 };
    const setCurrent = (v) => { calls.current = v; calls.history.push(v); };
    const scheduleHoldRelease = () => { calls.holdRelease++; };
    ${settledDelayCode}
    ${settledCode}
    ${scrollEndCode}
    ${highlightCode}
    ${toggleCode}
    ${chipCode}
    return {
      calls,
      getPending: () => pendingInitial,
      getHold: () => holdGi,
    };
  `;
  const factory = new Function(
    "detailEl",
    "b",
    "window",
    "setTimeout",
    "clearTimeout",
    "catEls",
    "gi",
    "prefersReducedMotion",
    body
  );
  const api = factory(
    detailEl,
    b,
    win,
    clock.setTimeout,
    clock.clearTimeout,
    catEls,
    tappedGi,
    () => true // reduced-motion: scrollIntoView は auto になるだけで流れは同じ
  );
  return { clock, win, detailEl, b, catEls, scrolls, api };
}

// --- 判定 ---

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

// --- ケース ---

runCase("1. 開く→タップなし→スクロールなし（保険タイマーで先頭）", () => {
  const h = makeHarness();
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  check("1", "保留が登録される", typeof h.api.getPending(), "function");
  check("1", "scroll リスナーが登録される", h.win.listenerCount("scroll"), 1);
  h.clock.advance(249);
  check("1", "250ms未満ではまだ点かない", h.api.calls.history, []);
  h.clock.advance(1);
  check("1", "250msで先頭が点く", h.api.calls.history, [0]);
  check("1", "完了後は保留が消える", h.api.getPending(), null);
  check("1", "完了後は scroll リスナーが残らない", h.win.listenerCount("scroll"), 0);
  check("1", "タイマーが残らない", h.clock.pendingCount(), 0);
});

runCase("2. 開く→スクロール継続（止まってから先頭）", () => {
  const h = makeHarness();
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  h.clock.advance(100);
  h.win.dispatch("scroll");
  h.clock.advance(100);
  h.win.dispatch("scroll");
  h.clock.advance(249);
  check("2", "最後のスクロールから250ms未満では点かない", h.api.calls.history, []);
  h.clock.advance(1);
  check("2", "スクロールが止まって250msで先頭が点く", h.api.calls.history, [0]);
  check("2", "後片付けが済んでいる", h.win.listenerCount("scroll"), 0);
});

runCase("3. 開く→保留中にチップタップ（タップ先が維持される）", () => {
  const h = makeHarness(2);
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  h.clock.advance(100);
  h.b.click();
  // 取り消し関数は冪等で、保留変数に残っていても二度目以降は何もしない。
  // ここでは「取り消しの実効」として、リスナーとタイマーが消えることを見る
  check("3", "タップで初期ハイライトの scroll リスナーが外れる", h.win.listenerCount("scroll"), 0);
  check("3", "タップで初期ハイライトのタイマーが消える", h.clock.pendingCount(), 0);
  check("3", "タップ先が点く", h.api.calls.history, [2]);
  check("3", "タップ先へスクロールする", h.scrolls.map((s) => s.i), [2]);
  h.clock.advance(1000);
  check("3", "時間が経っても先頭で上書きされない", h.api.calls.history, [2]);
  check("3", "現在地はタップ先のまま", h.api.calls.current, 2);
});

runCase("4. 開く→保留中にタップ→その後もスクロール（復活しない）", () => {
  const h = makeHarness(3);
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  h.clock.advance(50);
  h.b.click();
  // タップ由来の smooth スクロールで scroll イベントが続く状況を再現
  h.win.dispatch("scroll");
  h.clock.advance(100);
  h.win.dispatch("scroll");
  h.clock.advance(1000);
  check("4", "スクロールが続いても初期ハイライトは復活しない", h.api.calls.history, [3]);
  check("4", "タイマーが残らない", h.clock.pendingCount(), 0);
});

runCase("5. 開き直し（前回の保留は取り消され、最新だけが発火）", () => {
  const h = makeHarness();
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  h.clock.advance(100);
  h.detailEl.fireToggle();
  check("5", "保留は常に1つ（リスナーも1つ）", h.win.listenerCount("scroll"), 1);
  h.clock.advance(1000);
  check("5", "先頭が点くのは1回だけ", h.api.calls.history, [0]);
});

runCase("6. 保留中に閉じる（後片付けのみ、先頭は点けない）", () => {
  const h = makeHarness();
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  h.detailEl.open = false;
  h.clock.advance(1000);
  check("6", "閉じている間は先頭を点けない", h.api.calls.history, []);
  check("6", "保留は自己解消する", h.api.getPending(), null);
  check("6", "scroll リスナーが残らない", h.win.listenerCount("scroll"), 0);
});

runCase("7. 閉じたまま保険タイマーが発火した後に開き直す（ケース5の派生）", () => {
  const h = makeHarness();
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  check("7", "開いた直後は保留が登録される", typeof h.api.getPending(), "function");
  // 閉じる toggle は open=false で発火し、ハンドラは早期 return で保留を取り消さない
  h.detailEl.open = false;
  h.detailEl.fireToggle();
  check("7", "閉じた直後は保留がまだ残る（閉じる toggle では取り消されない）", typeof h.api.getPending(), "function");
  check("7", "閉じた直後は scroll リスナーがまだ残る", h.win.listenerCount("scroll"), 1);
  // 閉じたまま保険タイマーが発火する（highlightOnOpen の open チェックで無効化され、保留は自己解消する）
  h.clock.advance(1000);
  check("7", "閉じたまま発火しても先頭は点かない", h.api.calls.history, []);
  check("7", "発火後は保留が自己解消する", h.api.getPending(), null);
  check("7", "発火後は scroll リスナーが残らない", h.win.listenerCount("scroll"), 0);
  check("7", "発火後はタイマーが残らない", h.clock.pendingCount(), 0);
  // 開き直す: pendingInitial は既に null なので、取り消しが不要な分岐を通って新しい保留だけが作られる
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  check("7", "開き直しで新しい保留が登録される", typeof h.api.getPending(), "function");
  check("7", "開き直し後の scroll リスナーは1つだけ", h.win.listenerCount("scroll"), 1);
  h.clock.advance(249);
  check("7", "開き直し後250ms未満ではまだ点かない", h.api.calls.history, []);
  h.clock.advance(1);
  check("7", "開き直し後は先頭が1回だけ点く", h.api.calls.history, [0]);
  check("7", "完了後は保留が消える", h.api.getPending(), null);
  check("7", "完了後は scroll リスナーが残らない", h.win.listenerCount("scroll"), 0);
});


runCase("8. scrollend対応→停止で scrollend が発火（SCROLL_SETTLED_DELAY を待たず先頭、二重発火なし）", () => {
  const h = makeHarness(2, { scrollEndSupported: true });
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  check("8", "scrollend リスナーが登録される", h.win.listenerCount("scrollend"), 1);
  check("8", "保険のデバウンス側 scroll リスナーも登録される", h.win.listenerCount("scroll"), 1);
  h.clock.advance(100);
  h.win.dispatch("scroll");
  h.clock.advance(50);
  check("8", "scrollend 前はまだ点かない", h.api.calls.history, []);
  h.win.dispatch("scrollend");
  check("8", "scrollend で即時に先頭が点く（SCROLL_SETTLED_DELAY 未満）", h.api.calls.history, [0]);
  check("8", "完了後は保留が消える", h.api.getPending(), null);
  check("8", "scrollend リスナーが残らない", h.win.listenerCount("scrollend"), 0);
  check("8", "scroll リスナーが残らない", h.win.listenerCount("scroll"), 0);
  check("8", "タイマーが残らない", h.clock.pendingCount(), 0);
  h.clock.advance(1000);
  h.win.dispatch("scrollend");
  check("8", "時間が経っても二重発火しない", h.api.calls.history, [0]);
});

runCase("9. scrollend対応→保留中にチップタップ（scrollend ごと取り消し）", () => {
  const h = makeHarness(2, { scrollEndSupported: true });
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  h.clock.advance(100);
  h.b.click();
  check("9", "タップで scrollend リスナーが外れる", h.win.listenerCount("scrollend"), 0);
  check("9", "タップで scroll リスナーが外れる", h.win.listenerCount("scroll"), 0);
  check("9", "タップでタイマーが消える", h.clock.pendingCount(), 0);
  check("9", "タップ先が点く", h.api.calls.history, [2]);
  h.win.dispatch("scrollend");
  h.clock.advance(1000);
  check("9", "scrollend が来ても先頭で上書きされない", h.api.calls.history, [2]);
  check("9", "現在地はタップ先のまま", h.api.calls.current, 2);
});

runCase("10. scrollend対応→スクロールなし（保険のデバウンスで先頭）", () => {
  const h = makeHarness(2, { scrollEndSupported: true });
  h.detailEl.open = true;
  h.detailEl.fireToggle();
  h.clock.advance(249);
  check("10", "SCROLL_SETTLED_DELAY 未満ではまだ点かない", h.api.calls.history, []);
  h.clock.advance(1);
  check("10", "scrollend が無くても SCROLL_SETTLED_DELAY で先頭が点く", h.api.calls.history, [0]);
  check("10", "scrollend リスナーが残らない", h.win.listenerCount("scrollend"), 0);
  check("10", "タイマーが残らない", h.clock.pendingCount(), 0);
});

// --- 構造ガード（巻き戻し・順序の退行検出） ---

runCase("構造: 60ms固定待ちへ巻き戻っていない", () => {
  check("構造", "setTimeout(highlightOnOpen, 60) が無い", source.includes("setTimeout(highlightOnOpen, 60)"), false);
  check("構造", "onScrollSettled のデフォルト遅延は名前付き定数 SCROLL_SETTLED_DELAY", settledCode.includes("delay = SCROLL_SETTLED_DELAY"), true);
  check("構造", "SCROLL_SETTLED_DELAY は250ms", source.includes("const SCROLL_SETTLED_DELAY = 250;"), true);
  check("構造", "ヘルパーのタイマーは登録時＋先送りで2か所", settledCode.split("setTimeout(finish, delay)").length - 1, 2);
  check("構造", "toggle 側は保留を onScrollEndOrSettled で作る", toggleCode.includes("pendingInitial = onScrollEndOrSettled("), true);
  check("構造", "onScrollEndOrSettled は scrollend 対応を判定する", scrollEndCode.includes('"onscrollend" in window'), true);
  check("構造", "onScrollEndOrSettled は未対応時に onScrollSettled へフォールバックする", scrollEndCode.includes("return onScrollSettled(callback)"), true);
  check("構造", "onScrollEndOrSettled は保険のデバウンスを並走させる", scrollEndCode.includes("cancelDebounce = onScrollSettled(finish)"), true);
  check("構造", "onScrollEndOrSettled は scrollend リスナーを登録する", scrollEndCode.includes('addEventListener("scrollend", finish)'), true);
});

runCase("構造: チップ側の取り消しは setCurrent より前に呼ばれる", () => {
  const cancelIdx = chipCode.indexOf("if (pendingInitial) pendingInitial();");
  const setIdx = chipCode.indexOf("setCurrent(gi)");
  check("構造", "チップ click に取り消し呼び出しがある", cancelIdx >= 0, true);
  check("構造", "取り消しが setCurrent(gi) より前にある", cancelIdx >= 0 && setIdx >= 0 && cancelIdx < setIdx, true);
  const toggleCancelIdx = toggleCode.indexOf("if (pendingInitial) pendingInitial();");
  check("構造", "toggle 側にも前回保留の取り消しがある", toggleCancelIdx >= 0, true);
});

if (failures > 0) {
  console.log(`\n結果: ${failures} 件の確認が失敗しました`);
  process.exit(1);
}
console.log("\n結果: 全ケース合格（初期ハイライトの保留・取り消しの流れはこのスクリプトで固定化されています）");
