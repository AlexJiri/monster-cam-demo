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
  const FIRST_DAY_ROUNDS = 5; // the first 24 h with a game (from its first free round)
  const COOLDOWN_HOURS = 24;
  // Public file with { "latest", "minimum", "download", "server" }. Older than `minimum` = must update.
  const VERSION_URL = 'https://alexjiri.github.io/monster-cam-demo/version.json';
  // The Monster Cam server; version.json's "server" overrides it, so a new address needs no new build.
  const DEFAULT_SERVER = 'https://158.101.197.220';
  const KEY = 'monstercam-rounds';
  const LICENSE = 'monstercam-license'; // old: one key
  const LICENSES = 'monstercam-licenses';
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

  // ---------- License keys ----------
  // Every key bought is kept: { key, product }. A product is a game ('lightson'), a pack ('lightson-xmas'),
  // 'all' (the All Games bundle: every game, no packs) or 'founder' (everything, now and later). Same rule as the server.
  const isPackId = (id) => id.includes('-');
  const unlocks = (product, id) => product === id || product === 'founder' || (product === 'all' && !isPackId(id));
  const keys = () => {
    const list = store.get(LICENSES);
    if (Array.isArray(list)) return list;
    const old = store.get(LICENSE); // before packs: one key, for this game
    const moved = old && old.key ? [{ key: old.key, product: GAME, at: old.at }] : [];
    store.set(LICENSES, moved);
    return moved;
  };
  const license = {
    keys,
    // The first saved key (the game's own when there is one).
    get() { const l = keys(); return (l.find((k) => k.product === GAME) || l[0] || {}).key || null; },
    // Check a typed key (any product) and save it when valid. Resolves to { valid, product?, blocked?, offline? }.
    async activate(key, username) {
      const r = await call('/v1/key/check', { game: 'any', key, username: cleanUser(username) });
      if (!r) return { valid: false, offline: true };
      if (r.valid) {
        const k = String(key).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MC(\w{4})(\w{4})(\w{4})$/, 'MC-$1-$2-$3');
        store.set(LICENSES, keys().filter((x) => x.key !== k).concat({ key: k, product: r.product || GAME, at: Date.now() }));
      }
      return r;
    },
    // Quiet re-check (app start, TikTok connect): logs the username with each key, and drops a key the server
    // has blocked. Offline keeps the keys.
    async recheck(username) {
      for (const k of keys()) {
        const r = await call('/v1/key/check', { game: 'any', key: k.key, username: cleanUser(username) });
        if (r && r.valid === false) store.set(LICENSES, keys().filter((x) => x.key !== k.key));
      }
    },
  };
  // Owns a game, pack or bundle (a bundle key counts for what it unlocks).
  const owns = (id) => PAID || DEV || keys().some((k) => unlocks(k.product, id));
  // The full version of this game: no round limit, no watermark.
  const isPaid = () => PAID || keys().some((k) => unlocks(k.product, GAME));

  // ---------- Free rounds ----------
  // A counter of free rounds for a game or pack (`id`, the server's name for it too): `max` per COOLDOWN_HOURS
  // (`firstDay` in the first 24 h, games only), counted on the server per TikTok username, with a local list (start
  // times, saved under `storeKey`) as the fallback and offline count. Unlimited once `id` is owned.
  function counter(game, max, storeKey, firstDay = max) {
    // The numbers set in the backoffice come with the lobby catalog; the built-in ones until it has loaded.
    const limits = () => {
      const c = catalog.items().find((i) => i.product === game || (!i.product && i.id === game));
      const n = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d);
      return c ? { rounds: n(c.rounds, max), firstDay: n(c.firstDay, firstDay), cooldownH: n(c.cooldownH, COOLDOWN_HOURS) || COOLDOWN_HOURS }
        : { rounds: max, firstDay, cooldownH: COOLDOWN_HOURS };
    };
    const hold = () => limits().cooldownH * 3600e3;
    const local = {
      list() {
        const since = Date.now() - hold();
        return (store.get(storeKey) || []).filter((t) => t > since);
      },
      max() { const f = store.get(storeKey + '-first'), l = limits(); return !f || Date.now() - f < hold() ? l.firstDay : l.rounds; },
      left() { return Math.max(0, this.max() - this.list().length); },
      nextAt() { const l = this.list().sort((a, b) => a - b), m = this.max(); return l.length < m || !m ? 0 : l[l.length - m] + hold(); },
      use() {
        const l = this.list(); l.push(Date.now()); store.set(storeKey, l);
        if (!store.get(storeKey + '-first')) store.set(storeKey + '-first', Date.now());
      },
    };
    let online = null; // last answer from the server for the connected username: { user, left, nextAt, max }
    return {
      id: game,
      limits,
      get max() { return online && online.max ? online.max : local.max(); },
      left() { return owns(game) ? Infinity : online ? online.left : local.left(); },
      // When the next free round becomes available (ms timestamp), or 0 if one is available now.
      nextAt() { return this.left() > 0 ? 0 : online ? online.nextAt : local.nextAt(); },
      // Refresh the online count for the TikTok username the game is connected to (null = not connected).
      async refresh(username) {
        const user = cleanUser(username);
        if (!user) { online = null; return; }
        const r = await call('/v1/rounds/status', { game, username: user });
        online = r ? { user, left: r.left, nextAt: r.nextAt, max: r.max } : null;
      },
      // Use up a free round. Resolves to { allowed, left, nextAt }. Online for a connected username;
      // otherwise (or offline) the local count decides.
      async use(username) {
        if (owns(game)) return { allowed: true, left: Infinity, nextAt: 0 };
        const user = cleanUser(username);
        const r = user ? await call('/v1/rounds/use', { game, username: user }) : null;
        if (r) {
          online = { user, left: r.left, nextAt: r.nextAt, max: r.max };
          if (r.allowed) local.use(); // keep the local count in step for offline use
          return { allowed: r.allowed, left: r.left, nextAt: r.nextAt };
        }
        online = null;
        if (local.left() <= 0) return { allowed: false, left: 0, nextAt: local.nextAt() };
        local.use();
        return { allowed: true, left: local.left(), nextAt: local.nextAt() };
      },
    };
  }
  const rounds = counter(GAME, FREE_ROUNDS, KEY, FIRST_DAY_ROUNDS);

  // ---------- What's in the game ----------
  // Each game has its own monsters and scenes (they don't carry over to other games). Packs add more, sold apart.
  const CONTENT = {
    hunter: { icon: '🔦', name: 'Hunter', about: 'walks through the room with a lantern' },
    void: { icon: '🕳️', name: 'Void', about: 'crawls out of black holes' },
    krampus: { icon: '👹', name: 'Krampus', about: 'hooves, bells and chains' },
    santa: { icon: '🎅', name: 'Santa', about: 'fat and slow, hits you with his gift sack' },
    rudolf: { icon: '🦌', name: 'Rudolf', about: 'fast, his red nose is the light, charges with his antlers' },
    zombie: { icon: '🧟', name: 'Zombie', about: 'crawls with a head lamp, turns you into one of them' },
    none: { icon: '🎥', name: 'Just my room', short: 'Room' },
    basement: { icon: '🧱', name: 'Basement' },
    forest: { icon: '🌲', name: 'Forest' },
    hospital: { icon: '🏥', name: 'Hospital' },
    winter: { icon: '❄️', name: 'Winter night' },
  };
  const GAMES = {
    lightson: { monsters: ['hunter', 'void', 'zombie'], scenes: ['none', 'basement', 'forest', 'hospital'], packs: ['xmas'], duel: true },
  };

  // Cover pictures for the store (a catalog card's own `cover` link, set on the server, comes first).
  const COVERS = { lightson: 'src/covers/lightson.jpg', xmas: 'src/covers/xmas.jpg' };

  // ---------- Packs ----------
  // Extra monsters and scenes for one game, sold apart (`product`: what their keys unlock). Until bought, a pack
  // can be tried for a round a day (counted apart from the game's free rounds, and on top of them).
  const PACKS = {
    xmas: {
      id: 'xmas', // its card in the lobby catalog
      product: `${GAME}-xmas`,
      game: GAME,
      name: 'Christmas Pack',
      monsters: ['krampus', 'santa', 'rudolf'], scenes: ['winter'],
      rounds: counter(`${GAME}-xmas`, 1, 'monstercam-xmas-rounds'), // 1 free round a day
    },
  };
  // A catalog card's product id (what a key for it is saved as).
  const productOf = (cardId) => (PACKS[cardId] ? PACKS[cardId].product : cardId);
  // A product's name for messages ("✅ Unlocked: Christmas Pack").
  function productName(product) {
    const pack = Object.values(PACKS).find((p) => p.product === product);
    const card = catalog.items().find((c) => c.id === (pack ? pack.id : product));
    return card ? card.title : pack ? pack.name : product;
  }
  // The pack a game setup uses (monster or scene from a pack), or null.
  const packFor = (s) => Object.values(PACKS).find((p) => p.monsters.includes(s.monster) || p.scenes.includes(s.scene)) || null;

  // ---------- Lobby catalog ----------
  // The cards the lobby shows (games, packs, coming soon) with their Buy links, from the server (mc-catalog).
  // The last copy is kept for offline; the built-in list is the very first fallback (no Buy links in it).
  const CATALOG_KEY = 'monstercam-catalog';
  const DEFAULT_CATALOG = [
    { id: 'founder', kind: 'bundle', title: 'Founder Pass', icon: '👑', blurb: 'Every game and every pack, today and every one that comes out later. Only for a limited time.' },
    { id: 'lightson', kind: 'game', title: 'Lights On', icon: '🔦', blurb: 'A monster hunts the room with a lantern. Viewers send gifts to curse you, send it after you or chain it up. Freeze when the light finds you.' },
    { id: 'xmas', kind: 'pack', product: 'lightson-xmas', title: 'Christmas Pack', icon: '🎄', blurb: 'Krampus, an evil Santa who hits you with his gift sack and Rudolf with a glowing red nose. Winter night with snow, string lights and monster reindeer by a rusty sleigh.' },
    { id: 'all', kind: 'bundle', title: 'All Games Bundle', icon: '🎮', blurb: 'Every Monster Cam game out today, for less than buying them one by one.' },
    { id: 'freeze', kind: 'soon', title: 'Freeze', icon: '🧊', blurb: 'Reach the finish without moving while the monster watches.' },
    { id: 'swarm', kind: 'soon', title: 'Swarm', icon: '🦇', blurb: 'Every viewer becomes a little monster.' },
    { id: 'duel', kind: 'soon', title: 'Monster Duel', icon: '⚔️', blurb: 'TikTok LIVE battles: gifts send the monster to your opponent.' },
  ];
  const catalog = {
    items() { const c = store.get(CATALOG_KEY); return Array.isArray(c) && c.length ? c : DEFAULT_CATALOG; },
    // Ask the server for the newest cards. Resolves to true when they changed.
    async refresh() {
      try {
        const r = await fetch(server() + '/v1/catalog', { signal: AbortSignal.timeout(6000), cache: 'no-store' });
        const items = r.ok ? (await r.json()).items : null;
        if (!Array.isArray(items) || !items.length) return false;
        const changed = JSON.stringify(items) !== JSON.stringify(store.get(CATALOG_KEY));
        store.set(CATALOG_KEY, items);
        return changed;
      } catch (e) { return false; }
    },
    // Where to buy the full version ('' until the store page exists). Only https links are used.
    buyLink(id = GAME) { const c = this.items().find((i) => i.id === id); return c && /^https:\/\//.test(c.buy || '') ? c.buy : ''; },
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

  MC.edition = {
    VERSION, GAME, DEV, FREE_ROUNDS, FIRST_DAY_ROUNDS, COOLDOWN_HOURS, get PAID() { return isPaid(); }, isPaid, owns, license, rounds, server,
    CONTENT, GAMES, PACKS, COVERS, packFor, productOf, productName, catalog, checkVersion, watermark,
  };
})(window.MC = window.MC || {});
