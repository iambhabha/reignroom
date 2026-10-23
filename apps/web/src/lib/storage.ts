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

export const hostKeyFor = {
  get: (code: string) => read(session, `rr:host:${code}`),
  set: (code: string, key: string) => write(session, `rr:host:${code}`, key),
};

export const resumeFor = {
  get: (code: string) => read(session, `rr:resume:${code}`),
  set: (code: string, token: string | null) => write(session, `rr:resume:${code}`, token),
};
