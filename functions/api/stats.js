// GET /api/stats — 管理画面の統計情報（要 X-Admin-Password ヘッダー）
// taps: KV の日別タップ数（直近30日）
// analytics: Cloudflare Web Analytics（env の CF_API_TOKEN / CF_ACCOUNT_ID / CF_SITE_TAG が揃ったときだけ）
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jstDays(n) {
  const days = [];
  const base = Date.now() + 9 * 60 * 60 * 1000;
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(base - i * 86400 * 1000);
    const m = String(t.getUTCMonth() + 1).padStart(2, "0");
    const d = String(t.getUTCDate()).padStart(2, "0");
    days.push(`${t.getUTCFullYear()}-${m}-${d}`);
  }
  return days;
}

async function runRumQuery(env, start, end, extraFilter) {
  const query = `
    query($account: String!, $siteTag: String!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          daily: rumPageloadEventsAdaptiveGroups(
            limit: 100
            filter: { siteTag: $siteTag, date_geq: $start, date_leq: $end ${extraFilter} }
            orderBy: [date_ASC]
          ) { count sum { visits } avg { sampleInterval } dimensions { date } }
          referrers: rumPageloadEventsAdaptiveGroups(
            limit: 10
            filter: { siteTag: $siteTag, date_geq: $start, date_leq: $end ${extraFilter} }
            orderBy: [count_DESC]
          ) { count dimensions { refererHost } }
        }
      }
    }`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + env.CF_API_TOKEN,
    },
    body: JSON.stringify({
      query,
      variables: { account: env.CF_ACCOUNT_ID, siteTag: env.CF_SITE_TAG, start, end },
    }),
  });
  const data = await res.json();
  if (!res.ok || (data.errors && data.errors.length)) throw new Error("cloudflare_api_error");
  const acct = data.data && data.data.viewer && data.data.viewer.accounts && data.data.viewer.accounts[0];
  if (!acct) throw new Error("cloudflare_api_error");
  return acct;
}

async function fetchAnalytics(env, start, end) {
  let acct;
  try {
    acct = await runRumQuery(env, start, end, ', bot: 0, requestHost: "bar-novel.pages.dev"');
  } catch (e) {
    acct = await runRumQuery(env, start, end, "");
  }
  const dailyMap = {};
  for (const row of acct.daily || []) {
    dailyMap[row.dimensions.date] = {
      pv: row.count || 0,
      visits: row.sum && row.sum.visits ? row.sum.visits : 0,
      sample: row.avg && row.avg.sampleInterval ? row.avg.sampleInterval : 1,
    };
  }
  const referrers = (acct.referrers || []).map((r) => ({
    host: (r.dimensions && r.dimensions.refererHost) || "",
    pv: r.count || 0,
  }));
  return { dailyMap, referrers };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const pw = request.headers.get("X-Admin-Password");
  if (!env.ADMIN_PASSWORD || pw !== env.ADMIN_PASSWORD) return json({ error: "unauthorized" }, 401);
  if (!env.NEWS_KV) return json({ error: "kv_not_bound" }, 503);

  const days = jstDays(30);
  const taps = [];
  for (const day of days) {
    const t = { tel: 0, instagram: 0, map: 0 };
    const raw = await env.NEWS_KV.get("taps:" + day);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        for (const k of ["tel", "instagram", "map"]) if (Number.isFinite(p[k])) t[k] = p[k];
      } catch (e) { /* 壊れた値は0として扱う */ }
    }
    taps.push({ date: day, tel: t.tel, instagram: t.instagram, map: t.map });
  }

  const configured = !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.CF_SITE_TAG);
  let analytics = null;
  let analyticsError = false;
  if (configured) {
    try {
      const { dailyMap, referrers } = await fetchAnalytics(env, days[0], days[days.length - 1]);
      const daily = days.map((d) => ({
        date: d,
        pv: dailyMap[d] ? dailyMap[d].pv : 0,
        visits: dailyMap[d] ? dailyMap[d].visits : 0,
      }));
      const sampled = Object.values(dailyMap).some((v) => v.sample > 1);
      analytics = { daily, referrers, sampled };
    } catch (e) {
      analyticsError = true;
    }
  }
  return json({ taps, analytics, analyticsError, configured });
}
