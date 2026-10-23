import type { PathStats } from "../../lib/rtc/stats.ts";

/** Plain-language rating so latency is never conveyed by colour alone. */
export function rttLabel(rttMs: number | null): string {
  if (rttMs === null) return "measuring…";
  const rating = rttMs < 60 ? "good" : rttMs < 120 ? "okay" : "high";
  return `${rttMs} ms (${rating})`;
}

export function routeLabel(route: PathStats["route"]): string {
  if (route === "relay") return "Relayed (TURN)";
  if (route === "direct") return "Direct";
  return "—";
}

export function size(w: number | null, h: number | null): string {
  return w && h ? `${w}×${h}` : "—";
}

export function fps(v: number | null): string {
  return v === null ? "—" : `${Math.round(v)} fps`;
}
