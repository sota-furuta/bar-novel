// 実ブラウザのスモークテスト: Playwright + Chromium (headless) でサイトの
// 着地・確認モーダル・ハンバーガーメニューを実際にブラウザで動かして確認する。
//
// 導入手順（この VM では済ませてある。初めての環境では下記を実行する）:
//   1. Playwright を入れる: cd ~/workspace/bar-novel-smoke-deps && npm install playwright
//      （このフォルダはリポジトリ外の作業用パッケージ。repo 直下へは入れない）
//   2. Chromium 本体を入れる: npx --prefix ~/workspace/bar-novel-smoke-deps playwright install chromium
//      （~/.cache/ms-playwright/chromium-1255 に入る）
//   3. このスクリプトをリポジトリ直下で実行する: node tools/smoke-browser.mjs
//
// 対象 URL:
//   既定ではリポジトリ直下のファイルをローカルで一時配信し、
//   http://127.0.0.1:<一時ポート>/ を開く。この VM ではブラウザからの外部接続が
//   egress プロキシで遮断される（curl は 200 が返るのに Chromium は
//   ERR_TUNNEL_CONNECTION_FAILED になる）ため、検証プレビューを直接開くことはできない。
//   ブラウザから外部へ出られる環境では、環境変数でプレビュー自体を開ける:
//     SMOKE_URL=https://verification.bar-novel.pages.dev/ node tools/smoke-browser.mjs
//   なおローカル配信では /api/* は 404 を返すが、サイト側は取得失敗を無視する作りの
//   ため判定に影響しない。Google フォント／地図 iframe の読み込みも同理由で失敗するが、
//   判定には使わない。
//
// 確認範囲（全17チェック）:
//   (a) 着地: ヘッダーナビ「Menu」とハンバーガー経由「Access」で、対象セクションの
//       上端が scroll-margin-top 通り（84px）に着地し見出しが画面内に収まること。
//       フォーカスは着地後に body のまま動かないのが実際の挙動（サイトは見出しへ
//       フォーカスを移さない作りで、Chromium は同一文書内のアンカー移動でフォーカスを
//       body に戻す）なので、「意図しない場所へ飛んでいない（body のまま）」ことを確認する。
//   (b) モーダル: Instagram リンクで確認モーダルが開き、メッセージに「Instagram」が出て
//       フォーカスが「開く」ボタンへ移り、「開く」で Instagram の URL が window.open に
//       渡されて新しいタブが開くこと。開いた先の読み込み自体はこの VM ではプロキシで
//       遮断されるため、ポップアップの最終 URL では判定しない。その後モーダルが閉じること。
//   (c) ハンバーガー: 開閉（aria-expanded／hidden の切替）と、メニュー外タップで閉じること。
//       メニュー外タップの座標は、開いたメニュー内の Instagram リンクを踏まない左端
//       (40, 760) にする。reduced-motion を有効にしてスクロールを即時移動にし、判定を安定させる。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INSTAGRAM_URL = "https://www.instagram.com/isehara.bar.cocktail.novel";
const EXPECTED_TOP = 84; // セクションの scroll-margin-top（ヘッダー分）
const VIEWPORT = { width: 1280, height: 800 };

// Playwright はリポジトリ外の作業用パッケージから読む。
const require = createRequire(process.env.HOME + "/workspace/bar-novel-smoke-deps/package.json");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire(join(process.cwd(), "package.json"))("playwright"));
}

const root = fileURLToPath(new URL("..", import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// リポジトリ直下を一時配信する最小の静的サーバー。/api/* は 404 を返す。
function serveLocal() {
  return new Promise((resolveServer) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname.startsWith("/api/")) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "not found" }));
          return;
        }
        let path = decodeURIComponent(url.pathname);
        if (path === "/") path = "/index.html";
        const file = join(root, path);
        if (!existsSync(file) || !file.startsWith(root)) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(500);
        res.end("error");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      resolveServer({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${results.length}. ${name}`);
  } catch (err) {
    results.push({ name, ok: false, reason: err.message });
    console.log(`FAIL ${results.length}. ${name}: ${err.message}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

async function main() {
  let local = null;
  const url = process.env.SMOKE_URL || (await serveLocal().then((r) => ((local = r.server), r.url)));
  console.log(`対象URL: ${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  // window.open に渡された URL を記録しつつ、元の window.open も呼んでタブを開かせる。
  await context.addInitScript(() => {
    window.__openedUrls = [];
    const originalOpen = window.open.bind(window);
    window.open = (...args) => {
      window.__openedUrls.push(args[0]);
      return originalOpen(...args);
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log(`(pageerror: ${err.message})`));
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForSelector("#hamburger", { timeout: 10000 });

  const rectTop = (sel) =>
    page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, sel);
  const waitTop = (sel) =>
    page.waitForFunction(
      ([s, top]) => Math.abs(document.querySelector(s).getBoundingClientRect().top - top) <= 2,
      [sel, EXPECTED_TOP],
      { timeout: 5000 },
    );

  // (a) 着地
  await page.evaluate(() => window.scrollTo(0, 0));
  await check("ヘッダーナビ「Menu」で #menu の上端が 84px に着地する", async () => {
    await page.locator('.header-nav a[href="#menu"]').click();
    await waitTop("#menu");
    const top = await rectTop("#menu");
    assert(Math.abs(top - EXPECTED_TOP) <= 2, `#menu の上端が ${top}px（期待 ${EXPECTED_TOP}px）`);
  });
  await check("#menu の見出しが画面内に収まる", async () => {
    const r = await page.evaluate(() => {
      const el = document.querySelector("#menu .section-title");
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, vh: window.innerHeight };
    });
    assert(r.top >= 0 && r.bottom <= r.vh, `見出しの範囲 ${r.top}〜${r.bottom}px（画面高 ${r.vh}px）`);
  });
  await check("「Menu」着地後のフォーカスが body のまま", async () => {
    const tag = await page.evaluate(() => document.activeElement.tagName);
    assert(tag === "BODY", `フォーカスが ${tag} にある`);
  });
  await check("ハンバーガー経由「Access」で #access の上端が 84px に着地する", async () => {
    await page.locator("#hamburger").click();
    await page.locator('#hamburgerMenu a[href="#access"]').click();
    await waitTop("#access");
    const top = await rectTop("#access");
    assert(Math.abs(top - EXPECTED_TOP) <= 2, `#access の上端が ${top}px（期待 ${EXPECTED_TOP}px）`);
  });
  await check("「Access」着地後のフォーカスが body のまま", async () => {
    const tag = await page.evaluate(() => document.activeElement.tagName);
    assert(tag === "BODY", `フォーカスが ${tag} にある`);
  });

  // (b) 確認モーダル
  await check("Instagram リンクで確認モーダルが開く", async () => {
    await page.locator('#info a[href*="instagram.com"]').first().click();
    await page.waitForSelector(".external-open-modal.is-visible", { timeout: 5000 });
    const hidden = await page.evaluate(() => document.querySelector(".external-open-modal").hidden);
    assert(hidden === false, "モーダルが hidden のまま");
  });
  await check("モーダルのメッセージに「Instagram」が出る", async () => {
    const text = await page.locator(".external-open-message").textContent();
    assert(text.includes("Instagram"), `メッセージが「${text}」`);
  });
  await check("フォーカスが「開く」ボタンへ移る", async () => {
    await page.waitForFunction(
      () => document.activeElement?.classList.contains("external-open-confirm"),
      { timeout: 5000 },
    );
    const label = await page.evaluate(() => document.activeElement.textContent);
    assert(label === "開く", `フォーカス先が「${label}」`);
  });
  const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
  await check("「開く」で Instagram の URL が window.open に渡される", async () => {
    await page.locator(".external-open-confirm").click();
    await page.waitForFunction(
      () => window.__openedUrls.length > 0,
      { timeout: 5000 },
    );
    const opened = await page.evaluate(() => window.__openedUrls);
    assert(opened.includes(INSTAGRAM_URL), `window.open に渡された URL が ${opened.join(", ")}`);
  });
  await check("Instagram が新しいタブで開く", async () => {
    const popup = await popupPromise;
    assert(popup !== null, "ポップアップが開かなかった");
  });
  await check("「開く」の後にモーダルが閉じる", async () => {
    await page.waitForFunction(
      () => document.querySelector(".external-open-modal").hidden === true,
      { timeout: 5000 },
    );
  });

  // (c) ハンバーガーメニュー
  await check("初期状態は閉じている（aria-expanded=false・hidden）", async () => {
    const state = await page.evaluate(() => ({
      expanded: document.querySelector("#hamburger").getAttribute("aria-expanded"),
      hidden: document.querySelector("#hamburgerMenu").hidden,
    }));
    assert(state.expanded === "false" && state.hidden === true, JSON.stringify(state));
  });
  await check("ハンバーガーボタンで開く（aria-expanded=true・表示）", async () => {
    await page.locator("#hamburger").click();
    const state = await page.evaluate(() => ({
      expanded: document.querySelector("#hamburger").getAttribute("aria-expanded"),
      hidden: document.querySelector("#hamburgerMenu").hidden,
    }));
    assert(state.expanded === "true" && state.hidden === false, JSON.stringify(state));
  });
  await check("開いたメニュー内のリンクが見える", async () => {
    await page.waitForSelector("#hamburgerMenu .hamburger-insta", { state: "visible", timeout: 5000 });
  });
  await check("ハンバーガーボタンで閉じる（aria-expanded=false・hidden）", async () => {
    await page.locator("#hamburger").click();
    const state = await page.evaluate(() => ({
      expanded: document.querySelector("#hamburger").getAttribute("aria-expanded"),
      hidden: document.querySelector("#hamburgerMenu").hidden,
    }));
    assert(state.expanded === "false" && state.hidden === true, JSON.stringify(state));
  });
  await check("メニュー外タップでメニューが閉じる（hidden）", async () => {
    await page.locator("#hamburger").click();
    await page.waitForSelector("#hamburgerMenu:not([hidden])", { timeout: 5000 });
    // メニュー内の Instagram リンクを踏まない左端の位置をタップする。
    await page.mouse.click(40, 760);
    await page.waitForFunction(() => document.querySelector("#hamburgerMenu").hidden === true, {
      timeout: 5000,
    });
  });
  await check("メニュー外タップ後の aria-expanded が false", async () => {
    const expanded = await page.evaluate(() =>
      document.querySelector("#hamburger").getAttribute("aria-expanded"),
    );
    assert(expanded === "false", `aria-expanded が ${expanded}`);
  });

  await browser.close();
  if (local) local.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} 合格`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`実行エラー: ${err.message}`);
  process.exit(1);
});
