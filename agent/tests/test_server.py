import asyncio
import json
import socket

import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

from reignroom_agent.detect import Detection
from reignroom_agent.pads import MemoryBackend
from reignroom_agent.protocol import NEUTRAL, PadState
from reignroom_agent.server import Agent

TOKEN = "T" * 22
ORIGIN = "http://localhost:8787"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def pad(slot, seq, **state):
    return json.dumps({"t": "pad", "pad": slot, "seq": seq, "b": 0, "lx": 0, "ly": 0, "rx": 0,
                       "ry": 0, "l2": 0, "r2": 0, **state})


class Harness:
    def __init__(self):
        self.backend = MemoryBackend()
        self.backend.open([2, 3, 4])
        self.agent = Agent(
            token=TOKEN,
            backend=self.backend,
            detector=lambda: Detection(True, True, "SLUS-21209", "Urban Reign", "confirmed"),
            allowed_origins=[ORIGIN, "https://*.trycloudflare.com"],
            log=lambda m: None,
        )
        self.port = free_port()

    async def __aenter__(self):
        ready = asyncio.Event()
        self.task = asyncio.create_task(self.agent.run(self.port, ready))
        await ready.wait()
        return self

    async def __aexit__(self, *exc):
        self.task.cancel()
        try:
            await self.task
        except asyncio.CancelledError:
            pass

    def connect(self, origin=ORIGIN):
        return connect(f"ws://127.0.0.1:{self.port}", origin=origin)

    async def paired(self):
        ws = await self.connect()
        await ws.send(json.dumps({"t": "auth", "v": 1, "token": TOKEN}))
        assert json.loads(await ws.recv()) == {"t": "ready"}
        status = json.loads(await ws.recv())
        assert status["t"] == "status"
        return ws, status


def run(coro):
    return asyncio.run(coro)


def test_pairs_and_reports_status():
    async def go():
        async with Harness() as h:
            ws, status = await h.paired()
            assert status["pcsx2"]["match"] == "confirmed"
            assert status["pads"] == [2, 3, 4]
            await ws.close()
    run(go())


@pytest.mark.parametrize("origin", ["https://evil.example", "null"])
def test_refuses_foreign_origins(origin):
    async def go():
        async with Harness() as h:
            with pytest.raises(InvalidStatus) as err:
                await h.connect(origin)
            assert err.value.response.status_code == 403
    run(go())


def test_accepts_wildcard_origin_pattern():
    async def go():
        async with Harness() as h:
            ws = await h.connect("https://some-words.trycloudflare.com")
            await ws.close()
    run(go())


def test_wrong_token_is_refused_and_locks_out_after_five():
    async def go():
        async with Harness() as h:
            for _ in range(5):
                ws = await h.connect()
                await ws.send(json.dumps({"t": "auth", "v": 1, "token": "W" * 22}))
                assert json.loads(await ws.recv()) == {"t": "error", "code": "bad_token"}
                with pytest.raises(ConnectionClosed):
                    await ws.recv()
            # Locked out now, even with the right token.
            ws = await h.connect()
            assert json.loads(await ws.recv()) == {"t": "error", "code": "bad_token"}
    run(go())


def test_must_authenticate_first():
    async def go():
        async with Harness() as h:
            ws = await h.connect()
            await ws.send(pad(2, 1, b=1))
            assert json.loads(await ws.recv()) == {"t": "error", "code": "bad_message"}
            assert h.backend.applied == 0
    run(go())


def test_applies_input_and_acks():
    async def go():
        async with Harness() as h:
            ws, _ = await h.paired()
            await ws.send(pad(2, 41, b=1, lx=-128, l2=200))
            assert json.loads(await ws.recv()) == {"t": "ack", "pad": 2, "seq": 41}
            assert h.backend.states[2] == PadState(b=1, lx=-128, l2=200)
            await ws.close()
    run(go())


def test_ignores_invalid_messages_without_applying_them():
    async def go():
        async with Harness() as h:
            ws, _ = await h.paired()
            for bad in [pad(2, 1, lx=999), '{"t":"exec"}', pad(9, 1)]:
                await ws.send(bad)
            await ws.send(pad(3, 2, b=2))
            assert json.loads(await ws.recv()) == {"t": "ack", "pad": 3, "seq": 2}
            assert h.backend.applied == 1
            await ws.close()
    run(go())


def test_closes_on_sustained_garbage():
    async def go():
        async with Harness() as h:
            ws, _ = await h.paired()
            for _ in range(20):
                await ws.send("nope")
            assert json.loads(await ws.recv()) == {"t": "error", "code": "bad_message"}
    run(go())


def test_rate_limit_is_per_pad():
    """300 messages on P2 hit its 120/s budget; P3's 100 in the same burst all get through."""
    async def go():
        async with Harness() as h:
            ws, _ = await h.paired()
            for i in range(300):
                await ws.send(pad(2, i, b=1))
                if i < 100:
                    await ws.send(pad(3, i, b=1))
            acks = {2: 0, 3: 0}
            try:
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 0.5))
                    if m["t"] == "ack":
                        acks[m["pad"]] += 1
            except asyncio.TimeoutError:
                pass
            assert acks[3] == 100
            assert 115 <= acks[2] <= 140  # burst of 120 plus a little refill
            await ws.close()
    run(go())


def test_unknown_slot_reports_pad_unavailable():
    async def go():
        async with Harness() as h:
            ws, _ = await h.paired()
            await ws.send(pad(1, 1, b=1))  # agent created pads 2-4 only
            assert json.loads(await ws.recv()) == {"t": "error", "code": "pad_unavailable"}
            await ws.close()
    run(go())


def test_releases_all_pads_when_the_page_disconnects():
    async def go():
        async with Harness() as h:
            ws, _ = await h.paired()
            await ws.send(pad(2, 1, b=1, lx=50))
            await ws.recv()
            await ws.close()
            await asyncio.sleep(0.1)
            assert h.backend.states[2] == NEUTRAL
    run(go())


def test_newest_page_replaces_the_older_one():
    async def go():
        async with Harness() as h:
            old, _ = await h.paired()
            new, _ = await h.paired()
            assert json.loads(await old.recv()) == {"t": "error", "code": "replaced"}
            await new.send(pad(2, 5, b=1))
            assert json.loads(await new.recv())["t"] == "ack"
            await new.close()
    run(go())
