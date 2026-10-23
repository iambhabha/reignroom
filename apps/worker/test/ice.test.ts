import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IceRes } from "@reignroom/protocol";
import { iceServers } from "../src/ice.ts";
import { api, Client, createRoom } from "./helpers.ts";

afterEach(() => vi.restoreAllMocks());

const withSettings = (extra: Record<string, string>) => ({ ...env, ...extra }) as Env;

describe("iceServers()", () => {
  it("is STUN only when no TURN is configured", async () => {
    expect(await iceServers(env)).toEqual({
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
      relay: "none",
    });
  });

  it("uses the fallback TURN server when only that is configured", async () => {
    const res = await iceServers(
      withSettings({
        TURN_FALLBACK_URLS: "turn:relay.example:3478?transport=udp, turn:relay.example:3478?transport=tcp, bogus",
        TURN_FALLBACK_USERNAME: "user",
        TURN_FALLBACK_CREDENTIAL: "pass",
      }),
    );
    expect(res.relay).toBe("fallback");
    expect(res.iceServers[1]).toEqual({
      urls: ["turn:relay.example:3478?transport=udp", "turn:relay.example:3478?transport=tcp"],
      username: "user",
      credential: "pass",
    });
  });

  it("uses Cloudflare TURN when configured and drops port 53 URLs", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          iceServers: [
            { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
            {
              urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp"],
              username: "u",
              credential: "c",
            },
          ],
        },
        { status: 201 },
      ),
    );
    const res = await iceServers(withSettings({ TURN_KEY_ID: "kid", TURN_KEY_API_TOKEN: "tok" }));
    expect(IceRes.parse(res).relay).toBe("cloudflare");
    expect(res.iceServers.flatMap((s) => s.urls)).toEqual([
      "stun:stun.cloudflare.com:3478",
      "turn:turn.cloudflare.com:3478?transport=udp",
    ]);
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://rtc.live.cloudflare.com/v1/turn/keys/kid/credentials/generate-ice-servers",
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("falls back when the Cloudflare API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await iceServers(withSettings({ TURN_KEY_ID: "kid", TURN_KEY_API_TOKEN: "tok" }));
    expect(res.relay).toBe("none");
  });
});

describe("POST /api/rooms/:code/ice", () => {
  it("gives ICE servers to members only", async () => {
    const { code, hostKey } = await createRoom();
    const host = await Client.join(code, "Host", { hostKey });

    const ok = await api(`/api/rooms/${code}/ice`, {
      method: "POST",
      body: JSON.stringify({ resume: host.welcome.resume }),
    });
    expect(ok.status).toBe(200);
    expect(IceRes.parse(await ok.json()).relay).toBe("none");

    const stranger = await api(`/api/rooms/${code}/ice`, {
      method: "POST",
      body: JSON.stringify({ resume: "A".repeat(43) }),
    });
    expect(stranger.status).toBe(403);

    expect((await api(`/api/rooms/${code}/ice`, { method: "POST", body: "{}" })).status).toBe(400);
    expect((await api(`/api/rooms/${code}/ice`)).status).toBe(405);
  });
});

describe("want-offer", () => {
  it("is relayed from a guest to the host, never the other way", async () => {
    const { code, hostKey } = await createRoom();
    const host = await Client.join(code, "Host", { hostKey });
    const guest = await Client.join(code, "Guest");

    guest.client.send({ t: "want-offer", to: host.welcome.peer });
    expect(await host.client.next("want-offer")).toEqual({ t: "want-offer", from: guest.welcome.peer });

    host.client.send({ t: "want-offer", to: guest.welcome.peer });
    expect(await host.client.next("error")).toMatchObject({ code: "peer_not_found", fatal: false });
  });
});
