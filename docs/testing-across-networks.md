# Testing across two networks

The goal: one PC on home broadband (host), one device on a mobile hotspot (guest), and the guest
sees the host's stream smoothly. Do this on the deployed site (HTTPS); browsers only allow screen
sharing on secure pages, and the two networks can't reach each other's `localhost`.

## 1. Stream test without the game

1. **Host PC (broadband):** open the site in Chrome or Edge, enter a name, **Create room**.
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
