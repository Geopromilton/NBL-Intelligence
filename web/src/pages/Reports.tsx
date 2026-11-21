import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { Card, Loading, useLoad } from "../components/Bits";
import { I } from "../components/Icons";

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
      <div className="page-head"><div><div className="eyebrow">Library</div><h1>Reports</h1><p>One-click Word report in the NBL house format: Times New Roman, navy headings, labelled tables, figures at 600 DPI, the pre-drilling stamp on every groundwater result.</p></div></div>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card title="New site water intelligence report">
          <div className="field"><label>Water plan scenario</label>
            <select className="input" value={runId} onChange={e => setRunId(e.target.value)}>
              <option value="">Latest saved run (or design values)</option>
              {(runs.data || []).map(r => <option key={r.run_id} value={r.run_id}>{r.name} · {r.run_id} · {r.review?.status}</option>)}
            </select></div>
          <div className="field"><label>Add an AI conversation as notes (optional)</label>
            <select className="input" value={chat} onChange={e => setChat(e.target.value)}>
              <option value="">None</option>
              {(chats.data || []).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select></div>
          <div className="note small" style={{ marginBottom: 12 }}>Sections: site summary with provenance · exploration (sites, borewells, confidence) · water plan with labels and figure · recharge tiers and MODFLOW · integrity checks · decisions · placeholders and field tests.</div>
          <button className="btn primary" onClick={make} disabled={busy}>{busy ? <div className="spinner" /> : <I.doc size={15} />}Generate Word report</button>
        </Card>
        <Card title="Generated reports">
          {!list.data && <Loading />}
          {(list.data || []).map(r => (
            <div key={r.file} className="row between" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="small"><I.doc size={14} /> {r.file}</span><a className="btn" style={{ height: 30 }} href={r.url}><I.download size={14} />Open</a>
            </div>))}
          {list.data && !list.data.length && <div className="muted small">No reports yet.</div>}
        </Card>
      </div>
    </div>
  );
}
