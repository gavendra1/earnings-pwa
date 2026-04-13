import { useState, useEffect, useRef } from "react";

const SECTORS = ["All", "Banking", "IT", "FMCG", "Auto", "Pharma", "Energy", "Metals", "Infra"];
const FILTERS = ["All Results", "Beat Estimates", "Missed Estimates", "Record Profits"];
const AUTO_REFRESH_SECS = 3600;

function ResultCard({ result, index }) {
  const isPositive = result.change > 0;
  const isBeat = result.status === "beat";
  const isMiss = result.status === "miss";

  return (
    <div style={{
      background: "rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "16px", marginBottom: 12,
      border: "1px solid rgba(255,255,255,0.08)",
      animation: `slideUp 0.4s ease ${index * 0.06}s both`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: -0.3 }}>
              {result.symbol}
            </span>
            {isBeat && (
              <span style={{
                background: "rgba(48,209,88,0.2)", color: "#30d158",
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                border: "1px solid rgba(48,209,88,0.3)", letterSpacing: 0.5
              }}>✓ BEAT</span>
            )}
            {isMiss && (
              <span style={{
                background: "rgba(255,69,58,0.2)", color: "#ff453a",
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                border: "1px solid rgba(255,69,58,0.3)", letterSpacing: 0.5
              }}>✗ MISS</span>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
            {result.name} · {result.sector}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: isPositive ? "#30d158" : "#ff453a", fontWeight: 700, fontSize: 16 }}>
            {isPositive ? "▲" : "▼"} {Math.abs(result.change)}%
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>YoY PAT</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Revenue", value: result.revenue, sub: result.revenueGrowth },
          { label: "PAT", value: result.pat, sub: result.patGrowth },
          { label: "EBITDA", value: result.ebitda, sub: result.margin + "% Margin" },
        ].map(item => (
          <div key={item.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px" }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginBottom: 4, letterSpacing: 0.3 }}>
              {item.label}
            </div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{item.value}</div>
            <div style={{ color: item.sub?.includes("-") ? "#ff453a" : "#30d158", fontSize: 10, marginTop: 2 }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 10, paddingTop: 10,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.4)", fontSize: 11
      }}>
        📅 Q{result.quarter} FY{result.fy} · Declared {result.date}
      </div>
    </div>
  );
}

function LoadingCard({ index }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 16, marginBottom: 12,
      border: "1px solid rgba(255,255,255,0.06)",
      animation: `pulse 1.5s ease-in-out ${index * 0.1}s infinite`
    }}>
      <div style={{ height: 18, background: "rgba(255,255,255,0.08)", borderRadius: 6, width: "40%", marginBottom: 8 }} />
      <div style={{ height: 12, background: "rgba(255,255,255,0.05)", borderRadius: 4, width: "60%", marginBottom: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 60, background: "rgba(255,255,255,0.05)", borderRadius: 10 }} />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSector, setActiveSector] = useState("All");
  const [activeFilter, setActiveFilter] = useState("All Results");
  const [query, setQuery] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [fetched, setFetched] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(AUTO_REFRESH_SECS);
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [dataSource, setDataSource] = useState("");
  const scrollRef = useRef(null);
  const touchStartY = useRef(0);

  const parseResults = (text) => {
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      const start = clean.indexOf("[");
      const end = clean.lastIndexOf("]");
      if (start === -1) return [];
      return JSON.parse(clean.slice(start, end + 1));
    } catch { return []; }
  };

  const fetchResults = async (searchQuery = "") => {
    setLoading(true);
    setResults([]);
    setAiSummary("");
    setFetched(false);
    setDataSource("");

    let liveResults = [];

    // ── Step 1: Try BSE live data via Vercel serverless proxy ──────────
    if (!searchQuery) {
      try {
        const bseResp = await fetch("/api/results");
        const bseData = await bseResp.json();
        if (bseData.results?.length > 0) {
          liveResults = bseData.results;
          setDataSource("🟢 BSE Live");
        }
      } catch (_) { /* BSE unavailable, fall through to AI */ }
    }

    // ── Step 2: AI web search — for search queries OR BSE fallback ─────
    if (liveResults.length === 0) {
      try {
        const prompt = searchQuery
          ? `Search for Q4 FY2026 (Jan–Mar 2026) quarterly earnings for Indian stocks matching "${searchQuery}". Return JSON array of 6-8 results.`
          : `Search for Q4 FY2026 (January–March 2026) quarterly earnings results for major Indian listed companies declared this week. Return ONLY a JSON array for 8-10 companies:
[{
  "symbol": "RELIANCE",
  "name": "Reliance Industries Ltd",
  "sector": "Energy",
  "quarter": 4,
  "fy": "2026",
  "date": "Apr 25, 2026",
  "revenue": "₹2.51L Cr",
  "revenueGrowth": "+8.1%",
  "pat": "₹21,540 Cr",
  "patGrowth": "+8.4%",
  "ebitda": "₹48,600 Cr",
  "margin": "19.4",
  "change": 8.4,
  "status": "beat"
}]
Use real recent web data. status = "beat", "miss", or "inline". Return ONLY JSON array.`;

        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            system: "Financial data assistant. Search web for real Q4 FY2026 Indian earnings. Return valid JSON arrays. Today is April 2026.",
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await resp.json();
        const fullText = data.content?.map(b => b.text || "").filter(Boolean).join("\n") || "";
        const parsed = parseResults(fullText);
        if (parsed.length > 0) {
          liveResults = parsed;
          setDataSource("🤖 AI Web Search");
        }
      } catch (_) { /* AI also failed */ }
    }

    setResults(liveResults.length > 0 ? liveResults : FALLBACK_DATA);
    if (liveResults.length === 0) setDataSource("📦 Sample Data");

    // ── Step 3: AI summary (always) ────────────────────────────────────
    try {
      const summaryResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: "2-sentence summary of Q4 FY2026 Indian earnings season trends, key beats/misses, sector themes. Be specific. April 2026." }]
        })
      });
      const sd = await summaryResp.json();
      setAiSummary(sd.content?.[0]?.text || "");
    } catch (_) {}

    setFetched(true);
    setLastUpdated(new Date());
    setNextRefreshIn(AUTO_REFRESH_SECS);
    setLoading(false);
  };

  useEffect(() => {
    fetchResults();
    const autoTimer = setInterval(() => { fetchResults(); setNextRefreshIn(AUTO_REFRESH_SECS); }, AUTO_REFRESH_SECS * 1000);
    const countdownTimer = setInterval(() => setNextRefreshIn(p => p > 0 ? p - 1 : AUTO_REFRESH_SECS), 1000);
    return () => { clearInterval(autoTimer); clearInterval(countdownTimer); };
  }, []);

  const filtered = results.filter(r => {
    const sectorMatch = activeSector === "All" || r.sector === activeSector;
    const filterMatch =
      activeFilter === "All Results" ||
      (activeFilter === "Beat Estimates" && r.status === "beat") ||
      (activeFilter === "Missed Estimates" && r.status === "miss") ||
      (activeFilter === "Record Profits" && r.change > 20);
    const searchMatch = !query ||
      r.symbol?.toLowerCase().includes(query.toLowerCase()) ||
      r.name?.toLowerCase().includes(query.toLowerCase());
    return sectorMatch && filterMatch && searchMatch;
  });

  const beats = results.filter(r => r.status === "beat").length;
  const misses = results.filter(r => r.status === "miss").length;

  return (
    <div style={{
      height: "100dvh", width: "100%", display: "flex", flexDirection: "column",
      background: "linear-gradient(170deg, #0e1118 0%, #090c15 100%)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      color: "#fff", overflow: "hidden"
    }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        @keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: rgba(255,255,255,0.3); }
        input { outline: none; border: none; background: none; color: white; font-size: 16px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "16px 20px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>
              LIVE EARNINGS
            </div>
            <h1 style={{ margin: "3px 0 0", fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1 }}>
              Q4 Results · <span style={{ color: "#ffd60a" }}>FY 2026</span>
            </h1>
          </div>
          <button onClick={() => fetchResults()} style={{
            background: "rgba(255,214,10,0.15)", border: "1px solid rgba(255,214,10,0.3)",
            color: "#ffd60a", borderRadius: 14, padding: "8px 14px", fontSize: 13,
            fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6
          }}>
            {loading
              ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #ffd60a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              : "↻ Refresh"}
          </button>
        </div>

        {/* Stats */}
        {fetched && (
          <div style={{ display: "flex", gap: 10, marginTop: 14, animation: "slideUp 0.4s ease both" }}>
            {[
              { label: "Companies", value: results.length, color: "#fff" },
              { label: "Beat", value: beats, color: "#30d158" },
              { label: "Missed", value: misses, color: "#ff453a" },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: "rgba(255,255,255,0.05)",
                borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)"
              }}>
                <div style={{ color: s.color, fontWeight: 800, fontSize: 20 }}>{s.value}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Timestamps */}
        {fetched && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
            <span>🕐 {lastUpdated ? lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            <span>⟳ {Math.floor(nextRefreshIn / 60)}:{String(nextRefreshIn % 60).padStart(2, "0")}</span>
          </div>
        )}
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div style={{
          margin: "0 20px 10px", flexShrink: 0,
          background: "linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.05))",
          border: "1px solid rgba(255,214,10,0.2)", borderRadius: 14, padding: "11px 14px",
          animation: "slideUp 0.5s ease both"
        }}>
          <div style={{ color: "#ffd60a", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>✦ AI MARKET SUMMARY</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.5 }}>{aiSummary}</div>
        </div>
      )}

      {/* Search */}
      <div style={{ padding: "0 20px 10px", flexShrink: 0 }}>
        <div style={{
          background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.08)"
        }}>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search company or symbol..."
            style={{ flex: 1 }}
            onKeyDown={e => e.key === "Enter" && fetchResults(query)}
          />
          {query && (
            <button onClick={() => { setQuery(""); fetchResults(); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* Sector Pills */}
      <div style={{ padding: "0 20px 8px", overflowX: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
        {SECTORS.map(s => (
          <button key={s} onClick={() => setActiveSector(s)} style={{
            background: activeSector === s ? "#ffd60a" : "rgba(255,255,255,0.07)",
            color: activeSector === s ? "#000" : "rgba(255,255,255,0.6)",
            border: activeSector === s ? "none" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap"
          }}>{s}</button>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ padding: "0 20px 10px", overflowX: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setActiveFilter(f)} style={{
            background: activeFilter === f ? "rgba(255,255,255,0.12)" : "transparent",
            color: activeFilter === f ? "#fff" : "rgba(255,255,255,0.4)",
            border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12,
            fontWeight: activeFilter === f ? 700 : 500, cursor: "pointer",
            flexShrink: 0, whiteSpace: "nowrap"
          }}>{f}</button>
        ))}
      </div>

      {/* Scrollable Results */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}
        onTouchStart={e => { touchStartY.current = e.touches[0].clientY; }}
        onTouchMove={e => {
          const el = scrollRef.current;
          if (!el || el.scrollTop > 0) return;
          const dy = e.touches[0].clientY - touchStartY.current;
          if (dy > 0) { setIsPulling(true); setPullY(Math.min(dy * 0.4, 70)); }
        }}
        onTouchEnd={() => {
          if (pullY > 45 && !loading) fetchResults();
          setIsPulling(false); setPullY(0);
        }}
      >
        {/* Pull-to-refresh indicator */}
        {(isPulling || loading) && (
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            height: pullY || (loading ? 44 : 0), overflow: "hidden",
            transition: isPulling ? "none" : "height 0.3s ease",
            gap: 8, color: "rgba(255,255,255,0.5)", fontSize: 13
          }}>
            <span style={{
              display: "inline-block", width: 16, height: 16,
              border: "2px solid rgba(255,214,10,0.4)", borderTopColor: "#ffd60a",
              borderRadius: "50%", animation: "spin 0.7s linear infinite"
            }} />
            {pullY > 45 ? "Release to refresh" : loading ? "Updating..." : "Pull to refresh"}
          </div>
        )}

        <div style={{ padding: "0 20px 120px" }}>
          {loading
            ? [1, 2, 3, 4].map(i => <LoadingCard key={i} index={i} />)
            : filtered.length > 0
              ? filtered.map((r, i) => <ResultCard key={r.symbol + i} result={r} index={i} />)
              : (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.3)" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>No results found</div>
                  <div style={{ fontSize: 13 }}>Try a different filter or search</div>
                </div>
              )
          }
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{
        background: "rgba(10,10,15,0.97)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        paddingBottom: "env(safe-area-inset-bottom)",
        display: "grid", gridTemplateColumns: "repeat(4,1fr)", flexShrink: 0
      }}>
        {[
          { icon: "📊", label: "Results", active: true },
          { icon: "🔔", label: "Alerts", active: false },
          { icon: "📈", label: "Watchlist", active: false },
          { icon: "⚙️", label: "Settings", active: false },
        ].map(tab => (
          <div key={tab.label} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 3, padding: "10px 0", cursor: "pointer"
          }}>
            <span style={{ fontSize: 22 }}>{tab.icon}</span>
            <span style={{
              fontSize: 10, fontWeight: tab.active ? 700 : 500,
              color: tab.active ? "#ffd60a" : "rgba(255,255,255,0.35)"
            }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FALLBACK_DATA = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", quarter: 4, fy: "2026", date: "Apr 25, 2026", revenue: "₹2.51L Cr", revenueGrowth: "+8.1%", pat: "₹21,540 Cr", patGrowth: "+8.4%", ebitda: "₹48,600 Cr", margin: "19.4", change: 8.4, status: "beat" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking", quarter: 4, fy: "2026", date: "Apr 19, 2026", revenue: "₹89,340 Cr", revenueGrowth: "+16.1%", pat: "₹17,616 Cr", patGrowth: "+5.5%", ebitda: "₹23,400 Cr", margin: "26.2", change: 5.5, status: "inline" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT", quarter: 4, fy: "2026", date: "Apr 10, 2026", revenue: "₹67,432 Cr", revenueGrowth: "+5.3%", pat: "₹13,010 Cr", patGrowth: "+5.0%", ebitda: "₹17,980 Cr", margin: "26.7", change: 5.0, status: "beat" },
  { symbol: "INFY", name: "Infosys Ltd", sector: "IT", quarter: 4, fy: "2026", date: "Apr 17, 2026", revenue: "₹44,820 Cr", revenueGrowth: "+7.3%", pat: "₹7,288 Cr", patGrowth: "+7.1%", ebitda: "₹10,510 Cr", margin: "23.4", change: 7.1, status: "beat" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", sector: "Auto", quarter: 4, fy: "2026", date: "Apr 29, 2026", revenue: "₹41,200 Cr", revenueGrowth: "+6.3%", pat: "₹3,920 Cr", patGrowth: "+5.2%", ebitda: "₹5,480 Cr", margin: "13.3", change: 5.2, status: "inline" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma", quarter: 4, fy: "2026", date: "May 6, 2026", revenue: "₹15,240 Cr", revenueGrowth: "+9.6%", pat: "₹3,180 Cr", patGrowth: "+10.1%", ebitda: "₹4,380 Cr", margin: "28.7", change: 10.1, status: "beat" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", sector: "Banking", quarter: 4, fy: "2026", date: "Apr 28, 2026", revenue: "₹22,640 Cr", revenueGrowth: "+19.3%", pat: "₹4,980 Cr", patGrowth: "+15.6%", ebitda: "₹7,620 Cr", margin: "33.7", change: 15.6, status: "beat" },
  { symbol: "NESTLEIND", name: "Nestlé India Ltd", sector: "FMCG", quarter: 4, fy: "2026", date: "May 1, 2026", revenue: "₹4,920 Cr", revenueGrowth: "+2.9%", pat: "₹658 Cr", patGrowth: "-5.2%", ebitda: "₹1,060 Cr", margin: "21.5", change: -5.2, status: "miss" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", sector: "Energy", quarter: 4, fy: "2026", date: "May 9, 2026", revenue: "₹1.54L Cr", revenueGrowth: "-3.8%", pat: "₹8,920 Cr", patGrowth: "-9.7%", ebitda: "₹17,400 Cr", margin: "11.3", change: -9.7, status: "miss" },
];
