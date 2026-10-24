// Checks a running ReignRoom site end to end (headers, routing, rooms, sockets, signaling).
//   node scripts/verify-deploy.mjs https://reignroom.<you>.workers.dev
// Creates a short-lived test room. Exit code 1 if any check fails.

import http from "node:http";
import https from "node:https";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(BASE)) {
  console.error("Usage: node scripts/verify-deploy.mjs <site URL>");
  process.exit(2);
}
const WS_BASE = BASE.replace(/^http/, "ws");
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Raw WebSocket upgrade request with a chosen Origin (fetch can't send Upgrade). Resolves the HTTP status. */
function upgradeStatus(url, origin) {
  const u = new URL(url);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const req = lib.request(u, {
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        Origin: origin,
      },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(0));
    req.end();
  });
}

function member(code, name, extra = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/api/rooms/${code}/ws`);
    const c = { ws, inbox: [], closed: null, welcome: null };
    const timer = setTimeout(() => reject(new Error(`${name}: no welcome`)), 10_000);
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      const m = JSON.parse(e.data);
      c.inbox.push(m);
      if (m.t === "welcome") {
        clearTimeout(timer);
        c.welcome = m;
        resolve(c);
      }
    };
    ws.onclose = (e) => {
      c.closed = e.code;
    };
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", v: 1, name, ...extra }));
  });
}

// ── Static site ───────────────────────────────────────────────────────────
const home = await fetch(`${BASE}/`);
const html = await home.text();
check("home page", home.status === 200 && html.includes('id="root"'), `HTTP ${home.status}`);
const csp = home.headers.get("content-security-policy") ?? "";
check("CSP header", csp.includes("default-src 'self'") && csp.includes("ws://127.0.0.1:47823"));
check("Referrer-Policy no-referrer", home.headers.get("referrer-policy") === "no-referrer");
check("page not cached long", /no-cache/.test(home.headers.get("cache-control") ?? ""), home.headers.get("cache-control"));

const route = await fetch(`${BASE}/r/ABC234`);
check("app route serves the page", route.status === 200 && (await route.text()).includes('id="root"'));

const js = html.match(/\/assets\/[^"]+\.js/)?.[0];
if (js) {
  const asset = await fetch(BASE + js);
  check("hashed asset cached immutable", /immutable/.test(asset.headers.get("cache-control") ?? ""));
}
const missing = await fetch(`${BASE}/assets/does-not-exist.js`);
check(
  "missing asset is a real 404, not cached",
  missing.status === 404 && missing.headers.get("cache-control") === "no-store",
  `HTTP ${missing.status}, ${missing.headers.get("cache-control")}`,
);

// ── Rooms ─────────────────────────────────────────────────────────────────
const created = await fetch(`${BASE}/api/rooms`, { method: "POST", body: JSON.stringify({ players: 4 }) });
check("create room", created.status === 201, `HTTP ${created.status}`);
const { code, hostKey } = await created.json();
const info = await fetch(`${BASE}/api/rooms/${code}`);
check("room info", info.status === 200);

const host = await member(code, "Verify host", { hostKey });
const guests = await Promise.all(["A", "B", "C"].map((n) => member(code, `Verify ${n}`)));
check("host and 3 guests joined", guests.every((g) => g.welcome));

for (const g of guests) host.ws.send(JSON.stringify({ t: "sdp", to: g.welcome.peer, kind: "offer", sdp: "v=0\r\n" }));
for (let i = 0; i < 40; i++)
  for (const g of guests)
    host.ws.send(JSON.stringify({ t: "ice", to: g.welcome.peer, cand: { candidate: `candidate:${i} 1 udp 1 192.0.2.1 ${5000 + i} typ host`, sdpMid: "0", sdpMLineIndex: 0 } }));
await wait(2000);
const got = guests.map((g) => [g.inbox.filter((m) => m.t === "sdp").length, g.inbox.filter((m) => m.t === "ice").length]);
const errors = [host, ...guests].flatMap((c) => c.inbox.filter((m) => m.t === "error"));
check("signaling burst (3 offers + 120 candidates) delivered", got.every(([s, i]) => s === 1 && i === 40), JSON.stringify(got));
check("no rate-limit errors or disconnects", errors.length === 0 && [host, ...guests].every((c) => c.closed === null));

const ice = await fetch(`${BASE}/api/rooms/${code}/ice`, {
  method: "POST",
  body: JSON.stringify({ resume: guests[0].welcome.resume }),
});
const iceBody = ice.ok ? await ice.json() : null;
check("ICE servers for members", ice.status === 200, `relay: ${iceBody?.relay ?? "?"}`);

const foreign = await upgradeStatus(`${BASE}/api/rooms/${code}/ws`, "https://evil.example");
check("socket from another site refused", foreign !== 101 && foreign !== 0, `HTTP ${foreign}`);
const own = await upgradeStatus(`${BASE}/api/rooms/${code}/ws`, BASE);
check("socket from the site itself accepted", own === 101, `HTTP ${own}`);

for (const c of [host, ...guests]) c.ws.send(JSON.stringify({ t: "leave" }));
await wait(500);

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
