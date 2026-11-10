// Procedural sound effects (Web Audio): no sound files, so nothing to license.
// The browser only allows audio after a click, so call MC.sfx.unlock() from a button handler.
(function (MC) {
  let ctx = null, master = null;
  // The microphone ignores sound until this time (ms, performance.now()), so the game doesn't "hear" itself.
  const busy = (ms) => { api.busyUntil = Math.max(api.busyUntil || 0, performance.now() + ms); };

  function unlock() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // One heavy footstep: low thump plus a short scrape.
  function footstep(volume = 1) {
    if (!ctx) return;
    busy(300);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.9 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.3);

    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuffer(0.12);
    f.type = 'lowpass'; f.frequency.value = 700;
    ng.gain.setValueAtTime(0.25 * volume, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(f).connect(ng).connect(master);
    n.start(t);
  }

  // A series of footsteps getting louder (the warning before the light comes).
  function approach(seconds = 1.5) {
    const steps = Math.max(2, Math.round(seconds / 0.45));
    for (let i = 0; i < steps; i++) setTimeout(() => footstep(0.35 + (0.65 * i) / steps), i * 450);
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
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.22);
  }

  // Low, rumbling growl.
  function growl(seconds = 1.2, volume = 1) {
    if (!ctx) return;
    busy(seconds * 1000);
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuffer(seconds);
    f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 6;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 9; lfoGain.gain.value = 0.35 * volume;
    lfo.connect(lfoGain).connect(g.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6 * volume, t + 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(55, t + seconds);
    og.gain.setValueAtTime(0.12 * volume, t); og.gain.linearRampToValueAtTime(0.0001, t + seconds);
    n.connect(f).connect(g).connect(master);
    o.connect(og).connect(master);
    n.start(t); lfo.start(t); o.start(t);
    lfo.stop(t + seconds); o.stop(t + seconds);
  }

  // Sudden scare when caught: dissonant screech + crunch.
  function caught() {
    if (!ctx) return;
    busy(1600);
    const t = ctx.currentTime;
    [311, 330, 466].forEach((hz) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(hz * 2, t);
      o.frequency.exponentialRampToValueAtTime(hz / 2, t + 0.6);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.75);
    });
    for (let i = 0; i < 4; i++) setTimeout(() => footstep(1), 250 + i * 90); // crunch
    growl(1.4, 1);
  }

  // Click of the flashlight switching on.
  function click() {
    if (!ctx) return;
    busy(120);
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuffer(0.03);
    f.type = 'highpass'; f.frequency.value = 2000;
    g.gain.value = 0.5;
    n.connect(f).connect(g).connect(master);
    n.start(t);
  }

  function setVolume(v) { if (master) master.gain.value = v; }

  const api = { unlock, footstep, approach, growl, heartbeat, caught, click, setVolume, busyUntil: 0 };
  MC.sfx = api;
})(window.MC = window.MC || {});
