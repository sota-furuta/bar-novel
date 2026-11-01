// BAR NOVEL お知らせ（臨時休業）API
// GET  /api/news -> { closures: [{date, note}] }（今日以降のみ）
// POST /api/news { password, closures: [{date, note}] } -> 保存
function todayJST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export async function onRequestGet({ env }) {
  if (!env.NEWS_KV) {
    return Response.json({ closures: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const raw = await env.NEWS_KV.get("closures");
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  const today = todayJST();
  const closures = (Array.isArray(list) ? list : [])
    .filter((c) => c && c.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return Response.json({ closures }, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  if (!env.NEWS_KV) {
    return Response.json({ ok: false, error: "kv_not_bound" }, { status: 503 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const list = Array.isArray(body.closures)
    ? body.closures
        .filter((c) => c && /^\d{4}-\d{2}-\d{2}$/.test(c.date || ""))
        .map((c) => ({ date: c.date, note: String(c.note || "").slice(0, 60) }))
    : [];
  await env.NEWS_KV.put("closures", JSON.stringify(list));
  return Response.json({ ok: true, closures: list });
}
