// Edition (free / paid), free-round limit and the minimum-version check.
// The paid build replaces `PAID` with true. Free rounds are counted in this browser only (Phase 3, option A);
// an online counter per TikTok username can replace `rounds` later without touching the game.
(function (MC) {
  const VERSION = '0.3.2';
  const PAID = false;
  // Developer copy (game served by `npm start` / start-bridge.bat from the source folder): unlimited rounds.
  // The bridge switches this on; the desktop app never does.
  const DEV = false;
  const FREE_ROUNDS = 3;
  const COOLDOWN_HOURS = 24;
  // Public file with { "latest": "x.y.z", "minimum": "x.y.z", "download": "url" }. Older than `minimum` = must update.
  const VERSION_URL = 'https://alexjiri.github.io/monster-cam-demo/version.json';
  const KEY = 'monstercam-rounds';

  const newer = (a, b) => { // a > b
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };

  // Test site only (the public demo): add #reset-rounds to the link to get the free rounds back.
  if (location.hostname === 'alexjiri.github.io' && location.hash === '#reset-rounds') {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  const rounds = {
    // Start times of the rounds played in the last COOLDOWN_HOURS.
    list() {
      const since = Date.now() - COOLDOWN_HOURS * 3600e3;
      try { return (JSON.parse(localStorage.getItem(KEY)) || []).filter((t) => t > since); } catch (e) { return []; }
    },
    left() { return PAID || DEV ? Infinity : Math.max(0, FREE_ROUNDS - this.list().length); },
    // When the next free round becomes available (ms timestamp), or 0 if one is available now.
    nextAt() {
      if (this.left() > 0) return 0;
      return Math.min(...this.list()) + COOLDOWN_HOURS * 3600e3;
    },
    use() {
      if (PAID || DEV) return;
      const l = this.list(); l.push(Date.now());
      try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {}
    },
  };

  // Resolves to { required, available, download } or null when offline (offline never blocks the game).
  async function checkVersion() {
    try {
      const v = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
      return { required: newer(v.minimum, VERSION), available: newer(v.latest, VERSION), latest: v.latest, download: v.download };
    } catch (e) { return null; }
  }

  // Free version watermark, drawn on the game canvas so it shows on stream.
  function watermark(ctx) {
    if (PAID) return;
    const { width: w, height: h } = ctx.canvas;
    ctx.save();
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Bottom centre: the corners hold the feed and the curses.
    const text = 'Monster Cam · free version';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(w / 2 - tw / 2 - 10, h - 44, tw + 20, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(text, w / 2, h - 28);
    ctx.restore();
  }

  MC.edition = { VERSION, PAID, DEV, FREE_ROUNDS, COOLDOWN_HOURS, rounds, checkVersion, watermark };
})(window.MC = window.MC || {});
