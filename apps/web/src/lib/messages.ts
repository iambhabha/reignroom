import type { ErrorCode } from "@reignroom/protocol";
import type { EndReason } from "./room-connection.ts";

/** Short, specific messages for errors shown inline while staying in the room. */
export const noticeText: Record<ErrorCode, string> = {
  bad_message: "Something went wrong sending that. Try again.",
  version_mismatch: "This page is out of date. Reload to continue.",
  rate_limited: "Slow down a little. Some actions were skipped.",
  room_not_found: "This room doesn't exist or has expired.",
  room_full: "This room is full.",
  room_locked: "The host has locked this room, so new players can't join.",
  name_invalid: "Pick a name with at least one visible character.",
  name_taken: "Someone in this room already uses that name.",
  slot_taken: "That slot was just taken.",
  slot_unavailable: "Pick a player slot first.",
  not_host: "Only the host can do that.",
  bad_host_key: "This link doesn't give host access.",
  peer_not_found: "That player is no longer in the room.",
  players_below_occupied: "Move players out of the higher slots first.",
  not_member: "You're no longer in this room. Reload to rejoin.",
};

/** Headline and detail for the screen shown when the connection ends for good. */
export const endText: Record<EndReason, { title: string; detail: string }> = {
  kicked: { title: "You were removed", detail: "The host removed you from this room." },
  replaced: {
    title: "Open in another tab",
    detail:
      "This room is open in another tab or window, so this one was disconnected. Continue there, or reload this page to move the room back here.",
  },
  connection_lost: {
    title: "Connection lost",
    detail: "We couldn't reach the room for a while. Check your connection and try again.",
  },
  left: { title: "You left the room", detail: "Your slot is free for someone else." },
  room_not_found: { title: "Room not found", detail: "This room doesn't exist or has expired." },
  room_full: { title: "Room is full", detail: "All player slots are taken. Ask the host for a bigger room." },
  room_locked: {
    title: "Room is locked",
    detail: "The host has locked this room, so new players can't join. Ask them to unlock it.",
  },
  version_mismatch: { title: "Update needed", detail: "This page is out of date. Reload to continue." },
  bad_host_key: { title: "Host access denied", detail: "This tab doesn't have host access to the room." },
  name_invalid: { title: "Name not allowed", detail: noticeText.name_invalid },
  name_taken: { title: "Name in use", detail: noticeText.name_taken },
  bad_message: { title: "Couldn't join", detail: "The room rejected this connection. Reload and try again." },
  rate_limited: { title: "Too many requests", detail: "Wait a minute, then try again." },
  slot_taken: { title: "Couldn't join", detail: noticeText.slot_taken },
  slot_unavailable: { title: "Couldn't join", detail: noticeText.slot_unavailable },
  not_host: { title: "Couldn't join", detail: noticeText.not_host },
  peer_not_found: { title: "Couldn't join", detail: noticeText.peer_not_found },
  players_below_occupied: { title: "Couldn't join", detail: noticeText.players_below_occupied },
  not_member: { title: "Couldn't join", detail: noticeText.not_member },
};
