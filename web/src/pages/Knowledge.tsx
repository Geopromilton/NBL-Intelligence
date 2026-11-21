import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { Card, Loading, useLoad } from "../components/Bits";
import { I } from "../components/Icons";

export default function Knowledge() {
  const { site, ask, toast } = useApp();
  const lib = useLoad(() => api<any>(`/api/sites/${site}/knowledge`), [site]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function search() { if (!q.trim()) return; setBusy(true); setHits(await api(`/api/sites/${site}/knowledge/search?q=${encodeURIComponent(q)}`)); setBusy(false); }
  async function rebuild() { setBusy(true); const r = await api<any>(`/api/sites/${site}/knowledge/rebuild`, { method: "POST" }); setBusy(false); toast(`Index rebuilt: ${r.files} documents, ${r.chunks} passages`); lib.reload(); }
  const groups: Record<string, any[]> = {};
  (lib.data?.files || []).forEach((f: any) => { (groups[f.group] = groups[f.group] || []).push(f); });
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Library</div><h1>Knowledge</h1><p>The project's own documents, indexed on this computer: desk study, scope, ADMT protocol and reports, AquaTwin reports and guide, WaterPlan notes. The AI quotes from these with file names.</p></div>
        <div className="actions"><button className="btn" onClick={rebuild} disabled={busy}><I.refresh size={15} />Re-index</button></div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" style={{ height: 46, fontSize: 15 }} placeholder="Search the documents, e.g. transformer noise, BW-3 strike, infiltration test" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} />
        <button className="btn primary" style={{ height: 46 }} onClick={search}><I.search size={15} />Search</button>
        <button className="btn" style={{ height: 46 }} onClick={() => q && ask(q)}><I.spark size={15} />Ask</button>
      </div>
      <div className="grid g-side" style={{ alignItems: "start" }}>
        <Card title={hits ? `${hits.length} passages` : "Search results"}>
          {busy && <Loading text="Searching" />}
          {!hits && !busy && <div className="muted small">Type a question or words and press Enter.</div>}
          {hits?.map((h, i) => (
            <div key={i} className="doc-hit">
              <div className="row between"><b className="small">{h.document}</b><span className="tiny muted">{h.group} · score {h.score}</span></div>
              <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{h.passage.slice(0, 700)}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{h.path}</div>
            </div>))}
        </Card>
        <Card title="Indexed documents" sub={lib.data ? `${lib.data.files.length} files · ${lib.data.chunks} passages` : ""}>
          {!lib.data && <Loading />}
          {Object.entries(groups).map(([g, fs]) => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{g}</div>
              {fs.map(f => <div key={f.path} className="small" style={{ padding: "3px 0" }} title={f.path}>{f.name}</div>)}
            </div>))}
        </Card>
      </div>
    </div>
  );
}
