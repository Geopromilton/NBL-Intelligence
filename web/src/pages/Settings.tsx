import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { Card, Loading } from "../components/Bits";
import { I } from "../components/Icons";

export default function Settings() {
  const { toast, refreshHealth } = useApp();
  const [s, setS] = useState<any>(null);
  const [key, setKey] = useState("");
  const [test, setTest] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [upd, setUpd] = useState<any>(null);
  const [updBusy, setUpdBusy] = useState("");
  const { update, setUpdate } = useApp() as any;
  useEffect(() => { if (update) setUpd(update); }, [update]);
  async function loadModels() { setBusy(true); const r = await api<any>("/api/ai/models"); setBusy(false); if (r.ok) setModels(r.models); else toast(`Could not list models: ${r.error}`); }
  async function checkUpd() { setUpdBusy("check"); try { const r = await api("/api/update/check"); setUpd(r); setUpdate?.(r); } finally { setUpdBusy(""); } }
  async function applyUpd() { setUpdBusy("apply"); try { const r = await api<any>("/api/update/apply", { method: "POST" }); if (r.applied) { toast(`Version ${r.version} downloaded and checked. Restart to use it.`); await checkUpd(); } else toast(r.reason); } catch (e: any) { toast(e.message); } finally { setUpdBusy(""); } }
  async function rollback() { try { const r = await api<any>("/api/update/rollback", { method: "POST" }); toast(r.ok ? `Version ${r.version} will be restored at the next start.` : r.reason); await checkUpd(); } catch (e: any) { toast(e.message); } }
  async function restart() { await api("/api/update/restart", { method: "POST" }); toast("Restarting NBL-Intelligence…"); }
  const load = () => api("/api/settings").then(setS);
  useEffect(() => { load(); }, []);
  if (!s) return <div className="page"><Loading /></div>;
  async function save() { await api("/api/settings", { method: "PUT", json: { aquatwin_root: s.aquatwin_root, waterplan_root: s.waterplan_root, project_folders: s.project_folders, aquatwin_python: s.aquatwin_python, sites_root: s.sites_root, ai: s.ai } }); toast("Settings saved"); refreshHealth(); load(); }
  async function saveKey() { const r = await api<any>("/api/ai/key", { json: { key } }); setKey(""); toast(`Key saved (${r.where})`); refreshHealth(); load(); }
  async function runTest() { setBusy(true); setTest(await api("/api/ai/test", { method: "POST" })); setBusy(false); }
  const ai = s.ai;
  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">System</div><h1>Settings</h1><p>Saved in {s.settings_file}. Updates to NBL-Intelligence never overwrite this file.</p></div></div>
      <Card title="Updates" sub={upd ? `Version ${upd.current}${upd.mode === "installed" ? " · installed app" : " · source folder"}` : "Version and updates"} style={{ marginBottom: 16 }}
        right={<button className="btn" onClick={checkUpd} disabled={!!updBusy}>{updBusy === "check" ? <div className="spinner" /> : <I.refresh size={15} />}Check for updates</button>}>
        {!upd && <div className="small muted">Click "Check for updates". Updates replace the program only; sites, runs, decisions, reports and settings are never touched.</div>}
        {upd && <>
          <div className="row wrap" style={{ gap: 10 }}>
            {upd.available ? <span className="badge b-p1">Version {upd.latest} available</span> : upd.error ? <span className="badge b-differs">{upd.error}</span> : <span className="badge b-agree">Up to date{upd.latest ? ` (latest ${upd.latest})` : ""}</span>}
            {upd.pending_restart && <span className="badge b-pending">Downloaded - restart to finish</span>}
            <label className="toggle" style={{ marginLeft: "auto" }}><input type="checkbox" checked={s.auto_check_updates !== false} onChange={e => { setS({ ...s, auto_check_updates: e.target.checked }); api("/api/settings", { method: "PUT", json: { auto_check_updates: e.target.checked } }); }} />Check automatically at start</label>
          </div>
          {upd.notes && upd.available && <div className="note small" style={{ marginTop: 10, whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{upd.notes}</div>}
          {upd.note && <div className="small muted" style={{ marginTop: 8 }}>{upd.note}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            {upd.can_apply && upd.available && !upd.pending_restart && <button className="btn primary" onClick={applyUpd} disabled={!!updBusy}>{updBusy === "apply" ? <div className="spinner" /> : <I.download size={15} />}Download and install</button>}
            {upd.can_apply && upd.pending_restart && <button className="btn primary" onClick={restart}><I.refresh size={15} />Restart now</button>}
            {upd.can_apply && <button className="btn ghost" onClick={rollback}>Roll back to the previous version</button>}
          </div>
        </>}
      </Card>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card title="NVIDIA reasoning" sub="NVIDIA API catalog (integrate.api.nvidia.com)">
          <div className="field"><label>API key <b>{s.ai_key.set ? s.ai_key.masked : "not set"}</b></label>
            <div className="row"><input className="input" type="password" placeholder="nvapi-…" value={key} onChange={e => setKey(e.target.value)} /><button className="btn primary" disabled={key.length < 8} onClick={saveKey}>Save</button></div>
            <span className="hint">Stored in {s.ai_key.set ? s.ai_key.where : "Windows Credential Manager"}; never in the product folder. A key saved in NBL-AquaTwin is found automatically.</span></div>
          <div className="field"><label>Main model <button className="btn ghost" style={{ height: 22, padding: "0 6px", fontSize: 11.5 }} onClick={loadModels}>List models on my NVIDIA account</button></label>
            {models ? <select className="input" value={ai.model} onChange={e => setS({ ...s, ai: { ...ai, model: e.target.value } })}>{!models.includes(ai.model) && <option value={ai.model}>{ai.model} (not in the list)</option>}{models.map(m => <option key={m} value={m}>{m}</option>)}</select>
              : <input className="input" value={ai.model} onChange={e => setS({ ...s, ai: { ...ai, model: e.target.value } })} />}</div>
          <div className="field"><label>Fallback model</label>
            {models ? <select className="input" value={ai.fallback_model} onChange={e => setS({ ...s, ai: { ...ai, fallback_model: e.target.value } })}>{!models.includes(ai.fallback_model) && <option value={ai.fallback_model}>{ai.fallback_model} (not in the list)</option>}{models.map(m => <option key={m} value={m}>{m}</option>)}</select>
              : <input className="input" value={ai.fallback_model} onChange={e => setS({ ...s, ai: { ...ai, fallback_model: e.target.value } })} />}
            <span className="hint">Used automatically when the main model does not answer.</span></div>
          <label className="toggle"><input type="checkbox" checked={ai.stream !== false} onChange={e => setS({ ...s, ai: { ...ai, stream: e.target.checked } })} />Show answers word by word as they are written</label>
          <div className="grid g3" style={{ gap: 10 }}>
            <div className="field"><label>Timeout s</label><input className="input" type="number" value={ai.timeout_s} onChange={e => setS({ ...s, ai: { ...ai, timeout_s: +e.target.value } })} /></div>
            <div className="field"><label>Max steps</label><input className="input" type="number" value={ai.max_steps} onChange={e => setS({ ...s, ai: { ...ai, max_steps: +e.target.value } })} /></div>
            <div className="field"><label>Temperature</label><input className="input" type="number" step="0.1" value={ai.temperature} onChange={e => setS({ ...s, ai: { ...ai, temperature: +e.target.value } })} /></div>
          </div>
          <div className="field"><label>Service URL</label><input className="input" value={ai.base_url} onChange={e => setS({ ...s, ai: { ...ai, base_url: e.target.value } })} />
            <span className="hint">Any OpenAI-compatible service works, e.g. a local Ollama at http://localhost:11434/v1 for offline use.</span></div>
          <div className="row"><button className="btn primary" onClick={save}>Save AI settings</button><button className="btn" onClick={runTest} disabled={busy}>{busy ? <div className="spinner" /> : <I.spark size={15} />}Test connection</button></div>
          {test && <div className="note" style={{ marginTop: 12, color: test.ok ? "var(--leaf)" : "var(--danger)" }}>{test.ok ? `Connected: ${test.model} answered in ${test.seconds} s` : test.error}</div>}
          <div className="note small" style={{ marginTop: 12 }}>What is sent: your question and the engine results the AI asks for (tables and short document passages). Raw survey files and the full documents stay on this computer.</div>
        </Card>
        <Card title="Engines and project folders">
          <div className="field"><label>NBL-AquaTwin folder</label><input className="input" value={s.aquatwin_root} onChange={e => setS({ ...s, aquatwin_root: e.target.value })} /></div>
          <div className="field"><label>NBL-WaterPlan folder</label><input className="input" value={s.waterplan_root} onChange={e => setS({ ...s, waterplan_root: e.target.value })} /></div>
          {Object.entries(s.project_folders).map(([k, v]: any) => (
            <div className="field" key={k}><label>Project folder · {k}</label><input className="input" value={v} onChange={e => setS({ ...s, project_folders: { ...s.project_folders, [k]: e.target.value } })} /></div>))}
          <div className="field"><label>Site registries folder (optional)</label><input className="input" placeholder="default" value={s.sites_root || ""} onChange={e => setS({ ...s, sites_root: e.target.value })} />
            <span className="hint">Holds sites\&lt;site&gt;\site.yaml. Leave empty for the default.</span></div>
          <div className="field"><label>Python for long AquaTwin runs (optional)</label><input className="input" placeholder="e.g. C:\Users\…\anaconda3\python.exe" value={s.aquatwin_python} onChange={e => setS({ ...s, aquatwin_python: e.target.value })} /></div>
          <button className="btn primary" onClick={save}>Save folders</button>
        </Card>
      </div>
    </div>
  );
}
