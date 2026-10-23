"""Messages between the host's browser tab and this agent.

Mirrors packages/protocol/src/input.ts. Anything that is not exactly one of the three
allowed messages, with every value in range, is rejected. The agent runs no other commands.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

AGENT_PORT = 47823
PROTOCOL = 1
SLOTS = (1, 2, 3, 4)
BUTTON_COUNT = 14
BUTTON_MASK = (1 << BUTTON_COUNT) - 1
MAX_MESSAGE_BYTES = 256
MAX_SEQ = 0xFFFFFFFF
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{22}$")

# Bit order of PadState.b (same as BUTTONS in input.ts).
BUTTONS = (
    "cross", "circle", "square", "triangle", "l1", "r1", "select", "start",
    "l3", "r3", "up", "down", "left", "right",
)
BIT = {name: 1 << i for i, name in enumerate(BUTTONS)}

# Retail Urban Reign serials from PCSX2's GameIndex.yaml (trial disc SLPM-60272 excluded).
URBAN_REIGN_SERIALS = frozenset({"SLUS-21209", "SCES-53688", "SLPS-25557", "SCAJ-20152", "SCKA-20065"})


class Invalid(ValueError):
    """The message is not one the agent accepts."""


@dataclass(frozen=True)
class PadState:
    """Sticks -128..127 (+y is down, as browsers report it); triggers 0..255."""

    b: int = 0
    lx: int = 0
    ly: int = 0
    rx: int = 0
    ry: int = 0
    l2: int = 0
    r2: int = 0


NEUTRAL = PadState()


@dataclass(frozen=True)
class Auth:
    token: str


@dataclass(frozen=True)
class Pad:
    pad: int
    seq: int
    state: PadState


@dataclass(frozen=True)
class Release:
    pad: int


Message = Auth | Pad | Release

_PAD_FIELDS = {"b", "lx", "ly", "rx", "ry", "l2", "r2"}
_KEYS = {
    "auth": {"t", "v", "token"},
    "pad": {"t", "pad", "seq"} | _PAD_FIELDS,
    "release": {"t", "pad"},
}


def _int(value: object, lo: int, hi: int) -> int:
    # bool is a subclass of int in Python; JSON true/false must not pass as 1/0.
    if type(value) is not int or not lo <= value <= hi:
        raise Invalid("value out of range")
    return value


def parse(raw: str | bytes) -> Message:
    if not isinstance(raw, str):
        raise Invalid("text messages only")
    if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise Invalid("message too large")
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, RecursionError) as err:
        raise Invalid("not JSON") from err
    if not isinstance(data, dict):
        raise Invalid("not an object")
    kind = data.get("t")
    if not isinstance(kind, str) or kind not in _KEYS or set(data) != _KEYS[kind]:
        raise Invalid("unknown message or fields")

    if kind == "auth":
        if data["v"] != PROTOCOL or type(data["v"]) is not int:
            raise Invalid("protocol version")
        token = data["token"]
        if not isinstance(token, str) or not TOKEN_RE.fullmatch(token):
            raise Invalid("token format")
        return Auth(token)

    pad = _int(data["pad"], 1, 4)
    if kind == "release":
        return Release(pad)

    state = PadState(
        b=_int(data["b"], 0, BUTTON_MASK),
        lx=_int(data["lx"], -128, 127),
        ly=_int(data["ly"], -128, 127),
        rx=_int(data["rx"], -128, 127),
        ry=_int(data["ry"], -128, 127),
        l2=_int(data["l2"], 0, 255),
        r2=_int(data["r2"], 0, 255),
    )
    return Pad(pad, _int(data["seq"], 0, MAX_SEQ), state)


def dumps(message: dict) -> str:
    return json.dumps(message, separators=(",", ":"))
