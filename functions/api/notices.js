// BAR NOVEL お知らせ（イベントなどの告知）API
// GET  /api/notices -> { notices: [{text, until}] }（表示期間内のみ）
// POST /api/notices { password, notices: [{text, until}] } -> 保存
function todayJST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export async function onRequestGet({ env }) {
  if (!env.NEWS_KV) {
    return Response.json({ notices: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const raw = await env.NEWS_KV.get("notices");
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  const today = todayJST();
  const notices = (Array.isArray(list) ? list : [])
    .filter((n) => n && n.text && n.until >= today)
    .sort((a, b) => (a.until < b.until ? -1 : 1));
  return Response.json({ notices }, { headers: { "Cache-Control": "no-store" } });
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
  const list = Array.isArray(body.notices)
    ? body.notices
        .filter(
          (n) =>
            n &&
            String(n.text || "").trim() &&
            /^\d{4}-\d{2}-\d{2}$/.test(n.until || "")
        )
        .map((n) => ({
          text: String(n.text).trim().slice(0, 80),
          until: n.until,
        }))
        .slice(0, 10)
    : [];
  await env.NEWS_KV.put("notices", JSON.stringify(list));
  return Response.json({ ok: true, notices: list });
}
