"""Site registry: one site.yaml per NBL site holds the shared facts.

Both engines keep their own configuration files. The registry is the single
reference the platform checks them against (see consistency.py).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from . import settings


class SiteNotFound(KeyError):
    pass


def _site_files() -> dict[str, Path]:
    out: dict[str, Path] = {}
    root = settings.sites_root()
    if root.exists():
        for p in sorted(root.glob("*/site.yaml")):
            out[p.parent.name] = p
    return out


@lru_cache(maxsize=16)
def _load(path: str, mtime: float) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}


def get(site_id: str) -> dict[str, Any]:
    files = _site_files()
    key = site_id.lower()
    if key not in files:
        raise SiteNotFound(site_id)
    p = files[key]
    data = dict(_load(str(p), p.stat().st_mtime))
    data.setdefault("id", key)
    return data


def list_sites() -> list[dict[str, Any]]:
    out = []
    for sid in _site_files():
        s = get(sid)
        out.append({k: s.get(k) for k in ("id", "name", "status", "location", "centre", "stage", "client")})
    return out


def site_folder(site_id: str) -> Path:
    return settings.sites_root() / site_id.lower()


def fact(site_id: str, key: str, default: Any = None) -> Any:
    f = get(site_id).get("facts", {}).get(key)
    if isinstance(f, dict) and "value" in f:
        return f["value"]
    return default if f is None else f
