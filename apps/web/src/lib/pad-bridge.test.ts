import { NEUTRAL, type PadState, type Slot } from "@reignroom/protocol";
import { describe, expect, it } from "vitest";
import type { AgentBridge } from "./agent.ts";
import type { BrowserEmulator } from "./emu/emulator.ts";
import { InputRouter } from "./pad-bridge.ts";

function fakes(emulatorRunning: boolean) {
  const sent: { to: string; pad: number; state?: PadState }[] = [];
  const agentListeners = new Set<() => void>();
  const agent = {
    paired: true,
    subscribe: (fn: () => void) => (agentListeners.add(fn), () => agentListeners.delete(fn)),
    onAck: () => () => {},
    sendPad: (pad: Slot, _seq: number, state: PadState) => sent.push({ to: "agent", pad, state }),
    release: (pad: Slot) => sent.push({ to: "agent-release", pad }),
  } as unknown as AgentBridge;
  const emulator = {
    running: emulatorRunning,
    subscribe: () => () => {},
    setPad: (pad: number, state: PadState) => sent.push({ to: "emulator", pad, state }),
  } as unknown as BrowserEmulator;
  return { agent, emulator, sent };
}

describe("InputRouter", () => {
  const press: PadState = { ...NEUTRAL, b: 1 };

  it("sends input to the agent until the emulator is chosen", () => {
    const { agent, emulator, sent } = fakes(true);
    const router = new InputRouter(agent, emulator);
    router.sendPad(3, 1, press);
    expect(sent).toEqual([{ to: "agent", pad: 3, state: press }]);
    expect(router.accepts(4)).toBe(true);
  });

  it("drives emulator pad 2 from slot P2 only, and acks at once", () => {
    const { agent, emulator, sent } = fakes(true);
    const router = new InputRouter(agent, emulator);
    const acks: [Slot, number][] = [];
    router.onAck((pad, seq) => acks.push([pad, seq]));
    router.setTarget("emulator");
    router.sendPad(2, 7, press);
    router.sendPad(3, 8, press);
    expect(sent).toEqual([{ to: "emulator", pad: 1, state: press }]);
    expect(acks).toEqual([[2, 7]]);
    expect(router.accepts(2)).toBe(true);
    expect(router.accepts(3)).toBe(false);
  });

  it("reports not paired while the emulator has no game running", () => {
    const { agent, emulator } = fakes(false);
    const router = new InputRouter(agent, emulator);
    router.setTarget("emulator");
    expect(router.paired).toBe(false);
  });

  it("drops streamed input entirely in netplay", () => {
    const { agent, emulator, sent } = fakes(true);
    const router = new InputRouter(agent, emulator);
    router.setTarget("off");
    router.sendPad(2, 1, press);
    router.release(2);
    expect(sent).toEqual([]);
    expect(router.paired).toBe(false);
  });

  it("releases P2 to neutral in the emulator", () => {
    const { agent, emulator, sent } = fakes(true);
    const router = new InputRouter(agent, emulator);
    router.setTarget("emulator");
    router.release(2);
    expect(sent).toEqual([{ to: "emulator", pad: 1, state: NEUTRAL }]);
  });
});
