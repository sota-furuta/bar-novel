// 写真のキャプション変更 API（functions/api/photos.js の PATCH）のスタブテスト
// 偽の KV と Request で onRequestPatch を直接呼び、認証・バリデーション・
// 索引（photos:index）の更新を確認する。検証ブランチには KV が無いため、
// 実サーバーでの動作は本番反映後に確認する。
// 実行: node tools/check-photos-caption.mjs
import { onRequestPatch, onRequestGet } from "../functions/api/photos.js";

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

function req(body, raw) {
  return new Request("https://example.test/api/photos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.10" },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

const kv = fakeKV();
const env = { NEWS_KV: kv, ADMIN_PASSWORD: "secret" };
const seed = [
  { id: "abc", caption: "元の文", createdAt: "2026-11-23T09:01:49.412Z" },
  { id: "def", caption: "もう1枚", createdAt: "2026-11-23T09:02:49.412Z" },
];
await kv.put("photos:index", JSON.stringify(seed));
const readIndex = async () => JSON.parse(await kv.get("photos:index"));

// 1) 正常系：キャプションが変わり、id・createdAt・件数は不変
{
  const res = await onRequestPatch({ request: req({ password: "secret", id: "abc", caption: "新しい文" }), env });
  const data = await res.json();
  check("正常な変更は200で ok", res.status === 200 && data.ok === true);
  const idx = await readIndex();
  check("索引のキャプションが新しい文になる", idx[0].caption === "新しい文");
  check("id と createdAt は変わらない", idx[0].id === "abc" && idx[0].createdAt === seed[0].createdAt);
  check("件数と他の写真は変わらない", idx.length === 2 && idx[1].caption === "もう1枚");
}

// 2) 前後の空白は trim される（投稿時と同じ扱い）
{
  const res = await onRequestPatch({ request: req({ password: "secret", id: "def", caption: "  空白つき  " }), env });
  check("空白つきでも変更できる", res.status === 200);
  const idx = await readIndex();
  check("前後の空白が取り除かれる", idx[1].caption === "空白つき");
}

// 3) 40字を超えるキャプションは40字に切り詰められる（投稿時と同じ扱い）
{
  const res = await onRequestPatch({ request: req({ password: "secret", id: "def", caption: "あ".repeat(50) }), env });
  check("長いキャプションでも変更できる", res.status === 200);
  const idx = await readIndex();
  check("40字に切り詰められる", idx[1].caption.length === 40);
}

// 4) 空キャプションは 400 caption_required で、索引は変わらない
{
  const before = await kv.get("photos:index");
  const res = await onRequestPatch({ request: req({ password: "secret", id: "abc", caption: "   " }), env });
  const data = await res.json();
  check("空キャプションは400", res.status === 400 && data.error === "caption_required");
  check("索引は変わらない", (await kv.get("photos:index")) === before);
}

// 5) 存在しない id は 404 not_found
{
  const res = await onRequestPatch({ request: req({ password: "secret", id: "zzz", caption: "文" }), env });
  const data = await res.json();
  check("存在しない id は404", res.status === 404 && data.error === "not_found");
}

// 6) id が無ければ 400 no_id
{
  const res = await onRequestPatch({ request: req({ password: "secret", caption: "文" }), env });
  const data = await res.json();
  check("id が無ければ400", res.status === 400 && data.error === "no_id");
}

// 7) パスワードが違えば 401 で、索引は変わらない
{
  const before = await kv.get("photos:index");
  const res = await onRequestPatch({ request: req({ password: "wrong", id: "abc", caption: "文" }), env });
  check("パスワード違いは401", res.status === 401);
  check("索引は変わらない（認証失敗）", (await kv.get("photos:index")) === before);
}

// 8) 不正な JSON は 400 bad_json
{
  const res = await onRequestPatch({ request: req(null, "{not json"), env });
  const data = await res.json();
  check("不正な JSON は400", res.status === 400 && data.error === "bad_json");
}

// 9) GET /api/photos が新しいキャプションを返す
{
  const res = await onRequestGet({ env });
  const data = await res.json();
  check("GET で新しいキャプションが返る", data.photos[0].caption === "新しい文");
}

// 10) KV が無ければ 503
{
  const res = await onRequestPatch({ request: req({ password: "secret", id: "abc", caption: "文" }), env: { ADMIN_PASSWORD: "secret" } });
  check("KV が無ければ503", res.status === 503);
}

// 11) 試行制限：PATCH でも失敗を繰り返すとロックし、ロック中は正解でも 429
{
  const kv2 = fakeKV();
  const env2 = { NEWS_KV: kv2, ADMIN_PASSWORD: "secret" };
  await kv2.put("photos:index", JSON.stringify(seed));
  const reqIp = (body) => new Request("https://example.test/api/photos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.23" },
    body: JSON.stringify(body),
  });
  let last;
  for (let i = 1; i <= 5; i++) {
    last = await onRequestPatch({ request: reqIp({ password: "wrong" + i, id: "abc", caption: "文" }), env: env2 });
  }
  check("PATCH の失敗5回目でロック（429）", last.status === 429);
  const res = await onRequestPatch({ request: reqIp({ password: "secret", id: "abc", caption: "文" }), env: env2 });
  const data = await res.json();
  check("ロック中は正しいパスワードでも429", res.status === 429 && data.locked === true);
  const idx = JSON.parse(await kv2.get("photos:index"));
  check("ロック中は索引が変わらない", idx[0].caption === "元の文");
}

if (failures > 0) {
  console.log(`\n結果: ${failures} 件の確認が失敗しました`);
  process.exit(1);
}
console.log("\n結果: 全チェック合格（写真のキャプション変更 API）");
