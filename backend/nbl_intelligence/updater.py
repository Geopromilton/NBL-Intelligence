"""Updates without reinstalling.

The Windows installer puts a private Python runtime in runtime\\ and the program
in app\\. An update replaces only app\\:

1. check()  - asks GitHub for the latest release of Geopromilton/NBL-Intelligence.
2. apply()  - downloads nbl-intelligence-app.zip, verifies its SHA-256, and
              unpacks it to app_pending\\ next to app\\.
3. restart  - the launcher (launch.pyw) swaps app_pending\\ in at the next start,
              keeps the previous version in app_previous\\ for roll-back, and
              installs any new libraries listed in requirements.txt.

Data never lives in app\\ (sites, runs, decisions, reports and settings are in
%LOCALAPPDATA%\\NBL-Intelligence), so an update cannot touch them.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path
from typing import Any

import httpx

from . import __version__, settings

REPO = "Geopromilton/NBL-Intelligence"
ASSET = "nbl-intelligence-app.zip"
API = f"https://api.github.com/repos/{REPO}/releases/latest"


def _vt(v: str) -> tuple:
    v = v.strip().lstrip("vV")
    out = []
    for part in v.split("."):
        num = "".join(ch for ch in part if ch.isdigit())
        out.append(int(num) if num else 0)
    return tuple(out + [0] * (3 - len(out)))


def mode() -> str:
    if settings.INSTALL_ROOT:
        return "installed"
    if settings.FROZEN:
        return "frozen"
    return "source"


def check() -> dict[str, Any]:
    info: dict[str, Any] = {"current": __version__, "mode": mode(), "repo": REPO}
    try:
        r = httpx.get(API, headers={"Accept": "application/vnd.github+json"}, timeout=15, follow_redirects=True)
        if r.status_code == 404:
            return {**info, "available": False, "note": "No release has been published yet."}
        r.raise_for_status()
        rel = r.json()
    except Exception as e:  # noqa: BLE001
        return {**info, "available": False, "error": f"Could not reach GitHub ({type(e).__name__})."}
    latest = rel.get("tag_name", "")
    assets = {a["name"]: a["browser_download_url"] for a in rel.get("assets", [])}
    available = _vt(latest) > _vt(__version__) and ASSET in assets
    pending = (settings.INSTALL_ROOT / "app_pending" / "VERSION").exists() if settings.INSTALL_ROOT else False
    return {**info, "latest": latest.lstrip("v"), "available": available, "notes": (rel.get("body") or "")[:4000],
            "published": rel.get("published_at"), "pending_restart": pending,
            "can_apply": mode() == "installed",
            "note": None if mode() == "installed" else "This copy runs from the editable source folder; it is updated by editing files or with git, not by the in-app updater.",
            "_zip": assets.get(ASSET), "_sha": assets.get(ASSET + ".sha256")}


def apply() -> dict[str, Any]:
    if not settings.INSTALL_ROOT:
        raise RuntimeError("In-app updates work in the installed app only.")
    info = check()
    if not info.get("available"):
        return {"applied": False, "reason": info.get("error") or info.get("note") or "Already up to date."}
    dl = settings.user_dir() / "updates"
    dl.mkdir(parents=True, exist_ok=True)
    zpath = dl / f"nbl-intelligence-app-{info['latest']}.zip"
    with httpx.stream("GET", info["_zip"], timeout=120, follow_redirects=True) as r:
        r.raise_for_status()
        with open(zpath, "wb") as fh:
            for chunk in r.iter_bytes():
                fh.write(chunk)
    if info.get("_sha"):
        expected = httpx.get(info["_sha"], timeout=30, follow_redirects=True).text.split()[0].strip().lower()
        actual = hashlib.sha256(zpath.read_bytes()).hexdigest()
        if actual != expected:
            zpath.unlink(missing_ok=True)
            raise RuntimeError("The downloaded update failed its SHA-256 check and was discarded.")
    pending = settings.INSTALL_ROOT / "app_pending"
    if pending.exists():
        shutil.rmtree(pending)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(pending)
    if not (pending / "VERSION").exists():
        shutil.rmtree(pending, ignore_errors=True)
        raise RuntimeError("The update package is incomplete.")
    return {"applied": True, "version": info["latest"], "restart_required": True}


def rollback() -> dict[str, Any]:
    if not settings.INSTALL_ROOT:
        raise RuntimeError("Roll-back works in the installed app only.")
    prev = settings.INSTALL_ROOT / "app_previous"
    if not (prev / "VERSION").exists():
        return {"ok": False, "reason": "No previous version is kept."}
    pending = settings.INSTALL_ROOT / "app_pending"
    if pending.exists():
        shutil.rmtree(pending)
    shutil.copytree(prev, pending)
    return {"ok": True, "version": (prev / "VERSION").read_text().strip(), "restart_required": True}


def restart_soon(delay: float = 1.0) -> None:
    """Start a fresh launcher and end this process (used after an update)."""
    if not settings.INSTALL_ROOT:
        raise RuntimeError("Restart from the app works in the installed app only.")
    launcher = settings.INSTALL_ROOT / "launch.pyw"
    pyw = Path(sys.executable).with_name("pythonw.exe")
    exe = str(pyw if pyw.exists() else sys.executable)

    def go():
        time.sleep(delay)
        flags = 0x00000008 | 0x00000200 if sys.platform == "win32" else 0  # DETACHED_PROCESS | NEW_PROCESS_GROUP
        subprocess.Popen([exe, str(launcher), "--wait-port"], cwd=str(settings.INSTALL_ROOT), creationflags=flags, close_fds=True)
        os._exit(0)
    threading.Thread(target=go, daemon=True).start()
