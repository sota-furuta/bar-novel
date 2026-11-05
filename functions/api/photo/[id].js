// BAR NOVEL 投稿写真の配信
// GET /api/photo/<id> -> KV に保存した画像本体を返す
export async function onRequestGet({ env, params }) {
  if (!env.NEWS_KV) {
    return new Response("not found", { status: 404 });
  }
  const { value, metadata } = await env.NEWS_KV.getWithMetadata("photo:" + params.id, {
    type: "arrayBuffer",
  });
  if (!value) {
    return new Response("not found", { status: 404 });
  }
  return new Response(value, {
    headers: {
      "Content-Type": (metadata && metadata.contentType) || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
