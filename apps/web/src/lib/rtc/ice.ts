import { IceRes } from "@reignroom/protocol";
import { resumeFor } from "../storage.ts";
import { iceServersFromWire } from "./wire.ts";

const STUN_ONLY: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478"] }];

export interface IceConfig {
  servers: RTCIceServer[];
  relay: IceRes["relay"];
}

/**
 * Fetches ICE servers for this room (TURN credentials if the site has TURN configured).
 * Falls back to STUN only if the request fails, so a broken TURN setup never blocks play.
 */
export async function fetchIce(code: string): Promise<IceConfig> {
  const resume = resumeFor.get(code);
  if (!resume) return { servers: STUN_ONLY, relay: "none" };
  try {
    const res = await fetch(`/api/rooms/${code}/ice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = IceRes.parse(await res.json());
    return { servers: iceServersFromWire(body.iceServers), relay: body.relay };
  } catch {
    return { servers: STUN_ONLY, relay: "none" };
  }
}
