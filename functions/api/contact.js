// BAR NOVEL 開発者への要望・問い合わせ API
// POST   /api/contact { password, category, message } -> 送信（KVに保存、状態は未対応）
// POST   /api/contact { password, action: "status", id, status } -> 状態変更（open/done）
// GET    /api/contact (Header: X-Admin-Password) -> { contacts: [...] }
// DELETE /api/contact { password, id } -> 削除
const KEY = "contacts";
const CATEGORIES = ["機能の要望", "不具合の報告", "質問", "その他"];

async function readList(env) {
  const raw = await env.NEWS_KV.get(KEY);
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function authorized(env, pw) {
  return !!env.ADMIN_PASSWORD && pw === env.ADMIN_PASSWORD;
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
  if (!authorized(env, body.password)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 状態変更
  if (body.action === "status") {
    const id = String(body.id || "");
    const status = body.status === "done" ? "done" : "open";
    const list = await readList(env);
    const item = list.find((c) => c.id === id);
    if (!item) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    item.status = status;
    await env.NEWS_KV.put(KEY, JSON.stringify(list));
    return Response.json({ ok: true });
  }
  // 新規送信
  const message = String(body.message || "").trim().slice(0, 1000);
  if (!message) {
    return Response.json({ ok: false, error: "message_required" }, { status: 400 });
  }
  const category = CATEGORIES.includes(body.category) ? body.category : "その他";
  const list = await readList(env);
  list.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    category,
    message,
    status: "open",
    createdAt: new Date().toISOString(),
  });
  await env.NEWS_KV.put(KEY, JSON.stringify(list.slice(0, 100)));
  return Response.json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!env.NEWS_KV) {
    return Response.json({ contacts: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(env, request.headers.get("X-Admin-Password") || "")) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const contacts = await readList(env);
  return Response.json({ contacts }, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestDelete({ request, env }) {
  if (!env.NEWS_KV) {
    return Response.json({ ok: false, error: "kv_not_bound" }, { status: 503 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!authorized(env, body.password)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const id = String(body.id || "");
  const list = (await readList(env)).filter((c) => c.id !== id);
  await env.NEWS_KV.put(KEY, JSON.stringify(list));
  return Response.json({ ok: true });
}
