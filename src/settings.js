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
    roundSeconds: 180, // survive this long to win the round
    volume: 0.8,
    // Lights On: what counts as "moving" while the flashlight is on you.
    lightRules: { move: true, smile: true, blink: false, sound: true },
    patrolGap: [4, 9], // seconds of darkness between flashlight sweeps (random in this range)
    sweepSeconds: 5, // how long one sweep across the room takes
    warnSeconds: 1.5, // footsteps before the light arrives
    darkness: 0.85, // 0 = no darkness, 1 = pitch black between sweeps
    stareSeconds: 3, // big gift: the monster looks straight into the camera
    shieldSeconds: 6, // helper gift: the monster is chained and can't catch the streamer
    likesForShield: 100, // chat fills a bar with likes; when full, the monster is chained
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
    // Gifts by price: a gift without its own rule below uses the highest price tier it reaches.
    // Prices are TikTok coins per gift (they come with every gift). Effects as in `gifts`.
    tiers: [
      { min: 1, curse: 'curse' }, // small gifts: a random curse
      { min: 10, curse: 'sweep' }, // the hunter comes for you
      { min: 100, curse: 'stare' }, // it looks straight into the camera
      { min: 1000, curse: 'rampage' }, // breaks the chains and hunts you
      { min: 20000, curse: 'eat' }, // the monster eats you on the spot
    ],
    // Named gifts override the price tiers. `every`: trigger once per N gifts of that kind.
    // `curse`: blink | smile | move | sound | all | curse (random one) (curses), sweep | stare (flashlight),
    // rampage (break the chains + hunt), eat (lose a life on the spot), shield | cleanse (help the streamer).
    // Gift names must match TikTok's exactly; the bridge window prints each gift's name and price.
    gifts: [
      { gift: 'Rose', curse: 'blink', every: 1 }, // 1 coin
      { gift: 'Finger Heart', curse: 'move', every: 1 }, // 5 coins
      { gift: 'Heart Me', curse: 'cleanse', every: 1 }, // 1 coin, helper
      { gift: 'Hand Hearts', curse: 'shield', every: 1 }, // 100 coins, helper
      { gift: 'Galaxy', curse: 'rampage', every: 1 }, // 1,000 coins
    ],
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        const s = { ...clone(DEFAULTS), ...saved, curses: { ...clone(DEFAULTS.curses), ...saved.curses }, lightRules: { ...DEFAULTS.lightRules, ...saved.lightRules } };
        // Saves from older versions: add the price tiers and drop the old "*" catch-all.
        if (!Array.isArray(saved.tiers)) s.tiers = clone(DEFAULTS.tiers);
        s.gifts = s.gifts.filter((g) => g.gift !== '*');
        delete s.anyGiftAdded;
        return s;
      }
    } catch (e) {}
    return clone(DEFAULTS);
  }

  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  // The rule for a gift: its own named rule, else the highest price tier its price reaches.
  function ruleFor(s, gift, coins) {
    const named = s.gifts.find((g) => g.gift.toLowerCase() === String(gift).toLowerCase());
    if (named) return named;
    const tier = (s.tiers || []).filter((t) => (coins || 0) >= t.min).sort((a, b) => b.min - a.min)[0];
    return tier ? { gift, curse: tier.curse, every: 1, tier: tier.min } : null;
  }

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
    rampage: '💥 Break chains + hunt',
    eat: '🩸 Eaten on the spot',
    shield: '🛡️ Helper: chain the monster',
    cleanse: '🧹 Helper: remove curses',
  };

  MC.settings = { load, save, defaults: () => clone(DEFAULTS), ruleFor, EFFECTS };
})(window.MC = window.MC || {});
