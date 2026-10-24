# PyInstaller build: one folder, dist/reignroom-agent/, containing reignroom-agent.exe,
# the Python runtime and the ViGEm client DLL (in _internal/).
#
#   pyinstaller --clean --noconfirm reignroom-agent.spec
#
# Release builds first write reignroom_agent/site_origin.txt with the deployed site's origin
# (the release workflow does this); without it the agent only runs with --dev.
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("vgamepad")


def keep(entry):
    # Ship only the 64-bit ViGEm client DLL. vgamepad also carries old ViGEmBus 1.17 driver
    # installers (.msi); hosts install the driver (1.22.0) themselves, so leave those out.
    path = entry[0].replace("\\", "/").lower()
    return not path.endswith(".msi") and "/x86/" not in path


datas = [d for d in datas if keep(d)]
binaries = [b for b in binaries if keep(b)]
origin_file = Path("reignroom_agent/site_origin.txt")
if origin_file.exists():
    datas.append((str(origin_file), "reignroom_agent"))

a = Analysis(
    ["run_agent.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "unittest", "pytest"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    exclude_binaries=True,
    name="reignroom-agent",
    console=True,
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="reignroom-agent", upx=False)
