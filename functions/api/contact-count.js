// BAR NOVEL 問い合わせ件数 API（公開・件数のみ）
// GET /api/contact-count -> { open: 未対応の件数 }
// ログイン画面に件数バッジを出すため、件数だけは認証なしで返す（本文は返さない）
export async function onRequestGet({ env }) {
  if (!env.NEWS_KV) {
    return Response.json({ open: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  const raw = await env.NEWS_KV.get("contacts");
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  const open = (Array.isArray(list) ? list : []).filter(
    (c) => c && c.status !== "done"
  ).length;
  return Response.json({ open }, { headers: { "Cache-Control": "no-store" } });
}
