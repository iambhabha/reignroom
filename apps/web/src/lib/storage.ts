// Browser storage can be unavailable (private windows, blocked site data); every access is guarded.

function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    // Not persisted; the app still works for this page load.
  }
}

const local = () => localStorage;
// Per tab, so two tabs on one computer are two separate players.
const session = () => sessionStorage;

export const savedName = {
  get: () => read(local, "rr:name") ?? "",
  set: (name: string) => write(local, "rr:name", name),
};

/** Host keys older than this are dropped on start-up even if the room was never seen again. */
const HOST_KEY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HOST_PREFIX = "rr:host:";

/**
 * Host rights per room, kept in this browser so a closed or crashed tab can reclaim the
 * host seat by reopening the room link. Cleared when the room turns out to be gone.
 */
export const hostKeyFor = {
  get(code: string): string | null {
    const raw = read(local, HOST_PREFIX + code);
    if (!raw) return null;
    try {
      const { k } = JSON.parse(raw) as { k?: unknown };
      return typeof k === "string" ? k : null;
    } catch {
      return null;
    }
  },
  set: (code: string, key: string) =>
    write(local, HOST_PREFIX + code, JSON.stringify({ k: key, t: Date.now() })),
  clear: (code: string) => write(local, HOST_PREFIX + code, null),
  /** Removes host keys for rooms created long ago (rooms expire well before this). */
  prune(now = Date.now()): void {
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(HOST_PREFIX)) continue;
        let t = 0;
        try {
          t = Number((JSON.parse(localStorage.getItem(key) ?? "{}") as { t?: unknown }).t) || 0;
        } catch {
          // Unreadable entry; drop it.
        }
        if (now - t > HOST_KEY_MAX_AGE_MS) localStorage.removeItem(key);
      }
    } catch {
      // Storage unavailable.
    }
  },
};

/** Forgets everything stored for a room that no longer exists. */
export function forgetRoom(code: string): void {
  hostKeyFor.clear(code);
  resumeFor.set(code, null);
}

export const resumeFor = {
  get: (code: string) => read(session, `rr:resume:${code}`),
  set: (code: string, token: string | null) => write(session, `rr:resume:${code}`, token),
};
