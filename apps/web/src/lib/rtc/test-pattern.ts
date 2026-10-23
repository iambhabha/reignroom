/**
 * A moving 1280×720 test card at up to 60 fps, so a host can check that guests receive
 * smooth video before starting PCSX2. Drawn on a 60 Hz timer rather than animation frames,
 * which stop when the window is covered. Browsers still slow timers in hidden tabs, so keep
 * the host tab open (not minimised) while testing.
 */
export function startTestPattern(): { stream: MediaStream; stop: () => void } {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(60);
  let frame = 0;

  const draw = () => {
    frame += 1;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = "#14161a";
    ctx.fillRect(0, 0, w, h);
    // Bars in the four player colours make dropped or smeared frames easy to spot.
    const colours = ["#ff6b6b", "#5eaeff", "#4fd68b", "#ffd43b"];
    colours.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(((frame * 8 + i * 320) % (w + 160)) - 160, 0, 120, h);
    });
    ctx.fillStyle = "rgba(20, 22, 26, 0.85)";
    ctx.fillRect(w / 2 - 330, h / 2 - 110, 660, 220);
    ctx.fillStyle = "#eef0f3";
    ctx.textAlign = "center";
    ctx.font = "600 44px Barlow, sans-serif";
    ctx.fillText("ReignRoom test pattern", w / 2, h / 2 - 30);
    ctx.font = "500 64px ui-monospace, Consolas, monospace";
    ctx.fillText(`frame ${frame}`, w / 2, h / 2 + 55);
  };
  const timer = setInterval(draw, 1000 / 60);

  return {
    stream,
    stop: () => {
      clearInterval(timer);
      for (const t of stream.getTracks()) t.stop();
    },
  };
}
