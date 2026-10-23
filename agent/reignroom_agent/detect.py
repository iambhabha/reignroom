"""Is PCSX2 running Urban Reign?

1. PINE (PCSX2's local IPC, Settings > Advanced > PINE Settings > Enable): asks for the
   disc serial. Read-only queries only: MsgStatus (0x0F), MsgID (0x0C), MsgTitle (0x0B).
2. Fallback: the PCSX2 window title. Current PCSX2 shows the game *name* there, never the
   serial, so a title match is reported as "likely", not "confirmed".
"""

from __future__ import annotations

import socket
import struct
import sys
from dataclasses import dataclass

from .protocol import URBAN_REIGN_SERIALS

PINE_DEFAULT_SLOT = 28011
MSG_TITLE = 0x0B
MSG_ID = 0x0C
MSG_STATUS = 0x0F
IPC_OK = 0x00
STATUS_SHUTDOWN = 2


@dataclass(frozen=True)
class Detection:
    running: bool
    pine: bool
    serial: str | None
    title: str | None
    match: str  # confirmed | likely | wrong_game | no_game | not_running

    def to_message(self) -> dict:
        return {"running": self.running, "pine": self.pine, "serial": self.serial,
                "title": self.title, "match": self.match}


class PineClient:
    """Minimal PINE client: one request per connection, 4-byte little-endian size framing."""

    def __init__(self, port: int = PINE_DEFAULT_SLOT, timeout: float = 0.3) -> None:
        self.port = port
        self.timeout = timeout

    def query(self, opcode: int) -> bytes | None:
        try:
            with socket.create_connection(("127.0.0.1", self.port), timeout=self.timeout) as s:
                s.sendall(struct.pack("<IB", 5, opcode))
                header = _recv_exact(s, 4)
                size = struct.unpack("<I", header)[0]
                if size < 5 or size > 4096:
                    return None
                body = _recv_exact(s, size - 4)
        except OSError:
            return None
        if body[0] != IPC_OK:
            return None
        return body[1:]

    def status(self) -> int | None:
        payload = self.query(MSG_STATUS)
        return struct.unpack("<I", payload[:4])[0] if payload and len(payload) >= 4 else None

    def string(self, opcode: int) -> str | None:
        payload = self.query(opcode)
        if not payload or len(payload) < 4:
            return None
        length = struct.unpack("<I", payload[:4])[0]
        text = payload[4 : 4 + length].split(b"\0", 1)[0]
        return text.decode("utf-8", errors="replace").strip() or None


def _recv_exact(s: socket.socket, n: int) -> bytes:
    data = b""
    while len(data) < n:
        chunk = s.recv(n - len(data))
        if not chunk:
            raise OSError("connection closed")
        data += chunk
    return data


def pcsx2_window_titles() -> list[str]:
    """Titles of visible top-level windows that belong to a pcsx2*.exe process (Windows only)."""
    if sys.platform != "win32":
        return []
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    titles: list[str] = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def visit(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
        if not handle:
            return True
        try:
            buf = ctypes.create_unicode_buffer(1024)
            size = wintypes.DWORD(len(buf))
            if not kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
                return True
            exe = buf.value.rsplit("\\", 1)[-1].lower()
        finally:
            kernel32.CloseHandle(handle)
        if exe.startswith("pcsx2"):
            title = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, title, length + 1)
            titles.append(title.value)
        return True

    user32.EnumWindows(visit, 0)
    return titles


def detect(pine: PineClient, titles_fn=pcsx2_window_titles) -> Detection:
    status = pine.status()
    if status is not None:
        if status == STATUS_SHUTDOWN:
            return Detection(True, True, None, None, "no_game")
        serial = pine.string(MSG_ID)
        title = pine.string(MSG_TITLE)
        if serial is None:
            return Detection(True, True, None, title, "no_game")
        match = "confirmed" if serial.upper() in URBAN_REIGN_SERIALS else "wrong_game"
        return Detection(True, True, serial, title, match)

    titles = titles_fn()
    if not titles:
        return Detection(False, False, None, None, "not_running")
    for t in titles:
        if "urban reign" in t.lower():
            return Detection(True, False, None, t, "likely")
    # Without a game, PCSX2's windows are titled "PCSX2 vX.Y.Z" (or empty render windows).
    game_titles = [t for t in titles if not t.upper().startswith("PCSX2")]
    if game_titles:
        return Detection(True, False, None, game_titles[0], "wrong_game")
    return Detection(True, False, None, None, "no_game")
