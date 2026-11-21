import React, { useState } from "react";
import { api, VIEW } from "../lib/api";
import { useApp } from "../lib/app";
import { Card, Hero, Loading, Stat, useLoad } from "../components/Bits";
import { Glyph, IconBadge } from "../components/Glyphs";

const ext = (n: string) => (n.split(".").pop() || "").toLowerCase();
const EXT: Record<string, [string, string]> = { md: ["doc", "blue"], txt: ["doc", "slate"], yaml: ["gear", "violet"], yml: ["gear", "violet"], docx: ["doc", "blue"], pdf: ["doc", "red"] };
const SUGGEST = ["transformer noise", "BW-3 strike", "infiltration test", "recharge well depth", "persons per flat", "RO concentrate"];

export default function Knowledge() {
  const { site, ask, toast } = useApp();
  const lib = useLoad(() => api<any>(`/api/sites/${site}/knowledge`), [site]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function search(text = q) { if (!text.trim()) return; setQ(text); setBusy(true); try { setHits(await api(`/api/sites/${site}/knowledge/search?q=${encodeURIComponent(text)}`)); } finally { setBusy(false); } }
  async function rebuild() { setBusy(true); const r = await api<any>(`/api/sites/${site}/knowledge/rebuild`, { method: "POST" }); setBusy(false); toast(`Index rebuilt: ${r.files} documents, ${r.chunks} passages`); lib.reload(); }
  const files: any[] = lib.data?.files || [];
  const groups: Record<string, any[]> = {};
  files.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const mark = (text: string) => {
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return text.split(re).map((p, i) => re.test(p) ? <mark key={i} style={{ background: "rgba(61,220,151,.3)", color: "#fff", borderRadius: 3, padding: "0 2px" }}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>);
  };
  return (
    <div className="page">
      <Hero art="banner-knowledge" icon="book" eyebrow="Library" title="Knowledge"
        sub="The project's own documents, indexed on this computer: desk study, scope, ADMT protocol and reports, AquaTwin reports and guide, WaterPlan notes. The AI quotes from these with file names."
        actions={!VIEW && <button className="btn light" onClick={rebuild} disabled={busy}><Glyph name="sync" size={16} />Re-index</button>} />
      <div className="grid g4">
        <Stat icon="folder" tone="blue" label="Documents indexed" value={files.length} sub="on this computer" />
        <Stat icon="list" tone="aqua" label="Passages" value={lib.data?.chunks ?? "–"} sub="searchable text blocks" />
        <Stat icon="layers" tone="green" label="Sources" value={Object.keys(groups).length} sub="engines, site packs and project folder" />
        <Stat icon="search" tone="violet" label="Search method" value="BM25" sub="word ranking, no data leaves the computer" />
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="row" style={{ flex: 1, gap: 10, padding: "0 14px", height: 50, borderRadius: 14, background: "rgba(3,18,32,.6)", border: "1px solid var(--line-2)" }}>
            <Glyph name="search" size={18} color="#9FD8EA" />
            <input style={{ flex: 1, background: "transparent", border: 0, outline: 0, color: "#fff", fontSize: 15 }} placeholder="Search the documents, e.g. transformer noise, BW-3 strike, infiltration test" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} />
          </div>
          <button className="btn primary" style={{ height: 50 }} onClick={() => search()}><Glyph name="search" size={16} />Search</button>
          <button className="btn" style={{ height: 50 }} onClick={() => q && ask(q)}><Glyph name="spark" size={16} />Ask the AI</button>
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>{SUGGEST.map(s => <button key={s} className="tag" onClick={() => search(s)}>{s}</button>)}</div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", alignItems: "start", marginTop: 16 }}>
        <Card title={hits ? `${hits.length} passages found` : "Search results"} sub={hits && q ? <>for “{q}” · matched words highlighted</> : undefined} icon="search" tone="aqua"
          right={hits && hits.length > 0 && <button className="btn" onClick={() => ask(`Summarise what the project documents say about: ${q}. Quote file names.`)}><Glyph name="spark" size={15} />Summarise with AI</button>}>
          {busy && <Loading text="Searching" />}
          {!hits && !busy && <div className="empty">Type words or a question and press Enter.</div>}
          {hits?.map((h, i) => {
            const [ic, tone] = EXT[ext(h.document)] || ["doc", "slate"];
            return (
              <div key={i} className="doc-hit" style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr)", gap: 12 }}>
                <IconBadge name={ic} tone={tone} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div className="row between"><b className="small" style={{ color: "#fff" }}>{h.document}</b><span className="tag">{h.group}</span></div>
                  <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{mark(h.passage.slice(0, 700))}</div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>score {h.score} · {h.path}</div>
                </div>
              </div>);
          })}
          {hits && !hits.length && <div className="empty">No passages match. Try fewer or different words.</div>}
        </Card>
        <Card title="Indexed documents" sub={lib.data ? `${files.length} files · ${lib.data.chunks} passages` : ""} icon="folder" tone="blue">
          {!lib.data && <Loading />}
          <div style={{ maxHeight: "64vh", overflow: "auto" }}>
            {Object.entries(groups).map(([g, fs]) => (
              <div key={g} style={{ marginBottom: 12 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{g} · {fs.length}</div>
                {fs.map(f => { const [ic, tone] = EXT[ext(f.name)] || ["doc", "slate"]; return (
                  <div key={f.path} className="row" style={{ gap: 10, padding: "5px 0" }} title={f.path}>
                    <IconBadge name={ic} tone={tone} size={26} /><span className="small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span><span className="tiny muted">{f.chunks}</span>
                  </div>); })}
              </div>))}
          </div>
        </Card>
      </div>
    </div>
  );
}
