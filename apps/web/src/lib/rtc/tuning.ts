import { PRESETS, type Quality } from "./quality.ts";

/**
 * Codec order: H.264 first (usually hardware-encoded on Windows, lowest encode latency),
 * then VP8, then whatever else the browser offers. Retransmission/FEC entries are kept.
 */
export function preferCodecs(transceiver: RTCRtpTransceiver): void {
  const caps = RTCRtpReceiver.getCapabilities("video");
  if (!caps || typeof transceiver.setCodecPreferences !== "function") return;
  const rank = (c: RTCRtpCodec) => {
    const mime = c.mimeType.toLowerCase();
    if (mime === "video/h264") return c.sdpFmtpLine?.includes("packetization-mode=1") ? 0 : 1;
    if (mime === "video/vp8") return 2;
    if (mime === "video/vp9") return 3;
    if (mime === "video/av1") return 4;
    return 5; // rtx, red, ulpfec
  };
  const sorted = [...caps.codecs].sort((a, b) => rank(a) - rank(b));
  try {
    transceiver.setCodecPreferences(sorted);
  } catch {
    // Keep the browser's default order.
  }
}

/** Encoding settings for a preset, given the captured height. */
export function encodingFor(quality: Quality, sourceHeight: number | undefined): RTCRtpEncodingParameters {
  const p = PRESETS[quality];
  const scale = sourceHeight && sourceHeight > p.height ? sourceHeight / p.height : 1;
  return { maxBitrate: p.maxBitrate, maxFramerate: p.fps, scaleResolutionDownBy: scale };
}

/** Applies a preset to a live sender and asks the encoder to drop resolution before frame rate. */
export async function applyQuality(
  sender: RTCRtpSender,
  quality: Quality,
  sourceHeight: number | undefined,
): Promise<void> {
  const params = sender.getParameters() as RTCRtpSendParameters & { degradationPreference?: string };
  if (!params.encodings?.length) return;
  const enc = encodingFor(quality, sourceHeight);
  params.encodings = params.encodings.map((e) => ({ ...e, ...enc }));
  params.degradationPreference = "maintain-framerate";
  try {
    await sender.setParameters(params);
  } catch {
    // Some browsers reject degradationPreference; retry without it.
    delete params.degradationPreference;
    await sender.setParameters(params).catch(() => {});
  }
}
