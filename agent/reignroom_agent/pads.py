"""Virtual controllers. PS2 layout in, Xbox 360 (XInput) controller out.

PCSX2's SDL input source maps an Xbox 360 pad to the PS2 layout automatically
(A = Cross, B = Circle, X = Square, Y = Triangle, shoulders = L1/R1, triggers = L2/R2).
"""

from __future__ import annotations

from typing import Protocol

from .protocol import BIT, NEUTRAL, PadState

# XUSB (XInput) button bits, from ViGEmClient's XUSB_BUTTON.
XUSB = {
    "up": 0x0001,
    "down": 0x0002,
    "left": 0x0004,
    "right": 0x0008,
    "start": 0x0010,
    "select": 0x0020,  # Back
    "l3": 0x0040,
    "r3": 0x0080,
    "l1": 0x0100,
    "r1": 0x0200,
    "cross": 0x1000,  # A
    "circle": 0x2000,  # B
    "square": 0x4000,  # X
    "triangle": 0x8000,  # Y
}


def _axis(v: int, invert: bool = False) -> int:
    """-128..127 → -32768..32767. Both ends reach full deflection, also when inverted."""
    unit = v / 128 if v < 0 else v / 127  # -1.0 .. 1.0
    if invert:
        unit = -unit
    return round(unit * 32768) if unit < 0 else round(unit * 32767)


def to_xusb(state: PadState) -> tuple[int, int, int, int, int, int, int]:
    """Returns (buttons, left trigger, right trigger, LX, LY, RX, RY) in XInput terms.

    XInput's Y axis points up; the browser's points down, so Y is inverted.
    """
    buttons = 0
    for name, xbit in XUSB.items():
        if state.b & BIT[name]:
            buttons |= xbit
    return (
        buttons,
        state.l2,
        state.r2,
        _axis(state.lx),
        _axis(state.ly, invert=True),
        _axis(state.rx),
        _axis(state.ry, invert=True),
    )


class PadBackend(Protocol):
    def open(self, slots: list[int]) -> None: ...
    def apply(self, slot: int, state: PadState) -> None: ...
    def release(self, slot: int) -> None: ...
    def close(self) -> None: ...
    @property
    def slots(self) -> list[int]: ...


class ViGEmBackend:
    """Virtual Xbox 360 pads through the ViGEmBus driver (via vgamepad).

    Pads are created at start-up in slot order, so they always appear to Windows and
    PCSX2 in the same order (first = lowest slot).
    """

    def __init__(self) -> None:
        self._pads: dict[int, object] = {}

    @property
    def slots(self) -> list[int]:
        return sorted(self._pads)

    def open(self, slots: list[int]) -> None:
        import vgamepad  # Imported here so tests and --dry-run work without the driver.

        for slot in sorted(set(slots)):
            self._pads[slot] = vgamepad.VX360Gamepad()
        self._settle()

    def _settle(self) -> None:
        """Make new pads report a centred state.

        Measured with ViGEmBus 1.17 on Windows 11: updates sent in the first ~50–150 ms
        after a pad appears never reach XInput, which then shows small stray stick values
        (about -3000) until the next change. Alternating an imperceptible 1-unit nudge for
        300 ms and then sending neutral leaves every pad at exactly 0.
        """
        import time

        for i in range(6):
            for pad in self._pads.values():
                pad.report.sThumbLX = i % 2  # type: ignore[attr-defined]
                pad.update()  # type: ignore[attr-defined]
            time.sleep(0.05)
        for slot in self._pads:
            self.apply(slot, NEUTRAL)

    def apply(self, slot: int, state: PadState) -> None:
        pad = self._pads.get(slot)
        if pad is None:
            raise KeyError(slot)
        buttons, lt, rt, lx, ly, rx, ry = to_xusb(state)
        report = pad.report  # type: ignore[attr-defined]
        report.wButtons = buttons
        report.bLeftTrigger = lt
        report.bRightTrigger = rt
        report.sThumbLX = lx
        report.sThumbLY = ly
        report.sThumbRX = rx
        report.sThumbRY = ry
        pad.update()  # type: ignore[attr-defined]

    def release(self, slot: int) -> None:
        if slot in self._pads:
            self.apply(slot, NEUTRAL)

    def close(self) -> None:
        for slot in list(self._pads):
            self.release(slot)
        self._pads.clear()


class MemoryBackend:
    """Records states instead of driving hardware. Used by tests and --dry-run."""

    def __init__(self, echo: bool = False) -> None:
        self.states: dict[int, PadState] = {}
        self.applied = 0
        self._slots: list[int] = []
        self._echo = echo

    @property
    def slots(self) -> list[int]:
        return list(self._slots)

    def open(self, slots: list[int]) -> None:
        self._slots = sorted(set(slots))
        for s in self._slots:
            self.states[s] = NEUTRAL

    def apply(self, slot: int, state: PadState) -> None:
        if slot not in self._slots:
            raise KeyError(slot)
        if self._echo and state != self.states.get(slot):
            pressed = [n for n, bit in BIT.items() if state.b & bit]
            print(f"  P{slot}: {' '.join(pressed) or '-'} L({state.lx},{state.ly}) R({state.rx},{state.ry}) "
                  f"L2 {state.l2} R2 {state.r2}")
        self.states[slot] = state
        self.applied += 1

    def release(self, slot: int) -> None:
        if slot in self.states:
            self.states[slot] = NEUTRAL

    def close(self) -> None:
        for s in self._slots:
            self.release(s)
