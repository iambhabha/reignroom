# In-browser emulator build

The "Browser emulator (beta)" stream source runs [Play!](https://github.com/jpd002/Play-), a PS2
emulator by Jean-Philip Desjardins (BSD-2-Clause, see `apps/web/public/emu/rr2/LICENSE.txt`), in
the host's browser tab. The built files are in `apps/web/public/emu/rr2/`. No game or BIOS files
are part of it: the host loads their own disc image, and Play! needs no BIOS.

`play-reignroom.patch` is ReignRoom's change to Play!:

- Pads 1 and 2 take their whole state from JavaScript (`setPadState(pad, buttons, lx, ly, rx, ry)`),
  with real analog sticks. The stock web build has only keyboard keys for pad 1, and its L1/L2/L3/
  R1/R2/R3 keys can't be pressed (it expects codes like `Key1` that keyboards don't send).
- Netplay (lockstep): `startLockstep(clock)`, then `pushFrameInput(frame, …)` for both pads, in
  frame order. At each frame the emulator waits until that frame's input is there. It also
  records a hash of EE and IOP memory every 60 frames (`getHash`), and while in lockstep the PS2
  clock reads a fixed UTC time (`clock` + game time) instead of the computer's local time, which
  differs between players. Measured: two copies given the same input kept identical memory for
  10,740 frames, and changing one button on one frame showed up in the very next hash.
- `-sDYNAMIC_EXECUTION=0`: no `eval`/`new Function` in the JavaScript glue, so the site keeps a
  strict Content Security Policy (only `'wasm-unsafe-eval'` is added, for WebAssembly).

Limits, from Play!'s own code: no multitap (`Source/iop/Iop_Sio2.cpp`), so only P1 and P2; the
web build has no memory-page write protection and default float rounding (Play!'s README).

## Rebuild (Windows)

Tested with Play! commit `505dac73149fece41b04dd961078ce3011a8bed5` and Emscripten 4.0.1 (the
version Play!'s own CI uses). Short paths avoid Windows' 260-character path limit.

```powershell
git clone --recursive https://github.com/jpd002/Play-.git C:\rrtmp\play
cd C:\rrtmp\play
git checkout 505dac73149fece41b04dd961078ce3011a8bed5
git submodule update --init --recursive
git apply <path to this repo>\emulator\play-reignroom.patch

git clone https://github.com/emscripten-core/emsdk.git C:\rrtmp\emsdk
C:\rrtmp\emsdk\emsdk.bat install 4.0.1
C:\rrtmp\emsdk\emsdk.bat activate 4.0.1
python -m venv C:\rrtmp\buildtools
C:\rrtmp\buildtools\Scripts\pip install cmake ninja
```

Then in `cmd`:

```bat
call C:\rrtmp\emsdk\emsdk_env.bat
set PATH=C:\rrtmp\buildtools\Scripts;%PATH%
cd /d C:\rrtmp\play
emcmake cmake --preset wasm-ninja
cmake --build --preset wasm-ninja-release --target Play
```

Copy `build_cmake\build\wasm-ninja\Source\ui_js\Play.js` and `Play.wasm` into a **new** folder
(`apps/web/public/emu/rr2/`, and so on) and update `EMU_BASE` in `apps/web/src/lib/emu/emulator.ts`.
The files are cached forever, so a changed build must never reuse a folder name.

## Speed, measured on an i7-14700K (Chrome)

Urban Reign, Versus mode, 1v1 fight: about 47–53 fps on average, 1% lows around 25 fps, with
host and guest both playing. The limit is Play!'s emulated PS2 CPU running on one browser thread;
building with `-msimd128` and a fixed-size heap measured no faster (41 vs 42 fps on the intro).
PCSX2 with the ReignRoom agent stays the way to get a locked 60 fps and four players.
