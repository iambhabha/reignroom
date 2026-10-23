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

```bash
npm install
npm run typecheck
npm test
```
