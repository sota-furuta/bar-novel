// 試行制限ガード（functions/api/_auth-guard.js）のスタブテスト
// 偽の KV と Request で /api/auth と /api/news のハンドラを直接呼び、
// 「数える→ロック→ロック中は正解でも429→期限切れで復帰→成功で消去」と
// 「別APIの失敗も同じロックに効く」「KVなしでは従来どおり」を確認する。
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

console.log(failures === 0 ? "\n全ケース合格" : `\n${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
