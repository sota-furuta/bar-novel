// POST /api/track {type: "tel" | "instagram" | "map"}
// 公開サイトのCTAタップ計測。日別に KV (taps:YYYY-MM-DD) へ加算する。
const TYPES = ["tel", "instagram", "map"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jstToday() {
  const t = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${m}-${d}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.NEWS_KV) return json({ error: "kv_not_bound" }, 503);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "bad_request" }, 400);
  }
  const type = body && body.type;
  if (!TYPES.includes(type)) return json({ error: "bad_type" }, 400);
  const key = "taps:" + jstToday();
  const data = { tel: 0, instagram: 0, map: 0 };
  const raw = await env.NEWS_KV.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      for (const t of TYPES) if (Number.isFinite(parsed[t])) data[t] = parsed[t];
    } catch (e) { /* 壊れた値は初期値で上書き */ }
  }
  data[type] += 1;
  await env.NEWS_KV.put(key, JSON.stringify(data));
  return json({ ok: true });
}
