// 管理API共通のログイン試行制限（総当たり対策）
//
// 仕組み:
// - IP（CF-Connecting-IP）ごとに失敗を KV（NEWS_KV）の "authguard:<ip>" に数える
// - 15分間に5回失敗したら、そのIPを15分間ロックする（時間制。恒久ロックはしない）
// - ロック中は正しいパスワードでも全ての管理APIが 429 を返す
// - パスワードが合えば、そのIPの失敗カウントは消える
// - 失敗・ロック・ログイン成功は KV の "authlog" に新しい順で最大50件残す
//
// 前提と割り切り:
// - KV が無い環境（検証ブランチなど）では制限をかけず、従来の照合だけが働く（フェイルオープン）
// - KV の読み書きで例外が起きても照合は止めない（オーナーを締め出さないため）
// - KV は結果整合性のため、反映ラグの間は上限を少し超えて試行できる場合がある（この規模では許容）
// - カウントは読み→書きのため、同時リクエストでは数え漏れがありうる（同上）
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const LOG_KEY = "authlog";
const LOG_MAX = 50;

export const LOCK_MINUTES = LOCK_MS / 60000;

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function stateKey(ip) {
  return "authguard:" + ip;
}

async function readState(env, ip) {
  try {
    const raw = await env.NEWS_KV.get(stateKey(ip));
    const st = raw ? JSON.parse(raw) : null;
    if (st && Array.isArray(st.fails) && typeof st.lockedUntil === "number") return st;
  } catch {
    /* 壊れた状態は初期状態として扱う */
  }
  return { fails: [], lockedUntil: 0 };
}

async function appendLog(env, ip, endpoint, result) {
  try {
    const raw = await env.NEWS_KV.get(LOG_KEY);
    let list = [];
    try {
      list = raw ? JSON.parse(raw) : [];
    } catch {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    list.unshift({ at: new Date().toISOString(), ip, endpoint, result });
    await env.NEWS_KV.put(LOG_KEY, JSON.stringify(list.slice(0, LOG_MAX)));
  } catch {
    /* ログの失敗は本処理に影響させない */
  }
}

// ロック中かどうか。ロック中なら retryAfterMinutes（切り上げ）も返す
export async function checkLock(env, request) {
  if (!env.NEWS_KV) return { locked: false };
  try {
    const st = await readState(env, clientIp(request));
    const now = Date.now();
    if (st.lockedUntil > now) {
      return { locked: true, retryAfterMinutes: Math.max(1, Math.ceil((st.lockedUntil - now) / 60000)) };
    }
  } catch {
    /* 照合は止めない */
  }
  return { locked: false };
}

// 失敗を1回分記録する。今回の失敗でロックに入ったら { lockedNow: true }
export async function recordFailure(env, request, endpoint) {
  if (!env.NEWS_KV) return { lockedNow: false };
  const ip = clientIp(request);
  try {
    const now = Date.now();
    const st = await readState(env, ip);
    st.fails = st.fails.filter((t) => now - t < WINDOW_MS);
    st.fails.push(now);
    let lockedNow = false;
    if (st.fails.length >= MAX_FAILS) {
      st.lockedUntil = now + LOCK_MS;
      st.fails = [];
      lockedNow = true;
    }
    const ttl = Math.ceil((Math.max(st.lockedUntil, now + WINDOW_MS) - now) / 1000) + 60;
    await env.NEWS_KV.put(stateKey(ip), JSON.stringify(st), { expirationTtl: ttl });
    await appendLog(env, ip, endpoint, lockedNow ? "locked" : "failure");
    return { lockedNow };
  } catch {
    return { lockedNow: false };
  }
}

// 成功したら失敗カウントを消す。ログイン（/api/auth）のときだけ成功もログに残す
export async function recordSuccess(env, request, endpoint, logSuccess) {
  if (!env.NEWS_KV) return;
  const ip = clientIp(request);
  try {
    await env.NEWS_KV.delete(stateKey(ip));
  } catch {
    /* 照合は止めない */
  }
  if (logSuccess) await appendLog(env, ip, endpoint, "success");
}

// ロック中の共通応答
export function lockedResponse(retryAfterMinutes) {
  return Response.json(
    { ok: false, error: "locked", locked: true, retryAfterMinutes },
    { status: 429 }
  );
}
