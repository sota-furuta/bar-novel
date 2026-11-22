// パスワード確認専用API
// 試行制限は共通ガード（_auth-guard.js）: 15分間に5回失敗で15分ロック（IP単位）
import { checkLock, recordFailure, recordSuccess, lockedResponse, LOCK_MINUTES } from "./_auth-guard.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const lock = await checkLock(env, request);
  if (lock.locked) return lockedResponse(lock.retryAfterMinutes);
  const ok = !!env.ADMIN_PASSWORD && body.password === env.ADMIN_PASSWORD;
  if (!ok) {
    const r = await recordFailure(env, request, "/api/auth");
    if (r.lockedNow) return lockedResponse(LOCK_MINUTES);
    return Response.json({ ok: false }, { status: 401 });
  }
  await recordSuccess(env, request, "/api/auth", true);
  return Response.json({ ok: true });
}
