/// <reference lib="webworker" />
// Posts a message every few milliseconds. Timers on a page in a background tab are slowed to
// once a second, which would stall netplay for both players; a worker's timers are not, and
// its messages still reach the page right away.
setInterval(() => postMessage(0), 2);
