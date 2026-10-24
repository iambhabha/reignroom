import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Same isolation headers as production (public/_headers), for the in-browser emulator.
    headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" },
    // `wrangler dev` (apps/worker) serves the API on 8787.
    proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } },
  },
  build: { target: "es2023" },
});
