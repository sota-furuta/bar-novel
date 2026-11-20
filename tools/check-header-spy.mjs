// ヘッダースパイの確認スクリプト（BAR NOVEL ヘッダーナビ／ハンバーガーメニュー）
//
// ヘッダーナビとハンバーガーメニューは、同じ href（#menu 等）を持つリンクが
// 2つずつ存在する構成になっている。かつての byId 方式（href からリンクを
// 1つだけ引く方式）では、片方のナビにしか現在地（is-current／aria-current）が
// 付かないという、重複リンク特有の退行が起きうる。
// 目次チップ側にはスタブテスト（tools/check-initial-highlight.mjs 等）があるが、
// ヘッダー／ハンバーガー側には機械検証がなく、ナビが増えるたびに同じ見落としが
// 再発し得るため、このスクリプトで最低限のケースを固定する
// （2026-11-19、改善提案台帳の採用を受けて追加）。
//
// 再実行するタイミング:
// - script.js のヘッダースパイ（末尾の IIFE）や共通ヘルパー
//   createVisibleTracker を触ったとき
// - index.html のナビ（.header-nav／.hamburger-menu）にリンクを増減したとき
//   ※ ナビを意図的に変えた場合は、ハーネス定数 HEADER_HREFS／
//   HAMBURGER_HREFS も合わせて更新すること。このテストが落ちる
//   典型場面は正当なナビ増減時であり、定数を追随させるべき場面か
//   どうかをその場で判断できるようにするため
//   （2026-11-19、改善提案台帳の採用を受けて追加）。
// - index.html に新しいセクションを追加したとき（ナビへのリンク追加を
//   伴う場合を含む）
//   ※ リンクだけの変更とセクション新設とでは追随先が違う。リンクだけの
//   変更では HEADER_HREFS／HAMBURGER_HREFS の更新で足りるが、新しい
//   セクションを追加した場合は、それらに加えてハーネスの SECTION_IDS と、
//   構造ガードで固定しているセクション列リテラル（script.js のヘッダー
//   スパイ IIFE 内のセクション列と、その照合文字列）も、新セクションを
//   文書順の位置に加えて同期すること。セクション列がずれたままでは、
//   監視対象の文書順の確認が旧構成のままになってしまうため
//   （2026-11-19、改善提案台帳の採用を受けて追加）。
//
// 実行方法:
//   node tools/check-header-spy.mjs
// 全ケース合格なら終了コード 0、1件でも失敗したら 1 で終了する。
//
// 方式:
// テスト用の複製ロジックは持たない。script.js のソースから共通ヘルパー
// createVisibleTracker とヘッダースパイの IIFE そのものを取り出して、
// スタブ環境で実行する。スタブ環境は、リンク要素（classList／属性の記録）と
// セクション要素、コールバックを手動で発火できる IntersectionObserver だけを
// 用意し、発火後に各リンクの is-current と aria-current を判定する。
// 実装側の関数名や所在が変わると取り出しに失敗してエラーになる。
// その場合は実装の変更に合わせて、このスクリプトの対象定義も更新すること。
//
// 確認ケース:
// 1. menu が帯域内: 両ナビの #menu にだけ is-current と aria-current が付く
// 2. concept が帯域内: 同 href の重複リンク両方に付く（byId 方式の退行検出）
// 3. top が帯域内: ハンバーガーの #top だけが付き、ヘッダー側は外れる
//    （直前に付いていた #menu の現在地も両ナビから消える）
// 4. 複数セクションが帯域内: entries の届く順ではなく文書順で最後が選ばれる
// 5. 帯域が空: 現在地は据え置きになる（既存仕様の固定）
// 6. access が帯域内: 両ナビの #access に付く（末尾セクションでも外れない）
// あわせて構造ガードとして、両ナビを対象にするセレクタ（包含チェックでは
// なく完全一致で固定する。フッターナビ等への対象拡大＝現在地表示の意図しない
// 波及を機械検出するため。2026-11-19、改善提案台帳の採用を受けて変更）、
// sections への top の含有、byId 方式へ戻っていないこと、帯域定義
// （rootMargin の値と、IntersectionObserver の opts のキー集合）、
// index.html 側の前提（#top はハンバーガーにだけある）も確認する。
// opts はキー集合ごと固定する: rootMargin の値だけを見ていると、threshold 等の
// キーが追加されて帯域の挙動が静かに変わっても検出できない。キー集合ごと
// （現行は rootMargin のみ）固定し、キーの追加・削除のどちらも帯域定義の
// 巻き戻しとして同じガードで拾う
// （2026-11-19、改善提案台帳の採用を受けて追加）。
// さらに、index.html の両ナビの href 全集合（文書順の並びを含む）と
// ハーネス定数（HEADER_HREFS／HAMBURGER_HREFS）の突き合わせも行う
// （2026-11-19、改善提案台帳の採用を受けて追加）。ナビの増減こそが
// この退行の再発トリガーで、#top／#menu のみのサンプル確認では
// #faq 等の片ナビ欠落を取りこぼすため、全件を突き合わせる。
// 対象はスパイのセレクタ（a[href^="#"]）に合わせてフラグメント
// リンク（# で始まる href）だけとし、ハンバーガー内の外部リンク
// （Instagram 等）は突き合わせの対象外とする。
// href の抽出は引用符の違い（単一引用符）にも対応させる
// （2026-11-19、改善提案台帳の採用を受けて追加）。二重引用符前提だと、
// index.html 側の引用符が単一引用符に変わった場合に抽出が空になり、
// NG 表示が「#faq 等が欠落した」ように見えて原因の切り分けに手間が
// かかるため、二重／単一どちらの書き方でも同じ href 集合として扱う。
// 前提チェック（#top／#menu の有無）も文字列の直接照合ではなく
// この抽出結果で判定し、引用符の違いで同じ誤読が起きないようにする。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "script.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

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
      if (depth === 0) return sourceText.slice(start, i + 1);
    }
  }
  throw new Error(`script.js: ${label} の終端が見つかりません`);
}

const trackerCode = extractFrom(source, "const createVisibleTracker = (orderedEls) => {", "createVisibleTracker");
// 帯域定義の定数も定義そのものを取り出す（IIFE が参照するため、ハーネス側にも実物が要る）
const spyRootMarginMatch = source.match(/^const SPY_ROOT_MARGIN = .*;$/m);
if (!spyRootMarginMatch) throw new Error("script.js: SPY_ROOT_MARGIN の定義が見つかりません（実装が変わった場合はこのスクリプトも更新してください）");
const spyRootMarginCode = spyRootMarginMatch[0];
// ヘッダースパイは IIFE のため、「const links = ...」の直前にある IIFE 開始から取り出す
// （links の行が見つからなければ spyStart が -1 になり、下でエラーにする）
const spyStart = source.lastIndexOf("(function () {", source.indexOf("const links = document.querySelectorAll('.header-nav"));
if (spyStart < 0) throw new Error("script.js: ヘッダースパイの IIFE 開始が見つかりません");
const spyIife = extractFrom(source.slice(spyStart), "(function () {", "ヘッダースパイの IIFE 本体");

// --- スタブ環境 ---

// スパイ対象セレクタの期待値。script.js 側の対象がこの文字列から少しでも
// 変わったら（フッターナビ等の追加・順序や表記の変更を含む）失敗させるため、
// 包含チェックではなく完全一致で固定する。
const EXPECTED_SELECTOR = '.header-nav a[href^="#"], .hamburger-menu a[href^="#"]';
const SECTION_IDS = ["top", "concept", "menu", "gallery", "info", "faq", "access"];
const HEADER_HREFS = ["#concept", "#menu", "#gallery", "#info", "#faq", "#access"];
const HAMBURGER_HREFS = ["#top", ...HEADER_HREFS];

function makeLink(nav, href) {
  const classes = new Set();
  const attrs = new Map([["href", href]]);
  return {
    nav,
    classes,
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
}

function makeHarness() {
  const sections = SECTION_IDS.map((id) => ({ id }));
  const byIdMap = Object.fromEntries(sections.map((s) => [s.id, s]));
  const links = [
    ...HEADER_HREFS.map((h) => makeLink("header", h)),
    ...HAMBURGER_HREFS.map((h) => makeLink("hamburger", h)),
  ];
  const documentStub = {
    querySelectorAll(selector) {
      if (selector === EXPECTED_SELECTOR) return links;
      throw new Error(`想定外のセレクタです: ${selector}`);
    },
    getElementById(id) {
      return byIdMap[id] || null;
    },
  };
  const body = `
    const __instances = [];
    class IntersectionObserver {
      constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = []; __instances.push(this); }
      observe(el) { this.observed.push(el); }
    }
    const window = { IntersectionObserver };
    ${spyRootMarginCode}
    ${trackerCode}
    ${spyIife})();
    return {
      instances: __instances,
      fire(entries) { __instances[__instances.length - 1].cb(entries); },
    };
  `;
  const factory = new Function("document", body);
  const api = factory(documentStub);
  return { sections, byIdMap, links, api };
}

function currents(links) {
  return links.filter((a) => a.classList.contains("is-current")).map((a) => `${a.nav} ${a.getAttribute("href")}`);
}
function ariaCurrents(links) {
  return links.filter((a) => a.getAttribute("aria-current") === "true").map((a) => `${a.nav} ${a.getAttribute("href")}`);
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

runCase("1. menu が帯域内（両ナビの #menu にだけ付く）", () => {
  const h = makeHarness();
  h.api.fire([{ target: h.byIdMap.menu, isIntersecting: true }]);
  check("1", "is-current は両ナビの #menu だけ", currents(h.links), ["header #menu", "hamburger #menu"]);
  check("1", "aria-current は両ナビの #menu だけ", ariaCurrents(h.links), ["header #menu", "hamburger #menu"]);
});

runCase("2. concept が帯域内（同 href の重複リンク両方に付く）", () => {
  const h = makeHarness();
  h.api.fire([{ target: h.byIdMap.concept, isIntersecting: true }]);
  check("2", "is-current は両ナビの #concept", currents(h.links), ["header #concept", "hamburger #concept"]);
  check("2", "aria-current は両ナビの #concept", ariaCurrents(h.links), ["header #concept", "hamburger #concept"]);
});

runCase("3. top が帯域内（ハンバーガーだけが付き、ヘッダー側は外れる）", () => {
  const h = makeHarness();
  h.api.fire([{ target: h.byIdMap.menu, isIntersecting: true }]);
  check("3", "前提: 先に #menu が両ナビに付く", currents(h.links), ["header #menu", "hamburger #menu"]);
  h.api.fire([
    { target: h.byIdMap.menu, isIntersecting: false },
    { target: h.byIdMap.top, isIntersecting: true },
  ]);
  check("3", "is-current はハンバーガーの #top だけ", currents(h.links), ["hamburger #top"]);
  check("3", "aria-current はハンバーガーの #top だけ", ariaCurrents(h.links), ["hamburger #top"]);
  check("3", "ヘッダー側には現在地が1つも残らない", currents(h.links.filter((a) => a.nav === "header")), []);
});

runCase("4. 複数セクションが帯域内（文書順で最後、entries の順に依存しない）", () => {
  const h = makeHarness();
  // わざと文書順と逆順で届ける
  h.api.fire([
    { target: h.byIdMap.info, isIntersecting: true },
    { target: h.byIdMap.gallery, isIntersecting: true },
  ]);
  check("4", "文書順で後の info が両ナビで現在地", currents(h.links), ["header #info", "hamburger #info"]);
  check("4", "aria-current も info だけ", ariaCurrents(h.links), ["header #info", "hamburger #info"]);
});

runCase("5. 帯域が空（現在地は据え置き）", () => {
  const h = makeHarness();
  h.api.fire([{ target: h.byIdMap.concept, isIntersecting: true }]);
  h.api.fire([{ target: h.byIdMap.concept, isIntersecting: false }]);
  check("5", "帯域が空でも直前の現在地が残る（既存仕様）", currents(h.links), ["header #concept", "hamburger #concept"]);
});

runCase("6. access が帯域内（末尾セクションでも両ナビに付く）", () => {
  const h = makeHarness();
  h.api.fire([{ target: h.byIdMap.access, isIntersecting: true }]);
  check("6", "is-current は両ナビの #access", currents(h.links), ["header #access", "hamburger #access"]);
  check("6", "aria-current は両ナビの #access", ariaCurrents(h.links), ["header #access", "hamburger #access"]);
});

// --- 構造ガード（方式の巻き戻し・前提の崩れの検出） ---

runCase("構造: スパイの対象と方式", () => {
  check("構造", "セレクタが両ナビ対象の完全な文字列と一致する（フッター等への拡大を検出）", spyIife.includes(`document.querySelectorAll('${EXPECTED_SELECTOR}')`), true);
  check("構造", "sections の先頭に top が含まれる", spyIife.includes('["top", "concept", "menu", "gallery", "info", "faq", "access"]'), true);
  // byId マップの再導入だけを拾う。コメント中の "byId 方式" といった
  // 文字列だけの出現では落ちないよう、コードらしい出現に絞る。
  const byIdCodePattern = /(?:const|let|var)\s+byId\b|\bbyId\s*(?:\[|\.|=)/;
  check("構造", "byId 方式へ戻っていない", byIdCodePattern.test(spyIife), false);
  check("構造", "現在地の判定は href の一致で全リンクを走査する", spyIife.includes('a.getAttribute("href") === "#" + current.id'), true);
  const h = makeHarness();
  check("構造", "帯域定義 rootMargin は目次側と共通の値", h.api.instances[0].opts.rootMargin, "-35% 0px -55% 0px");
  check("構造", "帯域定義 opts のキー集合は rootMargin のみ（threshold 等の追加・削除を検出）", Object.keys(h.api.instances[0].opts).sort(), ["rootMargin"]);
  check("構造", "監視対象は7セクションを文書順どおり", h.api.instances[0].observed.map((s) => s.id), SECTION_IDS);
});

// index.html のナビブロックから、フラグメントリンク（# で始まる href）
// だけを文書順に取り出す。外部リンクはスパイ対象外のため除外する。
// href の値は二重引用符・単一引用符のどちらで書かれていても取り出す。
function navFragmentHrefs(className) {
  const start = html.indexOf(`class="${className}"`);
  if (start < 0) throw new Error(`index.html: class="${className}" のナビが見つかりません`);
  const end = html.indexOf("</nav>", start);
  if (end < 0) throw new Error(`index.html: class="${className}" のナビの終端が見つかりません`);
  const block = html.slice(start, end);
  return [...block.matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)')/g)].map((m) => m[1] ?? m[2]).filter((href) => href.startsWith("#"));
}

runCase("構造: index.html 側の前提（#top はハンバーガーにだけある）", () => {
  const headerHrefs = navFragmentHrefs("header-nav");
  const burgerHrefs = navFragmentHrefs("hamburger-menu");
  check("構造", "ヘッダーナビに #top は無い", headerHrefs.includes("#top"), false);
  check("構造", "ハンバーガーに #top がある", burgerHrefs.includes("#top"), true);
  check("構造", "両ナビに #menu がある（重複リンクの前提）", headerHrefs.includes("#menu") && burgerHrefs.includes("#menu"), true);
});

runCase("構造: index.html 両ナビの href 全集合とハーネス定数の突き合わせ", () => {
  check("構造", "ヘッダーナビの href 全集合（文書順）が HEADER_HREFS と一致する", navFragmentHrefs("header-nav"), HEADER_HREFS);
  check("構造", "ハンバーガーの href 全集合（文書順）が HAMBURGER_HREFS と一致する", navFragmentHrefs("hamburger-menu"), HAMBURGER_HREFS);
});

if (failures > 0) {
  console.log(`\n結果: ${failures} 件の確認が失敗しました`);
  process.exit(1);
}
console.log("\n結果: 全ケース合格（ヘッダースパイの重複リンク現在地表示はこのスクリプトで固定化されています）");
