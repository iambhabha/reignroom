/**
 * Frame statistics from Play!'s frame counter (frames the emulated GS has output). Polled every
 * millisecond, so each frame time is accurate to about 1–4 ms.
 */

const KEEP_FRAMES = 60 * 60 * 10; // about 10 minutes of frame times
const SPIKE_MS = 33.4; // longer than two 60 Hz frames

export interface FrameSummary {
  seconds: number;
  fpsNow: number;
  fpsAvg: number;
  low1: number;
  worstSecond: number;
  spikes: number;
}

export class FrameStats {
  private startedAt = 0;
  private lastCount = 0;
  private lastFrameAt = 0;
  private times = new Float32Array(KEEP_FRAMES);
  private frames = 0;
  private seconds: number[] = [];
  private secondStart = 0;
  private secondFrames = 0;
  private spikes = 0;

  constructor(private readonly getFrames: () => number) {
    this.reset();
  }

  reset(): void {
    const now = performance.now();
    this.startedAt = now;
    this.lastCount = this.getFrames();
    this.lastFrameAt = now;
    this.frames = 0;
    this.seconds = [];
    this.secondStart = now;
    this.secondFrames = 0;
    this.spikes = 0;
  }

  poll(): void {
    const now = performance.now();
    const count = this.getFrames();
    const n = count - this.lastCount;
    if (n > 0) {
      const dt = (now - this.lastFrameAt) / n;
      for (let i = 0; i < n; i++) {
        this.times[this.frames % KEEP_FRAMES] = dt;
        this.frames++;
        this.secondFrames++;
        if (dt > SPIKE_MS) this.spikes++;
      }
    }
    if (n !== 0) {
      this.lastCount = count;
      this.lastFrameAt = now;
    }
    while (now - this.secondStart >= 1000) {
      this.seconds.push(this.secondFrames);
      this.secondFrames = 0;
      this.secondStart += 1000;
    }
  }

  summary(): FrameSummary {
    const elapsed = (performance.now() - this.startedAt) / 1000;
    const count = Math.min(this.frames, KEEP_FRAMES);
    const sorted = this.times.slice(0, count).sort();
    const p99 = count ? sorted[Math.min(count - 1, Math.floor(count * 0.99))]! : 0;
    const secs = this.seconds;
    return {
      seconds: Math.floor(elapsed),
      fpsNow: secs.at(-1) ?? 0,
      fpsAvg: elapsed > 0 ? Math.round((10 * this.frames) / elapsed) / 10 : 0,
      low1: p99 ? Math.round(10000 / p99) / 10 : 0,
      worstSecond: secs.length ? Math.min(...secs) : 0,
      spikes: this.spikes,
    };
  }
}
