from reignroom_agent.pads import MemoryBackend, to_xusb
from reignroom_agent.protocol import BIT, NEUTRAL, PadState


def test_face_buttons_map_to_xbox_positions():
    buttons, *_ = to_xusb(PadState(b=BIT["cross"] | BIT["circle"] | BIT["square"] | BIT["triangle"]))
    assert buttons == 0x1000 | 0x2000 | 0x4000 | 0x8000  # A B X Y


def test_all_fourteen_buttons_map_to_distinct_bits():
    seen = set()
    for name, bit in BIT.items():
        buttons, *_ = to_xusb(PadState(b=bit))
        assert buttons and buttons not in seen, name
        seen.add(buttons)
    assert len(seen) == 14


def test_sticks_reach_full_range_and_y_is_inverted():
    _, _, _, lx, ly, rx, ry = to_xusb(PadState(lx=-128, ly=-128, rx=127, ry=127))
    assert (lx, rx) == (-32768, 32767)
    assert ly == 32767  # browser "up" (-128) is XInput "up" (+)
    assert ry == -32768  # browser "down" (+127) is XInput "down" (-)
    assert to_xusb(NEUTRAL) == (0, 0, 0, 0, 0, 0, 0)


def test_axis_values_stay_in_xinput_range():
    for v in range(-128, 128):
        _, _, _, lx, ly, *_ = to_xusb(PadState(lx=v, ly=v))
        assert -32768 <= lx <= 32767 and -32768 <= ly <= 32767
        assert (lx > 0) == (v > 0) and (ly > 0) == (v < 0)


def test_triggers_pass_through():
    _, lt, rt, *_ = to_xusb(PadState(l2=255, r2=40))
    assert (lt, rt) == (255, 40)


def test_memory_backend_releases_to_neutral():
    b = MemoryBackend()
    b.open([2, 3])
    b.apply(2, PadState(b=1))
    b.release(2)
    assert b.states[2] == NEUTRAL
    assert b.slots == [2, 3]
