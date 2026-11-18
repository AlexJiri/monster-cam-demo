// Sound effects (Web Audio). Recorded sounds from src/sounds (listed in src/sounds/sounds.json, free CC0 files)
// play when there is one for that sound; every other sound is made procedurally here, so nothing is ever silent.
// The browser only allows audio after a click, so call MC.sfx.unlock() from a button handler.
// Sounds come in groups, each with its own volume (the streamer's sound mixer in the game panel):
//   monster: growls, the scream when caught · steps: footsteps (and Krampus's bells) · tension: heartbeat · effects: flashlight clicks.
// Every sound varies a little each time it plays (pitch, loudness, left/right), so repeats don't sound copy-pasted.
(function (MC) {
  const GROUPS = ['monster', 'steps', 'tension', 'effects'];
  let ctx = null, master = null;
  const bus = {}; // group -> gain node
  const levels = { master: 0.8, monster: 1, steps: 1, tension: 1, effects: 1 };
  // The microphone ignores sound until this time (ms, performance.now()), so the game doesn't "hear" itself.
  const busy = (ms) => { api.busyUntil = Math.max(api.busyUntil || 0, performance.now() + ms); };
  const vary = (x, r = 0.1) => x * (1 + (Math.random() * 2 - 1) * r);

  function unlock() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = levels.master;
      master.connect(ctx.destination);
      for (const g of GROUPS) { bus[g] = ctx.createGain(); bus[g].gain.value = levels[g]; bus[g].connect(master); }
      loadSamples();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  // ---------- Recorded sounds ----------
  // src/sounds/sounds.json: { "click": ["click-1.mp3", "click-2.mp3"], "hoho": [...], ... }. Several files per sound
  // = a random one each time. Each play also varies a little (speed, loudness, left/right).
  const samples = {}; // name -> [AudioBuffer]
  async function loadSamples() {
    let list = {};
    try { list = await fetch('src/sounds/sounds.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})); } catch (e) { return; }
    for (const [name, files] of Object.entries(list)) {
      for (const f of [].concat(files)) {
        try {
          const buf = await fetch('src/sounds/' + encodeURIComponent(f)).then((r) => r.arrayBuffer());
          (samples[name] = samples[name] || []).push(await ctx.decodeAudioData(buf));
        } catch (e) { /* a missing or broken file: that sound stays procedural */ }
      }
    }
  }
  // Play a recorded sound if there is one; returns false when there isn't (the caller makes it procedurally).
  function sample(name, group, volume = 1, { pan, rate = vary(1, 0.06), busyMs } = {}) {
    const list = samples[name];
    if (!ctx || !list || !list.length) return false;
    const buf = list[Math.floor(Math.random() * list.length)];
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    g.gain.value = vary(volume, 0.1);
    src.connect(g).connect(out(group, pan));
    src.start();
    busy(busyMs != null ? busyMs : (buf.duration / rate) * 1000 + 150);
    return true;
  }
  // Output for a group, panned a little left or right (`pan` -1..1, default: a small random amount).
  function out(group, pan = (Math.random() * 2 - 1) * 0.3) {
    if (!ctx.createStereoPanner) return bus[group];
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(bus[group]);
    return p;
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Sleigh bells jingling: a few bright metallic hits close together (Krampus wears them on his belt).
  function bells(volume = 0.5, pan) {
    if (!ctx) return;
    if (sample('bells', 'steps', volume * 1.2, { pan })) return;
    busy(400);
    const dest = out('steps', pan), hits = 2 + Math.floor(Math.random() * 3);
    for (let h = 0; h < hits; h++) {
      const t = ctx.currentTime + h * vary(0.06, 0.4);
      for (const hz of [vary(2600, 0.2), vary(3900, 0.15), vary(5200, 0.1)]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05 * volume, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + vary(0.3, 0.3));
        o.connect(g).connect(dest);
        o.start(t); o.stop(t + 0.4);
      }
    }
  }

  // Which monster is walking: krampus (hooves and bells), santa (heavier steps, bells), rudolf (quick hooves), zombie (drags itself).
  let walker = 'hunter';
  // A hoof on the floor: a short hard knock.
  function hoof(volume, pan) {
    if (sample('hoof', 'steps', volume, { pan, busyMs: 300 })) return;
    const t = ctx.currentTime, dest = out('steps', pan);
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuffer(0.06);
    f.type = 'bandpass'; f.frequency.value = vary(900, 0.2); f.Q.value = 4;
    g.gain.setValueAtTime(1.4 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(vary(160, 0.1), t); o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    og.gain.setValueAtTime(0.5 * volume, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og).connect(dest);
    o.start(t); o.stop(t + 0.12);
  }

  // One heavy footstep: low thump plus a short scrape (Krampus: a hoof and bells). Steps alternate between a heavier and a lighter foot.
  let foot = 0;
  function footstep(volume = 1, pan) {
    if (!ctx) return;
    busy(300);
    foot ^= 1;
    volume = vary(volume * (foot ? 1 : 0.8), 0.12);
    if (walker === 'krampus') {
      hoof(volume, pan);
      if (foot || Math.random() < 0.3) bells(volume, pan);
      return;
    }
    if (walker === 'rudolf') { // light quick hooves, the bell on his collar now and then
      hoof(volume * 0.7, pan);
      if (Math.random() < 0.15) bells(volume * 0.6, pan);
      return;
    }
    if (walker === 'zombie') { drag(volume, pan); return; }
    // Santa: the same thump, heavier and lower; sleigh bells sometimes.
    const heavy = walker === 'santa';
    if (heavy && Math.random() < 0.25) bells(volume * 0.5, pan);
    if (sample('step', 'steps', volume, { pan, rate: vary(heavy ? 0.8 : 1, 0.06), busyMs: 300 })) return;
    const t = ctx.currentTime, dest = out('steps', pan), hz = vary(heavy ? 70 : 90, 0.12);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.45, t + 0.18);
    g.gain.setValueAtTime(0.9 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.3);

    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuffer(0.12);
    f.type = 'lowpass'; f.frequency.value = vary(700, 0.25);
    ng.gain.setValueAtTime(0.25 * volume, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(f).connect(ng).connect(dest);
    n.start(t);
  }

  // The zombie dragging itself along the floor: a long rough scrape.
  function drag(volume, pan) {
    if (sample('drag', 'steps', volume, { pan })) return;
    const t = ctx.currentTime, dest = out('steps', pan), len = vary(0.45, 0.2);
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuffer(len);
    f.type = 'bandpass'; f.frequency.setValueAtTime(vary(500, 0.2), t); f.frequency.linearRampToValueAtTime(vary(300, 0.2), t + len); f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * volume, t + len * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
  }

  // A voice: a buzzy tone through two vowel filters, its pitch following `curve` (Hz over time).
  function voice(seconds, volume, curve, formants, group = 'monster', wobble = 0) {
    const t = ctx.currentTime, dest = out(group);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    curve.forEach(([at, hz], i) => (i ? o.frequency.linearRampToValueAtTime(hz, t + at * seconds) : o.frequency.setValueAtTime(hz, t)));
    if (wobble) { // a sick, unsteady voice
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = vary(5, 0.3); lg.gain.value = wobble;
      lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + seconds);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.05);
    g.gain.setValueAtTime(volume, t + seconds * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    for (const [hz, q, amp] of formants) {
      const f = ctx.createBiquadFilter(), fg = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = q; fg.gain.value = amp;
      o.connect(f).connect(fg).connect(g);
    }
    g.connect(dest);
    o.start(t); o.stop(t + seconds + 0.05);
  }

  // Santa's deep, slow "ho ho ho".
  function hoho(volume = 1) {
    if (!ctx) return;
    if (sample('hoho', 'monster', volume, { rate: vary(0.95, 0.05) })) return;
    busy(1500);
    const p = vary(1, 0.06);
    for (let i = 0; i < 3; i++) {
      setTimeout(() => voice(0.32, 0.35 * volume, [[0, 120 * p], [1, 85 * p]], [[500, 4, 1.4], [850, 5, 0.7]]), i * 360);
      setTimeout(() => { // the breathy "h" before each "ho"
        if (!ctx) return;
        const t = ctx.currentTime, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        n.buffer = noiseBuffer(0.08); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.8;
        g.gain.setValueAtTime(0.25 * volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        n.connect(f).connect(g).connect(out('monster')); n.start(t);
      }, i * 360 - 40 < 0 ? 0 : i * 360 - 40);
    }
  }

  // The zombie's long moan: low, wavering, falling.
  function groan(seconds = 1.3, volume = 1) {
    if (!ctx) return;
    if (sample('groan', 'monster', volume)) return;
    busy(seconds * 1000);
    const p = vary(1, 0.12);
    voice(seconds, 0.3 * volume, [[0, 95 * p], [0.4, 110 * p], [1, 70 * p]], [[420, 3, 1.3], [700, 4, 0.6]], 'monster', 6);
  }

  // Rudolf snorting before he charges: two short blasts of air.
  function snort(volume = 1) {
    if (!ctx) return;
    if (sample('snort', 'monster', volume)) return;
    busy(700);
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        if (!ctx) return;
        const t = ctx.currentTime, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        n.buffer = noiseBuffer(0.25);
        f.type = 'bandpass'; f.frequency.setValueAtTime(vary(700, 0.2), t); f.frequency.exponentialRampToValueAtTime(300, t + 0.22); f.Q.value = 1.5;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * volume, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        n.connect(f).connect(g).connect(out('monster')); n.start(t);
      }, i * 280);
    }
  }

  // A series of footsteps getting louder and closer (the warning before the light comes): from one side to the middle.
  function approach(seconds = 1.5) {
    const steps = Math.max(2, Math.round(seconds / 0.45)), side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < steps; i++) setTimeout(() => footstep(0.35 + (0.65 * i) / steps, side * 0.7 * (1 - i / steps)), i * vary(450, 0.06));
  }

  // One soft heartbeat thump. Deliberately not marked as "busy": it's quiet and very low, and marking it
  // would deafen the microphone for the whole last half minute. Echo cancellation keeps it out of the mic.
  function heartbeat(volume = 0.4) {
    if (!ctx) return;
    if (sample('heartbeat', 'tension', volume * 2, { pan: 0, rate: 1, busyMs: 250 })) return;
    busy(250); // the microphone ignores it too (it was the one game sound it could hear)
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(out('tension', 0));
    o.start(t); o.stop(t + 0.22);
  }

  // Low, rumbling growl. A quieter growl right after another one is skipped (they used to pile up).
  let lastGrowl = { at: -1e9, until: -1e9, volume: 0 };
  function growl(seconds = 1.2, volume = 1) {
    if (!ctx) return;
    const now = performance.now();
    if (now < lastGrowl.until && now - lastGrowl.at < 600 && volume <= lastGrowl.volume) return;
    lastGrowl = { at: now, until: now + seconds * 1000, volume };
    if (sample('growl', 'monster', volume, { rate: vary(1, 0.1) })) return;
    busy(seconds * 1000);
    volume = vary(volume, 0.1);
    const t = ctx.currentTime, dest = out('monster'), pitch = vary(1, 0.15);
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuffer(seconds);
    f.type = 'lowpass'; f.frequency.value = 380 * pitch; f.Q.value = vary(6, 0.3);
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = vary(9, 0.3); lfoGain.gain.value = 0.35 * volume;
    lfo.connect(lfoGain).connect(g.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6 * volume, t + 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70 * pitch, t); o.frequency.linearRampToValueAtTime(vary(55, 0.15) * pitch, t + seconds);
    og.gain.setValueAtTime(0.12 * volume, t); og.gain.linearRampToValueAtTime(0.0001, t + seconds);
    n.connect(f).connect(g).connect(dest);
    o.connect(og).connect(dest);
    n.start(t); lfo.start(t); o.start(t);
    lfo.stop(t + seconds); o.stop(t + seconds);
  }

  // Sudden scare when caught: dissonant screech + crunch.
  function caught() {
    if (!ctx) return;
    lastGrowl.until = 0;
    if (sample('caught', 'monster', 1, { pan: 0 })) { busy(1600); return; }
    busy(1600);
    const t = ctx.currentTime, dest = out('monster', 0), pitch = vary(1, 0.08);
    [311, 330, 466].forEach((hz) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(hz * 2 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(hz / 2 * pitch, t + 0.6);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g).connect(dest);
      o.start(t); o.stop(t + 0.75);
    });
    for (let i = 0; i < 4; i++) setTimeout(() => footstep(1, 0), 250 + i * 90); // crunch
    lastGrowl.until = 0; // the scream's growl always plays
    growl(1.4, 1);
  }

  // Click of the flashlight switching on: a switch's two tiny clicks (press and catch), each a very short tick
  // of filtered noise that dies away in a few milliseconds, with a small plastic knock under it.
  function click() {
    if (!ctx) return;
    if (sample('click', 'effects', 0.8, { busyMs: 150 })) return;
    busy(120);
    const dest = out('effects');
    for (const [at, level] of [[0, 0.9], [vary(0.028, 0.2), 0.55]]) {
      const t = ctx.currentTime + at;
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuffer(0.012);
      f.type = 'bandpass'; f.frequency.value = vary(3200, 0.15); f.Q.value = 1.8;
      g.gain.setValueAtTime(level * vary(0.6, 0.1), t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.008);
      n.connect(f).connect(g).connect(dest);
      n.start(t);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = vary(1100, 0.1);
      og.gain.setValueAtTime(0.08 * level, t); og.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
      o.connect(og).connect(dest); o.start(t); o.stop(t + 0.015);
    }
  }

  // Santa's sack slamming into you: a deep, soft thud.
  function thud(volume = 1) {
    if (!ctx) return;
    if (sample('thud', 'monster', volume, { pan: 0 })) return;
    busy(500);
    const t = ctx.currentTime, dest = out('monster', 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    g.gain.setValueAtTime(1.1 * volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.4);
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuffer(0.2); f.type = 'lowpass'; f.frequency.value = 600;
    ng.gain.setValueAtTime(0.6 * volume, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(f).connect(ng).connect(dest); n.start(t);
  }

  // Rudolf hitting the "glass": a crack and small tinkling pieces.
  function crack(volume = 1) {
    if (!ctx) return;
    if (sample('crack', 'effects', volume, { pan: 0 })) return;
    busy(800);
    const t = ctx.currentTime, dest = out('effects', 0);
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuffer(0.15); f.type = 'highpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.9 * volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(f).connect(g).connect(dest); n.start(t);
    for (let i = 0; i < 7; i++) {
      const tt = t + 0.05 + Math.random() * 0.5, o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = vary(4200, 0.35);
      og.gain.setValueAtTime(0.0001, tt); og.gain.exponentialRampToValueAtTime(0.04 * volume, tt + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
      o.connect(og).connect(dest); o.start(tt); o.stop(tt + 0.14);
    }
  }

  // Volumes 0..1: the master (setVolume) and each group (setGroup). Kept until the audio starts.
  function setVolume(v) { levels.master = v; if (master) master.gain.value = v; }
  function setGroup(group, v) { if (!GROUPS.includes(group)) return; levels[group] = v; if (bus[group]) bus[group].gain.value = v; }

  const setMonster = (name) => { walker = name; };
  const api = { unlock, footstep, approach, growl, heartbeat, caught, click, bells, hoho, groan, snort, thud, crack, setVolume, setGroup, setMonster, GROUPS, busyUntil: 0 };
  MC.sfx = api;
})(window.MC = window.MC || {});
