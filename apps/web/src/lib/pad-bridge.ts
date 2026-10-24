import { NEUTRAL, type PadState, type Slot } from "@reignroom/protocol";
import type { AgentBridge } from "./agent.ts";
import type { BrowserEmulator } from "./emu/emulator.ts";

/** Where the host page sends guests' controller input. */
export interface PadBridge {
  readonly paired: boolean;
  /** Whether input for this player slot can reach the game. */
  accepts(slot: Slot): boolean;
  subscribe(fn: () => void): () => void;
  onAck(fn: (pad: Slot, seq: number) => void): () => void;
  sendPad(pad: Slot, seq: number, state: PadState): void;
  release(pad: Slot): void;
}

/** Where guests' streamed input goes: "off" in netplay, where input travels in lockstep. */
export type InputTarget = "agent" | "emulator" | "off";

/**
 * Sends guests' input to the in-browser emulator while it runs a game (P2 only: Play! has no
 * multitap), otherwise to the ReignRoom agent (virtual controllers for PCSX2).
 */
export class InputRouter implements PadBridge {
  private listeners = new Set<() => void>();
  private acks = new Set<(pad: Slot, seq: number) => void>();
  private target: InputTarget = "agent";

  private get useEmulator(): boolean {
    return this.target === "emulator";
  }

  constructor(
    private readonly agent: AgentBridge,
    private readonly emulator: BrowserEmulator,
  ) {}

  /** Starts listening to both targets; the returned function stops it. */
  attach(): () => void {
    const offAgent = this.agent.subscribe(() => this.changed());
    const offAgentAck = this.agent.onAck((pad, seq) => this.target === "agent" && this.ack(pad, seq));
    const offEmu = this.emulator.subscribe(() => this.changed());
    return () => {
      offAgent();
      offAgentAck();
      offEmu();
    };
  }

  /** Called when the host picks a stream source. */
  setTarget(target: InputTarget): void {
    if (target === this.target) return;
    this.target = target;
    this.changed();
  }

  get paired(): boolean {
    if (this.target === "off") return false;
    return this.useEmulator ? this.emulator.running : this.agent.paired;
  }

  accepts(slot: Slot): boolean {
    if (this.target === "off") return false;
    return this.useEmulator ? slot === 2 : true;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onAck(fn: (pad: Slot, seq: number) => void): () => void {
    this.acks.add(fn);
    return () => {
      this.acks.delete(fn);
    };
  }

  sendPad(pad: Slot, seq: number, state: PadState): void {
    if (this.target === "off") return;
    if (!this.useEmulator) {
      this.agent.sendPad(pad, seq, state);
      return;
    }
    if (pad !== 2 || !this.emulator.running) return;
    this.emulator.setPad(1, state);
    // Applied at once; the ack lets the guest measure the round trip to the game.
    this.ack(pad, seq);
  }

  release(pad: Slot): void {
    if (this.target === "agent") this.agent.release(pad);
    else if (this.target === "emulator" && pad === 2) this.emulator.setPad(1, NEUTRAL);
  }

  private ack(pad: Slot, seq: number): void {
    for (const fn of this.acks) fn(pad, seq);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }
}
