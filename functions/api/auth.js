// パスワード確認専用API
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const ok = !!env.ADMIN_PASSWORD && body.password === env.ADMIN_PASSWORD;
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
