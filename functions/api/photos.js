// BAR NOVEL 写真 API
// GET    /api/photos -> { photos: [{id, caption, createdAt}] }（投稿順）
// POST   /api/photos (multipart: password, caption, file) -> 写真を保存
// DELETE /api/photos { password, id } -> 写真を削除
// 画像本体は KV の "photo:<id>" に保存し、/api/photo/<id> で配信する
const INDEX_KEY = "photos:index";
const MAX_BYTES = 8 * 1024 * 1024;

async function readIndex(env) {
  const raw = await env.NEWS_KV.get(INDEX_KEY);
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function onRequestGet({ env }) {
  if (!env.NEWS_KV) {
    return Response.json({ photos: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const photos = await readIndex(env);
  return Response.json({ photos }, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  if (!env.NEWS_KV) {
    return Response.json({ ok: false, error: "kv_not_bound" }, { status: 503 });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "bad_form" }, { status: 400 });
  }
  if (!env.ADMIN_PASSWORD || form.get("password") !== env.ADMIN_PASSWORD) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ ok: false, error: "no_file" }, { status: 400 });
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type || "")) {
    return Response.json({ ok: false, error: "bad_type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "too_large" }, { status: 413 });
  }
  const caption = String(form.get("caption") || "").trim().slice(0, 40);
  if (!caption) {
    return Response.json({ ok: false, error: "caption_required" }, { status: 400 });
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const buf = await file.arrayBuffer();
  await env.NEWS_KV.put("photo:" + id, buf, { metadata: { contentType: file.type } });
  const index = await readIndex(env);
  index.push({ id, caption, createdAt: new Date().toISOString() });
  await env.NEWS_KV.put(INDEX_KEY, JSON.stringify(index));
  return Response.json({ ok: true, id });
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
  if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const id = String(body.id || "");
  if (!id) {
    return Response.json({ ok: false, error: "no_id" }, { status: 400 });
  }
  await env.NEWS_KV.delete("photo:" + id);
  const index = (await readIndex(env)).filter((p) => p.id !== id);
  await env.NEWS_KV.put(INDEX_KEY, JSON.stringify(index));
  return Response.json({ ok: true });
}
