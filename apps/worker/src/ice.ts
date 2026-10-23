import type { IceRes } from "@reignroom/protocol";

/**
 * TURN is optional. Without it, peers connect directly via STUN, which works for most
 * home and mobile networks; TURN relays the stream when a direct path is impossible.
 *
 * Settings (all optional, set as secrets with `wrangler secret put` or in .dev.vars):
 *   TURN_KEY_ID, TURN_KEY_API_TOKEN       Cloudflare Realtime TURN (primary)
 *   TURN_FALLBACK_URLS                    comma-separated, e.g. turn:host:3478?transport=udp
 *   TURN_FALLBACK_USERNAME, TURN_FALLBACK_CREDENTIAL   static credentials (e.g. ExpressTURN)
 */
interface TurnSettings {
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  TURN_FALLBACK_URLS?: string;
  TURN_FALLBACK_USERNAME?: string;
  TURN_FALLBACK_CREDENTIAL?: string;
}

/** Cloudflare documents this STUN service as free and unlimited. */
const STUN = { urls: ["stun:stun.cloudflare.com:3478"] };
/** Credentials live 2 hours; clients fetch new ones for each new connection. */
const TTL_SECONDS = 2 * 60 * 60;

export async function iceServers(env: Env): Promise<IceRes> {
  const s = env as Env & TurnSettings;

  if (s.TURN_KEY_ID && s.TURN_KEY_API_TOKEN) {
    const cloudflare = await cloudflareTurn(s.TURN_KEY_ID, s.TURN_KEY_API_TOKEN);
    if (cloudflare) return { iceServers: cloudflare, relay: "cloudflare" };
  }

  const fallbackUrls = (s.TURN_FALLBACK_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^turns?:/.test(u));
  if (fallbackUrls.length && s.TURN_FALLBACK_USERNAME && s.TURN_FALLBACK_CREDENTIAL) {
    return {
      iceServers: [
        STUN,
        { urls: fallbackUrls, username: s.TURN_FALLBACK_USERNAME, credential: s.TURN_FALLBACK_CREDENTIAL },
      ],
      relay: "fallback",
    };
  }

  return { iceServers: [STUN], relay: "none" };
}

async function cloudflareTurn(keyId: string, token: string): Promise<IceRes["iceServers"] | null> {
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );
    if (!res.ok) {
      console.error(`Cloudflare TURN credentials failed: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { iceServers?: unknown };
    const list = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
    const servers: IceRes["iceServers"] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const { urls, username, credential } = raw as Record<string, unknown>;
      const all = (Array.isArray(urls) ? urls : [urls]).filter((u): u is string => typeof u === "string");
      // Cloudflare: "The alternate port 53 is known to be blocked by web browsers".
      const usable = all.filter((u) => !/:53(\?|$)/.test(u));
      if (!usable.length) continue;
      servers.push({
        urls: usable,
        ...(typeof username === "string" ? { username } : {}),
        ...(typeof credential === "string" ? { credential } : {}),
      });
    }
    return servers.length ? servers : null;
  } catch (err) {
    console.error("Cloudflare TURN credentials failed", err);
    return null;
  }
}
