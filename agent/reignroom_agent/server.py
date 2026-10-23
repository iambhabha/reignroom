"""Local WebSocket server for the host's ReignRoom tab.

Security model:
- Listens on 127.0.0.1 only; nothing on the network can reach it.
- Only pages from the allowed site origins may connect (browsers always send Origin).
- The first message must carry the pairing token printed in this console.
- Afterwards only `pad` and `release` messages with in-range values are accepted.
"""

from __future__ import annotations

import asyncio
import fnmatch
import hmac
import time
from collections.abc import Callable

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Request, Response

from . import __version__
from .detect import Detection
from .pads import PadBackend
from .protocol import MAX_MESSAGE_BYTES, Auth, Invalid, Pad, Release, dumps, parse

AUTH_TIMEOUT_S = 5.0
STATUS_INTERVAL_S = 2.0
#: Per virtual pad. A guest sends on every change at up to ~60/s plus a 10/s resend.
PAD_RATE = 120
#: Wrong tokens before new attempts are refused for LOCKOUT_S.
MAX_BAD_TOKENS = 5
LOCKOUT_S = 30.0
#: Invalid messages within INVALID_WINDOW_S before the connection is closed.
MAX_INVALID = 20
INVALID_WINDOW_S = 10.0


class TokenBucket:
    def __init__(self, rate: float, capacity: float) -> None:
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last = time.monotonic()

    def take(self) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
        self.last = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


class Agent:
    def __init__(
        self,
        token: str,
        backend: PadBackend,
        detector: Callable[[], Detection],
        allowed_origins: list[str],
        pad_error: str | None = None,
        log: Callable[[str], None] = print,
    ) -> None:
        self.token = token
        self.backend = backend
        self.detector = detector
        self.allowed_origins = allowed_origins
        self.pad_error = pad_error
        self.log = log
        self.client: ServerConnection | None = None
        self.bad_tokens = 0
        self.locked_until = 0.0
        self.detection: Detection | None = None

    # ── Connection admission ──────────────────────────────────────────────

    def origin_allowed(self, origin: str | None) -> bool:
        if not origin:
            return False  # Browsers always send Origin; other local programs are not invited.
        return any(fnmatch.fnmatchcase(origin, pattern) for pattern in self.allowed_origins)

    def process_request(self, connection: ServerConnection, request: Request) -> Response | None:
        origin = request.headers.get("Origin")
        if not self.origin_allowed(origin):
            self.log(f"Refused a connection from {origin or 'a program without an Origin'}.")
            return connection.respond(403, "Forbidden origin\n")
        return None

    # ── Session ───────────────────────────────────────────────────────────

    async def handler(self, ws: ServerConnection) -> None:
        if time.monotonic() < self.locked_until:
            await self._error_close(ws, "bad_token")
            return
        try:
            first = await asyncio.wait_for(ws.recv(), AUTH_TIMEOUT_S)
            msg = parse(first)
        except (asyncio.TimeoutError, Invalid, ConnectionClosed):
            await self._error_close(ws, "bad_message")
            return
        if not isinstance(msg, Auth):
            await self._error_close(ws, "bad_message")
            return
        if not hmac.compare_digest(msg.token, self.token):
            self.bad_tokens += 1
            self.log("A page sent the wrong pairing token.")
            if self.bad_tokens >= MAX_BAD_TOKENS:
                self.bad_tokens = 0
                self.locked_until = time.monotonic() + LOCKOUT_S
                self.log(f"Too many wrong tokens; refusing connections for {int(LOCKOUT_S)} s.")
            await self._error_close(ws, "bad_token")
            return
        self.bad_tokens = 0

        previous = self.client
        self.client = ws
        if previous is not None:
            await self._error_close(previous, "replaced")
        self.log("Host page connected.")
        await ws.send(dumps({"t": "ready"}))
        await self.send_status(ws)

        buckets = {slot: TokenBucket(PAD_RATE, PAD_RATE) for slot in (1, 2, 3, 4)}
        invalid: list[float] = []
        try:
            async for raw in ws:
                try:
                    msg = parse(raw)
                    if isinstance(msg, Auth):
                        raise Invalid("already authenticated")
                except Invalid:
                    now = time.monotonic()
                    invalid = [t for t in invalid if now - t < INVALID_WINDOW_S] + [now]
                    if len(invalid) >= MAX_INVALID:
                        await self._error_close(ws, "bad_message")
                        return
                    continue
                if isinstance(msg, Pad):
                    if not buckets[msg.pad].take():
                        continue  # Over 120/s on this pad: drop; the next full state catches up.
                    try:
                        self.backend.apply(msg.pad, msg.state)
                    except KeyError:
                        await ws.send(dumps({"t": "error", "code": "pad_unavailable"}))
                        continue
                    await ws.send(dumps({"t": "ack", "pad": msg.pad, "seq": msg.seq}))
                elif isinstance(msg, Release):
                    self.backend.release(msg.pad)
        except ConnectionClosed:
            pass
        finally:
            if self.client is ws:
                self.client = None
                for slot in self.backend.slots:
                    self.backend.release(slot)
                self.log("Host page disconnected; all virtual pads released.")

    async def send_status(self, ws: ServerConnection) -> None:
        d = self.detection
        message = {
            "t": "status",
            "version": __version__,
            "pcsx2": d.to_message() if d else
            {"running": False, "pine": False, "serial": None, "title": None, "match": "not_running"},
            "pads": self.backend.slots,
            "padError": self.pad_error,
        }
        try:
            await ws.send(dumps(message))
        except ConnectionClosed:
            pass

    async def status_loop(self) -> None:
        last: Detection | None = None
        while True:
            self.detection = await asyncio.to_thread(self.detector)
            if self.detection != last:
                self.log(describe(self.detection))
                last = self.detection
            if self.client is not None:
                await self.send_status(self.client)
            await asyncio.sleep(STATUS_INTERVAL_S)

    async def _error_close(self, ws: ServerConnection, code: str) -> None:
        try:
            await ws.send(dumps({"t": "error", "code": code}))
            await ws.close(1008, code)
        except ConnectionClosed:
            pass

    async def run(self, port: int, ready: asyncio.Event | None = None) -> None:
        async with serve(
            self.handler,
            "127.0.0.1",
            port,
            process_request=self.process_request,
            max_size=MAX_MESSAGE_BYTES * 2,
            max_queue=64,
            compression=None,
        ):
            if ready:
                ready.set()
            await self.status_loop()


def describe(d: Detection) -> str:
    if d.match == "confirmed":
        return f"Urban Reign detected ({d.serial})."
    if d.match == "likely":
        return (f"PCSX2 window says '{d.title}'. Probably Urban Reign; enable PINE in PCSX2 "
                "(Settings > Advanced) to confirm the disc serial.")
    if d.match == "wrong_game":
        return f"WARNING: PCSX2 is running something else ({d.serial or d.title}). ReignRoom is for Urban Reign."
    if d.match == "no_game":
        return "PCSX2 is open but no game is running yet."
    return "WARNING: PCSX2 is not running."
