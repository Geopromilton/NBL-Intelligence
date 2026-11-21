import React, { useState } from "react";
import { api, VIEW } from "../lib/api";
import { useApp } from "../lib/app";
import { Card, Hero, Loading, useLoad } from "../components/Bits";
import { Glyph, IconBadge } from "../components/Glyphs";

const SECTIONS: [string, string, string, string][] = [
  ["globe", "teal", "Site summary", "Every fact with its provenance label"],
  ["drill", "blue", "Exploration", "Drilling sites, borewells, confidence panel"],
  ["drop", "aqua", "Water plan", "Supply split, storage figure, labelled periods"],
  ["recharge", "green", "Recharge", "Depth tiers and MODFLOW results"],
  ["shield", "amber", "Integrity", "Where the engines differ and the action"],
  ["gavel", "violet", "Decisions", "Adopted, proposed and open items"],
];

export default function Reports() {
  const { site, toast } = useApp();
  const list = useLoad(() => api<any[]>(`/api/sites/${site}/reports`), [site]);
  const runs = useLoad(() => api<any[]>(`/api/sites/${site}/runs`), [site]);
  const chats = useLoad(() => api<any[]>(`/api/sites/${site}/chats`), [site]);
  const [runId, setRunId] = useState("");
  const [chat, setChat] = useState("");
  const [busy, setBusy] = useState(false);
  async function make() {
    setBusy(true);
    try { const r = await api<any>(`/api/sites/${site}/report`, { json: { run_id: runId || null, include_ai_chat: chat || null } }); toast(`Report ready: ${r.file}`); list.reload(); window.open(r.url, "_blank"); }
    finally { setBusy(false); }
  }
  return (
    <div className="page">
      <Hero art="banner-reports" icon="doc" eyebrow="Library" title="Reports"
        sub="One-click Word report in the NBL house format: Times New Roman, navy headings, labelled tables, figures at 600 DPI, and the pre-drilling stamp on every groundwater result." />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", alignItems: "start" }}>
        <Card title="New site water intelligence report" sub="Word (.docx) · Times New Roman" icon="doc" tone="blue">
          <div className="field"><label>Water plan scenario</label>
            <select className="input" value={runId} onChange={e => setRunId(e.target.value)} disabled={VIEW}>
              <option value="">Latest saved run (or design values)</option>
              {(runs.data || []).map(r => <option key={r.run_id} value={r.run_id}>{r.name} · {r.run_id} · {r.review?.status || "pending"}</option>)}
            </select></div>
          <div className="field"><label>Add an AI conversation as notes (optional)</label>
            <select className="input" value={chat} onChange={e => setChat(e.target.value)} disabled={VIEW}>
              <option value="">None</option>
              {(chats.data || []).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select></div>
          <div className="eyebrow" style={{ margin: "14px 0 8px" }}>Report at a glance</div>
          <div className="grid g2" style={{ gap: 10 }}>
            {SECTIONS.map(([ic, tone, t, s]) => (
              <div key={t} className="row" style={{ gap: 10, padding: 10, borderRadius: 12, background: "rgba(3,18,32,.45)", border: "1px solid var(--line)" }}>
                <IconBadge name={ic} tone={tone} size={34} /><div><div className="small"><b style={{ color: "#fff" }}>{t}</b></div><div className="tiny muted">{s}</div></div>
              </div>))}
          </div>
          <div className="note small" style={{ margin: "12px 0" }}>Also included: placeholders still to confirm, and the field tests that will replace them.</div>
          {VIEW ? <div className="small muted">Reports are generated in the Windows app.</div>
            : <button className="btn primary" onClick={make} disabled={busy}>{busy ? <div className="spinner" /> : <Glyph name="doc" size={16} />}Generate Word report</button>}
        </Card>
        <Card title="Generated reports" sub={list.data ? `${list.data.length} on this computer` : ""} icon="folder" tone="green">
          {!list.data && <Loading />}
          {(list.data || []).map(r => (
            <div key={r.file} className="row" style={{ gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <IconBadge name="doc" tone="blue" size={34} />
              <div style={{ flex: 1, minWidth: 0 }}><div className="small" style={{ color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{r.file}</div><div className="tiny muted">Word document{r.bytes ? ` · ${(r.bytes / 1024 / 1024).toFixed(1)} MB` : ""}</div></div>
              <a className="btn" style={{ height: 32 }} href={r.url}><Glyph name="doc" size={14} />Open</a>
            </div>))}
          {list.data && !list.data.length && <div className="empty">No reports yet. Generate one on the left.</div>}
        </Card>
      </div>
    </div>
  );
}
