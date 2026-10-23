"""ReignRoom host agent.

    python -m reignroom_agent              # virtual pads for players 2–4
    python -m reignroom_agent --dry-run    # no driver needed; prints the input it receives
"""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import sys
from pathlib import Path

from . import __version__
from .detect import PINE_DEFAULT_SLOT, PineClient, detect
from .pads import MemoryBackend, PadBackend, ViGEmBackend
from .protocol import AGENT_PORT, TOKEN_RE
from .server import Agent

#: Pages allowed to connect. The deployed site's address is added at release time.
DEFAULT_ORIGINS = [
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://localhost:5173",
]

BANNER = """\
================================================================================
 ReignRoom host agent {version}  -  fan project for Urban Reign (PS2) in PCSX2
================================================================================
 Not affiliated with Bandai Namco or Sony. ReignRoom never provides, links to or
 helps you obtain the Urban Reign disc image or a PS2 BIOS. Use only copies you
 dumped yourself from a disc and a console you own.
--------------------------------------------------------------------------------"""


def token_file() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / "ReignRoom" / "agent-token.txt"


def load_or_create_token(renew: bool) -> str:
    """The token is kept between runs so the host pastes it into the site only once.

    It lives in the user's own profile folder; --new-token replaces it (e.g. if it leaked).
    """
    path = token_file()
    if not renew:
        try:
            saved = path.read_text(encoding="ascii").strip()
            if TOKEN_RE.fullmatch(saved):
                return saved
        except OSError:
            pass
    token = secrets.token_urlsafe(16)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(token, encoding="ascii")
    except OSError:
        pass  # Still usable for this run.
    return token


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="reignroom-agent", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pads", default="2,3,4",
                        help="player slots to create virtual controllers for (default: 2,3,4; "
                             "the host plays P1 on their own controller)")
    parser.add_argument("--dry-run", action="store_true",
                        help="don't create virtual controllers; print received input instead")
    parser.add_argument("--allow-origin", action="append", default=[], metavar="ORIGIN",
                        help="extra site address allowed to connect, e.g. https://*.trycloudflare.com")
    parser.add_argument("--pine-slot", type=int, default=PINE_DEFAULT_SLOT,
                        help=f"PCSX2 PINE slot (default {PINE_DEFAULT_SLOT})")
    parser.add_argument("--new-token", action="store_true",
                        help="create a new pairing token (the site will need the new one)")
    parser.add_argument("--token", help=argparse.SUPPRESS)  # fixed token for automated tests
    args = parser.parse_args(argv)

    try:
        slots = sorted({int(s) for s in args.pads.split(",") if s.strip()})
        if not slots or any(s not in (1, 2, 3, 4) for s in slots):
            raise ValueError
    except ValueError:
        parser.error("--pads takes slot numbers 1-4, e.g. 2,3,4")

    print(BANNER.format(version=__version__))

    backend: PadBackend
    pad_error = None
    if args.dry_run:
        backend = MemoryBackend(echo=True)
        backend.open(slots)
        print(" Dry run: no virtual controllers; input is printed below.")
    else:
        backend = ViGEmBackend()
        try:
            backend.open(slots)
            print(f" Virtual Xbox 360 controllers ready for players: {', '.join(f'P{s}' for s in slots)}")
            print(" They appear to Windows in that order. Bind them in PCSX2 as the host setup page shows.")
        except Exception as err:  # Driver missing or blocked.
            pad_error = ("Virtual controllers unavailable. Install ViGEmBus 1.22.0 "
                         "(github.com/nefarius/ViGEmBus/releases) and restart the agent.")
            print(f" ERROR: {pad_error}\n        ({err})")
            backend = MemoryBackend()

    token = args.token or load_or_create_token(args.new_token)
    print("--------------------------------------------------------------------------------")
    print(f" Pairing token:  {token}")
    print(" Paste it into the host page under 'Controller bridge' (only needed once per")
    print(" browser; it stays the same next time). Keep this window open while playing.")
    print(f" Listening on 127.0.0.1:{AGENT_PORT} (this computer only). Ctrl+C to quit.")
    print("--------------------------------------------------------------------------------")

    pine = PineClient(args.pine_slot)
    agent = Agent(
        token=token,
        backend=backend,
        detector=lambda: detect(pine),
        allowed_origins=DEFAULT_ORIGINS + args.allow_origin,
        pad_error=pad_error,
        log=lambda m: print(f" {m}", flush=True),
    )
    try:
        asyncio.run(agent.run(AGENT_PORT))
    except KeyboardInterrupt:
        pass
    except OSError as err:
        print(f" ERROR: can't listen on 127.0.0.1:{AGENT_PORT} ({err}). Is another agent already running?")
        return 1
    finally:
        backend.close()
        print(" Stopped. Virtual controllers removed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
