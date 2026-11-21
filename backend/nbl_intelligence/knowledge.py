"""Site knowledge: a local search index over the project's own documents.

Indexes text from the project folder (desk study, scope, ADMT protocol and
reports), the AquaTwin run reports, user guide and decision log, and the
WaterPlan documents. Nothing leaves the computer when indexing; only the few
passages the AI retrieves for a question are sent with that question.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from . import registry, settings
from .engines import aquatwin

TEXT_EXT = {".md", ".txt", ".yaml", ".yml"}
DOC_EXT = {".docx"}
PDF_EXT = {".pdf"}
SKIP_DIRS = {"node_modules", ".venv", "__pycache__", "video_frames", "tmp", "%SystemDrive%", "AquaTwin-build",
             "_to_delete", "_legacy_v0.1", "Data_Collection_Report_Photos", ".git", "dist", "build", "target"}
MAX_BYTES = 40_000_000
CHUNK = 900
_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-\.]*")
STOP = set("the a an and or of to in on for is are was were be by with as at from that this it its into not no than then also can may per".split())


def _tok(t: str) -> list[str]:
    return [w.lower().strip(".") for w in _WORD.findall(t) if w.lower() not in STOP and len(w) > 1]


def _read(p: Path) -> str:
    ext = p.suffix.lower()
    try:
        if ext in TEXT_EXT:
            return p.read_text(encoding="utf-8", errors="ignore")
        if ext in DOC_EXT:
            import docx
            d = docx.Document(str(p))
            parts = [para.text for para in d.paragraphs if para.text.strip()]
            for tb in d.tables:
                for row in tb.rows:
                    parts.append(" | ".join(c.text.strip() for c in row.cells))
            return "\n".join(parts)
        if ext in PDF_EXT:
            from pypdf import PdfReader
            r = PdfReader(str(p))
            return "\n".join((pg.extract_text() or "") for pg in r.pages[:80])
    except Exception:
        return ""
    return ""


def _walk(base: Path, exts: set[str], depth: int = 6) -> Iterable[Path]:
    if not base.exists():
        return
    stack = [(base, 0)]
    while stack:
        d, lv = stack.pop()
        try:
            entries = list(d.iterdir())
        except OSError:
            continue
        for e in entries:
            if e.is_dir():
                if e.name in SKIP_DIRS or e.name.startswith("_backup") or e.name.startswith("_prev") or lv >= depth:
                    continue
                stack.append((e, lv + 1))
            elif e.suffix.lower() in exts and not e.name.startswith("~$"):
                try:
                    if e.stat().st_size <= MAX_BYTES:
                        yield e
                except OSError:
                    continue


def sources(site_id: str) -> list[tuple[str, Path]]:
    out: list[tuple[str, Path]] = []
    pf = settings.project_folder(registry.get(site_id).get("project_folder_key", site_id))
    if pf:
        for p in _walk(pf, TEXT_EXT | DOC_EXT | PDF_EXT, depth=3):
            out.append(("Project folder", p))
    at = settings.aquatwin_root()
    for p in _walk(at / "docs", TEXT_EXT | DOC_EXT, depth=3):
        out.append(("NBL-AquaTwin docs", p))
    if (at / "CHANGELOG.md").exists():
        out.append(("NBL-AquaTwin", at / "CHANGELOG.md"))
    rd = aquatwin.run_dir(site_id)
    if rd:
        for p in _walk(rd / "report", {".md"}, depth=1):
            out.append(("NBL-AquaTwin run report", p))
    sd = aquatwin.site_dir(site_id)
    for sub in ("02_assumptions", "06_interpretation"):
        for p in _walk(sd / sub, {".yaml"}, depth=1):
            out.append(("NBL-AquaTwin site pack", p))
    wp = settings.waterplan_root()
    for p in _walk(wp / "docs", {".md"}, depth=2):
        out.append(("NBL-WaterPlan docs", p))
    if (wp / "README.md").exists():
        out.append(("NBL-WaterPlan", wp / "README.md"))
    wcfg = wp / "sites" / site_id / "site_config.yaml"
    if wcfg.exists():
        out.append(("NBL-WaterPlan site pack", wcfg))
    reg = registry.site_folder(site_id) / "site.yaml"
    if reg.exists():
        out.append(("NBL-Intelligence registry", reg))
    return out


def _index_path(site_id: str) -> Path:
    return settings.state_dir("knowledge") / f"{site_id}.json"


def build(site_id: str) -> dict[str, Any]:
    old: dict[str, Any] = {}
    ip = _index_path(site_id)
    if ip.exists():
        try:
            old = json.loads(ip.read_text(encoding="utf-8"))
        except Exception:
            old = {}
    old_files = {f["path"]: f for f in old.get("files", [])}
    files, chunks = [], []
    for group, p in sources(site_id):
        try:
            mtime = p.stat().st_mtime
        except OSError:
            continue
        key = str(p)
        if key in old_files and old_files[key]["mtime"] == mtime:
            files.append(old_files[key])
            chunks.extend(c for c in old.get("chunks", []) if c["path"] == key)
            continue
        text = _read(p)
        if not text.strip():
            continue
        text = re.sub(r"[ \t]+", " ", text)
        paras = []
        for line in re.split(r"\n+", text):
            line = line.strip()
            while len(line) > CHUNK:
                cut = line.rfind(". ", 0, CHUNK)
                cut = cut + 1 if cut > CHUNK // 3 else CHUNK
                paras.append(line[:cut])
                line = line[cut:].strip()
            if line:
                paras.append(line)
        buf = ""
        n = 0
        for para in paras:
            if len(buf) + len(para) > CHUNK and buf:
                chunks.append({"path": key, "name": p.name, "group": group, "n": n, "text": buf.strip()})
                n += 1
                buf = ""
            buf += para + "\n"
        if buf.strip():
            chunks.append({"path": key, "name": p.name, "group": group, "n": n, "text": buf.strip()})
        files.append({"path": key, "name": p.name, "group": group, "mtime": mtime, "chunks": n + 1})
    df: Counter = Counter()
    for c in chunks:
        toks = _tok(c["text"])
        c["len"] = len(toks)
        df.update(set(toks))
    data = {"site": site_id, "files": files, "chunks": chunks, "df": dict(df), "n": len(chunks)}
    ip.write_text(json.dumps(data), encoding="utf-8")
    _cache.pop(site_id, None)
    return {"files": len(files), "chunks": len(chunks)}


_cache: dict[str, dict[str, Any]] = {}


def _load(site_id: str) -> dict[str, Any]:
    if site_id in _cache:
        return _cache[site_id]
    ip = _index_path(site_id)
    if not ip.exists():
        build(site_id)
    data = json.loads(ip.read_text(encoding="utf-8"))
    for c in data["chunks"]:
        c["_tf"] = Counter(_tok(c["text"]))
    _cache[site_id] = data
    return data


def search(site_id: str, query: str, k: int = 6) -> list[dict[str, Any]]:
    data = _load(site_id)
    q = _tok(query)
    if not q or not data["chunks"]:
        return []
    N = data["n"]
    avg = sum(c["len"] for c in data["chunks"]) / max(N, 1)
    df = data["df"]
    scored = []
    for c in data["chunks"]:
        tf = c["_tf"]
        s = 0.0
        for w in q:
            if w in tf:
                idf = math.log(1 + (N - df.get(w, 0) + 0.5) / (df.get(w, 0) + 0.5))
                f = tf[w]
                s += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * c["len"] / max(avg, 1)))
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda x: -x[0])
    out, seen = [], Counter()
    for s, c in scored:
        if seen[c["path"]] >= 2:
            continue
        seen[c["path"]] += 1
        out.append({"score": round(s, 2), "document": c["name"], "group": c["group"], "path": c["path"],
                    "passage": c["text"][:1200]})
        if len(out) >= k:
            break
    return out


def library(site_id: str) -> dict[str, Any]:
    data = _load(site_id)
    return {"files": [{k: f[k] for k in ("name", "group", "path", "chunks")} for f in data["files"]],
            "chunks": data["n"]}
