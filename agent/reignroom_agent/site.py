"""Which ReignRoom site may talk to this agent.

Release builds bundle `site_origin.txt` with exactly one line, the deployed site's origin
(e.g. https://reignroom.example.workers.dev), written by the release workflow. Local
development addresses are only allowed with --dev.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DEV_ORIGINS = [
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://localhost:5173",
]

_ORIGIN_RE = re.compile(r"^https://[a-z0-9.-]+(:\d+)?$")


def _bundle_dir() -> Path:
    # PyInstaller puts bundled data next to the package (one-folder: _internal/).
    base = getattr(sys, "_MEIPASS", None)
    return Path(base) / "reignroom_agent" if base else Path(__file__).parent


def release_origin() -> str | None:
    try:
        text = (_bundle_dir() / "site_origin.txt").read_text(encoding="ascii").strip()
    except OSError:
        return None
    return text if _ORIGIN_RE.fullmatch(text) else None
