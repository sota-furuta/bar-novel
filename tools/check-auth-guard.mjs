// 試行制限ガード（functions/api/_auth-guard.js）のスタブテスト
// 偽の KV と Request で /api/auth と /api/news のハンドラを直接呼び、
// 「数える→ロック→ロック中は正解でも429→期限切れで復帰→成功で消去」と
// 「別APIの失敗も同じロックに効く」「KVなしでは従来どおり」を確認する。
// あわせて窓（15分）と残り時間表示の境界ケース（ケース11〜13）も固定する:
// 窓は「15分未満」の失敗だけを数え、残り時間は分単位で切り上げ（最小1分）、
// ロック期限ちょうどでは解除される。境界は Date.now を固定して ms 単位で検証する。
// ケース14では、ロック中の試行がロックを延長せず失敗カウントも増えないことも固定する。
// 実行: node tools/check-auth-guard.mjs
import { onRequestPost as authPost } from "../functions/api/auth.js";
import { onRequestPost as newsPost } from "../functions/api/news.js";

let failures = 0;
function check(name, cond) {
  if (cond) console.log("PASS " + name);
  else { failures++; console.log("FAIL " + name); }
}

function fakeKV() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, String(v)); },
    async delete(k) { map.delete(k); },
  };
}

function req(ip, body) {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

const kv = fakeKV();
const env = { NEWS_KV: kv, ADMIN_PASSWORD: "secret" };
const IP = "203.0.113.10";

// 1) 4回までは 401（ロックしない）
for (let i = 1; i <= 4; i++) {
  const res = await authPost({ request: req(IP, { password: "wrong" + i }), env });
  check(`失敗${i}回目は401`, res.status === 401);
}
// 2) 5回目の失敗でロックに入り、その応答が 429
{
  const res = await authPost({ request: req(IP, { password: "wrong5" }), env });
  const data = await res.json();
  check("5回目の失敗で429", res.status === 429);
  check("429に locked と残り15分が入る", data.locked === true && data.retryAfterMinutes === 15);
}
// 3) ロック中は正しいパスワードでも 429
{
  const res = await authPost({ request: req(IP, { password: "secret" }), env });
  check("ロック中は正解でも429", res.status === 429);
}
// 4) 別IPは影響を受けない
{
  const res = await authPost({ request: req("198.51.100.7", { password: "secret" }), env });
  check("別IPは通常どおり成功", res.status === 200);
}
// 5) ロック期限が切れれば正解で入れて、状態が消える
{
  const key = "authguard:" + IP;
  const st = JSON.parse(kv.map.get(key));
  st.lockedUntil = Date.now() - 1000;
  kv.map.set(key, JSON.stringify(st));
  const res = await authPost({ request: req(IP, { password: "secret" }), env });
  check("期限切れ後は成功", res.status === 200);
  check("成功で状態が消える", !kv.map.has(key));
}
// 6) 別API（/api/news）の失敗も同じIPのロックに効く
{
  const ip2 = "192.0.2.55";
  for (let i = 1; i <= 5; i++) {
    await newsPost({ request: req(ip2, { password: "bad", closures: [] }), env });
  }
  const res = await authPost({ request: req(ip2, { password: "secret" }), env });
  check("news側の失敗5回でauthもロック", res.status === 429);
}
// 7) ログが残っている（failure / locked / success を含み、新しい順）
{
  const log = JSON.parse(kv.map.get("authlog") || "[]");
  const results = log.map((e) => e.result);
  check("authlogにfailureがある", results.includes("failure"));
  check("authlogにlockedがある", results.includes("locked"));
  check("authlogにsuccessがある", results.includes("success"));
  check("authlogは50件以内", log.length <= 50);
}
// 8) KVなし環境では従来どおり（制限なし・例外なし）
{
  const envNoKv = { ADMIN_PASSWORD: "secret" };
  const ng = await authPost({ request: req(IP, { password: "nope" }), env: envNoKv });
  const ok = await authPost({ request: req(IP, { password: "secret" }), env: envNoKv });
  check("KVなし: 不正は401", ng.status === 401);
  check("KVなし: 正解は200", ok.status === 200);
}
// 9) 成功すると失敗カウントがリセットされる（4失敗→成功→4失敗でもロックしない）
{
  const ip3 = "203.0.113.99";
  for (let i = 0; i < 4; i++) await authPost({ request: req(ip3, { password: "x" }), env });
  await authPost({ request: req(ip3, { password: "secret" }), env });
  let last;
  for (let i = 0; i < 4; i++) last = await authPost({ request: req(ip3, { password: "x" }), env });
  check("成功でカウント消去（4+成功+4でも401止まり）", last.status === 401);
}

// 10) 他APIの成功ではカウントは消えない（消去はログイン成功時だけ）:
//     authで4回失敗 → newsへ正しいパスワードで保存（成功）→ authで1回失敗 = 通算5回でロック
{
  const ip4 = "203.0.113.77";
  for (let i = 0; i < 4; i++) await authPost({ request: req(ip4, { password: "x" }), env });
  const saved = await newsPost({ request: req(ip4, { password: "secret", closures: [] }), env });
  check("news保存は成功する", saved.status === 200);
  const fifth = await authPost({ request: req(ip4, { password: "x" }), env });
  check("他API成功後も通算5回でロック", fifth.status === 429);
}

// 11) 窓の境界: 15分ちょうど経過した失敗は窓から落ちる（数えない）
//     Date.now を固定し、境界を ms 単位で厳密に固定する
{
  const WINDOW_MS = 15 * 60 * 1000;
  const T = 1700000000000;
  const realNow = Date.now;
  Date.now = () => T;
  try {
    // 11a) ちょうど15分前の失敗1件＋新しい失敗3件がある状態で1回失敗:
    //      境界の1件が落ちるため合計4件止まりで、ロックせず401
    const ipA = "203.0.113.201";
    const keyA = "authguard:" + ipA;
    kv.map.set(keyA, JSON.stringify({
      fails: [T - WINDOW_MS, T - 60000, T - 60000, T - 60000],
      lockedUntil: 0,
    }));
    const resA = await authPost({ request: req(ipA, { password: "x" }), env });
    check("窓境界: 15分ちょうどの失敗は落ちて401止まり", resA.status === 401);
    const stA = JSON.parse(kv.map.get(keyA));
    check("窓境界: 境界の失敗が状態からも消えている", stA.fails.length === 4 && !stA.fails.includes(T - WINDOW_MS));

    // 11b) 15分より1msだけ新しい失敗は窓に残る:
    //      既存4件＋今回1件＝5件でロックし429
    const ipB = "203.0.113.202";
    const keyB = "authguard:" + ipB;
    kv.map.set(keyB, JSON.stringify({
      fails: [T - WINDOW_MS + 1, T - 60000, T - 60000, T - 60000],
      lockedUntil: 0,
    }));
    const resB = await authPost({ request: req(ipB, { password: "x" }), env });
    check("窓境界: 15分未満（1ms内側）の失敗は残って5件で429", resB.status === 429);
  } finally {
    Date.now = realNow;
  }
}

// 12) 残り時間（retryAfterMinutes）の切り上げ表示の境界
//     切り上げ: 端数は次の分へ。最小は1分。ちょうどの分はそのまま
{
  const T = 1700000000000;
  const realNow = Date.now;
  Date.now = () => T;
  try {
    async function lockedAttempt(ip, lockedUntil) {
      kv.map.set("authguard:" + ip, JSON.stringify({ fails: [], lockedUntil }));
      const res = await authPost({ request: req(ip, { password: "secret" }), env });
      return { status: res.status, data: await res.json() };
    }
    const cases = [
      ["残り15分ちょうどは15分", 15 * 60000, 15],
      ["残り14分30秒は切り上げて15分", 14 * 60000 + 30000, 15],
      ["残り14分ちょうどは14分", 14 * 60000, 14],
      ["残り14分1msは切り上げて15分", 14 * 60000 + 1, 15],
      ["残り30秒は切り上げて1分", 30000, 1],
      ["残り1msでも最小1分", 1, 1],
    ];
    let n = 0;
    for (const [name, remainMs, expect] of cases) {
      n++;
      const r = await lockedAttempt("203.0.113." + (210 + n), T + remainMs);
      check("残り時間: " + name, r.status === 429 && r.data.retryAfterMinutes === expect);
    }
  } finally {
    Date.now = realNow;
  }
}

// 13) ロック期限の境界: 期限ちょうど（lockedUntil == now）では解除され、
//     期限の1ms前ではまだロック中
{
  const T = 1700000000000;
  const realNow = Date.now;
  Date.now = () => T;
  try {
    const ipJust = "203.0.113.220";
    kv.map.set("authguard:" + ipJust, JSON.stringify({ fails: [], lockedUntil: T + 1 }));
    const still = await authPost({ request: req(ipJust, { password: "secret" }), env });
    check("期限境界: 期限1ms前はまだ429", still.status === 429);

    const ipExact = "203.0.113.221";
    const keyExact = "authguard:" + ipExact;
    kv.map.set(keyExact, JSON.stringify({ fails: [], lockedUntil: T }));
    const res = await authPost({ request: req(ipExact, { password: "secret" }), env });
    check("期限境界: 期限ちょうどで解除され成功", res.status === 200);
    check("期限境界: 解除後の成功で状態が消える", !kv.map.has(keyExact));
  } finally {
    Date.now = realNow;
  }
}

// 14) ロック中の試行はロックを延長せず、失敗カウントも増えない:
//     ロックしたIPで auth／news へ正解・不正解を繰り返し試しても、
//     authguard の状態（lockedUntil と fails）が変わらないことを固定する。
//     checkLock が recordFailure より先に返る順序が入れ替わると、
//     ロック中の試行が fails を積み増し、5回で再ロックされて
//     lockedUntil が伸びる（締め出しの自己延長）ため、その退行を検出する。
//     試行は不正解5回＋正解2回にする。不正解5回は、万一 recordFailure が
//     呼ばれていても再ロックに届く回数で、延長を確実に検出するため。
{
  const ip5 = "203.0.113.55";
  const key5 = "authguard:" + ip5;
  for (let i = 0; i < 5; i++) await authPost({ request: req(ip5, { password: "x" }), env });
  const before = JSON.parse(kv.map.get(key5));
  check("ロック直後は失敗カウントが空", Array.isArray(before.fails) && before.fails.length === 0);
  check("ロック直後はロック期限が未来", before.lockedUntil > Date.now());
  const closuresBefore = kv.map.get("closures");
  const attempts = [
    () => authPost({ request: req(ip5, { password: "x" }), env }),
    () => authPost({ request: req(ip5, { password: "secret" }), env }),
    () => newsPost({ request: req(ip5, { password: "x", closures: [] }), env }),
    () => newsPost({ request: req(ip5, { password: "secret", closures: [{ date: "2099-01-01", note: "locked" }] }), env }),
    () => authPost({ request: req(ip5, { password: "x" }), env }),
    () => newsPost({ request: req(ip5, { password: "x", closures: [] }), env }),
    () => authPost({ request: req(ip5, { password: "x" }), env }),
  ];
  let all429 = true;
  for (const attempt of attempts) {
    const res = await attempt();
    if (res.status !== 429) all429 = false;
  }
  check("ロック中の試行は全て429（auth／news・正解／不正解）", all429);
  const after = JSON.parse(kv.map.get(key5));
  check("ロック中の試行でロック期限が延長されない", after.lockedUntil === before.lockedUntil);
  check("ロック中の試行で失敗カウントが増えない", Array.isArray(after.fails) && after.fails.length === before.fails.length && JSON.stringify(after.fails) === JSON.stringify(before.fails));
  check("ロック中のnews保存でclosuresが書き換わらない", kv.map.get("closures") === closuresBefore);
}

console.log(failures === 0 ? "\n全ケース合格" : `\n${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
