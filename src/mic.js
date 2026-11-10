// Microphone loudness, 0..1 above the room's background noise. Runs locally; audio is never recorded or sent.
// The game's own sounds come out of the speakers and would reach the microphone, so the level is ignored
// while the game is making noise (MC.sfx.busyUntil) and the browser's echo cancellation is requested.
(function (MC) {
  const MIN_DB = -65, MAX_DB = -15; // map this range to 0..1

  class Mic {
    constructor() {
      this.level = 0; // smoothed, relative to the noise floor
      this.raw = 0;
      this.floor = 0.15; // background noise (0..1), set by calibrate
      this.ready = false;
    }

    async start() {
      const stream = await MC.media.get('audio'); // shared with the page around a test round (see face.js)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ctx.createMediaStreamSource(stream);
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 1024;
      src.connect(this.an);
      this.buf = new Float32Array(this.an.fftSize);
      this.ready = true;
    }

    // Current loudness above the floor (0..1). Call once per frame.
    read(now = performance.now()) {
      if (!this.ready) return 0;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.an.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const db = 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-9);
      this.raw = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
      const busy = MC.sfx && now < (MC.sfx.busyUntil || 0) + 250;
      const above = busy ? 0 : Math.max(0, (this.raw - this.floor) / (1 - this.floor));
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
