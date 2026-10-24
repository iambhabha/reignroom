/**
 * Disc image reader for Play!.js. The emulator thread asks the page for byte ranges of the
 * image and waits until isDone() is true. Reading straight from File.slice() costs one async
 * round trip per request, so ranges come from a block cache, with read-ahead for the
 * sequential reads games make while streaming levels, sound and video.
 */

const BLOCK = 1 << 20; // 1 MiB
const MAX_BLOCKS = 384; // 384 MiB of cache
const READ_AHEAD = 4;

interface EmscriptenHeap {
  HEAPU8: Uint8Array;
}

export class DiscImageDevice {
  private file: Blob | null = null;
  private doneFlag = false;
  /** Block index → bytes, kept in least-recently-used order. */
  private blocks = new Map<number, Uint8Array>();
  private loading = new Map<number, Promise<Uint8Array>>();
  readonly stats = { reads: 0, cacheHits: 0, waitMs: 0 };

  constructor(private readonly module: EmscriptenHeap) {}

  setFile(file: Blob): void {
    this.file = file;
    this.blocks.clear();
    this.loading.clear();
  }

  // Called by Play! (Source/Js_DiscImageDeviceStream.cpp) on the page's main thread.
  getFileSize(): number {
    if (!this.file) throw new Error("No file set.");
    return this.file.size;
  }

  isDone(): boolean {
    return this.doneFlag;
  }

  read(dstPtr: number, offset: number, size: number): void {
    if (!this.file) throw new Error("No file set.");
    this.doneFlag = false;
    this.stats.reads++;
    const first = Math.floor(offset / BLOCK);
    const last = Math.floor((offset + size - 1) / BLOCK);
    let cached = true;
    for (let i = first; i <= last; i++) if (!this.blocks.has(i)) cached = false;
    if (cached) {
      this.stats.cacheHits++;
      this.copy(dstPtr, offset, size, first, last);
      this.doneFlag = true;
    } else {
      const started = performance.now();
      const wanted: Promise<Uint8Array>[] = [];
      for (let i = first; i <= last; i++) wanted.push(this.load(i));
      void Promise.all(wanted).then(() => {
        this.stats.waitMs += performance.now() - started;
        this.copy(dstPtr, offset, size, first, last);
        this.doneFlag = true;
      });
    }
    for (let i = last + 1; i <= last + READ_AHEAD; i++) void this.load(i);
  }

  private copy(dstPtr: number, offset: number, size: number, first: number, last: number): void {
    const heap = this.module.HEAPU8;
    let written = 0;
    for (let i = first; i <= last; i++) {
      const block = this.blocks.get(i)!;
      this.blocks.delete(i);
      this.blocks.set(i, block);
      const start = i === first ? offset - i * BLOCK : 0;
      const end = Math.min(block.length, offset + size - i * BLOCK);
      heap.set(block.subarray(start, end), dstPtr + written);
      written += end - start;
    }
  }

  private load(index: number): Promise<Uint8Array> {
    const file = this.file!;
    const have = this.blocks.get(index);
    if (have) return Promise.resolve(have);
    if (index * BLOCK >= file.size) return Promise.resolve(new Uint8Array(0));
    let pending = this.loading.get(index);
    if (!pending) {
      pending = file
        .slice(index * BLOCK, Math.min(file.size, (index + 1) * BLOCK))
        .arrayBuffer()
        .then((buffer) => {
          const block = new Uint8Array(buffer);
          this.loading.delete(index);
          if (this.file === file) {
            this.blocks.set(index, block);
            while (this.blocks.size > MAX_BLOCKS) this.blocks.delete(this.blocks.keys().next().value!);
          }
          return block;
        });
      this.loading.set(index, pending);
    }
    return pending;
  }
}
