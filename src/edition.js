// Edition (free / full), free rounds, license keys and the minimum-version check.
// One app for everyone: without a key it is the free version (FREE_ROUNDS rounds, then a cooldown, watermark);
// a license key checked once on the Monster Cam server unlocks the full game for good.
// Free rounds are counted online per TikTok username (the account the streamer goes live on), with a local
// count in this browser as the fallback when offline or not connected to TikTok. Offline never blocks the game.
(function (MC) {
  const VERSION = '0.3.2';
  const GAME = 'lightson'; // id of this game on the server (a bundle key unlocks every game)
  // Old-style full build (prepare.js with EDITION=paid). The normal build is free until a key is entered.
  const PAID = false;
  // Developer copy (game served by `npm start` / start-bridge.bat from the source folder): unlimited rounds.
  // The bridge switches this on; the desktop app never does.
  const DEV = false;
  const FREE_ROUNDS = 3;
  const COOLDOWN_HOURS = 24;
  // Public file with { "latest", "minimum", "download", "server" }. Older than `minimum` = must update.
  const VERSION_URL = 'https://alexjiri.github.io/monster-cam-demo/version.json';
  // The Monster Cam server; version.json's "server" overrides it, so a new address needs no new build.
  const DEFAULT_SERVER = 'https://158.101.197.220';
  const KEY = 'monstercam-rounds';
  const LICENSE = 'monstercam-license';
  const SERVER_KEY = 'monstercam-server';

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const server = () => store.get(SERVER_KEY) || DEFAULT_SERVER;
  const cleanUser = (u) => String(u || '').trim().replace(/^@/, '').toLowerCase();

  // POST to the server; resolves to the JSON answer, or null when it can't be reached (offline never blocks).
  async function call(path, body) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(server() + path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: GAME, ...body }), signal: ctl.signal,
      });
      clearTimeout(t);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  const newer = (a, b) => { // a > b
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };

  // Test site only (the public demo): add #reset-rounds to the link to get the free rounds back.
  if (location.hostname === 'alexjiri.github.io' && location.hash === '#reset-rounds') store.set(KEY, null);

  // ---------- License key ----------
  const license = {
    // The saved key, once the server said it was valid.
    get() { const l = store.get(LICENSE); return l && l.key ? l.key : null; },
    // Check a typed key and save it when valid. Resolves to { valid, blocked?, offline? }.
    async activate(key, username) {
      const r = await call('/v1/key/check', { key, username: cleanUser(username) });
      if (!r) return { valid: false, offline: true };
      if (r.valid) store.set(LICENSE, { key: String(key).trim().toUpperCase(), at: Date.now() });
      return r;
    },
    // Quiet re-check (app start, TikTok connect): logs the username with the key, and drops a key the server
    // has blocked. Offline keeps the key.
    async recheck(username) {
      const key = this.get();
      if (!key) return;
      const r = await call('/v1/key/check', { key, username: cleanUser(username) });
      if (r && r.valid === false) store.set(LICENSE, null);
    },
  };
  const isPaid = () => PAID || !!license.get();

  // ---------- Free rounds ----------
  // Local list: start times of the rounds played here in the last COOLDOWN_HOURS (fallback and offline count).
  const local = {
    list() {
      const since = Date.now() - COOLDOWN_HOURS * 3600e3;
      return (store.get(KEY) || []).filter((t) => t > since);
    },
    left() { return Math.max(0, FREE_ROUNDS - this.list().length); },
    nextAt() { const l = this.list(); return l.length < FREE_ROUNDS ? 0 : Math.min(...l) + COOLDOWN_HOURS * 3600e3; },
    use() { const l = this.list(); l.push(Date.now()); store.set(KEY, l); },
  };
  let online = null; // last answer from the server for the connected username: { user, left, nextAt }

  const rounds = {
    left() { return isPaid() || DEV ? Infinity : online ? online.left : local.left(); },
    // When the next free round becomes available (ms timestamp), or 0 if one is available now.
    nextAt() { return this.left() > 0 ? 0 : online ? online.nextAt : local.nextAt(); },
    // Refresh the online count for the TikTok username the game is connected to (null = not connected).
    async refresh(username) {
      const user = cleanUser(username);
      if (!user) { online = null; return; }
      const r = await call('/v1/rounds/status', { username: user });
      online = r ? { user, left: r.left, nextAt: r.nextAt } : null;
    },
    // Use up a free round. Resolves to { allowed, left, nextAt }. Online for a connected username;
    // otherwise (or offline) the local count decides.
    async use(username) {
      if (isPaid() || DEV) return { allowed: true, left: Infinity, nextAt: 0 };
      const user = cleanUser(username);
      const r = user ? await call('/v1/rounds/use', { username: user }) : null;
      if (r) {
        online = { user, left: r.left, nextAt: r.nextAt };
        if (r.allowed) local.use(); // keep the local count in step for offline use
        return { allowed: r.allowed, left: r.left, nextAt: r.nextAt };
      }
      online = null;
      if (local.left() <= 0) return { allowed: false, left: 0, nextAt: local.nextAt() };
      local.use();
      return { allowed: true, left: local.left(), nextAt: local.nextAt() };
    },
  };

  // Resolves to { required, available, download } or null when offline (offline never blocks the game).
  async function checkVersion() {
    try {
      const v = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
      if (v.server && /^https:\/\//.test(v.server)) store.set(SERVER_KEY, v.server.replace(/\/+$/, ''));
      return { required: newer(v.minimum, VERSION), available: newer(v.latest, VERSION), latest: v.latest, download: v.download };
    } catch (e) { return null; }
  }

  // Free version watermark, drawn on the game canvas so it shows on stream.
  function watermark(ctx) {
    if (isPaid()) return;
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

  MC.edition = { VERSION, GAME, DEV, FREE_ROUNDS, COOLDOWN_HOURS, get PAID() { return isPaid(); }, isPaid, license, rounds, checkVersion, watermark };
})(window.MC = window.MC || {});
