import type { ClientMsg, IceRes } from "@reignroom/protocol";

type WireCandidate = Extract<ClientMsg, { t: "ice" }>["cand"];

/** Browser ICE candidate → the room's message shape (`null` = end of candidates). */
export function candidateToWire(c: RTCIceCandidate | null): WireCandidate {
  if (!c) return null;
  return {
    candidate: c.candidate,
    sdpMid: c.sdpMid,
    sdpMLineIndex: c.sdpMLineIndex,
    usernameFragment: c.usernameFragment,
  };
}

/** Room message → browser ICE candidate init. */
export function candidateFromWire(c: NonNullable<WireCandidate>): RTCIceCandidateInit {
  const init: RTCIceCandidateInit = { candidate: c.candidate };
  if (c.sdpMid !== undefined) init.sdpMid = c.sdpMid;
  if (c.sdpMLineIndex !== undefined) init.sdpMLineIndex = c.sdpMLineIndex;
  if (c.usernameFragment !== undefined) init.usernameFragment = c.usernameFragment;
  return init;
}

export function iceServersFromWire(list: IceRes["iceServers"]): RTCIceServer[] {
  return list.map((s) => {
    const server: RTCIceServer = { urls: s.urls };
    if (s.username !== undefined) server.username = s.username;
    if (s.credential !== undefined) server.credential = s.credential;
    return server;
  });
}
