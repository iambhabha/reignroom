import {
  CreateRoomReq,
  RoomCode,
  type ApiError,
  type CreateRoomRes,
  type ErrorCode,
} from "@reignroom/protocol";
import { newRoomCode, newSecret, sha256 } from "./ids.ts";

export { RoomDO } from "./room.ts";

const ROOM_PATH = /^\/api\/rooms\/([^/]+)(\/ws)?$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return createRoom(request, env, ip);
    }

    const match = ROOM_PATH.exec(url.pathname);
    if (match) {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const code = RoomCode.safeParse(match[1]);
      if (!code.success) return apiError("room_not_found", 404);
      if (!(await allow(env.JOIN_LIMITER, ip))) return apiError("rate_limited", 429);
      const room = env.ROOMS.get(env.ROOMS.idFromName(code.data));

      if (match[2]) {
        if (!originAllowed(request, url, env)) return new Response("Forbidden origin", { status: 403 });
        return room.fetch(request);
      }
      const info = await room.info();
      return info ? Response.json(info, noStore) : apiError("room_not_found", 404);
    }

    return apiError("bad_message", 404);
  },
} satisfies ExportedHandler<Env>;

async function createRoom(request: Request, env: Env, ip: string): Promise<Response> {
  if (!(await allow(env.CREATE_LIMITER, ip))) return apiError("rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("bad_message", 400);
  }
  const parsed = CreateRoomReq.safeParse(body);
  if (!parsed.success) return apiError("bad_message", 400);

  const hostKey = newSecret();
  const hostKeyHash = await sha256(hostKey);
  // Collisions are vanishingly rare with ~1.07 billion codes; retry a few times anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode();
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (await room.init(code, parsed.data.players, hostKeyHash)) {
      return Response.json({ code, hostKey } satisfies CreateRoomRes, { status: 201, ...noStore });
    }
  }
  return apiError("room_full", 503);
}

async function allow(limiter: RateLimit, key: string): Promise<boolean> {
  const { success } = await limiter.limit({ key });
  return success;
}

/**
 * Browsers always send Origin on WebSocket requests. Rejecting foreign origins stops
 * other websites from opening room sockets in a visitor's browser.
 */
function originAllowed(request: Request, url: URL, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin || origin === url.origin) return true;
  return env.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

const noStore = { headers: { "Cache-Control": "no-store" } };

function apiError(error: ErrorCode, status: number): Response {
  return Response.json({ error } satisfies ApiError, { status, ...noStore });
}

function methodNotAllowed(allowMethod: string): Response {
  return new Response(null, { status: 405, headers: { Allow: allowMethod } });
}
