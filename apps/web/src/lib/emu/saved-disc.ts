/**
 * Remembers which disc image the host picked, so next time it is one click instead of a file
 * dialog. Only a file *handle* is stored, in this browser (IndexedDB); the browser asks the
 * host's permission again before the file can be read. The file itself is never copied.
 * Chrome and Edge only (File System Access API); elsewhere the host picks the file each time.
 */

const DB = "rr-emulator";
const STORE = "handles";
const KEY = "disc";

interface ReadPermission {
  queryPermission(o: { mode: "read" }): Promise<PermissionState>;
  requestPermission(o: { mode: "read" }): Promise<PermissionState>;
}
type DiscHandle = FileSystemFileHandle & ReadPermission;
type PickerWindow = Window & {
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
};

export const canRemember = typeof window !== "undefined" && "showOpenFilePicker" in window;

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = op(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The remembered disc's file name, if there is one. */
export async function savedDiscName(): Promise<string | null> {
  try {
    const handle = (await run("readonly", (s) => s.get(KEY))) as DiscHandle | undefined;
    return handle?.name ?? null;
  } catch {
    return null;
  }
}

/** Opens the remembered disc. Must be called from a click (the browser may ask permission). */
export async function openSavedDisc(): Promise<File | null> {
  try {
    const handle = (await run("readonly", (s) => s.get(KEY))) as DiscHandle | undefined;
    if (!handle) return null;
    let state = await handle.queryPermission({ mode: "read" });
    if (state !== "granted") state = await handle.requestPermission({ mode: "read" });
    return state === "granted" ? await handle.getFile() : null;
  } catch {
    return null;
  }
}

/** Shows the browser's file picker and remembers the choice. Null if cancelled. */
export async function pickAndRememberDisc(): Promise<File | null> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) return null;
  try {
    const [handle] = await picker({
      id: "rr-disc",
      types: [{ description: "PS2 disc image", accept: { "application/octet-stream": [".iso", ".chd", ".cso", ".isz", ".bin"] } }],
    });
    if (!handle) return null;
    await run("readwrite", (s) => s.put(handle, KEY)).catch(() => {});
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function forgetDisc(): Promise<void> {
  await run("readwrite", (s) => s.delete(KEY)).catch(() => {});
}
