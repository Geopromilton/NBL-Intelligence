"""Word report in the NBL house format.

Times New Roman throughout, navy headings, clean tables, figures at 600 DPI
with at most two panels per row, units written with a slash, and the
pre-drilling status stamp on every groundwater result.
"""
from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
from typing import Any

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from . import consistency, registry, runs, settings
from .engines import aquatwin, waterplan

NAVY = RGBColor(0x0B, 0x2A, 0x4A)
BLUE = RGBColor(0x1F, 0x5F, 0x99)
FONT = "Times New Roman"


def _font(run, size=12, bold=False, italic=False, color=None):
    run.font.name = FONT
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color is not None:
        run.font.color.rgb = color


def _styles(doc: Document) -> None:
    for name in ("Normal", "Heading 1", "Heading 2", "Heading 3", "Title", "Caption"):
        st = doc.styles[name]
        st.font.name = FONT
        rf = st.element.rPr.rFonts
        for att in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
            if rf.get(qn(att)) is not None:
                del rf.attrib[qn(att)]
        for att in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
            rf.set(qn(att), FONT)
    doc.styles["Normal"].font.size = Pt(12)
    doc.styles["Heading 1"].font.size = Pt(16)
    doc.styles["Heading 1"].font.color.rgb = NAVY
    doc.styles["Heading 2"].font.size = Pt(13)
    doc.styles["Heading 2"].font.color.rgb = BLUE
    pf = doc.styles["Normal"].paragraph_format
    pf.line_spacing = 1.5
    pf.space_after = Pt(4)
    for s in doc.sections:
        s.left_margin = s.right_margin = Cm(2.5)
        s.top_margin = s.bottom_margin = Cm(2.2)


def _para(doc, text, size=12, bold=False, italic=False, align=None, color=None):
    p = doc.add_paragraph()
    _font(p.add_run(text), size, bold, italic, color)
    if align == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif align == "justify":
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    return p


def _shade(cell, hexcolor):
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hexcolor)
    tcPr.append(shd)


def _table(doc, caption, header, rows, widths=None, size=10):
    cap = doc.add_paragraph()
    _font(cap.add_run(caption), 11, italic=True)
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    def _tight(cell):
        for para in cell.paragraphs:
            para.paragraph_format.line_spacing = 1.0
            para.paragraph_format.space_after = Pt(1)
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.text = ""
        _font(c.paragraphs[0].add_run(_sup(str(h))), size, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        _tight(c)
        _shade(c, "0B2A4A")
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = ""
            _tight(cells[i])
            _font(cells[i].paragraphs[0].add_run("" if v is None else _sup(str(v))), size)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


def _sup(text: str) -> str:
    import re
    return re.sub(r"\bm([23])\b", lambda m: "m" + ("\u00b2" if m.group(1) == "2" else "\u00b3"), text)


def _fmt(v):
    if isinstance(v, float):
        return f"{v:,.2f}" if abs(v) < 100 else f"{v:,.0f}"
    if isinstance(v, int):
        return f"{v:,}"
    return v


def _figure_storage(result: dict[str, Any]) -> bytes | None:
    daily = result.get("daily")
    if not daily:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    fam = "Times New Roman" if any("Times New Roman" in f.name for f in font_manager.fontManager.ttflist) else "serif"
    plt.rcParams.update({"font.family": fam, "font.size": 9})
    import pandas as pd
    d = pd.DataFrame(daily)
    d["date"] = pd.to_datetime(d["date"])
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.9), constrained_layout=True)
    ax = axes[0]
    ax.plot(d["date"], d["reservoir_storage_m3"], lw=0.8, color="#1F5F99", label="Reservoir")
    ax.plot(d["date"], d["roof_storage_m3"], lw=0.8, color="#2A9D8F", label="Roof chambers")
    ax.plot(d["date"], d["treated_storage_m3"], lw=0.8, color="#B5651D", label="Treated-water tank")
    import matplotlib.dates as mdates
    ax.xaxis.set_major_locator(mdates.YearLocator(2))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.set_ylabel("Storage (m\u00b3)")
    ax.set_title("(a) Storage, daily", fontsize=9)
    ax.legend(frameon=False, fontsize=7, loc="upper left", bbox_to_anchor=(0, -0.18), ncol=3)
    ax = axes[1]
    sh = result.get("supply_shares") or {}
    labels = ["Rainwater", "Reused water", "Borewell"]
    vals = [sh.get("rain", 0) * 100, sh.get("reuse", 0) * 100, sh.get("borewell", 0) * 100]
    ax.tick_params(axis="x", labelsize=8)
    ax.bar(labels, vals, color=["#2A9D8F", "#1F5F99", "#6B4E9B"])
    for i, v in enumerate(vals):
        ax.text(i, v + 1, f"{v:.0f} %", ha="center", fontsize=8)
    ax.set_ylabel("Share of supply over the run (%)")
    ax.set_ylim(0, max(vals + [10]) * 1.2)
    ax.set_title("(b) Supply by source, after treatment", fontsize=9)
    buf = io.BytesIO()
    fig.savefig(buf, dpi=600, format="png")
    plt.close(fig)
    return buf.getvalue()


def build(site: str, run_id: str | None = None, ai_notes: list[dict[str, Any]] | None = None) -> Path:
    reg = registry.get(site)
    doc = Document()
    _styles(doc)
    _para(doc, "Nature Based Living", 14, True, align="center", color=NAVY)
    _para(doc, "NBL-Intelligence", 26, True, align="center", color=NAVY)
    _para(doc, f"Site Water Intelligence Report - {reg['name']}", 16, align="center", color=BLUE)
    _para(doc, reg.get("location", ""), 12, italic=True, align="center")
    _para(doc, f"Prepared {datetime.now():%d %B %Y}", 12, align="center")
    _para(doc, reg.get("status_stamp", aquatwin.STAMP), 10, True, align="center", color=RGBColor(0xA0, 0x40, 0x20))
    doc.add_page_break()

    doc.add_heading("1. Site summary", level=1)
    _para(doc, reg.get("concept", ""), align="justify")
    rows = []
    for k, f in (reg.get("facts") or {}).items():
        if isinstance(f, dict):
            rows.append([k.replace("_", " ").capitalize(), f"{_fmt(f.get('value'))} {f.get('unit', '') or ''}".strip(),
                         f.get("provenance", ""), f.get("source", "")])
    _table(doc, "Table 1. Shared site facts with source and provenance", ["Item", "Value", "Provenance", "Source"], rows, [4.2, 4.6, 2.3, 5.0], 9)

    doc.add_heading("2. Groundwater exploration", level=1)
    _para(doc, aquatwin.STAMP, 10, True, color=RGBColor(0xA0, 0x40, 0x20))
    ds = aquatwin.drilling_sites(site)
    _table(doc, "Table 2. Borewell sites from the ADMT interpretation (priority list v03)",
           ["Site", "Role", "Primary zone (score, depth, type)", "Distance to boundary (m)", "Status"],
           [[s.get("Site"), s.get("Role"), s.get("Primary_zone"), _fmt(s.get("Distance_to_boundary_m")), s.get("Status")] for s in ds["sites"]],
           [1.2, 3.2, 5.0, 2.8, 2.6], 9)
    _para(doc, ds["order_note"], 11, italic=True)
    bw = aquatwin.borewells(site)
    _table(doc, "Table 3. Off-site reference borewells (reported, not measured by NBL)", ["Borewell", "Depth (m)", "Water strikes (m)", "Status"],
           [[b["id"], b.get("total_depth_m"), "; ".join(f"{a}-{c}" for a, c in (b.get("strikes_m") or [])), b.get("status")] for b in bw["borewells"]],
           [2.5, 2.5, 5, 5], 10)
    cp = aquatwin.confidence_panel(site)
    _table(doc, "Table 4. Confidence panel (layers are reported separately, never combined)", ["Layer", "Status"],
           [[r.get("layer"), r.get("status")] for r in cp["rows"]], [4.5, 11.5], 9)

    doc.add_heading("3. Water plan", level=1)
    rec = None
    all_runs = runs.list_runs(site)
    if run_id:
        rec = runs.get_run(site, run_id, daily=True)
    elif all_runs:
        rec = runs.get_run(site, all_runs[0]["run_id"], daily=True)
    if rec is None:
        res = waterplan.run_plan(site, {})
        rec = runs.save_run(site, "NBL-WaterPlan", "Design values (report)", {}, res, by="report")
        rec["daily"] = res["daily"]
    res = rec["result"]
    sc = res["scenario"]
    _para(doc, f"Scenario: {rec['name']} (run {rec['run_id']}). {sc['flats']:.0f} flats x {sc['persons_per_flat']:.0f} persons x "
               f"{sc['litres_per_person_day']:.0f} L/person/day; build-up to full occupancy over {sc['years_to_full_occupancy']:.0f} years; "
               f"rain: {res['rain_case']}. {res['standard']}.", align="justify")
    _table(doc, "Table 5. Water plan results with period and case labels", ["Item", "Value", "Unit", "Period", "Case / treatment"],
           [[k["name"], _fmt(k["value"]), k["unit"], k["period"], " · ".join(x for x in (k.get("case"), k.get("treatment")) if x)] for k in res["kpis"]],
           [4.6, 2.2, 2.4, 3.8, 3.4], 9)
    png = _figure_storage({**res, "daily": rec.get("daily")})
    if png:
        doc.add_picture(io.BytesIO(png), width=Cm(16))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        c = _para(doc, "Figure 1. (a) Daily storage in the reservoir, roof chambers and treated-water tank; (b) share of supply by source over the run, all after treatment.", 11, italic=True, align="center")
    _para(doc, f"Net zero discharge over the run: {'achieved' if res['net_zero_discharge'] else 'not achieved'} (water leaving the lease {res['totals_m3']['spill']:,.0f} m\u00b3 over the run).", 12)

    doc.add_heading("4. Recharge", level=1)
    cb = aquatwin.cloudburst_tiers(site)
    _table(doc, f"Table 6. Cloudburst recharge by depth tier ({cb.get('label', '')})",
           ["Tier", "Boundary", "To aquifer (%)", "Held in dry rock (%)", "Retained after 1 yr (%)", "Head benefit after 1 yr (m)"],
           [[r["tier"], r["boundary"], _fmt(r["to_aquifer_pct"]), _fmt(r["held_unsat_pct"]), _fmt(r["retained_1y_pct"]), _fmt(r["head_benefit_1y_m"])] for r in cb.get("summary", [])],
           [4.5, 2.2, 2.2, 2.4, 2.4, 2.3], 9)
    ms = aquatwin.modflow_scenarios(site)
    _table(doc, f"Table 7. MODFLOW scenarios ({ms.get('label', '')})",
           ["Scenario", "Boundary", "Runs", "Site recharge over 10 yr (m3)", "Drawdown at well, p50 (m)"],
           [[r["scenario_text"], r["boundary"], r["runs"], _fmt(r["site_recharge_10yr_m3_p50"]), _fmt(r["drawdown_well_end_m_p50"])] for r in ms.get("summary", [])],
           [6, 2.2, 1.4, 3.4, 3], 9)

    doc.add_heading("5. Integrity of the numbers", level=1)
    ch = consistency.run(site)
    _table(doc, "Table 8. Do the registry and the two engines agree?", ["Check", "Values by source", "Status", "Action"],
           [[c["title"], "; ".join(f"{v['source']}: {_fmt(v['value'])} {v.get('unit', '')}" for v in c["values"]), c["status"], c["action"]] for c in ch["checks"]],
           [3.2, 6.3, 1.6, 4.9], 8)

    doc.add_heading("6. Decisions", level=1)
    decs = runs.list_decisions(site) + aquatwin.decisions(site)["decisions"][-10:]
    _table(doc, "Table 9. Recent decisions", ["ID", "Date", "Decision", "By", "Status"],
           [[d["id"], d["date"], d["decision"][:220], d["by"], d["status"]] for d in decs], [1.8, 2.1, 8.0, 2.6, 1.5], 8)

    doc.add_heading("7. Field tests that will replace placeholders", level=1)
    _table(doc, "Table 10. Placeholders and the test that replaces each", ["ID", "Item", "Field test"],
           [[p["id"], p["item"], p["test"]] for p in reg.get("placeholders_to_replace", [])], [1.5, 7, 7.5], 10)
    if ai_notes:
        doc.add_heading("8. AI notes (interpretation, not calculation)", level=1)
        for n in ai_notes:
            _para(doc, n.get("question", ""), 11, True)
            _para(doc, n.get("answer", ""), 11, align="justify")

    out = settings.state_dir("reports", site) / f"NBL-Intelligence_Report_{reg['name']}_{datetime.now():%Y%m%d-%H%M%S}.docx"
    doc.save(str(out))
    return out
