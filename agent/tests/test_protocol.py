import json

import pytest

from reignroom_agent.protocol import Auth, Invalid, Pad, PadState, Release, parse

TOKEN = "A" * 22


def pad_msg(**over):
    msg = {"t": "pad", "pad": 2, "seq": 7, "b": 1, "lx": 0, "ly": 0, "rx": 0, "ry": 0, "l2": 0, "r2": 0}
    msg.update(over)
    return json.dumps(msg)


def test_accepts_the_three_messages():
    assert parse(json.dumps({"t": "auth", "v": 1, "token": TOKEN})) == Auth(TOKEN)
    assert parse(pad_msg()) == Pad(2, 7, PadState(b=1))
    assert parse(json.dumps({"t": "release", "pad": 4})) == Release(4)


@pytest.mark.parametrize(
    "raw",
    [
        pad_msg(pad=5),
        pad_msg(pad=0),
        pad_msg(b=1 << 14),  # unused button bit
        pad_msg(lx=128),
        pad_msg(ly=-129),
        pad_msg(l2=256),
        pad_msg(r2=-1),
        pad_msg(seq=-1),
        pad_msg(seq=2**32),
        pad_msg(b=True),  # JSON true is not 1
        pad_msg(lx=1.5),
        pad_msg(lx="1"),
        pad_msg(extra=1),
        json.dumps({"t": "pad", "pad": 2}),
        json.dumps({"t": "exec", "cmd": "calc"}),
        json.dumps({"t": "auth", "v": 2, "token": TOKEN}),
        json.dumps({"t": "auth", "v": 1, "token": "short"}),
        json.dumps({"t": "auth", "v": True, "token": TOKEN}),
        json.dumps([1, 2]),
        "not json",
        "[" * 1000,
        b'{"t":"release","pad":1}',
        json.dumps({"t": "release", "pad": 1, "pad2": 1}),
    ],
)
def test_rejects_everything_else(raw):
    with pytest.raises(Invalid):
        parse(raw)


def test_rejects_oversized_messages():
    with pytest.raises(Invalid):
        parse(json.dumps({"t": "release", "pad": 1, "x": "y" * 300}))
