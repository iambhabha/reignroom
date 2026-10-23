export const QUALITIES = ["720p60", "540p60", "480p60"] as const;
export type Quality = (typeof QUALITIES)[number];
export const DEFAULT_QUALITY: Quality = "540p60";

/**
 * Starting points for a fast-moving 3D brawler at 60 fps, H.264. Tune after measuring
 * real streams; the encoder lowers bitrate on its own when the network can't keep up.
 */
export const PRESETS: Record<Quality, { height: number; fps: number; maxBitrate: number }> = {
  "720p60": { height: 720, fps: 60, maxBitrate: 6_000_000 },
  "540p60": { height: 540, fps: 60, maxBitrate: 4_000_000 },
  "480p60": { height: 480, fps: 60, maxBitrate: 2_500_000 },
};

/** Opus audio when sharing the screen with sound, roughly. */
const AUDIO_BPS = 128_000;

/** The host uploads one copy of the stream per guest (mesh). */
export function uploadMbps(quality: Quality, guests: number, withAudio: boolean): number {
  const perGuest = PRESETS[quality].maxBitrate + (withAudio ? AUDIO_BPS : 0);
  return (perGuest * Math.max(1, guests)) / 1_000_000;
}
