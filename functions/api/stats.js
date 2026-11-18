// GET /api/stats — 管理画面の統計情報（要 X-Admin-Password ヘッダー）
// taps: KV の日別タップ数（直近30日）
// analytics: Cloudflare Web Analytics（env の CF_API_TOKEN / CF_ACCOUNT_ID / CF_SITE_TAG が揃ったときだけ）
// debug: 訪問者数0件問題の診断用（段階ごとの結果・siteTagなしの結果・使用中の識別子）。原因が判明したら外す。
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

async function postGraphQL(env, query, variables) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + env.CF_API_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok || (data.errors && data.errors.length)) {
    const msg = data.errors && data.errors[0] && data.errors[0].message ? data.errors[0].message : "http_" + res.status;
    throw new Error("cloudflare_api_error: " + msg);
  }
  const acct = data.data && data.data.viewer && data.data.viewer.accounts && data.data.viewer.accounts[0];
  if (!acct) throw new Error("cloudflare_api_error: account_not_found");
  return acct;
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
  return postGraphQL(env, query, { account: env.CF_ACCOUNT_ID, siteTag: env.CF_SITE_TAG, start, end });
}

// 診断用: siteTag を付けずにアカウント全体の日別件数を取る
async function runRumQueryNoTag(env, start, end) {
  const query = `
    query($account: String!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          daily: rumPageloadEventsAdaptiveGroups(
            limit: 100
            filter: { date_geq: $start, date_leq: $end }
            orderBy: [date_ASC]
          ) { count dimensions { date } }
        }
      }
    }`;
  return postGraphQL(env, query, { account: env.CF_ACCOUNT_ID, start, end });
}

// 診断用: 任意のディメンションでグループ化して内訳を見る
async function probeGroups(env, start, end, withTag, dimension) {
  const varsDecl = withTag
    ? "($account: String!, $siteTag: String!, $start: Date!, $end: Date!)"
    : "($account: String!, $start: Date!, $end: Date!)";
  const tagFilter = withTag ? "siteTag: $siteTag, " : "";
  const query = `
    query${varsDecl} {
      viewer {
        accounts(filter: { accountTag: $account }) {
          groups: rumPageloadEventsAdaptiveGroups(
            limit: 20
            filter: { ${tagFilter}date_geq: $start, date_leq: $end }
            orderBy: [count_DESC]
          ) { count dimensions { ${dimension} } }
        }
      }
    }`;
  const variables = withTag
    ? { account: env.CF_ACCOUNT_ID, siteTag: env.CF_SITE_TAG, start, end }
    : { account: env.CF_ACCOUNT_ID, start, end };
  const acct = await postGraphQL(env, query, variables);
  return (acct.groups || []).map((g) => ({
    key: (g.dimensions && g.dimensions[dimension]) || "",
    pv: g.count || 0,
  }));
}

async function probeSafe(env, start, end, withTag, dimension) {
  try {
    const rows = await probeGroups(env, start, end, withTag, dimension);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function rumHasData(acct) {
  if (!acct) return false;
  const rows = [...(acct.daily || []), ...(acct.referrers || [])];
  return rows.some((r) => (r.count || 0) > 0);
}

function summarizeAcct(acct) {
  const daily = (acct && acct.daily) || [];
  return { rows: daily.length, pv: daily.reduce((s, r) => s + (r.count || 0), 0) };
}

async function fetchAnalytics(env, start, end) {
  // 絞り込みの強い順に試し、データが取れた段階の結果を使う。
  // 以前はエラー時にしか条件を緩めなかったため、絞り込みが強すぎて
  // 「成功したが0件」になる場合に拾えなかった。
  const stageDefs = [
    { name: "bot+host", filter: ', bot: 0, requestHost: "bar-novel.pages.dev"' },
    { name: "botのみ", filter: ", bot: 0" },
    { name: "条件なし", filter: "" },
  ];
  const stageResults = [];
  let acct = null;
  let lastError = null;
  for (const s of stageDefs) {
    try {
      const result = await runRumQuery(env, start, end, s.filter);
      const sum = summarizeAcct(result);
      stageResults.push({ name: s.name, ok: true, rows: sum.rows, pv: sum.pv });
      if (rumHasData(result)) { acct = result; break; }
      if (!acct) acct = result;
    } catch (e) {
      stageResults.push({ name: s.name, ok: false, error: String((e && e.message) || e) });
      lastError = e;
    }
  }
  if (!acct) {
    const err = lastError || new Error("cloudflare_api_error");
    err.stageResults = stageResults;
    throw err;
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
  return { dailyMap, referrers, stageResults };
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
  let debug = null;
  if (configured) {
    let stageResults = [];
    try {
      const r = await fetchAnalytics(env, days[0], days[days.length - 1]);
      stageResults = r.stageResults;
      const daily = days.map((d) => ({
        date: d,
        pv: r.dailyMap[d] ? r.dailyMap[d].pv : 0,
        visits: r.dailyMap[d] ? r.dailyMap[d].visits : 0,
      }));
      const sampled = Object.values(r.dailyMap).some((v) => v.sample > 1);
      analytics = { daily, referrers: r.referrers, sampled };
    } catch (e) {
      analyticsError = true;
      stageResults = e.stageResults || [];
    }
    // 診断: siteTagなしでもアカウントにデータがあるか
    let noSiteTag = null;
    try {
      const a2 = await runRumQueryNoTag(env, days[0], days[days.length - 1]);
      const s2 = summarizeAcct(a2);
      noSiteTag = { ok: true, rows: s2.rows, pv: s2.pv };
    } catch (e) {
      noSiteTag = { ok: false, error: String((e && e.message) || e) };
    }
    const hostsNoTag = await probeSafe(env, days[0], days[days.length - 1], false, "requestHost");
    const tagsNoTag = await probeSafe(env, days[0], days[days.length - 1], false, "siteTag");
    const hostsWithTag = await probeSafe(env, days[0], days[days.length - 1], true, "requestHost");
    debug = {
      siteTag: env.CF_SITE_TAG,
      siteTagLength: env.CF_SITE_TAG.length,
      accountId: env.CF_ACCOUNT_ID,
      accountIdLength: env.CF_ACCOUNT_ID.length,
      stages: stageResults,
      noSiteTag,
      hostsNoTag,
      tagsNoTag,
      hostsWithTag,
    };
  }
  return json({ taps, analytics, analyticsError, configured, debug });
}
