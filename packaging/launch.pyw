"""NBL-Intelligence launcher (installed app).

Lives in the install folder next to runtime\\ and app\\. On every start it
1. swaps in a downloaded update (app_pending\\ -> app\\, old app kept in app_previous\\),
2. installs libraries if the update changed requirements.txt,
3. starts NBL-Intelligence from app\\.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP, PENDING, PREVIOUS = ROOT / "app", ROOT / "app_pending", ROOT / "app_previous"
RUNTIME_PY = ROOT / "runtime" / "python.exe"
LOG = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "NBL-Intelligence" / "launcher.log"


def log(msg):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(msg + "\n")


def swap_in_update():
    if not (PENDING / "VERSION").exists():
        return
    try:
        if PREVIOUS.exists():
            shutil.rmtree(PREVIOUS)
        if APP.exists():
            APP.rename(PREVIOUS)
        PENDING.rename(APP)
        log("updated to " + (APP / "VERSION").read_text().strip())
    except OSError as e:
        log(f"update swap failed: {e}")
        if not APP.exists() and PREVIOUS.exists():
            PREVIOUS.rename(APP)


def sync_requirements():
    req = APP / "requirements.txt"
    done = ROOT / "installed_requirements.txt"
    if not req.exists():
        return
    if done.exists() and done.read_text() == req.read_text():
        return
    flags = 0x08000000 if sys.platform == "win32" else 0  # no console window
    r = subprocess.run([str(RUNTIME_PY), "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", str(req)],
                       capture_output=True, text=True, creationflags=flags)
    log("pip: " + (r.stdout + r.stderr)[-2000:])
    if r.returncode == 0:
        shutil.copy2(req, done)


def main():
    swap_in_update()
    sync_requirements()
    os.environ["NBL_INTELLIGENCE_INSTALLED"] = "1"
    sys.path.insert(0, str(APP / "backend"))
    os.chdir(APP)
    from nbl_intelligence.__main__ import main as run
    run()


if __name__ == "__main__":
    main()
