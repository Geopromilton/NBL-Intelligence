"""Start NBL-Intelligence.

    python -m nbl_intelligence            desktop window (falls back to the browser)
    python -m nbl_intelligence --browser  open in the default browser
    python -m nbl_intelligence --server   API and web only (no window)
    python -m nbl_intelligence --prepare  rebuild 3D scenes and the document index
"""
from __future__ import annotations

import argparse
import os
import socket
import threading
import time
import webbrowser

from . import APP_NAME, __version__, registry, settings


def _free(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def _serve(port: int) -> None:
    import uvicorn
    from .api import app
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", log_config=None)


def _wait(port: int, timeout: float = 30) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if not _free(port):
            return True
        time.sleep(0.25)
    return False


def prepare() -> None:
    from . import knowledge, twin
    for s in registry.list_sites():
        print(f"[{s['id']}] 3D scene ...", flush=True)
        twin.scene(s["id"], rebuild=True)
        print(f"[{s['id']}] document index ...", flush=True)
        print("   ", knowledge.build(s["id"]))


def _quiet_streams() -> None:
    """pythonw has no console: send output to a log file instead of nowhere."""
    import sys
    if sys.stdout is None or sys.stderr is None:
        log = settings.state_dir("logs") / "nbl-intelligence.log"
        fh = open(log, "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stdout or fh
        sys.stderr = sys.stderr or fh


def main() -> None:
    _quiet_streams()
    ap = argparse.ArgumentParser(prog=APP_NAME)
    ap.add_argument("--browser", action="store_true")
    ap.add_argument("--server", action="store_true")
    ap.add_argument("--prepare", action="store_true")
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--wait-port", action="store_true", help="after an update: wait for the previous instance to close")
    a = ap.parse_args()
    if a.prepare:
        prepare()
        return
    port = a.port or int(settings.load().get("port", settings.DEFAULT_PORT))
    url = f"http://127.0.0.1:{port}/"
    print(f"{APP_NAME} {__version__} - {url}")
    if a.wait_port:
        t0 = time.time()
        while not _free(port) and time.time() - t0 < 20:
            time.sleep(0.3)
    if a.server or os.environ.get("NBL_INTELLIGENCE_SERVER_ONLY"):
        _serve(port)
        return
    if _free(port):
        threading.Thread(target=_serve, args=(port,), daemon=True).start()
    _wait(port)
    if not a.browser:
        try:
            import webview  # pywebview
            webview.create_window(APP_NAME, url, width=1520, height=940, min_size=(1180, 720))
            webview.start()
            return
        except Exception as e:  # noqa: BLE001
            print(f"Desktop window not available ({e}); opening the browser.")
    webbrowser.open(url)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
