// Streamer settings: detection thresholds, curse timers and which gift triggers what.
// Saved in this browser (localStorage).
(function (MC) {
  const KEY = 'monstercam-settings';

  const DEFAULTS = {
    smileThreshold: 0.45, // 0..1 above the calibrated neutral face
    blinkThreshold: 0.55,
    moveThreshold: 1.5, // head movement speed
    soundThreshold: 0.3, // 0..1 above the room's background noise
    lives: 3,
    reviveSeconds: 3, // after losing a life nothing can catch the streamer for this long
    maxCurses: 3, // active at once, the rest wait in a queue
    graceMs: 1200, // warning time before a new curse starts counting
    roundSeconds: 300, // survive this long to win the round (a duel lasts about 5 minutes)
    volume: 0.8,
    sound: { monster: 1, steps: 1, tension: 1, effects: 1 }, // each sound group's volume, 0..1 (sfx.js)
    // Lights On: what counts as "moving" while the flashlight is on you.
    monster: 'hunter', // hunter (walks through the room) | void (comes out of black holes)
    scene: 'none', // atmosphere over the camera: none | basement | forest | hospital
    lightRules: { move: true, smile: true, blink: false, sound: true },
    showGiftGuide: true, // on stream: which gift curses, hunts, eats or helps
    patrolGap: [4, 9], // seconds of darkness between flashlight sweeps (random in this range)
    sweepSeconds: 5, // how long one sweep across the room takes
    warnSeconds: 1.5, // footsteps before the light arrives
    darkness: 0.85, // 0 = no darkness, 1 = pitch black between sweeps
    camBoost: 1, // camera brightness, 1 = as is, up to 1.5
    stareSeconds: 3, // big gift: the monster looks straight into the camera
    shieldSeconds: 6, // helper gift: the monster is chained and can't catch the streamer
    likesForShield: 200, // old saves only: now a gift rule on TAPS (see gifts)
    // Dares are written by the streamer: keep them harmless (TikTok removes lives with dangerous challenges).
    loseDares: [
      'Talk like a pirate for 1 minute',
      'Do 10 squats on camera',
      'Read the next 3 comments in a whisper',
      'Wear something silly on your head for the next round',
      'Sing the chorus of a song chat picks',
    ],
    winDares: [
      'Chat: everyone types 🐔 in the comments',
      'Chat: send 100 likes in 30 seconds',
      'Chat: the top gifter picks the next monster',
    ],
    curses: {
      blink: { label: "Don't blink", icon: '👁️', seconds: 5, maxSeconds: 10 },
      smile: { label: "Don't smile", icon: '😐', seconds: 10, maxSeconds: 20 },
      move: { label: 'Freeze', icon: '🧊', seconds: 5, maxSeconds: 10 }, // no moving and no sound
      sound: { label: 'Silence', icon: '🤫', seconds: 5, maxSeconds: 15 },
    },
    // Which gift does what: `every` gifts of `gift` → `curse` (the effect, see EFFECTS below).
    // Kept short on purpose: viewers have to remember it. Gift names must match TikTok's exactly.
    gifts: [
      { gift: 'Rose', every: 1, curse: 'blink' },
      { gift: 'TikTok', every: 1, curse: 'smile' },
      { gift: 'Finger Heart', every: 1, curse: 'move' },
      { gift: 'Doughnut', every: 1, curse: 'sweep' },
      { gift: 'Galaxy', every: 1, curse: 'rampage' },
      { gift: 'Lion', every: 1, curse: 'eat' },
      { gift: '__taps__', every: 200, curse: 'shield' }, // likes (taps): every 200 chain the monster
    ],
    giftsVersion: 3,
    tapsRule: true, // taps are a rule in `gifts` (older saves get converted once)
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        const s = { ...clone(DEFAULTS), ...saved, curses: { ...clone(DEFAULTS.curses), ...saved.curses }, lightRules: { ...DEFAULTS.lightRules, ...saved.lightRules }, sound: { ...DEFAULTS.sound, ...saved.sound } };
        // Saves from older gift lists: the new short list, 5-minute rounds and the likes target.
        if (saved.giftsVersion !== DEFAULTS.giftsVersion) {
          s.gifts = clone(DEFAULTS.gifts);
          s.giftsVersion = DEFAULTS.giftsVersion;
          s.roundSeconds = DEFAULTS.roundSeconds;
          s.likesForShield = DEFAULTS.likesForShield;
        }
        // Taps used to be a separate setting; now they're a rule like the gifts (once).
        if (!saved.tapsRule) {
          if (s.likesForShield > 0 && !s.gifts.some((g) => g.gift === TAPS)) s.gifts.push({ gift: TAPS, every: s.likesForShield, curse: 'shield' });
          s.tapsRule = true;
        }
        delete s.tiers;
        delete s.anyGiftAdded;
        return s;
      }
    } catch (e) {}
    return clone(DEFAULTS);
  }

  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  // The rule for a gift, by its TikTok name.
  const ruleFor = (s, gift) => s.gifts.find((g) => g.gift.toLowerCase() === String(gift).toLowerCase()) || null;

  // TikTok gifts the settings offer in a list (others can be typed in). Coins = price, only to sort; icons are ours (emoji that Windows 10 can show).
  // Prices: ttcalculator.net LIVE gift chart (2026) and gifts seen on lives.
  const CATALOG = [
    { name: 'Rose', coins: 1, icon: '🌹' },
    { name: 'TikTok', coins: 1, icon: '🎵' },
    { name: 'Heart Me', coins: 1, icon: '💗' },
    { name: 'Blow a kiss', coins: 1, icon: '😘' },
    { name: 'Finger Heart', coins: 5, icon: '💞' },
    { name: 'Panda', coins: 5, icon: '🐼' },
    { name: 'Doughnut', coins: 30, icon: '🍩' },
    { name: 'Hand Hearts', coins: 100, icon: '🤲' },
    { name: 'Confetti', coins: 100, icon: '🎊' },
    { name: 'Sunglasses', coins: 199, icon: '🕶️' },
    { name: 'Corgi', coins: 299, icon: '🐕' },
    { name: 'Perfume', coins: 300, icon: '🧴' },
    { name: 'Pink Cowboy', coins: 450, icon: '🤠' },
    { name: 'Coral', coins: 499, icon: '🐚' },
    { name: 'Galaxy', coins: 1000, icon: '🌌' },
    { name: 'Drama Queen', coins: 5000, icon: '👑' },
    { name: 'Rocket', coins: 20000, icon: '🚀' },
    { name: 'Lion', coins: 29999, icon: '🦁' },
    { name: 'Universe', coins: 34999, icon: '🪐' },
  ];
  // ---------- Gift list from the Monster Cam server ----------
  // The server learns new gifts from lives (name, price, picture) and keeps a copy of each picture. Its last list
  // is kept in this browser and added to CATALOG, so new gifts and pictures arrive without a new version of the game.
  // Offline: the built-in list above, with its emoji.
  const SERVER_KEY = 'monstercam-server'; // set by edition.js from version.json
  const GIFTS_KEY = 'monstercam-gifts';
  const DEFAULT_SERVER = 'https://158.101.197.220';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const server = () => store.get(SERVER_KEY) || DEFAULT_SERVER;
  const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  function mergeCatalog(saved) {
    if (!saved || !Array.isArray(saved.gifts)) return;
    for (const g of saved.gifts) {
      if (!g || typeof g.name !== 'string' || !g.name) continue;
      const img = typeof g.img === 'string' && g.img.startsWith('/') ? saved.base + g.img : '';
      const old = CATALOG.find((c) => sameName(c.name, g.name));
      if (old) { if (g.coins > 0) old.coins = g.coins; if (img) old.img = img; } else CATALOG.push({ name: g.name, coins: g.coins || 0, icon: '🎁', img });
    }
    CATALOG.sort((a, b) => a.coins - b.coins);
  }
  mergeCatalog(store.get(GIFTS_KEY));
  // Ask the server for its list (game start). Resolves to true when it was reached.
  async function refreshCatalog() {
    try {
      const base = server();
      const r = await fetch(base + '/v1/gifts', { signal: AbortSignal.timeout(6000), cache: 'no-store' });
      if (!r.ok) return false;
      const saved = { base, gifts: (await r.json()).gifts };
      store.set(GIFTS_KEY, saved);
      mergeCatalog(saved);
      return true;
    } catch (e) { return false; }
  }

  // Gifts seen on the streamer's live go to the server (each name once per session, sent in small batches):
  // that's how it learns new gifts and their pictures.
  const reported = new Set();
  let outbox = [], outUser = null, outTimer = null;
  function reportGift(username, e) {
    const name = String(e && e.gift || '');
    if (!username || !name || reported.has(name.toLowerCase())) return;
    reported.add(name.toLowerCase());
    if (outUser && outUser !== username) outbox = [];
    outUser = username;
    outbox.push({ name, coins: Number(e.diamonds) || 0, image: String(e.image || '') });
    clearTimeout(outTimer);
    outTimer = setTimeout(() => {
      const gifts = outbox.splice(0, 30);
      fetch(server() + '/v1/gifts/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: 'lightson', username: outUser, gifts }) }).catch(() => {});
    }, 5000);
  }

  // The picture of a gift, ready to draw on the canvas, or null while it loads (or when there is none).
  const pictures = new Map();
  function giftPicture(url) {
    if (!url) return null;
    let img = pictures.get(url);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous'; // the stage canvas stays capturable
      img.src = url;
      pictures.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  // Likes (taps) work like a gift: `every` taps fill the bar and trigger the effect.
  const TAPS = '__taps__';
  const giftInfo = (name) => (name === TAPS ? { name, label: 'taps', coins: 0, icon: '❤️' }
    : CATALOG.find((g) => g.name.toLowerCase() === String(name).toLowerCase()) || { name, coins: 0, icon: '🎁' });

  // Effects grouped (helpers last).
  const GROUPS = [
    { id: 'curses', effects: ['curse', 'blink', 'smile', 'move', 'sound', 'all'] },
    { id: 'hunter', effects: ['sweep', 'stare'] },
    { id: 'big', effects: ['rampage', 'eat'] },
    { id: 'helpers', effects: ['shield', 'cleanse'] },
  ];

  // Every effect a gift can have, in the order the settings list them.
  const EFFECTS = {
    curse: '🎲 Random curse',
    blink: "👁️ Curse: don't blink",
    smile: "😐 Curse: don't smile",
    move: '🧊 Curse: freeze',
    sound: '🤫 Curse: silence',
    all: '☠️ All curses',
    sweep: '🔦 Hunter comes for you',
    stare: '👀 Monster stares at you',
    rampage: '💥 Breaks the chains + hunts',
    eat: '🩸 Eaten on the spot',
    shield: '🛡️ Chain the monster (helps)',
    cleanse: '🧹 Remove all curses (helps)',
  };

  MC.settings = { load, save, defaults: () => clone(DEFAULTS), ruleFor, EFFECTS, GROUPS, CATALOG, giftInfo, TAPS, refreshCatalog, reportGift, giftPicture };
})(window.MC = window.MC || {});
