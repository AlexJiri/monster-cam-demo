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
    // `every`: trigger once per N gifts of that kind (e.g. a curse every 10 roses).
    // `curse`: blink | smile | move | sound | all (curses), sweep | stare (Lights On flashlight),
    // shield | cleanse (help the streamer: chain the monster, remove all curses).
    // Gift names must match TikTok's; rename them in the settings to the gifts you want. "*" = any other gift.
    gifts: [
      { gift: 'Rose', curse: 'blink', every: 1 },
      { gift: 'Ice Cream Cone', curse: 'smile', every: 1 },
      { gift: 'Finger Heart', curse: 'move', every: 1 },
      { gift: 'Galaxy', curse: 'all', every: 1 },
      { gift: 'Doughnut', curse: 'sweep', every: 1 },
      { gift: 'Lion', curse: 'stare', every: 1 },
      { gift: 'Microphone', curse: 'sound', every: 1 },
      { gift: 'Hand Hearts', curse: 'shield', every: 1 },
      { gift: 'Heart Me', curse: 'cleanse', every: 1 },
      { gift: '*', curse: 'sweep', every: 3 }, // any other gift: every 3rd one sends the hunter
    ],
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        const s = { ...clone(DEFAULTS), ...saved, curses: { ...clone(DEFAULTS.curses), ...saved.curses }, lightRules: { ...DEFAULTS.lightRules, ...saved.lightRules } };
        // Saves from before Lights On have no gift for the flashlight effects: add the defaults.
        for (const eff of ['sweep', 'stare', 'sound', 'shield', 'cleanse']) {
          if (!s.gifts.some((g) => g.curse === eff)) s.gifts.push(clone(DEFAULTS.gifts.find((g) => g.curse === eff)));
        }
        // Saves from before the "any other gift" rule.
        if (!s.anyGiftAdded) { if (!s.gifts.some((g) => g.gift === '*')) s.gifts.push(clone(DEFAULTS.gifts.find((g) => g.gift === '*'))); s.anyGiftAdded = true; }
        return s;
      }
    } catch (e) {}
    return clone(DEFAULTS);
  }

  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  MC.settings = { load, save, defaults: () => clone(DEFAULTS) };
})(window.MC = window.MC || {});
