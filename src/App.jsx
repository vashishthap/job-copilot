import { useState, useCallback, useEffect } from "react";

// ─── STORAGE ───────────────────────────────────────────────────────────────
const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

// ─── CANDIDATE PROFILE ─────────────────────────────────────────────────────
const EXP = `Nokia – Customer Technology Lead (2024–present): 10% YoY revenue growth, 25% efficiency gain, 40% client engagement increase. C-suite technology adviser to Telia, VodafoneThree, Indosat.
Nokia – Senior Programme Manager (2021–2024): Cloud and data capacity programmes, 15% latency reduction, 60% processing capability increase.
Nokia – Head of Cloud Core Network Build Services (2020–2021): 20% reliability improvement, EUR 2M annualised savings, 15% cost reduction.
Nokia – Lead Technical PM 5G (2018–2020): 5G deployment across multiple markets, 15% implementation cost reduction.
Nokia – Global Head of Services Process Framework (2016–2018): 30% efficiency improvement, pioneered RPA integration, basis for US Patent 11562313.
Ulticom – Head of Solution Sales India (2007–2008): 15% sales uplift.
Aricent/Capgemini – Product Manager (2006–2007): Established network engineering service line, 25% revenue increase.`;

const HIGHLIGHTS = `EUR 2M savings | 40% efficiency gains | US Patent 11562313 | MVNO Nation Live 2025 Keynote Speaker | Lean Six Sigma Black Belt | 28 years global telecoms and technology leadership`;

const QUICK_SEARCHES = [
  "Technology Director",
  "Programme Director",
  "Head of Transformation",
  "Sales Director Technology",
  "VP Technology",
  "Digital Director",
  "Head of Technology",
  "Managing Director",
];

const STATUSES = ["Saved", "Applied", "Interviewing", "Offer", "Rejected"];
const STATUS_STYLE = {
  Saved:        { color: "#64748B", bg: "#F1F5F9" },
  Applied:      { color: "#2563EB", bg: "#DBEAFE" },
  Interviewing: { color: "#D97706", bg: "#FEF3C7" },
  Offer:        { color: "#059669", bg: "#D1FAE5" },
  Rejected:     { color: "#DC2626", bg: "#FEE2E2" },
};

// ─── ADZUNA LIVE SEARCH ────────────────────────────────────────────────────
// Location keywords to strip from "what" and route to Adzuna's "where" param
const LOC_WORDS = new Set(["uk","london","manchester","birmingham","leeds","edinburgh","bristol","remote","hybrid","england","scotland","wales"]);

async function searchAdzuna(appId, appKey, query) {
  const words    = query.trim().split(/\s+/);
  const locWords = words.filter(w => LOC_WORDS.has(w.toLowerCase()));
  const kwWords  = words.filter(w => !LOC_WORDS.has(w.toLowerCase()));

  const what  = encodeURIComponent((kwWords.length ? kwWords : words).join(" "));
  const where = encodeURIComponent(locWords.length ? locWords.join(" ") : "uk");

  const buildUrl = (salaryMin) => {
    let u = `https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=10&what=${what}&where=${where}&sort_by=relevance&content-type=application/json`;
    if (salaryMin) u += `&salary_min=${salaryMin}`;
    return u;
  };

  const doFetch = async (url) => {
    const r = await fetch(url);
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("Adzuna keys rejected — check your App ID and App Key in Settings.");
      throw new Error(`Adzuna error ${r.status}. Please try again.`);
    }
    return r.json();
  };

  // Try with a broad salary floor first; fall back without if Adzuna returns nothing
  // (many senior roles don't advertise salary and are silently excluded by the filter)
  let data = await doFetch(buildUrl(80000));
  if (!data.results?.length) data = await doFetch(buildUrl(null));

  return (data.results || []).map((j, i) => ({
    id: i,
    title:     j.title || "Role",
    company:   j.company?.display_name || "Company",
    location:  j.location?.display_name || "UK",
    salaryRaw: j.salary_min || 0,
    salary:    j.salary_min && j.salary_max
                 ? `£${Math.round(j.salary_min / 1000)}k – £${Math.round(j.salary_max / 1000)}k`
                 : j.salary_min ? `£${Math.round(j.salary_min / 1000)}k+` : "Salary not listed",
    type:      j.contract_time === "full_time" ? "Full-time"
               : j.contract_time === "part_time" ? "Part-time"
               : j.contract_type === "contract" ? "Contract" : "Permanent",
    description: (j.description || "").replace(/<[^>]+>/g, "").trim(),
    summary:   (j.description || "").replace(/<[^>]+>/g, "").slice(0, 220).trim() + "…",
    url:       j.redirect_url || "",
  }));
}

// ─── CLAUDE API (text only, for CV/cover letter) ──────────────────────────
async function askClaude(apiKey, system, user, tokens = 1200, model = "claude-haiku-4-5-20251001") {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: tokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error("Invalid Anthropic API key — update it in Settings.");
    if (r.status === 429) throw new Error("Too many requests — wait a moment and try again.");
    throw new Error(e?.error?.message || `API error ${r.status}`);
  }
  const raw = await r.text();
  let d;
  try { d = JSON.parse(raw); } catch {
    const m = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
    throw new Error("Response error — please try again.");
  }
  return (d.content?.[0]?.text || "").trim();
}

// ─── ICONS ─────────────────────────────────────────────────────────────────
function Ic({ n, s = 18 }) {
  const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    search:  <svg {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
    file:    <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    mail:    <svg {...p}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>,
    chart:   <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    plus:    <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    trash:   <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
    star:    <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    check:   <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>,
    key:     <svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
    copy:    <svg {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
    eye:     <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    eyeoff:  <svg {...p}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    cog:      <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    download: <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    link:     <svg {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    linkedin: <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  };
  return icons[n] || null;
}

// ─── GLOBAL STYLES ─────────────────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
      :root {
        --bg: #F0F4FF; --surface: #FFFFFF; --card: #FFFFFF;
        --border: #D8E2F8; --border2: #B8C9F0;
        --blue: #2563EB; --blue-lt: #EEF3FF; --blue-mid: #DBEAFE;
        --text: #0F172A; --text2: #334155; --muted: #64748B; --faint: #94A3B8;
        --green: #059669; --green-lt: #ECFDF5;
        --amber: #D97706; --amber-lt: #FFFBEB;
        --red: #DC2626; --red-lt: #FEF2F2;
        --shadow: 0 1px 3px rgba(37,99,235,0.08), 0 4px 16px rgba(37,99,235,0.06);
        --shadow-lg: 0 4px 6px rgba(37,99,235,0.05), 0 10px 40px rgba(37,99,235,0.12);
      }
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: var(--bg); font-family: 'Outfit', sans-serif; color: var(--text); -webkit-font-smoothing: antialiased; }
      @keyframes spin   { to { transform: rotate(360deg); } }
      @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      ::-webkit-scrollbar { width: 5px; }
      ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }
      button { cursor: pointer; font-family: inherit; }
      textarea, input, select { font-family: inherit; }
      textarea { resize: vertical; }
      input:focus, textarea:focus { outline: none; border-color: var(--blue) !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.12) !important; }
      a { color: var(--blue); }
      .card-hover { transition: box-shadow .18s, transform .18s, border-color .18s; }
      .card-hover:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); border-color: var(--border2) !important; }
      .chip:hover { background: var(--blue-mid) !important; color: var(--blue) !important; border-color: var(--border2) !important; }
      .btn-blue { background: linear-gradient(135deg,#2563EB,#1D4ED8); color:#fff; border:none; font-family:inherit; font-weight:600; transition: box-shadow .18s, transform .15s; cursor:pointer; }
      .btn-blue:hover:not(:disabled) { box-shadow: 0 4px 20px rgba(37,99,235,0.4); transform: translateY(-1px); }
      .btn-blue:disabled { opacity:0.5; cursor:not-allowed; }
      .btn-green { background: linear-gradient(135deg,#059669,#047857); color:#fff; border:none; font-family:inherit; font-weight:600; transition: box-shadow .18s, transform .15s; cursor:pointer; }
      .btn-green:hover:not(:disabled) { box-shadow: 0 4px 20px rgba(5,150,105,0.4); transform: translateY(-1px); }
      .btn-outline { background:var(--surface); color:var(--text2); border:1.5px solid var(--border); font-family:inherit; transition:border-color .15s,background .15s; cursor:pointer; }
      .btn-outline:hover { border-color:var(--border2); background:var(--blue-lt); }
      .tab-btn { border:none; background:transparent; font-family:inherit; cursor:pointer; transition:color .15s; }
      .tab-btn:hover { color:var(--blue) !important; }
    `}</style>
  );
}

// ─── SHARED UI ─────────────────────────────────────────────────────────────
const Lbl = ({ t }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 7 }}>{t}</div>
);

function Err({ msg }) {
  if (!msg) return null;
  return <div style={{ background: "var(--red-lt)", border: "1.5px solid #FCA5A5", borderRadius: 10, padding: "11px 15px", color: "var(--red)", fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>⚠️ {msg}</div>;
}

function Spin({ msg = "Working…" }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 0", color: "var(--muted)" }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--blue-mid)", borderTopColor: "var(--blue)", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 14px" }} />
      <div style={{ fontSize: 14 }}>{msg}</div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}
      className="btn-outline" style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
      <Ic n={done ? "check" : "copy"} s={13} />{done ? "Copied!" : "Copy"}
    </button>
  );
}

function BigBtn({ label, icon, onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled} className="btn-blue"
      style={{ marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 11, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {loading
        ? <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />Working…</>
        : <><Ic n={icon} s={16} />{label}</>}
    </button>
  );
}

function OutputBox({ text, ph, mh = 340 }) {
  return (
    <div style={{ minHeight: mh, maxHeight: 640, padding: "15px 17px", background: "var(--blue-lt)", border: "1.5px solid var(--border)", borderRadius: 12, color: "var(--text2)", fontSize: 13, lineHeight: 1.85, whiteSpace: "pre-wrap", overflowY: "auto" }}>
      {text || <span style={{ color: "var(--faint)" }}>{ph}</span>}
    </div>
  );
}

// ─── DOWNLOAD HELPERS ──────────────────────────────────────────────────────
function cleanSpecialChars(s) {
  return s
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes → straight
    .replace(/[\u201C\u201D]/g, '"')   // smart double quotes → straight
    .replace(/\u2013/g, "-")           // en dash → hyphen
    .replace(/\u2014/g, "-")           // em dash → hyphen
    .replace(/\u2026/g, "...")         // ellipsis → three dots
    .replace(/\u00A0/g, " ");          // non-breaking space → regular
}

function downloadAsDoc(text, filename) {
  const esc = s => cleanSpecialChars(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text.split("\n").map(l => {
    const t = l.trim();
    if (!t) return `<p style="margin:0 0 4pt;">&nbsp;</p>`;
    if (/^━+$/.test(t)) return `<p style="margin:2pt 0;border-bottom:1pt solid #2563EB;">&nbsp;</p>`;
    if (t === "PRASHANT VASHISHTHA") return `<p style="margin:0 0 4pt;font-family:Calibri,Arial;font-size:18pt;font-weight:bold;color:#1E40AF;">${esc(t)}</p>`;
    if (t === t.toUpperCase() && t.length > 3 && !/^[━\-•]/.test(t) && !/←/.test(t))
      return `<p style="margin:8pt 0 3pt;font-family:Calibri,Arial;font-size:11pt;font-weight:bold;color:#1E40AF;letter-spacing:.04em;">${esc(t)}</p>`;
    if (t.startsWith("- ") || t.startsWith("• "))
      return `<p style="margin:0 0 4pt;font-family:Calibri,Arial;font-size:11pt;padding-left:14pt;">${esc(t)}</p>`;
    if (t.includes(" | ") && !t.includes("@"))
      return `<p style="margin:6pt 0 2pt;font-family:Calibri,Arial;font-size:11pt;font-weight:bold;">${esc(t)}</p>`;
    return `<p style="margin:0 0 4pt;font-family:Calibri,Arial;font-size:11pt;">${esc(t)}</p>`;
  }).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"/></head><body style="margin:64pt 60pt;">${lines}</body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename + ".doc";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadAsPDF(text, title) {
  const esc = s => cleanSpecialChars(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text.split("\n").map(l => {
    const t = l.trim();
    if (!t) return `<p class="gap">&nbsp;</p>`;
    if (/^━+$/.test(t)) return `<hr class="sep"/>`;
    if (t === "PRASHANT VASHISHTHA") return `<p class="name">${esc(t)}</p>`;
    if (t === t.toUpperCase() && t.length > 3 && !/^[━\-•]/.test(t) && !/←/.test(t)) return `<p class="hdr">${esc(t)}</p>`;
    if (t.startsWith("- ") || t.startsWith("• ")) return `<p class="bul">${esc(t)}</p>`;
    if (t.includes(" | ") && !t.includes("@")) return `<p class="role">${esc(t)}</p>`;
    return `<p class="txt">${esc(t)}</p>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><title>${esc(title)}</title><style>
    @media print { @page { margin: 20mm 18mm; } }
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.55; padding: 28px; max-width: 720px; margin: 0 auto; color: #111; }
    p { margin: 0; }
    .name { font-size: 20pt; font-weight: 700; color: #1E40AF; margin-bottom: 4px; }
    .hdr  { font-size: 10pt; font-weight: 700; color: #1E40AF; letter-spacing: .06em; margin: 10px 0 2px; }
    .role { font-weight: 700; margin: 6px 0 2px; }
    .bul  { padding-left: 14px; margin-bottom: 3px; }
    .txt  { margin-bottom: 3px; }
    .gap  { margin-bottom: 4px; }
    .sep  { border: none; border-top: 1px solid #2563EB; margin: 2px 0; }
  </style></head><body>${lines}
  <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 400); }<\/script>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// ─── DOWNLOAD ACTION BAR ────────────────────────────────────────────────────
function DownloadBar({ text, docFilename, pdfTitle, applyUrl, onCoverLetter }) {
  if (!text) return null;
  return (
    <div style={{ marginTop: 14, padding: "14px 16px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center", boxShadow: "var(--shadow)" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginRight: 2 }}>Save as:</span>
      <button onClick={() => downloadAsDoc(text, docFilename)} className="btn-outline"
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
        <Ic n="download" s={13} /> .doc (Word)
      </button>
      <button onClick={() => downloadAsPDF(text, pdfTitle)} className="btn-outline"
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
        <Ic n="download" s={13} /> PDF
      </button>
      <CopyBtn text={text} />
      {applyUrl && (
        <a href={applyUrl} target="_blank" rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "var(--green-lt)", color: "var(--green)", border: "1.5px solid #A7F3D0", textDecoration: "none", marginLeft: "auto" }}>
          <Ic n="link" s={13} /> Apply Now ↗
        </a>
      )}
      {onCoverLetter && (
        <button onClick={onCoverLetter} className="btn-green"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 12 }}>
          <Ic n="mail" s={13} /> Cover Letter →
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP SCREEN — collects Anthropic key + Adzuna App ID + Adzuna App Key
// ═══════════════════════════════════════════════════════════════════════════
function Setup({ existing, existingAzId, existingAzKey, onSave, isUpdate, onCancel, storageErr }) {
  const [key,    setKey]    = useState(existing || "");
  const [azId,   setAzId]   = useState(existingAzId || "");
  const [azKey,  setAzKey]  = useState(existingAzKey || "");
  const [showKey, setShowKey] = useState(false);
  const [err,    setErr]    = useState("");
  const [ok,     setOk]     = useState(false);

  // Sync Adzuna fields whenever parent passes updated stored values (e.g. Settings reopened)
  useEffect(() => { setAzId(existingAzId || ""); }, [existingAzId]);
  useEffect(() => { setAzKey(existingAzKey || ""); }, [existingAzKey]);

  const save = () => {
    const k = key.trim();
    if (!k) { setErr("Please enter your Anthropic API key."); return; }
    if (!k.startsWith("sk-ant-")) { setErr("Anthropic keys start with sk-ant- — make sure you copied the full key."); return; }
    if (k.length < 40) { setErr("That key looks too short — make sure you copied all of it."); return; }
    setErr("");
    setOk(true);
    // Capture current values immediately to avoid stale closure in setTimeout
    const aid = azId.trim();
    const akey = azKey.trim();
    setTimeout(() => onSave({ anthropic: k, azId: aid, azKey: akey }), 500);
  };

  const inputStyle = { width: "100%", padding: "11px 13px", background: "#F8FAFF", border: "1.5px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none" };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#E8EFFE 0%,#F0F4FF 50%,#EEF3FF 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Styles />
      <div style={{ width: "100%", maxWidth: 540, background: "#fff", borderRadius: 22, boxShadow: "0 8px 60px rgba(37,99,235,0.18)", overflow: "hidden", border: "1px solid var(--border)" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#1E40AF,#2563EB,#3B5BDB)", padding: "28px 32px" }}>
          <div style={{ width: 44, height: 44, background: "rgba(255,255,255,.2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Ic n="star" s={22} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-.3px", marginBottom: 4 }}>Job Search Copilot</div>
          <div style={{ color: "rgba(255,255,255,.75)", fontSize: 13 }}>Prashant Vashishtha · Senior Executive Edition</div>
        </div>

        <div style={{ padding: "28px 32px" }}>

          {/* ── KEY 1: Anthropic ── */}
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, minWidth: 28, background: "var(--blue)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 800 }}>1</div>
              <div>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>Anthropic API Key</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Powers CV tailoring &amp; cover letters — <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a></div>
              </div>
            </div>
            <div style={{ background: "var(--blue-lt)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 13px", marginBottom: 10, fontSize: 12, color: "var(--text2)", lineHeight: 1.65 }}>
              Sign up free → click <strong>API Keys</strong> → <strong>Create Key</strong> → copy it. Then add £5 credit under Billing (pennies per use).
            </div>
            <div style={{ position: "relative" }}>
              <input type={showKey ? "text" : "password"} value={key} onChange={e => { setKey(e.target.value); setErr(""); }}
                placeholder="sk-ant-api03-…" style={{ ...inputStyle, paddingRight: 44 }} />
              <button onClick={() => setShowKey(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--faint)", cursor: "pointer" }}>
                <Ic n={showKey ? "eyeoff" : "eye"} s={17} />
              </button>
            </div>
          </div>

          {/* ── KEY 2 & 3: Adzuna ── */}
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, minWidth: 28, background: "var(--blue)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 800 }}>2</div>
              <div>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>Adzuna API Keys &nbsp;<span style={{ fontWeight: 500, color: "var(--green)", fontSize: 12 }}>FREE — no credit card</span></div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Powers live job search (Reed, Indeed, Totaljobs…) — <a href="https://developer.adzuna.com" target="_blank" rel="noreferrer">developer.adzuna.com</a></div>
              </div>
            </div>
            <div style={{ background: "var(--blue-lt)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 13px", marginBottom: 10, fontSize: 12, color: "var(--text2)", lineHeight: 1.65 }}>
              Register free at <a href="https://developer.adzuna.com" target="_blank" rel="noreferrer">developer.adzuna.com</a> → log in → click <strong>Dashboard</strong> → copy your <strong>App ID</strong> and <strong>App Key</strong>.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <Lbl t="Adzuna App ID" />
                <input type="text" value={azId} onChange={e => setAzId(e.target.value)} placeholder="e.g. a1b2c3d4" style={inputStyle} />
                {existingAzId && !azId && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Previously saved — type to replace</div>}
                {azId && <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>✓ App ID entered</div>}
              </div>
              <div>
                <Lbl t="Adzuna App Key" />
                <input type="text" value={azKey} onChange={e => setAzKey(e.target.value)} placeholder="e.g. e5f6g7h8i9…" style={inputStyle} />
                {existingAzKey && !azKey && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Previously saved — type to replace</div>}
                {azKey && <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>✓ App Key entered</div>}
              </div>
            </div>
            <div style={{ marginTop: 7, fontSize: 11, color: "var(--muted)" }}>
              You can skip Adzuna now and add it later via ⚙ Settings. CV tools work without it.
            </div>
          </div>

          {err && <div style={{ background: "var(--red-lt)", border: "1px solid #FCA5A5", borderRadius: 9, padding: "10px 13px", color: "var(--red)", fontSize: 13, marginBottom: 14 }}>⚠️ {err}</div>}
          {storageErr && <div style={{ background: "var(--red-lt)", border: "1px solid #FCA5A5", borderRadius: 9, padding: "10px 13px", color: "var(--red)", fontSize: 13, marginBottom: 14 }}>⚠️ {storageErr}</div>}
          {ok  && <div style={{ background: "var(--green-lt)", border: "1px solid #6EE7B7", borderRadius: 9, padding: "10px 13px", color: "var(--green)", fontSize: 13, marginBottom: 14 }}>✓ Saved! Launching…</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={save} disabled={!key.trim() || ok} className="btn-blue"
              style={{ flex: 1, padding: "12px 0", borderRadius: 11, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Ic n="key" s={16} />{isUpdate ? "Save Changes" : "Save & Launch"}
            </button>
            {isUpdate && <button onClick={onCancel} className="btn-outline" style={{ padding: "12px 18px", borderRadius: 11, fontSize: 14 }}>Cancel</button>}
          </div>
          <p style={{ marginTop: 12, fontSize: 11, color: "var(--faint)", textAlign: "center" }}>All keys stored in your browser only — never sent anywhere except the respective APIs.</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [apiKey,    setApiKey]    = useState(() => LS.get("cpk",   ""));
  const [adzunaId,  setAdzunaId]  = useState(() => LS.get("azid",  ""));
  const [adzunaKey, setAdzunaKey] = useState(() => LS.get("azkey", ""));
  const [ready,     setReady]     = useState(() => !!LS.get("cpk", ""));
  const [showSett,     setShowSett]     = useState(false);
  const [tab,          setTab]          = useState("search");
  const [apps,         setApps]         = useState(() => LS.get("cpa", []));
  const [coverPrefill, setCoverPrefill] = useState(null);

  const [settErr, setSettErr] = useState("");

  const saveKeys = ({ anthropic, azId, azKey }) => {
    const ok1 = LS.set("cpk",   anthropic);
    const ok2 = LS.set("azid",  azId);
    const ok3 = LS.set("azkey", azKey);
    if (!ok1 || !ok2 || !ok3) {
      setSettErr("Failed to save keys — browser storage may be full. Try clearing site data and retrying.");
      return;
    }
    setSettErr("");
    setApiKey(anthropic);
    setAdzunaId(azId);
    setAdzunaKey(azKey);
    setReady(true); setShowSett(false);
  };

  const updApps = useCallback(next => { setApps(next); LS.set("cpa", next); }, []);

  const addApp = useCallback(job => {
    setApps(prev => {
      if (prev.find(a => a.title === job.title && a.company === job.company)) return prev;
      const next = [{ ...job, id: Date.now(), status: "Saved", dateAdded: new Date().toLocaleDateString("en-GB"), notes: "" }, ...prev];
      LS.set("cpa", next);
      return next;
    });
    setTab("tracker");
  }, []);

  const openCoverWithJob = useCallback(job => {
    setCoverPrefill({ jd: job.description || "", company: job.company || "", role: job.title || "", url: job.url || "" });
    setTab("cover");
  }, []);

  if (!ready || showSett) {
    return <Setup existing={apiKey} existingAzId={adzunaId} existingAzKey={adzunaKey} onSave={saveKeys} isUpdate={showSett} onCancel={() => setShowSett(false)} storageErr={settErr} />;
  }

  const tabs = [
    { id: "search",  label: "Find Live Jobs",              icon: "search" },
    { id: "tailor",  label: "Tailor CV",                   icon: "file"   },
    { id: "cover",   label: "Cover Letter",                icon: "mail"   },
    { id: "tracker", label: `Tracker (${apps.length})`,    icon: "chart"  },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Styles />

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#1E40AF,#2563EB,#3B5BDB)", boxShadow: "0 2px 20px rgba(37,99,235,0.35)" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, background: "rgba(255,255,255,.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ic n="star" s={18} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", letterSpacing: "-.2px" }}>Job Search Copilot</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)" }}>Prashant Vashishtha · Senior Executive</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.15)", borderRadius: 20, padding: "5px 13px", border: "1px solid rgba(255,255,255,.2)" }}>
              <div style={{ width: 7, height: 7, background: "#4ADE80", borderRadius: "50%", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.9)", fontWeight: 500 }}>{apps.length} tracked</span>
            </div>
            <button onClick={() => setShowSett(true)} style={{ width: 34, height: 34, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 9, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Ic n="cog" s={15} />
            </button>
          </div>
        </div>
      </div>

      {/* PROFILE STRIP */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", padding: "0 24px", display: "flex", gap: 22, alignItems: "center", height: 40, flexWrap: "wrap" }}>
          {[["Min Salary","£130,000+",true],["Availability","Negotiable",false],["Targets","Director · VP · Sales · Consulting",false],["Locations","UK · Europe · Global · Remote",false]].map(([l,v,hi]) => (
            <div key={l} style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em" }}>{l}:</span>
              <span style={{ fontSize: 12, color: hi ? "var(--blue)" : "var(--text2)", fontWeight: hi ? 700 : 400 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid var(--border)" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", padding: "0 24px", display: "flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="tab-btn"
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "13px 18px", color: tab === t.id ? "var(--blue)" : "var(--muted)", borderBottom: tab === t.id ? "2.5px solid var(--blue)" : "2.5px solid transparent", fontSize: 13, fontWeight: tab === t.id ? 700 : 500 }}>
              <Ic n={t.icon} s={14} />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth: 1020, margin: "0 auto", padding: "28px 24px" }}>
        {tab === "search"  && <SearchTab  adzunaId={adzunaId} adzunaKey={adzunaKey} onSave={addApp} onOpenSettings={() => setShowSett(true)} />}
        {tab === "tailor"  && <TailorTab  apiKey={apiKey} apps={apps} onOpenCover={openCoverWithJob} />}
        {tab === "cover"   && <CoverTab   apiKey={apiKey} prefill={coverPrefill} apps={apps} />}
        {tab === "tracker" && <TrackerTab apps={apps} onUpdate={updApps} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIND LIVE JOBS TAB
// ═══════════════════════════════════════════════════════════════════════════
function SearchTab({ adzunaId, adzunaKey, onSave, onOpenSettings }) {
  const [query,    setQuery]    = useState("");
  const [jobs,     setJobs]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saved,    setSaved]    = useState({});
  const [err,      setErr]      = useState("");
  const [sortBy,   setSortBy]   = useState("relevance");
  const [workType, setWorkType] = useState("All");
  const hasKeys = adzunaId && adzunaKey;

  const detectWorkType = (job) => {
    const text = (job.title + " " + job.location + " " + (job.description || "")).toLowerCase();
    if (text.includes("remote")) return "Remote";
    if (text.includes("hybrid")) return "Hybrid";
    return "On-site";
  };

  const search = async (q) => {
    const sq = (q || query).trim();
    if (!sq || !hasKeys) return;
    setLoading(true); setJobs([]); setErr(""); setWorkType("All"); setSortBy("relevance");
    try {
      const results = await searchAdzuna(adzunaId, adzunaKey, sq);
      if (results.length === 0) throw new Error("No results found — try shorter or broader terms e.g. 'Transformation Director' or 'Technology VP'.");
      setJobs(results);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  let displayed = [...jobs];
  if (workType !== "All") displayed = displayed.filter(j => detectWorkType(j) === workType);
  if (sortBy === "salary_desc") displayed.sort((a, b) => b.salaryRaw - a.salaryRaw);
  if (sortBy === "salary_asc")  displayed.sort((a, b) => a.salaryRaw - b.salaryRaw);

  // No Adzuna keys yet — show setup prompt
  if (!hasKeys) return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 20, letterSpacing: "-.4px" }}>Find Live Jobs</h2>
      <div style={{ background: "var(--amber-lt)", border: "1.5px solid #FDE68A", borderRadius: 16, padding: "28px 32px", maxWidth: 560 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔑</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Adzuna keys needed for live search</div>
        <p style={{ color: "var(--text2)", fontSize: 14, lineHeight: 1.75, marginBottom: 20 }}>
          Live job search uses <strong>Adzuna</strong> — a free API that searches millions of real UK listings from Reed, Indeed, Totaljobs, CV-Library and more.
        </p>
        <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14, marginBottom: 12 }}>Get your free Adzuna keys in 2 minutes:</div>
          {[
            <span key="1">Go to <a href="https://developer.adzuna.com" target="_blank" rel="noreferrer">developer.adzuna.com</a> → click <strong>Register</strong></span>,
            <span key="2">Fill in name + email — completely free, no credit card</span>,
            <span key="3">Log in → click <strong>Dashboard</strong> → copy <strong>App ID</strong> and <strong>App Key</strong></span>,
            <span key="4">Click <strong>⚙ Settings</strong> (top right) and paste them in</span>,
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 9, alignItems: "flex-start" }}>
              <div style={{ width: 24, height: 24, minWidth: 24, background: "var(--blue)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 700 }}>{i + 1}</div>
              <span style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6 }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Adzuna is free forever for personal use — no subscription, no expiry.</div>
        <button onClick={onOpenSettings} className="btn-blue"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 11, fontSize: 14, border: "none" }}>
          <Ic n="cog" s={16} />Configure Adzuna Keys Now
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 6, letterSpacing: "-.4px" }}>Find Live Jobs</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Real-time listings from Reed, Indeed, Totaljobs and more.</span>
          <span style={{ padding: "3px 11px", background: "var(--green-lt)", color: "var(--green)", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid #A7F3D0" }}>£130k+ filtered</span>
          <span style={{ padding: "3px 11px", background: "var(--blue-lt)", color: "var(--blue)", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid var(--border)" }}>Live market</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
          placeholder="e.g. Digital Transformation Director, Technology VP, Programme Director…"
          style={{ flex: 1, padding: "11px 15px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 11, color: "var(--text)", fontSize: 14, outline: "none", boxShadow: "var(--shadow)" }} />
        <button onClick={() => search()} className="btn-blue" style={{ padding: "11px 22px", borderRadius: 11, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Ic n="search" s={15} />Search
        </button>
      </div>

      {/* Quick search chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
        {QUICK_SEARCHES.map(q => (
          <button key={q} onClick={() => { setQuery(q); search(q); }} className="chip"
            style={{ padding: "5px 13px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 20, color: "var(--text2)", fontSize: 12, fontWeight: 500, boxShadow: "var(--shadow)", transition: "all .15s" }}>
            {q}
          </button>
        ))}
      </div>

      {/* LinkedIn quick-search bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, padding: "10px 14px", background: "#EEF3FF", border: "1.5px solid #C7D7F8", borderRadius: 11 }}>
        <Ic n="linkedin" s={15} />
        <span style={{ fontSize: 12, color: "var(--text2)", flex: 1 }}>
          Also search on <strong>LinkedIn Jobs</strong> — opens in a new tab with the same query.
        </span>
        <a
          href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query || "Technology Director")}&location=United+Kingdom&sortBy=R`}
          target="_blank"
          rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#0A66C2", color: "#fff", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
          <Ic n="linkedin" s={13} /> Search LinkedIn ↗
        </a>
      </div>

      {/* Filter & sort bar — only show when results exist */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Work type</span>
            <div style={{ display: "flex", gap: 5 }}>
              {["All", "Remote", "Hybrid", "On-site"].map(t => (
                <button key={t} onClick={() => setWorkType(t)}
                  style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: workType === t ? "var(--blue)" : "var(--bg)", color: workType === t ? "#fff" : "var(--muted)", border: `1.5px solid ${workType === t ? "var(--blue)" : "var(--border)"}`, transition: "all .15s" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Sort by</span>
            <div style={{ display: "flex", gap: 5 }}>
              {[["relevance","Relevance"],["salary_desc","Salary ↓"],["salary_asc","Salary ↑"]].map(([v, label]) => (
                <button key={v} onClick={() => setSortBy(v)}
                  style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: sortBy === v ? "var(--blue)" : "var(--bg)", color: sortBy === v ? "#fff" : "var(--muted)", border: `1.5px solid ${sortBy === v ? "var(--blue)" : "var(--border)"}`, transition: "all .15s" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--faint)" }}>
            {displayed.length} of {jobs.length} shown
          </span>
        </div>
      )}

      <Err msg={err} />
      {loading && <Spin msg="Searching live job market…" />}

      {jobs.length > 0 && displayed.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--faint)", fontSize: 13 }}>
          No {workType} roles in these results — try a different work type filter.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {displayed.map(job => {
          const wt = detectWorkType(job);
          return <div key={job.id} className="card-hover"
            style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 16, padding: "20px 22px", display: "flex", gap: 16, justifyContent: "space-between", animation: "fadeUp .25s ease", boxShadow: "var(--shadow)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{job.title}</h3>
                <span style={{ padding: "2px 9px", background: "var(--blue-lt)", color: "var(--blue)", borderRadius: 20, fontSize: 11, fontWeight: 700, border: "1px solid var(--border)", whiteSpace: "nowrap" }}>{job.type}</span>
                <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                  background: wt === "Remote" ? "#F0FDF4" : wt === "Hybrid" ? "#FFFBEB" : "#F8FAFF",
                  color:      wt === "Remote" ? "#15803D"  : wt === "Hybrid" ? "#B45309"  : "#475569",
                  border:     wt === "Remote" ? "1px solid #BBF7D0" : wt === "Hybrid" ? "1px solid #FDE68A" : "1px solid var(--border)" }}>
                  {wt}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, marginBottom: 9, flexWrap: "wrap" }}>
                <span style={{ color: "var(--text2)", fontSize: 13, fontWeight: 700 }}>{job.company}</span>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>📍 {job.location}</span>
                <span style={{ color: "var(--green)", fontSize: 13, fontWeight: 700 }}>💰 {job.salary}</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.65 }}>{job.summary}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 96 }}>
              <button onClick={() => { onSave(job); setSaved(s => ({ ...s, [job.id]: true })); }}
                className={saved[job.id] ? "" : "btn-blue"}
                style={saved[job.id]
                  ? { padding: "8px 0", background: "var(--green-lt)", color: "var(--green)", border: "1.5px solid #A7F3D0", borderRadius: 9, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, justifyContent: "center", width: "100%", cursor: "default" }
                  : { padding: "8px 0", borderRadius: 9, fontSize: 13, width: "100%", display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                {saved[job.id] ? <><Ic n="check" s={14} />Saved</> : <><Ic n="plus" s={14} />Save</>}
              </button>
              {job.url && (
                <a href={job.url} target="_blank" rel="noreferrer"
                  style={{ padding: "7px 0", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 9, fontSize: 12, fontWeight: 600, color: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", width: "100%" }}>
                  View ↗
                </a>
              )}
            </div>
          </div>
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAILOR CV TAB
// ═══════════════════════════════════════════════════════════════════════════
const CV_SYSTEM = `You are a senior executive CV writer. Produce TWO clearly separated outputs for this candidate.

OUTPUT 1 — TAILORING NOTES (shown separately, never downloaded):
Start with exactly: ===TAILORING_NOTES===
Concise guidance under these four headings (plain text, no extra formatting):
Transferable skills mapped: 3-4 skills from the candidate's telecoms/technology background that directly transfer to this role, with a one-line explanation of how each maps across.
Key areas to emphasise: What to foreground for this specific role.
Keywords to weave in: 6-8 keywords from the JD, comma-separated.
Honest gap check: Any genuine gap to flag, or "No significant gaps identified."

OUTPUT 2 — COMPLETE TAILORED CV (clean, ready to download):
Start with exactly: ===TAILORED_CV===
Use exactly this structure:

PRASHANT VASHISHTHA
London, UK | Availability: Negotiable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROFESSIONAL SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Three sentences. Use only facts from the candidate data. Mirror the role's language naturally.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE COMPETENCIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[8-10 competency areas drawn from the candidate's actual experience. Pipe-separated pairs per line.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROFESSIONAL EXPERIENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Every role from the candidate data, in this format:]
COMPANY - TITLE | DATES
- [Bullet reframed to show transferable relevance — metrics and facts from candidate data only]
[2-3 bullets for the 2 most recent roles; 1-2 for earlier roles]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY ACHIEVEMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Bullets drawn only from the KEY ACHIEVEMENTS data provided. Do not add others.]

════════ ABSOLUTE RULES — any violation makes the CV unusable ════════
1. COPY metrics exactly as given. "10% YoY" stays "10% YoY" — never "double-digit" or "significant".
2. Do NOT add any figure, percentage, client name, technology, tool, certification, or achievement that is not explicitly stated in the candidate data.
3. Do NOT upgrade titles, extend date ranges, or imply responsibilities not described.
4. Do NOT use phrases like "led a team of X", "managed £Xm budget", or any number not in the data.
5. If a role requirement has no honest match in the data, describe the candidate's closest real experience without inventing specifics.
6. Transferable-skills framing is encouraged — reframe real experience to show relevance — but never fabricate.
7. Output nothing outside the two === delimited sections.`;

function TailorTab({ apiKey, apps, onOpenCover }) {
  const [jd,             setJd]             = useState("");
  const [cvOut,          setCvOut]          = useState("");
  const [notesOut,       setNotesOut]       = useState("");
  const [busy,           setBusy]           = useState(false);
  const [fetchingJD,     setFetchingJD]     = useState(false);
  const [err,            setErr]            = useState("");
  const [selectedJob,    setSelectedJob]    = useState(null);
  const [feedback,       setFeedback]       = useState("");
  const [showRefine,     setShowRefine]     = useState(false);

  const jobsWithDesc = apps.filter(a => a.description && a.description.length > 20);

  const loadJob = (app) => {
    setSelectedJob(app);
    setJd(app.description || "");
    setCvOut(""); setNotesOut(""); setErr(""); setFeedback(""); setShowRefine(false);
  };

  const fetchFullJD = async () => {
    if (!selectedJob?.url) return;
    setFetchingJD(true);
    try {
      const proxy = `https://corsproxy.io/?${encodeURIComponent(selectedJob.url)}`;
      const r = await fetch(proxy);
      const html = await r.text();
      const div = document.createElement("div");
      div.innerHTML = html;
      div.querySelectorAll("script,style,nav,header,footer,aside").forEach(el => el.remove());
      const raw = (div.innerText || div.textContent || "").replace(/\s+/g, " ").trim();
      if (raw.length > 300) setJd(raw.slice(0, 4000));
    } catch (_) { /* silently fall back — user can paste manually */ }
    setFetchingJD(false);
  };

  const parseOutput = (raw) => {
    const notesMatch = raw.match(/===TAILORING_NOTES===([\s\S]*?)(?====TAILORED_CV===|$)/);
    const cvMatch    = raw.match(/===TAILORED_CV===([\s\S]*)$/);
    return {
      notes: notesMatch ? notesMatch[1].trim() : "",
      cv:    cvMatch    ? cvMatch[1].trim()    : raw.trim(),
    };
  };

  const run = async (refineMode = false) => {
    if (!jd.trim()) return;
    setBusy(true); setErr("");
    if (!refineMode) { setCvOut(""); setNotesOut(""); setFeedback(""); setShowRefine(false); }
    const userMsg = refineMode
      ? `JOB DESCRIPTION:\n${jd}\n\nCANDIDATE EXPERIENCE:\n${EXP}\n\nKEY ACHIEVEMENTS: ${HIGHLIGHTS}\n\n---\nPREVIOUS CV DRAFT:\n${cvOut}\n\n---\nUSER REFINEMENT REQUEST:\n${feedback}\n\nRevise the complete CV incorporating this feedback. Output both sections (===TAILORING_NOTES=== and ===TAILORED_CV===) again.`
      : `JOB DESCRIPTION:\n${jd}\n\nCANDIDATE EXPERIENCE:\n${EXP}\n\nKEY ACHIEVEMENTS: ${HIGHLIGHTS}`;
    try {
      const raw = await askClaude(apiKey, CV_SYSTEM, userMsg, 2400, "claude-sonnet-4-5-20250929");
      const { notes, cv } = parseOutput(raw);
      setNotesOut(notes);
      setCvOut(cv);
      if (refineMode) { setFeedback(""); setShowRefine(false); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 6, letterSpacing: "-.4px" }}>Tailor Your CV</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Generates a complete, download-ready CV tailored to the role — with a separate tailoring notes panel for guidance. Uses only your real experience.</p>
      </div>

      {jobsWithDesc.length > 0 && (
        <div style={{ marginBottom: 18, padding: "14px 16px", background: "var(--blue-lt)", border: "1.5px solid var(--border)", borderRadius: 12 }}>
          <Lbl t={`Load from saved jobs (${jobsWithDesc.length} available)`} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {jobsWithDesc.map(app => (
              <button key={app.id} onClick={() => loadJob(app)} className={selectedJob?.id === app.id ? "btn-blue" : "btn-outline"}
                style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {app.title} · {app.company}
              </button>
            ))}
          </div>
          {selectedJob && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--green)", fontWeight: 600, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span>✓ {selectedJob.title} @ {selectedJob.company}</span>
              {selectedJob.url && <a href={selectedJob.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>View posting ↗</a>}
              {selectedJob.url && (
                <button onClick={fetchFullJD} disabled={fetchingJD} className="btn-outline"
                  style={{ padding: "3px 11px", borderRadius: 8, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                  {fetchingJD ? "Fetching…" : "Fetch Full JD ↓"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <Err msg={err} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Left — Job description input + refine */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <Lbl t="Job Description" />
          <textarea value={jd} onChange={e => { setJd(e.target.value); setSelectedJob(null); setCvOut(""); setNotesOut(""); setShowRefine(false); }}
            placeholder="Paste the full job description here, or load a saved job above. More detail = better tailoring."
            style={{ width: "100%", minHeight: 360, padding: "13px 15px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13, lineHeight: 1.7, outline: "none", boxShadow: "var(--shadow)" }} />
          <BigBtn label="Generate Full Tailored CV" icon="file" onClick={() => run(false)} loading={busy && !showRefine} disabled={!jd.trim()} />

          {/* Refine panel */}
          {cvOut && (
            <div style={{ marginTop: 14, padding: "14px 16px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Lbl t="Refine with feedback" />
                <button onClick={() => setShowRefine(s => !s)} style={{ fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  {showRefine ? "▲ hide" : "▼ show"}
                </button>
              </div>
              {showRefine && (
                <>
                  <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
                    placeholder={'e.g. "Emphasise the sales experience more" · "Shorter summary" · "Lead with the 5G programme work"'}
                    style={{ width: "100%", minHeight: 80, padding: "10px 13px", background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 13, lineHeight: 1.6, outline: "none", resize: "vertical" }} />
                  <button onClick={() => run(true)} disabled={!feedback.trim() || busy} className="btn-outline"
                    style={{ marginTop: 9, width: "100%", padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    {busy ? <><div style={{ width: 14, height: 14, border: "2px solid var(--border)", borderTopColor: "var(--blue)", borderRadius: "50%", animation: "spin .8s linear infinite" }} />Refining…</> : <>↺ Regenerate with feedback</>}
                  </button>
                </>
              )}
              {!showRefine && <div style={{ fontSize: 12, color: "var(--muted)" }}>Not quite right? Add notes and regenerate in seconds.</div>}
            </div>
          )}
        </div>

        {/* Right — Tailoring Notes + Clean CV */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Tailoring Notes panel */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", letterSpacing: ".09em", textTransform: "uppercase" }}>Tailoring Notes</div>
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>— transferable skills, keywords & guidance</span>
            </div>
            {!notesOut && !busy && (
              <div style={{ padding: "11px 14px", background: "var(--amber-lt)", border: "1px solid #FDE68A", borderRadius: 10, fontSize: 12, color: "#92400E", lineHeight: 1.7 }}>
                <strong>What you'll get here:</strong> Transferable skills mapped to this role, key emphasis areas, keywords to weave in, and an honest gap check — separate from the CV itself.
              </div>
            )}
            {notesOut && (
              <div style={{ padding: "14px 16px", background: "var(--amber-lt)", border: "1.5px solid #FDE68A", borderRadius: 12, fontSize: 13, color: "#78350F", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto" }}>
                {notesOut}
              </div>
            )}
          </div>

          {/* Tailored CV panel */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <Lbl t="Complete Tailored CV" />
              {cvOut && <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 700 }}>✓ Ready to download</span>}
            </div>
            <OutputBox text={cvOut} ph="Your complete tailored CV will appear here — ready to download as Word or PDF." mh={300} />
            <DownloadBar
              text={cvOut}
              docFilename={selectedJob ? `CV-${selectedJob.company.replace(/\s+/g,"-")}` : "CV-Tailored"}
              pdfTitle={selectedJob ? `Tailored CV — ${selectedJob.title} @ ${selectedJob.company}` : "Tailored CV"}
              applyUrl={selectedJob?.url}
              onCoverLetter={selectedJob && cvOut ? () => onOpenCover(selectedJob) : null}
            />
          </div>

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COVER LETTER TAB
// ═══════════════════════════════════════════════════════════════════════════
function CoverTab({ apiKey, prefill, apps }) {
  const [jd,          setJd]          = useState("");
  const [co,          setCo]          = useState("");
  const [ro,          setRo]          = useState("");
  const [applyUrl,    setApplyUrl]    = useState("");
  const [tone,        setTone]        = useState("Confident & direct");
  const [out,         setOut]         = useState("");
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState("");
  const [selectedJob, setSelectedJob] = useState(null);

  const jobsWithDesc = (apps || []).filter(a => a.description && a.description.length > 20);

  // Pre-fill from "Cover Letter →" button in TailorTab
  useEffect(() => {
    if (prefill) {
      setJd(prefill.jd      || "");
      setCo(prefill.company || "");
      setRo(prefill.role    || "");
      setApplyUrl(prefill.url || "");
      setSelectedJob(null);
      setOut("");
    }
  }, [prefill]);

  const loadJob = (app) => {
    setSelectedJob(app);
    setJd(app.description || "");
    setCo(app.company     || "");
    setRo(app.title       || "");
    setApplyUrl(app.url   || "");
    setOut(""); setErr("");
  };

  const run = async () => {
    if (!jd.trim()) return;
    setBusy(true); setOut(""); setErr("");
    try {
      const r = await askClaude(apiKey,
        `You write concise cover letters for senior executives.
Rules:
- Maximum 300 words
- Tone: ${tone}
- Open with a specific hook about the company or role — based only on the JD provided
- Reference exactly 2 quantified achievements from KEY WINS below — copy the figures exactly, do not round or embellish
- Close confidently; mention availability is negotiable
- Address as "Dear Hiring Team"
- No salary mention; no corporate waffle
- Do NOT invent any achievement, figure, client, or detail not listed in KEY WINS`,
        `ROLE: ${ro || "Senior Executive"} at ${co || "the organisation"}
JOB DESCRIPTION:
${jd}

CANDIDATE: Prashant Vashishtha | Notice: Negotiable
KEY WINS (use only these, copy figures exactly):
- EUR 2M annualised savings delivered at Nokia
- 40% efficiency gains through process transformation and RPA
- US Patent 11562313 for services process automation
- MVNO Nation Live 2025 Keynote Speaker
- 28 years global telecoms and technology leadership
- 10% YoY revenue growth in current Customer Technology Lead role
- 25% efficiency gain, 40% client engagement increase (current role)`,
        900
      );
      setOut(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const inputStyle = { width: "100%", padding: "10px 13px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none" };

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 6, letterSpacing: "-.4px" }}>Cover Letter Generator</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Bespoke senior executive cover letter — ready to download in seconds.
          {(prefill?.company || selectedJob) && <span style={{ color: "var(--green)", fontWeight: 600 }}> ✓ Pre-filled from {selectedJob?.company || prefill?.company}</span>}
        </p>
      </div>

      {/* Saved jobs loader */}
      {jobsWithDesc.length > 0 && (
        <div style={{ marginBottom: 18, padding: "14px 16px", background: "var(--blue-lt)", border: "1.5px solid var(--border)", borderRadius: 12 }}>
          <Lbl t={`Load from saved jobs (${jobsWithDesc.length} available)`} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {jobsWithDesc.map(app => (
              <button key={app.id} onClick={() => loadJob(app)} className={selectedJob?.id === app.id ? "btn-blue" : "btn-outline"}
                style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {app.title} · {app.company}
              </button>
            ))}
          </div>
          {selectedJob && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--green)", fontWeight: 600 }}>
              ✓ {selectedJob.title} @ {selectedJob.company}
              {selectedJob.url && <> · <a href={selectedJob.url} target="_blank" rel="noreferrer">View posting ↗</a></>}
            </div>
          )}
        </div>
      )}

      <Err msg={err} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Lbl t="Company" /><input value={co} onChange={e => setCo(e.target.value)} placeholder="e.g. Deloitte" style={inputStyle} /></div>
            <div><Lbl t="Role Title" /><input value={ro} onChange={e => setRo(e.target.value)} placeholder="e.g. Director" style={inputStyle} /></div>
          </div>
          <div>
            <Lbl t="Tone" />
            <div style={{ display: "flex", gap: 8 }}>
              {["Confident & direct", "Warm & collaborative", "Strategic & formal"].map(t => (
                <button key={t} onClick={() => setTone(t)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", background: tone === t ? "var(--blue)" : "#fff", color: tone === t ? "#fff" : "var(--muted)", border: tone === t ? "1.5px solid var(--blue)" : "1.5px solid var(--border)", transition: "all .15s" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Lbl t="Job Description" />
            <textarea value={jd} onChange={e => { setJd(e.target.value); setSelectedJob(null); }} placeholder="Paste job description here, or load a saved job above…"
              style={{ width: "100%", minHeight: 230, padding: "13px 15px", background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13, lineHeight: 1.7, outline: "none" }} />
          </div>
          <BigBtn label="Generate Cover Letter" icon="mail" onClick={run} loading={busy} disabled={!jd.trim()} />
        </div>
        <div>
          <Lbl t="Cover Letter" />
          <OutputBox text={out} ph="Your cover letter will appear here…" mh={440} />
          <DownloadBar
            text={out}
            docFilename={co ? `Cover-Letter-${co}` : "Cover-Letter"}
            pdfTitle={co && ro ? `Cover Letter — ${ro} @ ${co}` : "Cover Letter"}
            applyUrl={applyUrl}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACKER TAB
// ═══════════════════════════════════════════════════════════════════════════
function TrackerTab({ apps, onUpdate }) {
  const [filter,    setFilter]    = useState("All");
  const [editId,    setEditId]    = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const [showAdd,   setShowAdd]   = useState(false);
  const [nj,        setNj]        = useState({ title: "", company: "", location: "", salary: "", status: "Applied" });

  const filtered = filter === "All" ? apps : apps.filter(a => a.status === filter);
  const counts   = Object.fromEntries(STATUSES.map(s => [s, apps.filter(a => a.status === s).length]));

  const updStatus = (id, status) => onUpdate(apps.map(a => a.id === id ? { ...a, status } : a));
  const del       = id => { if (window.confirm("Remove this application?")) onUpdate(apps.filter(a => a.id !== id)); };
  const saveN     = id => { onUpdate(apps.map(a => a.id === id ? { ...a, notes: editNotes } : a)); setEditId(null); };
  const addM      = () => {
    if (!nj.title || !nj.company) return;
    onUpdate([{ ...nj, id: Date.now(), dateAdded: new Date().toLocaleDateString("en-GB"), notes: "" }, ...apps]);
    setNj({ title: "", company: "", location: "", salary: "", status: "Applied" });
    setShowAdd(false);
  };

  const inputSm = { padding: "8px 11px", background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, outline: "none", width: "100%" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 6, letterSpacing: "-.4px" }}>Application Tracker</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Saved in your browser — persists between sessions.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-blue"
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, fontSize: 13 }}>
          <Ic n="plus" s={14} />Add Manually
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 22 }}>
        {STATUSES.map(s => (
          <div key={s} style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 12px", textAlign: "center", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: STATUS_STYLE[s].color, marginBottom: 2 }}>{counts[s] || 0}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, padding: "18px 22px", marginBottom: 20, boxShadow: "var(--shadow)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Add Application Manually</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[["title","Role Title"],["company","Company"],["location","Location"],["salary","Salary"]].map(([k, ph]) => (
              <input key={k} value={nj[k]} onChange={e => setNj(n => ({ ...n, [k]: e.target.value }))} placeholder={ph} style={inputSm} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={nj.status} onChange={e => setNj(n => ({ ...n, status: e.target.value }))} style={{ ...inputSm, width: "auto" }}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={addM} className="btn-blue" style={{ padding: "8px 18px", borderRadius: 8, fontSize: 13 }}>Add</button>
            <button onClick={() => setShowAdd(false)} className="btn-outline" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {["All", ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: filter === s ? "var(--blue)" : "#fff", color: filter === s ? "#fff" : "var(--muted)", border: `1.5px solid ${filter === s ? "var(--blue)" : "var(--border)"}`, transition: "all .15s" }}>
            {s} ({s === "All" ? apps.length : counts[s] || 0})
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "56px 0", color: "var(--faint)" }}>
          <Ic n="chart" s={38} />
          <div style={{ marginTop: 12, fontSize: 14 }}>No applications yet — save jobs from Find Live Jobs or add manually.</div>
        </div>
      )}

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(app => {
          const st = STATUS_STYLE[app.status] || STATUS_STYLE.Saved;
          return (
            <div key={app.id} className="card-hover"
              style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow)", animation: "fadeUp .25s ease" }}>
              <div style={{ padding: "15px 20px", display: "flex", gap: 14, justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{app.title}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>@ {app.company}</span>
                    {app.location && <span style={{ color: "var(--faint)", fontSize: 12 }}>· {app.location}</span>}
                    {app.salary   && <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 700 }}>· {app.salary}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>Added {app.dateAdded}</span>
                    <select value={app.status} onChange={e => updStatus(app.id, e.target.value)}
                      style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, background: st.bg, color: st.color, border: "none", fontWeight: 700, outline: "none", cursor: "pointer" }}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    {app.url && <a href={app.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600, textDecoration: "none" }}>Apply ↗</a>}
                  </div>
                  {editId === app.id ? (
                    <div style={{ marginTop: 10 }}>
                      <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                        style={{ width: "100%", minHeight: 70, padding: "9px 11px", background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, outline: "none" }} />
                      <div style={{ display: "flex", gap: 7, marginTop: 5 }}>
                        <button onClick={() => saveN(app.id)} className="btn-blue" style={{ padding: "5px 13px", borderRadius: 7, fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditId(null)} className="btn-outline" style={{ padding: "5px 11px", borderRadius: 7, fontSize: 12 }}>Cancel</button>
                      </div>
                    </div>
                  ) : app.notes ? (
                    <div onClick={() => { setEditId(app.id); setEditNotes(app.notes); }}
                      style={{ marginTop: 8, padding: "7px 11px", background: "var(--blue-lt)", borderRadius: 8, color: "var(--text2)", fontSize: 12, cursor: "pointer", border: "1px solid var(--border)" }}>
                      📝 {app.notes}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <button onClick={() => { setEditId(app.id); setEditNotes(app.notes || ""); }} className="btn-outline"
                    style={{ padding: 7, borderRadius: 7, display: "flex", alignItems: "center" }} title="Add notes">
                    <Ic n="file" s={13} />
                  </button>
                  <button onClick={() => del(app.id)} className="btn-outline"
                    style={{ padding: 7, borderRadius: 7, display: "flex", alignItems: "center" }} title="Delete">
                    <Ic n="trash" s={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
