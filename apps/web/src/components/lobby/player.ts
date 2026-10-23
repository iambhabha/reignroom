import type { Slot } from "@reignroom/protocol";

// Literal class names so Tailwind can find them.
export const slotBar: Record<Slot, string> = { 1: "bg-p1", 2: "bg-p2", 3: "bg-p3", 4: "bg-p4" };
export const slotChip: Record<Slot, string> = {
  1: "bg-p1 text-player-ink",
  2: "bg-p2 text-player-ink",
  3: "bg-p3 text-player-ink",
  4: "bg-p4 text-player-ink",
};
