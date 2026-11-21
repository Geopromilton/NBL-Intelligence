"""Settings and folders for NBL-Intelligence.

Two ways of running:
* From source (developer): program, sites and state live in the product folder.
* Installed (standalone Windows app built with PyInstaller): the program is
  read-only in Program Files; sites, state and settings live in
  %LOCALAPPDATA%\\NBL-Intelligence. Site registries shipped with the program are
  copied there on first start and are never overwritten afterwards.

Order of precedence: environment variables > user settings file > defaults.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

FROZEN = bool(getattr(sys, "frozen", False))
# INSTALLED: started by the Windows installer's launcher (runtime\ + app\ folders).
# Program code in app\ is replaced by updates, so all data lives in %LOCALAPPDATA%.
INSTALLED = FROZEN or bool(os.environ.get("NBL_INTELLIGENCE_INSTALLED"))
BUNDLE_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
PRODUCT_ROOT = Path(sys.executable).resolve().parent if FROZEN else Path(__file__).resolve().parents[2]
INSTALL_ROOT = PRODUCT_ROOT.parent if INSTALLED and not FROZEN else None
WEB_DIST = BUNDLE_ROOT / "web" / "dist"
BUNDLED_SITES = BUNDLE_ROOT / "sites"
DEFAULT_PORT = 8780


def user_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "NBL-Intelligence"
    return Path.home() / ".nbl-intelligence"


SETTINGS_FILE = user_dir() / "settings.json"
STATE_ROOT = Path(os.environ.get("NBL_INTELLIGENCE_STATE") or (user_dir() / "state" if INSTALLED else PRODUCT_ROOT / "state"))

DEFAULTS: dict[str, Any] = {
    "aquatwin_root": r"D:\NBL-AquaTwin",
    "waterplan_root": r"D:\NBL-WaterPlan",
    "project_folders": {"siddanahalli": r"D:\Siddanahalli"},
    "sites_root": "",               # empty = default (see sites_root())
    "aquatwin_python": "",          # python.exe for long AquaTwin runs; empty = auto
    "auto_check_updates": True,
    "port": DEFAULT_PORT,
    "theme": "auto",
    "welcome_done": False,
    "ai": {
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": "deepseek-ai/deepseek-v4.1-flash",
        "fallback_model": "nvidia/nemotron-3-super-120b-a12b",
        "timeout_s": 60,
        "temperature": 0.2,
        "max_tokens": 4000,
        "max_steps": 6,
        "stream": True,
    },
}

_ENV = {"aquatwin_root": "NBL_AQUATWIN_ROOT", "waterplan_root": "NBL_WATERPLAN_ROOT", "sites_root": "NBL_INTELLIGENCE_SITES"}


def _merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load() -> dict[str, Any]:
    data = json.loads(json.dumps(DEFAULTS))
    if SETTINGS_FILE.exists():
        try:
            data = _merge(data, json.loads(SETTINGS_FILE.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    for key, env in _ENV.items():
        if os.environ.get(env):
            data[key] = os.environ[env]
    if os.environ.get("NBL_SIDDANAHALLI_ROOT"):
        data["project_folders"] = {**data["project_folders"], "siddanahalli": os.environ["NBL_SIDDANAHALLI_ROOT"]}
    if os.environ.get("NBL_INTELLIGENCE_PORT"):
        data["port"] = int(os.environ["NBL_INTELLIGENCE_PORT"])
    return data


def save(update: dict[str, Any]) -> dict[str, Any]:
    current: dict[str, Any] = {}
    if SETTINGS_FILE.exists():
        try:
            current = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            current = {}
    clean = {k: v for k, v in update.items() if k in DEFAULTS}
    merged = _merge(current, clean)
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    return load()


def sites_root() -> Path:
    """Folder holding sites\\<id>\\site.yaml. Writable (the 3D scene cache lives there)."""
    configured = load().get("sites_root")
    if configured:
        return Path(configured)
    if not INSTALLED:
        return PRODUCT_ROOT / "sites"
    root = user_dir() / "sites"
    if BUNDLED_SITES.exists():
        for src in BUNDLED_SITES.iterdir():
            dst = root / src.name
            if src.is_dir() and not (dst / "site.yaml").exists():
                dst.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src / "site.yaml", dst / "site.yaml")
    return root


def aquatwin_root() -> Path:
    return Path(load()["aquatwin_root"])


def waterplan_root() -> Path:
    return Path(load()["waterplan_root"])


def project_folder(site_id: str) -> Path | None:
    p = load()["project_folders"].get(site_id)
    return Path(p) if p else None


def state_dir(*parts: str) -> Path:
    d = STATE_ROOT.joinpath(*parts)
    d.mkdir(parents=True, exist_ok=True)
    return d
