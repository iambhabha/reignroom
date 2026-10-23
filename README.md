# ReignRoom

Online rooms for **Urban Reign** (PS2) played through the PCSX2 emulator. One host runs the
game on their Windows PC and streams it to up to three guests over WebRTC; guest controller
input comes back to the host and appears in PCSX2 as virtual controllers.

> **Bring your own copy.** ReignRoom never hosts, links to, or helps you obtain the Urban Reign
> disc image or a PS2 BIOS. Use only copies you dumped yourself from discs and a console you own.
>
> Fan project. Not affiliated with, endorsed by, or sponsored by Bandai Namco or Sony
> Interactive Entertainment. "Urban Reign" and "PlayStation" are trademarks of their owners.

## Repository layout

| Path | What it is |
|---|---|
| `packages/protocol` | Shared message types and validation (signaling, input, agent) |
| `apps/worker` | Cloudflare Worker + Durable Object: rooms, lobby, chat, signaling; serves the site |
| `apps/web` | Vite + React + TypeScript + Tailwind site |
| `agent` | Windows host agent (Python): virtual pads + Urban Reign detection |

## Development

Needs Node.js 22 or later.

```bash
npm install
npm run typecheck
npm test
```

**Whole site on one port** (what production looks like): builds the site, then `wrangler dev`
serves it and the API at http://localhost:8787.

```bash
npm run preview
```

**Live-reloading UI**: copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars`, then run
these in two terminals and open http://localhost:5173 (Vite forwards `/api` to the Worker).

```bash
npm run dev:worker
npm run dev:web
```

To try a room locally with two players on one computer, use two different addresses, for example
http://localhost:8787 for the host and http://127.0.0.1:8787 for the guest. Host access is
remembered per browser and address, so two tabs on the same address would both be the host.

**Windows path length:** local Durable Object data lives under
`apps/worker/.wrangler/state/v3/do/…` with a 64-character file name. If the repository sits in a
very deep folder, that path can pass Windows' 260-character limit and every room request fails with
an "internal error". Clone to a shorter path, or run `npx wrangler dev --persist-to C:/rr-state`.

## Streaming and TURN

Video goes straight from the host's browser to each guest (WebRTC). That uses STUN only by
default, which works for most networks. For networks that block direct connections, set a TURN
relay (optional): Cloudflare Realtime TURN is the primary option, any TURN service with fixed
credentials (such as ExpressTURN) the fallback. The settings are listed in
`apps/worker/.dev.vars.example`; on the deployed Worker set them with `wrangler secret put`.

The **Test pattern** source checks guest video without PCSX2. For the two-network test, follow
[docs/testing-across-networks.md](docs/testing-across-networks.md).
