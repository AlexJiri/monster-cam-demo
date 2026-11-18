// Procedural sound effects (Web Audio): no sound files, so nothing to license.
// The browser only allows audio after a click, so call MC.sfx.unlock() from a button handler.
// Sounds come in groups, each with its own volume (the streamer's sound mixer in the game panel):
//   monster: growls, the scream when caught · steps: footsteps · tension: heartbeat · effects: flashlight clicks.
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
    }
    if (ctx.state === 'suspended') ctx.resume();
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

  // One heavy footstep: low thump plus a short scrape. Steps alternate between a heavier and a lighter foot.
  let foot = 0;
  function footstep(volume = 1, pan) {
    if (!ctx) return;
    busy(300);
    foot ^= 1;
    volume = vary(volume * (foot ? 1 : 0.8), 0.12);
    const t = ctx.currentTime, dest = out('steps', pan), hz = vary(90, 0.12);
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

  // A series of footsteps getting louder and closer (the warning before the light comes): from one side to the middle.
  function approach(seconds = 1.5) {
    const steps = Math.max(2, Math.round(seconds / 0.45)), side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < steps; i++) setTimeout(() => footstep(0.35 + (0.65 * i) / steps, side * 0.7 * (1 - i / steps)), i * vary(450, 0.06));
  }

  // One soft heartbeat thump. Deliberately not marked as "busy": it's quiet and very low, and marking it
  // would deafen the microphone for the whole last half minute. Echo cancellation keeps it out of the mic.
  function heartbeat(volume = 0.4) {
    if (!ctx) return;
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

  // Click of the flashlight switching on.
  function click() {
    if (!ctx) return;
    busy(120);
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuffer(0.03);
    f.type = 'highpass'; f.frequency.value = vary(2000, 0.2);
    g.gain.value = vary(0.5, 0.15);
    n.connect(f).connect(g).connect(out('effects'));
    n.start(t);
  }

  // Volumes 0..1: the master (setVolume) and each group (setGroup). Kept until the audio starts.
  function setVolume(v) { levels.master = v; if (master) master.gain.value = v; }
  function setGroup(group, v) { if (!GROUPS.includes(group)) return; levels[group] = v; if (bus[group]) bus[group].gain.value = v; }

  const api = { unlock, footstep, approach, growl, heartbeat, caught, click, setVolume, setGroup, GROUPS, busyUntil: 0 };
  MC.sfx = api;
})(window.MC = window.MC || {});
