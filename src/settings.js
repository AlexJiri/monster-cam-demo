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
    // Lights On: what counts as "moving" while the flashlight is on you.
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
        const s = { ...clone(DEFAULTS), ...saved, curses: { ...clone(DEFAULTS.curses), ...saved.curses }, lightRules: { ...DEFAULTS.lightRules, ...saved.lightRules } };
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

  MC.settings = { load, save, defaults: () => clone(DEFAULTS), ruleFor, EFFECTS, GROUPS, CATALOG, giftInfo, TAPS };
})(window.MC = window.MC || {});
