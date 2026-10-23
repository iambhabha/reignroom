/** Connection facts both sides show. `rttMs` is the network round trip (ICE), not input latency. */
export interface PathStats {
  rttMs: number | null;
  /** "relay" = through TURN, "direct" = peer to peer (host, srflx or prflx candidates). */
  route: "direct" | "relay" | null;
}

export interface GuestStats extends PathStats {
  fps: number | null;
  width: number | null;
  height: number | null;
  /** Average time frames wait in the jitter buffer. */
  bufferMs: number | null;
  framesDecoded: number;
}

export interface HostPeerStats extends PathStats {
  fps: number | null;
  width: number | null;
  height: number | null;
  kbps: number | null;
  /** "bandwidth", "cpu", "other" or "none" — why the encoder is holding back. */
  limitedBy: string | null;
  encoder: string | null;
}

type Report = Record<string, unknown> & { type: string; id: string };

function path(stats: RTCStatsReport): PathStats {
  let pairId: string | undefined;
  stats.forEach((r: Report) => {
    if (r.type === "transport" && typeof r.selectedCandidatePairId === "string") pairId = r.selectedCandidatePairId;
  });
  let pair: Report | undefined;
  stats.forEach((r: Report) => {
    if (r.type !== "candidate-pair") return;
    if (pairId ? r.id === pairId : r.nominated === true && r.state === "succeeded") pair = r;
  });
  if (!pair) return { rttMs: null, route: null };
  const local = stats.get(pair.localCandidateId as string) as Report | undefined;
  const remote = stats.get(pair.remoteCandidateId as string) as Report | undefined;
  const relayed = local?.candidateType === "relay" || remote?.candidateType === "relay";
  const rtt = typeof pair.currentRoundTripTime === "number" ? pair.currentRoundTripTime * 1000 : null;
  return { rttMs: rtt === null ? null : Math.round(rtt), route: relayed ? "relay" : "direct" };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function guestStats(pc: RTCPeerConnection): Promise<GuestStats> {
  const stats = await pc.getStats();
  let video: Report | undefined;
  stats.forEach((r: Report) => {
    if (r.type === "inbound-rtp" && r.kind === "video") video = r;
  });
  const emitted = num(video?.jitterBufferEmittedCount);
  const delay = num(video?.jitterBufferDelay);
  return {
    ...path(stats),
    fps: num(video?.framesPerSecond),
    width: num(video?.frameWidth),
    height: num(video?.frameHeight),
    bufferMs: emitted && delay !== null ? Math.round((delay / emitted) * 1000) : null,
    framesDecoded: num(video?.framesDecoded) ?? 0,
  };
}

/** Host side; `prev` gives the previous sample so bitrate can be computed. */
export async function hostStats(
  pc: RTCPeerConnection,
  prev: { bytes: number; at: number } | null,
): Promise<{ stats: HostPeerStats; sample: { bytes: number; at: number } | null }> {
  const stats = await pc.getStats();
  let video: Report | undefined;
  stats.forEach((r: Report) => {
    if (r.type === "outbound-rtp" && r.kind === "video") video = r;
  });
  const bytes = num(video?.bytesSent);
  const at = num(video?.timestamp);
  const sample = bytes !== null && at !== null ? { bytes, at } : null;
  const kbps =
    sample && prev && sample.at > prev.at
      ? Math.round(((sample.bytes - prev.bytes) * 8) / (sample.at - prev.at))
      : null;
  return {
    stats: {
      ...path(stats),
      fps: num(video?.framesPerSecond),
      width: num(video?.frameWidth),
      height: num(video?.frameHeight),
      kbps,
      limitedBy: typeof video?.qualityLimitationReason === "string" ? video.qualityLimitationReason : null,
      encoder: typeof video?.encoderImplementation === "string" ? video.encoderImplementation : null,
    },
    sample,
  };
}
