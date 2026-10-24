# Real-game test checklist (Urban Reign in PCSX2)

For testing with **your own** Urban Reign disc image and **your own** PS2 BIOS dump. ReignRoom never
provides either. Tick each box; if a step fails, stop and note what the "If it fails" line asks for.

Menu names below are from PCSX2 2.8.2's source code. Items marked *(unverified)* could not be checked
without a running game.

---

## A. Upgrade ViGEmBus 1.17 → 1.22.0 (once)

Your PC has **Nefarius Virtual Gamepad Emulation Bus Driver 1.17.333.0** (installed by the vgamepad
library's bundled setup). The guide tells hosts to use 1.22.0, so match it.

- [ ] Close the ReignRoom agent and any game or app using a controller.
- [ ] **Uninstall 1.17:** Windows **Settings → Apps → Installed apps** → find
      **Nefarius Virtual Gamepad Emulation Bus Driver** (1.17.333.0) → **⋯ → Uninstall**.
      (Same thing from a terminal: `MsiExec.exe /X{93D91F60-7C94-4A79-863F-EA713D2EB3F3}`.)
- [ ] Restart Windows if the uninstaller asks.
- [ ] **Install 1.22.0:** download `ViGEmBus_1.22.0_x64_x86_arm64.exe` (6.0 MB) from
      https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0, run it, accept the Windows admin
      prompt, finish.
- [ ] **Check:** Installed apps now lists the bus driver with version **1.22.0**, and this prints
      `OK`:

```powershell
(Get-PnpDevice -FriendlyName "*Virtual Gamepad Emulation Bus*").Status
```

- [ ] Start the agent; it should print `Virtual Xbox 360 controllers ready for players: P2, P3, P4`.

**If it fails:** the exact error text from the installer or the agent window, and the output of the
command above.

## B. PCSX2 settings

- [ ] **BIOS:** Settings → BIOS → point it at the folder with your own BIOS dump.
- [ ] **Game:** File → Start File… → your Urban Reign `.chd` (don't start it yet if you prefer; any order
      works).
- [ ] **Show the Advanced page** (it is hidden by default): **Tools → Show Advanced Settings** → PCSX2
      warns about advanced settings → **Yes**.
- [ ] **Enable PINE:** Settings → **Advanced** → **PINE Settings** → tick **Enable**, Slot **28011**.
      Restart PCSX2 so it listens.
- [ ] **Multitap:** Settings → **Controllers** → **Global Settings** → **Controller Multitap** → tick
      **Multitap on Console Port 1**. Leave **Enable SDL Input Source** ticked (default).
- [ ] **Start the ReignRoom agent now** (before binding), so the three virtual controllers exist.
- [ ] **Bind controllers** (Settings → Controllers; the left list now shows **Controller Port 1A–1D**):
  - **1A:** your own controller → **Automatic Mapping** → pick it.
  - **1B:** **Automatic Mapping** → pick the **first** virtual Xbox 360 controller.
  - **1C:** the **second** virtual one. **1D:** the **third**.
  - The agent creates them in order P2, P3, P4, so they're listed in that order after your own pad.
    The exact device names in the list *(unverified)*: note them for the guide.
- [ ] Optional check: **Tools → Controller Tester** while a guest presses buttons *(what it shows is
      unverified; note it)*.
- [ ] If the game runs slow: Settings → **Emulation** → **System Settings** → **EE Cycle Rate** →
      **130% (Overclock)** (PCSX2's GameDB note for Urban Reign recommends EE cycle rate +1).

**If it fails:** which setting or menu didn't match this list, with the exact labels you see.

## C. The test

1. [ ] Either the **deployed site** with the **released agent** (preferred: tests what hosts get), or
      locally: `npm run preview` (site at http://localhost:8787) and the agent started with `--dev`
      (`python -m reignroom_agent --dev` in `agent/`), since builds otherwise accept only the deployed site.
2. [ ] **Host** (Chrome): the site → name → **4** players → **Create room**.
3. [ ] **Controller bridge:** paste the agent's token → **Connected**, *Virtual controllers: P2, P3, P4*.
4. [ ] Boot the game. Within ~2 s the bridge panel shows **"Urban Reign detected (SLUS-21209)"** (or your
      region's serial), and the agent window prints the same.
5. [ ] **Stream:** Game window → 540p → **Start streaming** → pick the PCSX2 window.
6. [ ] **Guest** (second browser profile, or another device via the tunnel): open the invite link, join,
      take **P2**. Guest's line reads **"you control P2 in the game"**.
7. [ ] In Urban Reign, go to a mode with player selection *(which mode offers 2–4 players is unverified;
      note it)*. Guest presses Cross / moves the stick → **player 2** responds, not 1, 3 or 4.
8. [ ] Guest moves to **P3** in the lobby → now **player 3** responds. Then **P4** → **player 4**.
9. [ ] Host's own controller moves **player 1** throughout.
10. [ ] Note the guest's **Input round trip** and **Video** fps while playing.

Test one guest controller at a time if the guests are tabs on the same PC: every tab sees the same
physical controller.

## D. What to send back

| Check | Note |
|---|---|
| ViGEmBus upgrade | ok / error text |
| PINE serial shown on host page | serial, or what it said instead |
| Device names in PCSX2's Automatic Mapping list | exact text |
| P2 / P3 / P4 → correct in-game player? | yes / which player moved instead |
| Players 3–4 not responding at all | try **Multitap on Console Port 2** + bind 2A–2D, note which port works |
| Input round trip, video fps | numbers from the guest's stats |
| Anything that looked wrong or unclear | screenshot or exact text |
