"""Manual test for a running agent: pairs like the host page would, then drives one pad.

    python tools/test_client.py --token <pairing token> [--pad 2]

Presses every PS2 button in turn, sweeps both sticks and triggers, and prints the
agent's acknowledgement time for each message. Watch the pad in PCSX2's controller
settings or in Windows' "Set up USB game controllers" (joy.cpl).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import time

from websockets.asyncio.client import connect

BUTTONS = ("cross", "circle", "square", "triangle", "l1", "r1", "select", "start",
           "l3", "r3", "up", "down", "left", "right")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True)
    ap.add_argument("--pad", type=int, default=2)
    ap.add_argument("--origin", default="http://localhost:8787")
    ap.add_argument("--hold", type=float, default=0.3, help="seconds per step")
    args = ap.parse_args()

    async with connect("ws://127.0.0.1:47823", origin=args.origin) as ws:
        await ws.send(json.dumps({"t": "auth", "v": 1, "token": args.token}))
        print("agent:", await ws.recv())
        status = json.loads(await ws.recv())
        print("pads:", status["pads"], "| PCSX2:", status["pcsx2"]["match"], status["pcsx2"]["serial"] or "")

        seq = 0
        rtts: list[float] = []

        async def send(**state: int) -> None:
            nonlocal seq
            seq += 1
            msg = {"t": "pad", "pad": args.pad, "seq": seq, "b": 0, "lx": 0, "ly": 0, "rx": 0, "ry": 0,
                   "l2": 0, "r2": 0, **state}
            t0 = time.perf_counter()
            await ws.send(json.dumps(msg))
            while True:
                reply = json.loads(await ws.recv())
                if reply.get("t") == "ack" and reply.get("seq") == seq:
                    rtts.append((time.perf_counter() - t0) * 1000)
                    return
                if reply.get("t") == "error":
                    raise SystemExit(f"agent error: {reply['code']}")

        for i, name in enumerate(BUTTONS):
            print(f"  {name}")
            await send(b=1 << i)
            await asyncio.sleep(args.hold)
        for label, field in (("L2", "l2"), ("R2", "r2")):
            print(f"  {label}")
            await send(**{field: 255})
            await asyncio.sleep(args.hold)
        print("  sticks: one full circle each")
        for step in range(48):
            a = step / 48 * 2 * math.pi
            x, y = round(math.cos(a) * 127), round(math.sin(a) * 127)
            await send(lx=x, ly=y, rx=-x, ry=-y)
            await asyncio.sleep(1 / 60)
        await send()
        rtts.sort()
        print(f"acks: {len(rtts)}  median {rtts[len(rtts) // 2]:.2f} ms  max {rtts[-1]:.2f} ms "
              "(page -> agent -> virtual pad -> page, on this computer)")


if __name__ == "__main__":
    asyncio.run(main())
