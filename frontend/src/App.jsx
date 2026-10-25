import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend, Cell,
} from "recharts";

// ─── Config ──────────────────────────────────────────────
const API_BASE = "http://localhost:4000/api";

// ─── Mock data for demo (used when backend is offline) ───
const MOCK_STATS = { totalBooks: 247, totalTracked: 18, withPrices: 14, avgPrice: 11.49, minPrice: 0, maxPrice: 34.99 };

const MOCK_SEARCH_RESULTS = [
  {
    title: "Dune", authors: ["Frank Herbert"], isbn: "9780441013593",
    thumbnail: "https://covers.openlibrary.org/b/id/8231856-M.jpg",
    publisher: "Ace Books", publishedDate: "1965", pageCount: 688,
    categories: ["Science Fiction"], sources: ["google_books", "open_library"],
    prices: [
      { source: "google_books", retailPrice: 9.99, listPrice: 12.99, currency: "USD", format: "ebook", available: true, buyLink: "#" },
      { source: "open_library", retailPrice: 0, listPrice: 0, currency: "USD", format: "ebook", available: true, buyLink: "#" },
    ],
    cheapestPrice: 0, cheapestSource: "open_library",
    savings: { hasSavings: true, amount: 9.99, percent: 100 },
  },
  {
    title: "Neuromancer", authors: ["William Gibson"], isbn: "9780441569595",
    thumbnail: "https://covers.openlibrary.org/b/id/12645114-M.jpg",
    publisher: "Ace Books", publishedDate: "1984", pageCount: 271,
    categories: ["Cyberpunk"], sources: ["google_books"],
    prices: [
      { source: "google_books", retailPrice: 7.99, listPrice: 9.99, currency: "USD", format: "ebook", available: true, buyLink: "#" },
    ],
    cheapestPrice: 7.99, cheapestSource: "google_books",
    savings: { hasSavings: false, amount: 0, percent: 0 },
  },
  {
    title: "Snow Crash", authors: ["Neal Stephenson"], isbn: "9780553380958",
    thumbnail: "https://covers.openlibrary.org/b/id/477433-M.jpg",
    publisher: "Bantam Books", publishedDate: "1992", pageCount: 440,
    categories: ["Science Fiction"], sources: ["google_books", "open_library"],
    prices: [
      { source: "google_books", retailPrice: 11.99, listPrice: 16.99, currency: "USD", format: "ebook", available: true, buyLink: "#" },
      { source: "open_library", retailPrice: 0, listPrice: 0, currency: "USD", format: "ebook", available: true, buyLink: "#" },
    ],
    cheapestPrice: 0, cheapestSource: "open_library",
    savings: { hasSavings: true, amount: 11.99, percent: 100 },
  },
  {
    title: "The Left Hand of Darkness", authors: ["Ursula K. Le Guin"], isbn: "9780441478125",
    thumbnail: "https://covers.openlibrary.org/b/id/6470448-M.jpg",
    publisher: "Ace Books", publishedDate: "1969", pageCount: 286,
    categories: ["Science Fiction"], sources: ["google_books"],
    prices: [
      { source: "google_books", retailPrice: 8.99, listPrice: 10.99, currency: "USD", format: "ebook", available: true, buyLink: "#" },
    ],
    cheapestPrice: 8.99, cheapestSource: "google_books",
    savings: { hasSavings: false, amount: 0, percent: 0 },
  },
  {
    title: "Foundation", authors: ["Isaac Asimov"], isbn: "9780553293357",
    thumbnail: "https://covers.openlibrary.org/b/id/6998964-M.jpg",
    publisher: "Bantam", publishedDate: "1951", pageCount: 244,
    categories: ["Science Fiction"], sources: ["google_books", "open_library"],
    prices: [
      { source: "google_books", retailPrice: 9.49, listPrice: 12.99, currency: "USD", format: "ebook", available: true, buyLink: "#" },
      { source: "open_library", retailPrice: 0, listPrice: 0, currency: "USD", format: "ebook", available: true, buyLink: "#" },
    ],
    cheapestPrice: 0, cheapestSource: "open_library",
    savings: { hasSavings: true, amount: 9.49, percent: 100 },
  },
];

const MOCK_TRACKED = [
  { _id: "t1", title: "Dune", authors: ["Frank Herbert"], cheapestPrice: 0, cheapestSource: "open_library", thumbnail: "https://covers.openlibrary.org/b/id/8231856-M.jpg", lastPriceCheck: "2026-04-25T10:00:00Z", prices: MOCK_SEARCH_RESULTS[0].prices, trackingEnabled: true },
  { _id: "t2", title: "Foundation", authors: ["Isaac Asimov"], cheapestPrice: 0, cheapestSource: "open_library", thumbnail: "https://covers.openlibrary.org/b/id/6998964-M.jpg", lastPriceCheck: "2026-04-25T09:30:00Z", prices: MOCK_SEARCH_RESULTS[4].prices, trackingEnabled: true },
  { _id: "t3", title: "Neuromancer", authors: ["William Gibson"], cheapestPrice: 7.99, cheapestSource: "google_books", thumbnail: "https://covers.openlibrary.org/b/id/12645114-M.jpg", lastPriceCheck: "2026-04-25T08:15:00Z", prices: MOCK_SEARCH_RESULTS[1].prices, trackingEnabled: true },
];

const MOCK_HISTORY_DATA = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (29 - i));
  return {
    date: d.toISOString().split("T")[0],
    google_books: +(9.99 + Math.sin(i * 0.3) * 2 + Math.random() * 0.5).toFixed(2),
    open_library: 0,
  };
});

// ─── Utility Hooks ───────────────────────────────────────
function useDemoMode() {
  const [isDemo, setIsDemo] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => { if (r.ok) setIsDemo(false); else setIsDemo(true); }).catch(() => setIsDemo(true)).finally(() => setChecked(true));
  }, []);
  return { isDemo, checked };
}

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ─── Source badge colors ────────────────────────────────
const SRC = {
  google_books: { label: "Google Books", color: "#4285F4", bg: "rgba(66,133,244,0.12)" },
  open_library: { label: "Open Library", color: "#E6A817", bg: "rgba(230,168,23,0.12)" },
  internet_archive: { label: "Internet Archive", color: "#D44", bg: "rgba(221,68,68,0.12)" },
};

// ─── Components ─────────────────────────────────────────

function SourceBadge({ source }) {
  const s = SRC[source] || { label: source, color: "#999", bg: "rgba(153,153,153,0.12)" };
  return (<span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: s.color, background: s.bg, border: `1px solid ${s.color}22`, fontFamily: "'DM Mono', monospace", textTransform: "uppercase" }}>{s.label}</span>);
}

function FormatBadge({ format }) {
  const colors = { ebook: "#00C9A7", paperback: "#FF6B6B", hardcover: "#845EC2", audiobook: "#FF9671", unknown: "#666" };
  const c = colors[format] || colors.unknown;
  return (<span style={{ padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, color: c, background: `${c}18`, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>{format}</span>);
}

function PriceTag({ price, isLowest, size = "md" }) {
  const isFree = price === 0;
  const sz = size === "lg" ? { fs: 28, lh: 1 } : size === "sm" ? { fs: 14, lh: 1.2 } : { fs: 20, lh: 1.1 };
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2, fontFamily: "'DM Mono', monospace", fontSize: sz.fs, fontWeight: 800, lineHeight: sz.lh, color: isFree ? "#00C9A7" : isLowest ? "#FFD93D" : "#E8E0D4", textShadow: isLowest ? "0 0 20px rgba(255,217,61,0.3)" : "none" }}>
      {isFree ? "FREE" : `$${price.toFixed(2)}`}
    </span>
  );
}

function SavingsPill({ savings }) {
  if (!savings?.hasSavings) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, color: "#1B1A17", background: "linear-gradient(135deg, #00C9A7, #00E4B8)", fontFamily: "'DM Mono', monospace", boxShadow: "0 2px 8px rgba(0,201,167,0.3)" }}>
      ▼ Save ${savings.amount.toFixed(2)} ({savings.percent}%)
    </span>
  );
}

function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{ background: "linear-gradient(145deg, #2A2520, #1F1B17)", borderRadius: 12, padding: "24px 20px", border: "1px solid #3A3530", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 12, right: 16, fontSize: 28, opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#8A8070", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: "#E8E0D4", fontFamily: "'Playfair Display', Georgia, serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6A6050", marginTop: 6, fontFamily: "'DM Mono', monospace" }}>{sub}</div>}
    </div>
  );
}

function SearchBar({ onSearch, loading }) {
  const [q, setQ] = useState("");
  const handle = (e) => { e.preventDefault(); if (q.trim().length >= 2) onSearch(q.trim()); };
  return (
    <form onSubmit={handle} style={{ display: "flex", gap: 12, width: "100%" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, author, or ISBN..."
          style={{ width: "100%", padding: "16px 20px 16px 48px", borderRadius: 12, border: "1px solid #3A3530", background: "#1F1B17", color: "#E8E0D4", fontSize: 16, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
          onFocus={(e) => e.target.style.borderColor = "#E6A817"}
          onBlur={(e) => e.target.style.borderColor = "#3A3530"}
        />
        <span style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", fontSize: 18, opacity: 0.4 }}>⌕</span>
      </div>
      <button type="submit" disabled={loading || q.trim().length < 2}
        style={{ padding: "16px 32px", borderRadius: 12, border: "none", background: loading ? "#3A3530" : "linear-gradient(135deg, #E6A817, #D4960F)", color: "#1B1A17", fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", transition: "transform 0.15s, box-shadow 0.15s", boxShadow: "0 4px 15px rgba(230,168,23,0.3)", letterSpacing: 0.3 }}
        onMouseEnter={(e) => { if (!loading) e.target.style.transform = "translateY(-1px)"; }}
        onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; }}
      >
        {loading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}

function BookCard({ book, onTrack, onSelect, tracked }) {
  const [hovering, setHovering] = useState(false);
  return (
    <div
      onClick={() => onSelect?.(book)}
      onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      style={{
        display: "grid", gridTemplateColumns: "80px 1fr auto", gap: 20, padding: 20,
        background: hovering ? "#252119" : "#1F1B17", borderRadius: 12,
        border: `1px solid ${hovering ? "#4A4035" : "#2E2A25"}`,
        cursor: "pointer", transition: "all 0.2s",
        transform: hovering ? "translateY(-2px)" : "none",
        boxShadow: hovering ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
      }}
    >
      <div style={{ width: 80, height: 110, borderRadius: 6, overflow: "hidden", background: "#2A2520", flexShrink: 0 }}>
        {book.thumbnail ? <img src={book.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, opacity: 0.3 }}>📖</div>}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#E8E0D4", fontFamily: "'Playfair Display', Georgia, serif", lineHeight: 1.3, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{book.title}</h3>
        <div style={{ fontSize: 13, color: "#8A8070", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>{(book.authors || []).join(", ") || "Unknown author"}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {(book.sources || []).map((s) => <SourceBadge key={s} source={s} />)}
          {(book.prices || []).map((p, i) => <FormatBadge key={i} format={p.format} />)}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {(book.prices || []).map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: "#15120F" }}>
              <span style={{ fontSize: 10, color: SRC[p.source]?.color || "#999", fontWeight: 600 }}>{SRC[p.source]?.label?.split(" ")[0] || p.source}</span>
              <PriceTag price={p.retailPrice} isLowest={p.retailPrice === book.cheapestPrice} size="sm" />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", minWidth: 100 }}>
        <div style={{ textAlign: "right" }}>
          {book.cheapestPrice != null && <PriceTag price={book.cheapestPrice} isLowest size="lg" />}
          <SavingsPill savings={book.savings} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onTrack?.(book); }}
          style={{
            padding: "8px 16px", borderRadius: 8, border: tracked ? "1px solid #E6A817" : "1px solid #3A3530",
            background: tracked ? "rgba(230,168,23,0.15)" : "transparent",
            color: tracked ? "#E6A817" : "#8A8070", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Mono', monospace", transition: "all 0.2s",
          }}
        >
          {tracked ? "✓ Tracking" : "+ Track"}
        </button>
      </div>
    </div>
  );
}

function PriceHistoryChart({ data, title }) {
  if (!data || data.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "#6A6050" }}>No price history yet. Tracking starts after enabling.</div>;
  return (
    <div style={{ background: "#1F1B17", borderRadius: 12, border: "1px solid #2E2A25", padding: 24 }}>
      <h3 style={{ margin: "0 0 20px", fontSize: 16, color: "#E8E0D4", fontFamily: "'Playfair Display', Georgia, serif" }}>{title || "Price History"}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="gGoogle" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4285F4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#4285F4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gOpenLib" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#E6A817" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#E6A817" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2E2A25" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6A6050" }} tickFormatter={(v) => v.slice(5)} stroke="#2E2A25" />
          <YAxis tick={{ fontSize: 10, fill: "#6A6050" }} stroke="#2E2A25" tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: "#2A2520", border: "1px solid #3A3530", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 12 }}
            labelStyle={{ color: "#E8E0D4" }}
            formatter={(val) => [`$${val.toFixed(2)}`, ""]}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'DM Mono', monospace" }} />
          <Area type="monotone" dataKey="google_books" stroke="#4285F4" fill="url(#gGoogle)" strokeWidth={2} name="Google Books" dot={false} />
          <Area type="monotone" dataKey="open_library" stroke="#E6A817" fill="url(#gOpenLib)" strokeWidth={2} name="Open Library" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BookDetailModal({ book, history, onClose }) {
  if (!book) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1B1A17", borderRadius: 16, border: "1px solid #2E2A25", maxWidth: 720, width: "100%", maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ width: 100, height: 140, borderRadius: 8, overflow: "hidden", background: "#2A2520", flexShrink: 0 }}>
                {book.thumbnail ? <img src={book.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, opacity: 0.3 }}>📖</div>}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontFamily: "'Playfair Display', Georgia, serif", color: "#E8E0D4", lineHeight: 1.3 }}>{book.title}</h2>
                <div style={{ fontSize: 14, color: "#8A8070", marginTop: 4 }}>{(book.authors || []).join(", ")}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {book.publisher && <span style={{ fontSize: 11, color: "#6A6050", padding: "3px 8px", background: "#252119", borderRadius: 4 }}>{book.publisher}</span>}
                  {book.publishedDate && <span style={{ fontSize: 11, color: "#6A6050", padding: "3px 8px", background: "#252119", borderRadius: 4 }}>{book.publishedDate}</span>}
                  {book.pageCount && <span style={{ fontSize: 11, color: "#6A6050", padding: "3px 8px", background: "#252119", borderRadius: 4 }}>{book.pageCount} pp</span>}
                  {book.isbn && <span style={{ fontSize: 11, color: "#6A6050", padding: "3px 8px", background: "#252119", borderRadius: 4 }}>ISBN {book.isbn}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#6A6050", fontSize: 24, cursor: "pointer", padding: 8 }}>✕</button>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: "#E6A817", marginBottom: 12, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Price Comparison</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
            {(book.prices || []).map((p, i) => (
              <div key={i} style={{ background: p.retailPrice === book.cheapestPrice ? "linear-gradient(145deg, #2A2520, #322A20)" : "#252119", borderRadius: 10, padding: 16, border: p.retailPrice === book.cheapestPrice ? "1px solid #E6A81744" : "1px solid #2E2A25", position: "relative" }}>
                {p.retailPrice === book.cheapestPrice && <div style={{ position: "absolute", top: -8, right: 12, padding: "2px 10px", borderRadius: 10, background: "#E6A817", color: "#1B1A17", fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>BEST PRICE</div>}
                <SourceBadge source={p.source} />
                <div style={{ marginTop: 12 }}><PriceTag price={p.retailPrice ?? 0} isLowest={p.retailPrice === book.cheapestPrice} size="lg" /></div>
                {p.listPrice != null && p.listPrice !== p.retailPrice && <div style={{ fontSize: 12, color: "#6A6050", textDecoration: "line-through", marginTop: 4 }}>${p.listPrice.toFixed(2)} list</div>}
                <div style={{ marginTop: 8 }}><FormatBadge format={p.format} /></div>
                {p.buyLink && p.buyLink !== "#" && <a href={p.buyLink} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 11, color: "#E6A817", textDecoration: "none" }}>Buy →</a>}
              </div>
            ))}
          </div>

          <PriceHistoryChart data={history} title={`${book.title} — 30 Day Price History`} />
        </div>
      </div>
    </div>
  );
}

function TrackedBookRow({ book, onSelect }) {
  const [hov, setHov] = useState(false);
  const ago = book.lastPriceCheck ? timeAgo(new Date(book.lastPriceCheck)) : "never";
  return (
    <div onClick={() => onSelect?.(book)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "grid", gridTemplateColumns: "44px 1fr 100px 80px 100px", alignItems: "center", gap: 16, padding: "12px 16px", background: hov ? "#252119" : "transparent", borderRadius: 8, cursor: "pointer", transition: "background 0.15s", borderBottom: "1px solid #1F1B1711" }}>
      <div style={{ width: 44, height: 58, borderRadius: 4, overflow: "hidden", background: "#2A2520" }}>
        {book.thumbnail ? <img src={book.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, opacity: 0.3 }}>📖</div>}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E0D4", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{book.title}</div>
        <div style={{ fontSize: 11, color: "#6A6050" }}>{(book.authors || []).join(", ")}</div>
      </div>
      <div>{book.cheapestPrice != null ? <PriceTag price={book.cheapestPrice} isLowest size="sm" /> : <span style={{ fontSize: 12, color: "#6A6050" }}>—</span>}</div>
      <div>{book.cheapestSource && <SourceBadge source={book.cheapestSource} />}</div>
      <div style={{ fontSize: 11, color: "#6A6050", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{ago}</div>
    </div>
  );
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Tabs ───────────────────────────────────────────────
const TABS = [
  { id: "search", label: "Search", icon: "⌕" },
  { id: "tracked", label: "Tracked", icon: "★" },
  { id: "drops", label: "Drops", icon: "▼" },
];

// ─── Main App ───────────────────────────────────────────
export default function App() {
  const { isDemo, checked } = useDemoMode();
  const [tab, setTab] = useState("search");
  const [stats, setStats] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [trackedBooks, setTrackedBooks] = useState([]);
  const [trackedIds, setTrackedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [drops, setDrops] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Load stats + tracked on mount
  useEffect(() => {
    if (!checked) return;
    if (isDemo) {
      setStats(MOCK_STATS);
      setTrackedBooks(MOCK_TRACKED);
      setTrackedIds(new Set(MOCK_TRACKED.map(b => b._id)));
    } else {
      apiFetch("/books/stats/overview").then(setStats).catch(() => setStats(MOCK_STATS));
      apiFetch("/books/tracked").then(d => {
        setTrackedBooks(d.books || []);
        setTrackedIds(new Set((d.books || []).map(b => b._id)));
      }).catch(() => {});
    }
  }, [isDemo, checked]);

  const handleSearch = useCallback(async (q) => {
    setLoading(true);
    setSearchQuery(q);
    try {
      if (isDemo) {
        await new Promise(r => setTimeout(r, 600));
        const filtered = MOCK_SEARCH_RESULTS.filter(b =>
          b.title.toLowerCase().includes(q.toLowerCase()) ||
          b.authors.some(a => a.toLowerCase().includes(q.toLowerCase()))
        );
        setSearchResults(filtered.length > 0 ? filtered : MOCK_SEARCH_RESULTS);
      } else {
        const data = await apiFetch(`/books/search?q=${encodeURIComponent(q)}&limit=15`);
        setSearchResults(data.results || []);
      }
    } catch {
      setSearchResults(MOCK_SEARCH_RESULTS);
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  const handleTrack = useCallback(async (book) => {
    if (isDemo) {
      setTrackedIds(prev => { const n = new Set(prev); n.add(book.isbn || book.title); return n; });
      setTrackedBooks(prev => [...prev, { ...book, _id: book.isbn || book.title, trackingEnabled: true, lastPriceCheck: new Date().toISOString() }]);
      return;
    }
    try {
      await fetch(`${API_BASE}/books/track`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(book),
      });
      setTrackedIds(prev => { const n = new Set(prev); n.add(book.isbn || book.title); return n; });
      const d = await apiFetch("/books/tracked");
      setTrackedBooks(d.books || []);
    } catch (e) { console.error(e); }
  }, [isDemo]);

  const handleSelectBook = useCallback(async (book) => {
    setSelectedBook(book);
    if (isDemo) {
      setHistoryData(MOCK_HISTORY_DATA);
    } else if (book._id) {
      try {
        const d = await apiFetch(`/history/${book._id}/compare?days=30`);
        setHistoryData(d.timeline || []);
      } catch { setHistoryData(MOCK_HISTORY_DATA); }
    } else {
      setHistoryData(MOCK_HISTORY_DATA);
    }
  }, [isDemo]);

  const loadDrops = useCallback(async () => {
    if (isDemo) {
      setDrops([
        { title: "Dune", source: "open_library", changePercent: -100, currentPrice: 0, thumbnail: MOCK_SEARCH_RESULTS[0].thumbnail },
        { title: "Snow Crash", source: "open_library", changePercent: -100, currentPrice: 0, thumbnail: MOCK_SEARCH_RESULTS[2].thumbnail },
      ]);
    } else {
      try {
        const d = await apiFetch("/history/alerts/drops?threshold=3");
        setDrops(d.drops || []);
      } catch { setDrops([]); }
    }
  }, [isDemo]);

  useEffect(() => { if (tab === "drops") loadDrops(); }, [tab, loadDrops]);

  if (!checked) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#141210", color: "#6A6050", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.5s infinite" }}>📚</div>Connecting…</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#141210", color: "#E8E0D4", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800;900&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #1B1A17; }
        ::-webkit-scrollbar-thumb { background: #3A3530; border-radius: 3px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* ─ Header ─ */}
      <header style={{ borderBottom: "1px solid #2E2A25", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(180deg, #1B1A17, #14121000)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, #E6A817, #D4960F)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 15px rgba(230,168,23,0.25)" }}>📚</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Playfair Display', Georgia, serif", color: "#E8E0D4", lineHeight: 1 }}>BookPipe</h1>
            <div style={{ fontSize: 10, color: "#6A6050", fontFamily: "'DM Mono', monospace", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>Price Intelligence Pipeline</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {isDemo && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: "rgba(230,168,23,0.12)", border: "1px solid #E6A81733" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#E6A817", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, color: "#E6A817", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>DEMO MODE</span>
            </div>
          )}
          <div style={{ fontSize: 11, color: "#6A6050", fontFamily: "'DM Mono', monospace" }}>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        </div>
      </header>

      {/* ─ Navigation ─ */}
      <nav style={{ display: "flex", gap: 4, padding: "12px 32px", borderBottom: "1px solid #1F1B17" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: tab === t.id ? "#2A2520" : "transparent",
              color: tab === t.id ? "#E6A817" : "#6A6050",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
            {t.id === "tracked" && trackedBooks.length > 0 && (
              <span style={{ padding: "1px 7px", borderRadius: 10, background: tab === t.id ? "#E6A81722" : "#2A2520", fontSize: 10, fontWeight: 700, color: tab === t.id ? "#E6A817" : "#6A6050" }}>{trackedBooks.length}</span>
            )}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px 60px" }}>
        {/* ─ Stats Row ─ */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 32, animation: "slideUp 0.4s ease" }}>
            <StatCard label="Total Books" value={stats.totalBooks} icon="📚" />
            <StatCard label="Tracking" value={stats.totalTracked} sub={`${stats.withPrices} with prices`} icon="★" />
            <StatCard label="Avg Price" value={`$${stats.avgPrice}`} sub={`$${stats.minPrice} – $${stats.maxPrice}`} icon="◎" />
            <StatCard label="Sources" value="2" sub="Google · Open Library" icon="⚡" />
          </div>
        )}

        {/* ─ Search Tab ─ */}
        {tab === "search" && (
          <div style={{ animation: "slideUp 0.3s ease" }}>
            <SearchBar onSearch={handleSearch} loading={loading} />
            {loading && (
              <div style={{ textAlign: "center", padding: 60, color: "#6A6050" }}>
                <div style={{ fontSize: 28, marginBottom: 12, animation: "pulse 1s infinite" }}>📡</div>
                Querying Google Books & Open Library…
              </div>
            )}
            {!loading && searchResults.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: "#6A6050", marginBottom: 12, fontFamily: "'DM Mono', monospace" }}>
                  {searchResults.length} results for "{searchQuery}"
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {searchResults.map((book, i) => (
                    <div key={i} style={{ animation: `slideUp ${0.2 + i * 0.08}s ease` }}>
                      <BookCard
                        book={book}
                        onTrack={handleTrack}
                        onSelect={handleSelectBook}
                        tracked={trackedIds.has(book.isbn || book.title)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!loading && searchResults.length === 0 && searchQuery && (
              <div style={{ textAlign: "center", padding: 60, color: "#6A6050" }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📭</div>
                No results found. Try a different query.
              </div>
            )}
            {!loading && searchResults.length === 0 && !searchQuery && (
              <div style={{ textAlign: "center", padding: 80, color: "#6A6050" }}>
                <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.3 }}>📖</div>
                <div style={{ fontSize: 18, fontFamily: "'Playfair Display', Georgia, serif", color: "#8A8070", marginBottom: 8 }}>Search for any book</div>
                <div style={{ fontSize: 13, maxWidth: 400, margin: "0 auto", lineHeight: 1.7 }}>
                  Compare prices across Google Books and Open Library. Track books to monitor price changes over time.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─ Tracked Tab ─ */}
        {tab === "tracked" && (
          <div style={{ animation: "slideUp 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontFamily: "'Playfair Display', Georgia, serif", color: "#E8E0D4" }}>Tracked Books</h2>
              <div style={{ fontSize: 11, color: "#6A6050", fontFamily: "'DM Mono', monospace" }}>
                Cron: every 6h · {trackedBooks.length} books
              </div>
            </div>
            {trackedBooks.length > 0 ? (
              <div style={{ background: "#1F1B17", borderRadius: 12, border: "1px solid #2E2A25", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 100px 80px 100px", gap: 16, padding: "12px 16px", borderBottom: "1px solid #2E2A25" }}>
                  {["", "Book", "Price", "Source", "Updated"].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "#6A6050", textTransform: "uppercase", letterSpacing: 1.2, fontFamily: "'DM Mono', monospace", textAlign: i === 4 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>
                {trackedBooks.map((book, i) => <TrackedBookRow key={book._id || i} book={book} onSelect={handleSelectBook} />)}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 80, color: "#6A6050" }}>
                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>★</div>
                <div style={{ fontSize: 16, fontFamily: "'Playfair Display', Georgia, serif", color: "#8A8070" }}>No books tracked yet</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Search and click "+ Track" to start monitoring prices.</div>
              </div>
            )}
          </div>
        )}

        {/* ─ Drops Tab ─ */}
        {tab === "drops" && (
          <div style={{ animation: "slideUp 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontFamily: "'Playfair Display', Georgia, serif", color: "#E8E0D4" }}>Price Drops</h2>
              <div style={{ fontSize: 11, color: "#6A6050", fontFamily: "'DM Mono', monospace" }}>threshold: 3%+</div>
            </div>
            {drops.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {drops.map((drop, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, background: "#1F1B17", borderRadius: 10, border: "1px solid #2E2A25" }}>
                    <div style={{ width: 48, height: 64, borderRadius: 6, overflow: "hidden", background: "#2A2520", flexShrink: 0 }}>
                      {drop.thumbnail ? <img src={drop.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3 }}>📖</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E0D4" }}>{drop.title}</div>
                      <SourceBadge source={drop.source} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#00C9A7", fontFamily: "'DM Mono', monospace" }}>{drop.changePercent}%</div>
                      {drop.currentPrice != null && <div style={{ fontSize: 12, color: "#6A6050" }}>now ${drop.currentPrice.toFixed(2)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 80, color: "#6A6050" }}>
                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>▼</div>
                <div style={{ fontSize: 16, fontFamily: "'Playfair Display', Georgia, serif", color: "#8A8070" }}>No recent price drops</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Track more books and check back after the cron job runs.</div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─ Detail Modal ─ */}
      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          history={historyData}
          onClose={() => { setSelectedBook(null); setHistoryData([]); }}
        />
      )}

      {/* ─ Footer ─ */}
      <footer style={{ borderTop: "1px solid #1F1B17", padding: "16px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#3A3530", fontFamily: "'DM Mono', monospace" }}>
          BookPipe v2.0 · Google Books API · Open Library API · MongoDB · Node.js Cron
        </div>
      </footer>
    </div>
  );
}
