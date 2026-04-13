// api/results.js
// Vercel Serverless Function — proxies BSE India results calendar
// Runs server-side so CORS and auth headers are handled correctly

export default async function handler(req, res) {
  // Allow cross-origin calls from the PWA
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Date range: last 30 days → today
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);

  const fmt = (d) =>
    `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  const fromDate = fmt(from);
  const toDate   = fmt(today);

  // BSE headers — required to avoid 403
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.bseindia.com/',
    'Origin': 'https://www.bseindia.com',
  };

  try {
    // ── Step 1: Fetch BSE results calendar ──────────────────────────────
    const calUrl =
      `https://api.bseindia.com/BseIndiaAPI/api/ResultsCalendar/w` +
      `?fromdate=${encodeURIComponent(fromDate)}&todate=${encodeURIComponent(toDate)}`;

    const calResp = await fetch(calUrl, { headers });

    if (!calResp.ok) {
      // BSE API unreachable — return empty so app falls back to AI
      return res.status(200).json({ source: 'bse_unavailable', results: [] });
    }

    const calData = await calResp.json();

    // BSE returns Table[] with company entries
    const companies = (calData?.Table || []).slice(0, 20); // cap at 20

    if (companies.length === 0) {
      return res.status(200).json({ source: 'bse_empty', results: [] });
    }

    // ── Step 2: Fetch financial figures for each company ─────────────────
    const SECTOR_MAP = buildSectorMap();

    const results = await Promise.all(
      companies.map(async (co) => {
        const scripCode = co.SCRIP_CD || co.scrip_cd || '';
        const symbol    = co.NSE_SYMBOL || co.nse_symbol || co.SCRIP_CD || '';
        const name      = co.SCRIP_NAME || co.scrip_name || symbol;

        let pat = null, revenue = null, ebitda = null;

        try {
          const finUrl =
            `https://api.bseindia.com/BseIndiaAPI/api/FinancialResults/w` +
            `?scripcode=${scripCode}&period=Q&Type=C`;

          const finResp = await fetch(finUrl, { headers });
          if (finResp.ok) {
            const finData = await finResp.json();
            const latest  = finData?.Table?.[0] || finData?.Table1?.[0];
            if (latest) {
              pat     = latest.PROFIT_AFTER_TAX || latest.PAT || null;
              revenue = latest.NET_SALES        || latest.REVENUE || null;
              ebitda  = latest.PBDIT            || latest.EBITDA  || null;
            }
          }
        } catch (_) { /* financial detail fetch failed, still return basic entry */ }

        // Determine sector from symbol
        const sector = guessSector(symbol, SECTOR_MAP);

        // Format crore values
        const fmt = (v) => v != null ? `₹${(v/100).toFixed(0)} Cr` : '—';

        // YoY change placeholder (BSE doesn't give this in calendar API directly)
        const change = co.CHG_PCT != null ? parseFloat(co.CHG_PCT) : null;

        return {
          symbol:       symbol.trim(),
          name:         name.trim(),
          sector,
          quarter:      4,
          fy:           '2026',
          date:         formatBseDate(co.RESULT_DATE || co.result_date || toDate),
          revenue:      fmt(revenue),
          revenueGrowth: '—',
          pat:          fmt(pat),
          patGrowth:    change != null ? `${change > 0 ? '+' : ''}${change.toFixed(1)}%` : '—',
          ebitda:       fmt(ebitda),
          margin:       (revenue && ebitda) ? ((ebitda/revenue)*100).toFixed(1) : '—',
          change:       change ?? 0,
          status:       deriveStatus(change),
        };
      })
    );

    return res.status(200).json({
      source: 'bse_live',
      fetchedAt: new Date().toISOString(),
      results: results.filter(r => r.symbol),
    });

  } catch (err) {
    console.error('BSE proxy error:', err.message);
    return res.status(200).json({ source: 'error', error: err.message, results: [] });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBseDate(raw) {
  if (!raw) return '—';
  try {
    // BSE dates come as "2026-04-10T00:00:00" or "10/04/2026"
    const d = new Date(raw.includes('/') ? raw.split('/').reverse().join('-') : raw);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return raw; }
}

function deriveStatus(change) {
  if (change == null) return 'inline';
  if (change > 10)  return 'beat';
  if (change < -5)  return 'miss';
  return 'inline';
}

function guessSector(symbol, map) {
  const s = symbol.toUpperCase();
  for (const [sector, symbols] of Object.entries(map)) {
    if (symbols.some(k => s.includes(k))) return sector;
  }
  return 'Other';
}

function buildSectorMap() {
  return {
    Banking:  ['HDFC','ICICI','KOTAK','AXIS','SBI','BANK','BAJFIN','MUTH','SHRI','IIFL','PNBHOUSI'],
    IT:       ['TCS','INFY','WIPRO','HCL','TECH','LTIM','MPHASIS','COFORGE','PERSISTENT'],
    FMCG:     ['NESTLE','HUL','ITC','DABUR','MARICO','BRITANNIA','GODREJ','EMAMI','COLPAL'],
    Auto:     ['MARUTI','TATAMOTOR','BAJAJ','HERO','EICHER','MRF','BOSCH','MOTHERSON'],
    Pharma:   ['SUNPHARMA','DRREDDY','CIPLA','DIVISLAB','BIOCON','ALKEM','TORRENT','LUPIN'],
    Energy:   ['RELIANCE','ONGC','IOC','BPCL','GAIL','NTPC','POWERGRID','TATAPOWER','ADANIPOWER'],
    Metals:   ['TATA STEEL','HINDALCO','JSW','SAIL','VEDANTA','COALINDIA','NMDC','MOIL'],
    Infra:    ['LT','ADANI','ULTRACEMCO','AMBUJACEM','ACC','SHREECEM','DLF','GODREJPROP'],
  };
}
