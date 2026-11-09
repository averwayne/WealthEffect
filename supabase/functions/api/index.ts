// Wealth Effect server API (Supabase Edge Function).
// Holds every third-party key server-side. Actions:
//   quotes         { symbols: string[] }  -> cached Finnhub quotes (shared across users)
//   search         { q: string }          -> Finnhub symbol search
//   macro          {}                     -> 3M T-bill (FRED DTB3), CPI YoY (FRED CPIAUCSL), SPY monthly (Alpha Vantage)
//   delete-account {}                     -> permanently deletes the calling user and all their data
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY');
const ALPHAVANTAGE_KEY = Deno.env.get('ALPHAVANTAGE_API_KEY');
const FRED_KEY = Deno.env.get('FRED_API_KEY');

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_FETCH_PER_CALL = 40;
const SYMBOL_RE = /^[A-Z0-9.\-^=:]{1,24}$/;

/** US regular session, roughly: Mon–Fri 13:30–20:00 UTC (covers EST/EDT with margin). */
function marketOpen(now = new Date()) {
  const d = now.getUTCDay();
  if (d === 0 || d === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 13 * 60 + 30 && mins <= 21 * 60;
}

function isStale(fetchedAt: string | null) {
  if (!fetchedAt) return true;
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age > (marketOpen() ? 15 * 60_000 : 6 * 3600_000);
}

async function quotes(symbols: string[]) {
  const list = [...new Set(symbols.map((s) => String(s).toUpperCase().trim()))].filter((s) => SYMBOL_RE.test(s)).slice(0, 200);
  if (!list.length) return json({ quotes: [], configured: !!FINNHUB_KEY });
  const { data: cached } = await admin.from('quotes').select('*').in('symbol', list);
  const bySym = new Map((cached ?? []).map((r) => [r.symbol, r]));
  const stale = list.filter((s) => isStale(bySym.get(s)?.fetched_at ?? null)).slice(0, MAX_FETCH_PER_CALL);

  if (FINNHUB_KEY && stale.length) {
    const fresh: Record<string, unknown>[] = [];
    // small concurrency to respect the provider's per-minute limit
    for (let i = 0; i < stale.length; i += 5) {
      const batch = stale.slice(i, i + 5);
      const res = await Promise.all(
        batch.map(async (s) => {
          try {
            const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${FINNHUB_KEY}`);
            if (!r.ok) return null;
            const q = await r.json();
            if (!q || typeof q.c !== 'number' || q.c <= 0) return null;
            return {
              symbol: s,
              price: q.c,
              change: q.d ?? 0,
              change_pct: q.dp ?? 0,
              prev_close: q.pc ?? null,
              quote_time: q.t ? new Date(q.t * 1000).toISOString() : null,
              fetched_at: new Date().toISOString(),
            };
          } catch {
            return null;
          }
        }),
      );
      for (const r of res) if (r) fresh.push(r);
    }
    if (fresh.length) {
      await admin.from('quotes').upsert(fresh);
      for (const r of fresh) bySym.set(r.symbol as string, r);
    }
  }
  return json({ quotes: list.map((s) => bySym.get(s)).filter(Boolean), configured: !!FINNHUB_KEY });
}

async function search(q: string) {
  if (!FINNHUB_KEY) return json({ results: [], configured: false });
  const term = String(q ?? '').trim().slice(0, 40);
  if (!term) return json({ results: [], configured: true });
  const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(term)}&exchange=US&token=${FINNHUB_KEY}`);
  if (!r.ok) return json({ results: [], configured: true, error: 'provider_error' });
  const body = await r.json();
  const results = (body.result ?? [])
    .slice(0, 8)
    .map((x: { symbol: string; description: string; type: string }) => ({ symbol: x.symbol, name: x.description, type: x.type }));
  return json({ results, configured: true });
}

async function seriesFresh(series: string, maxAgeMs: number) {
  const { data } = await admin.from('market_meta').select('fetched_at').eq('series', series).maybeSingle();
  return data && Date.now() - new Date(data.fetched_at).getTime() < maxAgeMs;
}

async function storeSeries(series: string, rows: { obs_date: string; value: number }[]) {
  if (!rows.length) return;
  await admin.from('market_series').upsert(rows.map((r) => ({ series, ...r })));
  await admin.from('market_meta').upsert({ series, fetched_at: new Date().toISOString() });
}

async function refreshFred(seriesId: string, key: string, units?: string) {
  if (!FRED_KEY || (await seriesFresh(key, 12 * 3600_000))) return;
  const u = new URL('https://api.stlouisfed.org/fred/series/observations');
  u.searchParams.set('series_id', seriesId);
  u.searchParams.set('api_key', FRED_KEY);
  u.searchParams.set('file_type', 'json');
  u.searchParams.set('sort_order', 'desc');
  u.searchParams.set('limit', '30');
  if (units) u.searchParams.set('units', units);
  const r = await fetch(u);
  if (!r.ok) return;
  const body = await r.json();
  const rows = (body.observations ?? [])
    .filter((o: { value: string }) => o.value !== '.')
    .map((o: { date: string; value: string }) => ({ obs_date: o.date, value: Number(o.value) / 100 }));
  await storeSeries(key, rows);
}

async function refreshSpy() {
  if (!ALPHAVANTAGE_KEY || (await seriesFresh('SPY_M', 20 * 3600_000))) return;
  const r = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=SPY&apikey=${ALPHAVANTAGE_KEY}`);
  if (!r.ok) return;
  const body = await r.json();
  const ts = body['Monthly Adjusted Time Series'];
  if (!ts) return;
  const rows = Object.entries(ts).map(([d, v]) => ({ obs_date: d, value: Number((v as Record<string, string>)['5. adjusted close']) }));
  await storeSeries('SPY_M', rows);
}

async function latest(series: string) {
  const { data } = await admin.from('market_series').select('obs_date, value').eq('series', series).order('obs_date', { ascending: false }).limit(1).maybeSingle();
  return data ? { value: Number(data.value), date: data.obs_date } : null;
}

async function macro() {
  await Promise.allSettled([refreshFred('DTB3', 'DTB3'), refreshFred('CPIAUCSL', 'CPI_YOY', 'pc1'), refreshSpy()]);
  const [tbill, cpiYoY] = await Promise.all([latest('DTB3'), latest('CPI_YOY')]);
  const { data: spy } = await admin.from('market_series').select('obs_date, value').eq('series', 'SPY_M').order('obs_date');
  return json({
    tbill,
    cpiYoY,
    spy: (spy ?? []).map((r) => ({ date: r.obs_date, close: Number(r.value) })),
    configured: { fred: !!FRED_KEY, alphavantage: !!ALPHAVANTAGE_KEY },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth?.user) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  try {
    switch (body.action) {
      case 'quotes':
        return await quotes(Array.isArray(body.symbols) ? (body.symbols as string[]) : []);
      case 'search':
        return await search(String(body.q ?? ''));
      case 'macro':
        return await macro();
      case 'delete-account': {
        const { error: delErr } = await admin.auth.admin.deleteUser(auth.user.id);
        if (delErr) return json({ error: 'delete_failed' }, 500);
        return json({ ok: true });
      }
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});
