"""3D site twin: prepares terrain, boundary, wells, sites and the ADMT block.

All geometry is converted to local metres (x east, y north) around the lease
centre in UTM 43N; elevations are m amsl and ADMT depths are m below ground.
Prepared scenes are cached in sites/<site>/twin/scene.json and rebuilt when
an input file changes.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import registry, settings
from .engines import aquatwin

# ------------------------------------------------------------- UTM (WGS84)
_A, _F, _K0 = 6378137.0, 1 / 298.257223563, 0.9996


def to_utm(lat: float, lon: float, zone: int = 43) -> tuple[float, float]:
    e2 = _F * (2 - _F)
    ep2 = e2 / (1 - e2)
    lat_r, lon_r = math.radians(lat), math.radians(lon)
    lon0 = math.radians((zone - 1) * 6 - 180 + 3)
    n = _A / math.sqrt(1 - e2 * math.sin(lat_r) ** 2)
    t = math.tan(lat_r) ** 2
    c = ep2 * math.cos(lat_r) ** 2
    a = math.cos(lat_r) * (lon_r - lon0)
    m = _A * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat_r
              - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * lat_r)
              + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * lat_r)
              - (35 * e2 ** 3 / 3072) * math.sin(6 * lat_r))
    x = _K0 * n * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * a ** 5 / 120) + 500000.0
    y = _K0 * (m + n * math.tan(lat_r) * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24
                                          + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * a ** 6 / 720))
    return x, y


def _dms(text: str) -> float | None:
    import re
    m = re.findall(r"(\d+)\s*deg\s*(\d+)'([\d.]+)\"", text)
    return m


# ------------------------------------------------------------- inputs
def _boundary_lonlat(site_id: str) -> list[tuple[float, float]]:
    p = settings.waterplan_root() / "sites" / site_id / "boundary" / f"{site_id}_lease.geojson"
    if not p.exists():
        cand = list((settings.waterplan_root() / "sites" / site_id / "boundary").glob("*.geojson"))
        p = cand[0] if cand else p
    if not p.exists():
        return []
    g = json.loads(p.read_text(encoding="utf-8"))
    geom = g.get("geometry") or g["features"][0]["geometry"]
    return [(float(x), float(y)) for x, y in geom["coordinates"][0]]


def _dem_path(site_id: str) -> Path | None:
    pf = settings.project_folder(registry.get(site_id).get("project_folder_key", site_id))
    if not pf:
        return None
    for name in ("Sid_FABDEM_2km.tif", "Sid_GLO30_2km.tif", "Sid_AW3D30_2km.tif", "Sid_NASADEM_2km.tif"):
        for p in pf.glob(f"**/{name}"):
            return p
    found = list(pf.glob("*DEM*/*.tif"))
    return found[0] if found else None


def _terrain(site_id: str, ox: float, oy: float, half: float = 950.0) -> dict[str, Any] | None:
    p = _dem_path(site_id)
    if p is None:
        return None
    import tifffile
    with tifffile.TiffFile(str(p)) as tf:
        page = tf.pages[0]
        arr = page.asarray().astype(float)
        scale = page.tags["ModelPixelScaleTag"].value
        tie = page.tags["ModelTiepointTag"].value
    dx, dy = scale[0], scale[1]
    x0, y0 = tie[3], tie[4]
    arr[arr < -1000] = np.nan
    cols = x0 + (np.arange(arr.shape[1]) + 0.5) * dx
    rows = y0 - (np.arange(arr.shape[0]) + 0.5) * dy
    ci = np.where((cols >= ox - half) & (cols <= ox + half))[0]
    ri = np.where((rows >= oy - half) & (rows <= oy + half))[0]
    sub = arr[np.ix_(ri, ci)]
    if np.isnan(sub).any():
        sub = np.where(np.isnan(sub), np.nanmean(sub), sub)
    return {"nx": int(len(ci)), "ny": int(len(ri)), "x": [round(float(c - ox), 1) for c in cols[ci]],
            "y": [round(float(r - oy), 1) for r in rows[ri]], "z": [round(float(v), 2) for v in sub.ravel()],
            "zmin": round(float(sub.min()), 2), "zmax": round(float(sub.max()), 2), "cell_m": dx,
            "source": f"{p.name} (30 m, bare-earth), project folder"}


def _ground(ter: dict | None, x: float, y: float, default: float = 918.0) -> float:
    if not ter:
        return default
    xs, ys = np.array(ter["x"]), np.array(ter["y"])
    i = int(np.argmin(abs(xs - x)))
    j = int(np.argmin(abs(ys - y)))
    return float(ter["z"][j * ter["nx"] + i])


def build_scene(site_id: str) -> dict[str, Any]:
    ring = _boundary_lonlat(site_id)
    utm = [to_utm(lat, lon) for lon, lat in ring]
    if utm:
        ox = float(np.mean([u[0] for u in utm[:-1]]))
        oy = float(np.mean([u[1] for u in utm[:-1]]))
    else:
        c = registry.get(site_id).get("centre", {})
        ox, oy = to_utm(c.get("lat", 12.8897), c.get("lon", 77.9152))
    ter = _terrain(site_id, ox, oy)
    scene: dict[str, Any] = {"site": site_id, "origin_utm": [round(ox, 2), round(oy, 2)], "crs": "EPSG:32643",
                             "terrain": ter}
    scene["boundary"] = [[round(u[0] - ox, 2), round(u[1] - oy, 2), round(_ground(ter, u[0] - ox, u[1] - oy), 2)] for u in utm]

    bw = aquatwin.borewells(site_id)["borewells"]
    scene["borewells"] = [{"id": b["id"], "x": round(b["E"] - ox, 1), "y": round(b["N"] - oy, 1),
                           "elev": b.get("elev_m"), "depth": b.get("total_depth_m"), "status": b.get("status"),
                           "strikes": b.get("strikes_m")} for b in bw if "E" in b]
    ds = aquatwin.drilling_sites(site_id)["sites"]
    scene["drilling_sites"] = [{"id": s["Site"], "role": s["Role"], "x": round(s["E"] - ox, 1), "y": round(s["N"] - oy, 1),
                                "zone": s.get("Primary_zone"), "score": s.get("Best_zone_score"), "basis": s.get("Basis"),
                                "ground": round(_ground(ter, s["E"] - ox, s["N"] - oy), 1)} for s in ds]
    rz = aquatwin.recharge_points(site_id)["points"]
    scene["recharge_points"] = [{"id": r["Site"], "x": round(r["E"] - ox, 1), "y": round(r["N"] - oy, 1),
                                 "tiers": r.get("Tiers_found"), "readings": r.get("Readings_found"),
                                 "zone_depth": r.get("Zone_depth_m"), "ground": round(_ground(ter, r["E"] - ox, r["N"] - oy), 1)}
                                for r in rz if r.get("E")]
    zs = aquatwin.zones(site_id)["zones"]
    scene["zones"] = [{"id": z["Zone"], "line": z["Line"], "x": round(z["Centre_E"] - ox, 1), "y": round(z["Centre_N"] - oy, 1),
                       "top": z["Top_m"], "bottom": z["Bottom_m"], "score": z["Score"], "type": z.get("Target_type"),
                       "transformer": bool(z.get("Transformer_affected"))} for z in zs if z.get("Centre_E")]
    tx, ty = to_utm(12 + 53 / 60 + 29.08 / 3600, 77 + 54 / 60 + 54.36 / 3600)
    scene["transformer"] = {"x": round(tx - ox, 1), "y": round(ty - oy, 1), "radius_m": 120}

    rd = aquatwin.run_dir(site_id)
    m0 = rd / "outputs" / "M0" / "M0_master_dataset.csv" if rd else None
    if m0 and m0.exists():
        m = pd.read_csv(m0, usecols=["line", "E", "N", "depth_nominal_m", "log10_dV_levelled", "decision"])
        m = m[m["decision"] != "exclude"].dropna(subset=["log10_dV_levelled"])
        scene["admt"] = {"x": (m["E"] - ox).round(1).tolist(), "y": (m["N"] - oy).round(1).tolist(),
                         "d": m["depth_nominal_m"].astype(int).tolist(), "v": m["log10_dV_levelled"].round(3).tolist(),
                         "line": m["line"].tolist(),
                         "label": "ADMT levelled response log10(dV), cells kept or flagged by M0 QC; purple = very low (clay-like), blue = water-bearing signal, red = high",
                         "source": aquatwin._src(m0)}
    m5 = rd / "outputs" / "M5" / "M5_ensemble.npz" if rd else None
    if m5 and m5.exists():
        d = np.load(m5, allow_pickle=True)
        X0, Y0 = float(d["X0"]), float(d["Y0"])
        block = {"xc": (d["xc"] + X0 - ox).round(1).tolist(), "yc": (d["yc"] + Y0 - oy).round(1).tolist(),
                 "zc": d["zc"].round(1).tolist(), "shape": list(d["p_permeable_I-POS"].shape),
                 "inside": d["inside"].astype(int).ravel().tolist(), "readings": {},
                 "label": "Probability that a cell is in a permeable class, 100 stochastic realisations (M5), by ADMT reading",
                 "source": aquatwin._src(m5)}
        for name, lab in zip(d["interp_names"], d["interp_labels"]):
            block["readings"][str(name)] = {"label": str(lab), "p": d[f"p_permeable_{name}"].round(2).ravel().tolist()}
        scene["block"] = block
    scene["stamp"] = aquatwin.STAMP
    return scene


def scene(site_id: str, rebuild: bool = False) -> dict[str, Any]:
    out = registry.site_folder(site_id) / "twin" / "scene.json"
    if out.exists() and not rebuild:
        return json.loads(out.read_text(encoding="utf-8"))
    s = build_scene(site_id)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(s, separators=(",", ":")), encoding="utf-8")
    return s
