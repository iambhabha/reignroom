# Testing across two networks

The goal: one PC on home broadband (host), one device on a mobile hotspot (guest), and the guest
sees the host's stream smoothly.

Run it on the **deployed site**, `https://reignroom.<subdomain>.workers.dev` (or your custom
domain), with the **released agent**. That's what real hosts and guests use. Browsers only allow
screen sharing on secure (HTTPS) pages, and two networks can't reach each other's `localhost`, so
a local `npm run preview` can't be used for this test.

*Before deployment only*, a temporary tunnel can stand in for the deployed site; see
[the last section](#before-deployment-a-temporary-tunnel).

## 1. Stream test without the game

1. **Host PC (broadband):** open the deployed site in Chrome or Edge, enter a name, **Create room**.
2. Click **Copy invite link** and send it to the guest device (any messenger).
3. **Guest device (on the mobile hotspot, Wi-Fi off on broadband):** open the link, enter a
   name, join.
4. Host: under **Stream**, choose **Test pattern**, keep **540p**, press **Start streaming**.
   Keep the host tab open on screen during this test.
5. Guest: the moving test card should appear within a few seconds.

Write down what each side shows:

| Where | What to note |
|---|---|
| Guest, under the video | Round trip, Video (size · fps), Buffer, Route |
| Host, Guests list | Status, Round trip, size · fps · Mbps, route, any "limited by …" |

Expected on a working setup: guest fps close to 60, Route **Direct** (or **Relayed (TURN)** if a
relay is configured and needed), round trip roughly the ping between the two networks.

## 2. If the guest never gets a picture

- Route stays "—" and status "Connecting…" for more than ~15 s: the two networks can't connect
  directly (common with some mobile carriers). Configure TURN (see `apps/worker/.dev.vars.example`
  for the settings; on the deployed site use `wrangler secret put`) and repeat.
- Fewer than ~30 fps with "limited by bandwidth": lower the quality to 480p, or check the host's
  upload speed.

## 3. With PCSX2

Repeat step 1 with **Game window** and pick the PCSX2 window in Chrome's share dialog. To include
game sound, use **Entire screen with sound** instead (guests then see the whole screen).

## Before deployment: a temporary tunnel

Only for trying things before the site is deployed. A Cloudflare quick tunnel (free, no account)
gives the local server a temporary public HTTPS address.

1. Install `cloudflared` once (official releases: https://github.com/cloudflare/cloudflared/releases/latest).
2. In the repo, start the site (`http://localhost:8787`):

```bash
npm run preview
```

3. In a second terminal:

```bash
cloudflared tunnel --url http://localhost:8787
```

4. Use the printed `https://<random-words>.trycloudflare.com` address as "the site" in the steps
   above. The address changes every time the tunnel starts; Ctrl+C in both terminals stops it.
5. Controller tests through the tunnel also need the agent to accept that address, e.g.
   `python -m reignroom_agent --dev --allow-origin "https://*.trycloudflare.com"`. A released
   agent accepts a tunnel only when started with that `--allow-origin` option; by default it
   accepts just the deployed site.

While the tunnel runs, anyone with the address can open the site, so stop it when you're done.
