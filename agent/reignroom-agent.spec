# PyInstaller build: one self-contained reignroom-agent.exe with Python and the ViGEm client DLL.
#   pyinstaller --clean --noconfirm reignroom-agent.spec
from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("vgamepad")

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
    a.binaries,
    a.datas,
    name="reignroom-agent",
    console=True,
    upx=False,
)
