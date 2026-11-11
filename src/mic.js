// Microphone loudness, 0..1 above the room's background noise. Runs locally; audio is never recorded or sent.
// The game's own sounds come out of the speakers and would reach the microphone, so the level is ignored
// while the game is making noise (MC.sfx.busyUntil) only a louder sound counts, and the browser's echo cancellation is requested.
(function (MC) {
  const MIN_DB = -65, MAX_DB = -15; // map this range to 0..1
  const BUSY_MARGIN = 0.2; // extra loudness needed while the game's own sounds play (about 10 dB)

  class Mic {
    constructor() {
      this.level = 0; // smoothed, relative to the noise floor
      this.raw = 0;
      this.floor = 0.15; // background noise (0..1), set by calibrate
      this.ready = false;
    }

    // Create the audio context right inside a tap handler (before any await), the only moment phones allow it to run.
    prime() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    }

    get running() { return !!this.ctx && this.ctx.state === 'running'; }

    async start() {
      this.prime();
      this.stream = await MC.media.get('audio'); // shared with the page around a test round (see face.js)
      this.connect();
      // Phones (iOS Safari above all) start the audio context suspended and only let a tap or key press wake it,
      // so resuming from the frame loop alone left the mic deaf until something else woke it.
      const wake = () => { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); };
      for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, wake, { capture: true, passive: true });
      wake();
      this.ready = true;
    }

    connect() {
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 1024;
      src.connect(this.an);
      this.buf = new Float32Array(this.an.fftSize);
      this.silent = 0;
    }

    // iPhones sometimes hand an audio context that started together with the microphone nothing but exact
    // zeros (the first round was deaf, the next one fine). A real microphone is never perfectly silent,
    // so after ~1 s of exact zeros start a fresh context on the same stream.
    revive() {
      const old = this.ctx;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume().catch(() => {});
      this.connect();
      old.close().catch(() => {});
      this.revives = (this.revives || 0) + 1;
    }

    // Current loudness above the floor (0..1). Call once per frame.
    read(now = performance.now()) {
      if (!this.ready) return 0;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.an.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      if (sum === 0 && this.ctx.state === 'running' && this.stream.getAudioTracks().some((t) => t.readyState === 'live')) {
        if (++this.silent > 60 && (this.revives || 0) < 5) this.revive();
      } else this.silent = 0;
      const db = 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-9);
      this.raw = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
      const busy = MC.sfx && now < (MC.sfx.busyUntil || 0) + 250;
      // While the game makes noise, only a clearly louder sound counts (a voice, not the speakers' footsteps).
      // Muting the mic completely here made the streamer impossible to catch while the hunter walked:
      // its footsteps play every 0.4 s, exactly while the light sweeps the room.
      const floor = busy ? Math.min(0.85, this.floor + BUSY_MARGIN) : this.floor;
      const above = Math.max(0, (this.raw - floor) / (1 - floor));
      // Rise fast, fall slower, so a short word still registers.
      this.level = above > this.level ? above : this.level * 0.85 + above * 0.15;
      return this.level;
    }

    calibrateStart() { this.samples = []; }
    sample() { if (this.samples) this.samples.push(this.raw); }
    calibrateEnd() {
      if (this.samples && this.samples.length) {
        const sorted = this.samples.slice().sort((a, b) => a - b);
        // A bit above the typical room level, so breathing and fan noise don't count.
        this.floor = Math.min(0.6, sorted[Math.floor(sorted.length * 0.8)] + 0.05);
      }
      this.samples = null;
      return this.floor;
    }
  }

  MC.Mic = Mic;
})(window.MC = window.MC || {});
