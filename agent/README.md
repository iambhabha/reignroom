# ReignRoom host agent

Runs on the **host's Windows PC**, next to PCSX2. It receives the guests' controller input from
the host's ReignRoom browser tab and feeds it into PCSX2 as virtual Xbox 360 controllers, and it
tells the host page whether PCSX2 is running Urban Reign.

> ReignRoom never provides, links to or helps you obtain the Urban Reign disc image or a PS2
> BIOS. Use only copies you dumped yourself from a disc and a console you own.

## Requirements

- Windows 10/11, 64-bit.
- **ViGEmBus 1.22.0** (virtual controller driver). The project is retired but its final signed
  installer still works: https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0.
  Older versions work too, but 1.22.0's installer has no auto-updater.
- PCSX2 (current stable). For a confirmed game check, turn on **Settings > Advanced >
  PINE Settings > Enable** (default slot 28011).

## Run

Download `reignroom-agent-<version>-windows-x64.zip` from the project's GitHub Releases, check its
SHA-256 (on the release page and the site's host guide), unzip it, and run `reignroom-agent.exe`
from that folder. It prints a **pairing token**; paste it once into the host page under
**Controller bridge**. The token is kept in `%LOCALAPPDATA%\ReignRoom\agent-token.txt` (your
own profile), readable only by your Windows account and SYSTEM, so it stays the same next time
(`--new-token` makes a new one).

```text
reignroom-agent.exe                 virtual controllers for P2, P3, P4 (host plays P1)
reignroom-agent.exe --pads 1,2,3,4  also a virtual P1
reignroom-agent.exe --dry-run       no driver needed; prints the input it receives
reignroom-agent.exe --dev           also accept local development sites (localhost)
```

The controllers are created in slot order (P2 first), which is the order Windows and PCSX2 list
them in.

## What it accepts (security)

- Listens on `127.0.0.1:47823` only, never on the network.
- Only pages from the ReignRoom site may connect (browser `Origin` check). A release build accepts
  exactly one site, written into it by the release workflow; localhost only with `--dev`.
- The first message must carry the pairing token. Five wrong tokens lock it for 30 seconds.
- After that it accepts exactly two messages: `pad` (one controller's buttons, sticks and
  triggers, every value range-checked) and `release`. Nothing else, no other commands.
- At most 120 messages per second per controller; extra ones are dropped.
- When the page disconnects, every controller is released to neutral.
- Game detection only uses PCSX2's read-only PINE queries (status, serial, title).

## Develop

```bash
py -3.14 -m venv .venv
.venv\Scripts\python -m pip install -e .[dev]
.venv\Scripts\python -m pytest
.venv\Scripts\python -m reignroom_agent --dev --dry-run
.venv\Scripts\python tools\test_client.py --token <token>
.venv\Scripts\pyinstaller --clean --noconfirm reignroom-agent.spec
```

The build is a folder, `dist\reignroom-agent\` (one-folder mode). Releases are built by
`.github/workflows/agent-release.yml` with PyInstaller's bootloader compiled from source.

Python 3.14 is verified: vgamepad creates controllers through ViGEmBus, websockets 17.3 and
PyInstaller 6.22.3 both support it, and the built `.exe` was run end to end.

vgamepad is pinned to upstream commit `3f910aa` (version 0.1.3, not on PyPI). The PyPI release
0.1.0 always starts ViGEmBus's interactive installer during `pip install` when the driver is
missing; 0.1.3 skips it when `VGAMEPAD_SKIP_VIGEMBUS_INSTALL=true` is set, which CI and the
release workflow do. Set it yourself before installing on a PC without the driver.
