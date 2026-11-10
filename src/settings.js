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
    // Which gift does what. `every`: trigger once per N gifts of that kind (helpers need more, so the monster usually wins).
    // `coins`: TikTok's price, only to sort the list (prices can change; the rules go by name).
    // `curse`: blink | smile | move | sound | all | curse (a random one) – curses,
    // sweep (hunter comes) | stare (looks into the camera) | rampage (breaks the chains and hunts) | eat (eaten on the spot),
    // shield (chains the monster) | cleanse (removes all curses) – helpers.
    // Gift names must match TikTok's exactly; the bridge window prints each gift's name and price as it arrives.
    gifts: [
      { gift: 'Rose', coins: 1, curse: 'blink', every: 1 },
      { gift: 'TikTok', coins: 1, curse: 'smile', every: 1 },
      { gift: 'Blow a kiss', coins: 1, curse: 'curse', every: 1 },
      { gift: 'Finger Heart', coins: 5, curse: 'move', every: 1 },
      { gift: 'Panda', coins: 5, curse: 'sound', every: 1 },
      { gift: 'Perfume', coins: 300, curse: 'all', every: 1 },
      { gift: 'Doughnut', coins: 30, curse: 'sweep', every: 1 },
      { gift: 'Confetti', coins: 100, curse: 'stare', every: 1 },
      { gift: 'Sunglasses', coins: 199, curse: 'sweep', every: 1 },
      { gift: 'Pink Cowboy', coins: 450, curse: 'stare', every: 1 },
      { gift: 'Galaxy', coins: 1000, curse: 'rampage', every: 1 },
      { gift: 'Drama Queen', coins: 5000, curse: 'rampage', every: 1 },
      { gift: 'Rocket', coins: 20000, curse: 'eat', every: 1 },
      { gift: 'Lion', coins: 29999, curse: 'eat', every: 1 },
      { gift: 'Universe', coins: 34999, curse: 'eat', every: 1 },
      { gift: 'Heart Me', coins: 1, curse: 'cleanse', every: 10 },
      { gift: 'Hand Hearts', coins: 100, curse: 'shield', every: 3 },
    ],
    giftsVersion: 2,
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        const s = { ...clone(DEFAULTS), ...saved, curses: { ...clone(DEFAULTS.curses), ...saved.curses }, lightRules: { ...DEFAULTS.lightRules, ...saved.lightRules } };
        // Saves from before the gift categories (v2): new gift list and 5-minute rounds.
        if (saved.giftsVersion !== DEFAULTS.giftsVersion) {
          s.gifts = clone(DEFAULTS.gifts);
          s.giftsVersion = DEFAULTS.giftsVersion;
          s.roundSeconds = DEFAULTS.roundSeconds;
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

  // Effects grouped the way the settings page shows them.
  const GROUPS = [
    { id: 'curses', title: '😈 Curses', viewers: '😈 Curse the streamer', hint: 'Cheap gifts: a rule with a timer. Break it and you lose a life.', effects: ['curse', 'blink', 'smile', 'move', 'sound', 'all'] },
    { id: 'hunter', title: '🔦 Hunter', viewers: '🔦 Send the hunter', hint: 'The monster comes looking for you.', effects: ['sweep', 'stare'] },
    { id: 'big', title: '💥 Big gifts', viewers: '💥 Feed them to the monster', hint: 'Expensive gifts: break the chains, or straight into the jaws.', effects: ['rampage', 'eat'] },
    { id: 'helpers', title: '🛡️ Helpers', viewers: '🛡️ Save the streamer', hint: 'Save the streamer. Keep "every" high so the monster usually wins.', effects: ['shield', 'cleanse'] },
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
    shield: '🛡️ Helper: chain the monster',
    cleanse: '🧹 Helper: remove curses',
  };

  MC.settings = { load, save, defaults: () => clone(DEFAULTS), ruleFor, EFFECTS, GROUPS };
})(window.MC = window.MC || {});
