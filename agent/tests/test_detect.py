import socket
import struct
import threading

import pytest

from reignroom_agent.detect import PineClient, detect


class FakePine:
    """Answers PINE requests the way PCSX2's PINE.cpp frames them."""

    def __init__(self, status=0, serial="SLUS-21209", title="Urban Reign"):
        self.status, self.serial, self.title = status, serial, title
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen()
        self.port = self.sock.getsockname()[1]
        self.opcodes = []
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self):
        while True:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            with conn:
                size = struct.unpack("<I", conn.recv(4))[0]
                opcode = conn.recv(size - 4)[0]
                self.opcodes.append(opcode)
                conn.sendall(self._reply(opcode))

    def _reply(self, opcode):
        def frame(result, payload=b""):
            return struct.pack("<IB", 5 + len(payload), result) + payload

        if opcode == 0x0F:
            return frame(0, struct.pack("<I", self.status))
        if opcode in (0x0C, 0x0B):
            if self.status == 2:
                return frame(0xFF)  # no VM
            text = (self.serial if opcode == 0x0C else self.title).encode() + b"\0"
            return frame(0, struct.pack("<I", len(text)) + text)
        return frame(0xFF)

    def close(self):
        self.sock.close()


@pytest.fixture
def pine():
    servers = []

    def make(**kw):
        s = FakePine(**kw)
        servers.append(s)
        return s

    yield make
    for s in servers:
        s.close()


def test_confirms_urban_reign_by_serial(pine):
    p = pine()
    d = detect(PineClient(p.port))
    assert (d.running, d.pine, d.serial, d.title, d.match) == (True, True, "SLUS-21209", "Urban Reign", "confirmed")
    assert set(p.opcodes) == {0x0F, 0x0C, 0x0B}  # read-only queries only


@pytest.mark.parametrize("serial", ["SCES-53688", "SLPS-25557", "SCAJ-20152", "SCKA-20065"])
def test_all_retail_regions_count(pine, serial):
    assert detect(PineClient(pine(serial=serial).port)).match == "confirmed"


def test_trial_disc_and_other_games_are_wrong_game(pine):
    assert detect(PineClient(pine(serial="SLPM-60272").port)).match == "wrong_game"
    assert detect(PineClient(pine(serial="SLUS-20062", title="Other").port)).match == "wrong_game"


def test_pcsx2_open_without_a_game(pine):
    assert detect(PineClient(pine(status=2).port)).match == "no_game"


def unused_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def test_window_title_fallback_without_pine():
    no_pine = PineClient(unused_port())
    assert detect(no_pine, lambda: ["Urban Reign"]).match == "likely"
    assert detect(no_pine, lambda: ["PCSX2 v2.8.2"]).match == "no_game"
    assert detect(no_pine, lambda: ["PCSX2 v2.8.2", "Some Other Game"]).match == "wrong_game"
    assert detect(no_pine, lambda: []).match == "not_running"
