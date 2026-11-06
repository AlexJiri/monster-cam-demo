// Lights On: a hunter walks along the top of the room with a flashlight.
// Dark → footsteps (warning) → the beam sweeps the room → dark again.
// While the beam is on the streamer's face, the light rules apply (don't move / smile / blink).
// A big gift makes the monster stare straight into the camera: the whole frame is lit.
(function (MC) {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;

  class LightsOn {
    constructor(canvas, settings, { onCaught, onPhase }) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.dark = document.createElement('canvas');
      this.s = settings;
      this.onCaught = onCaught;
      this.onPhase = onPhase || (() => {});
      this.phase = 'off';
      this.pending = []; // hunts requested by gifts: names of the viewers who sent them
      this.by = null; // viewer behind the current hunt or stare (null = the monster's own patrol)
      this.shieldUntil = 0; // monster chained by helpers until this time
      this.lit = false;
      this.litSince = 0;
      this.beam = null;
      this.monster = { x: -0.2, y: 0, side: 1 };
    }

    // ---------- state ----------
    start(now) { this.set('idle', now); this.nextAt = now + rand(...this.s.patrolGap) * 1000; }
    stop(now) { this.set('off', now); this.lit = false; }

    set(phase, now, extra = {}) {
      this.phase = phase;
      this.t0 = now;
      Object.assign(this, extra);
      this.onPhase(phase);
    }

    // sweep: the hunter comes looking for the streamer (the beam homes in on the face).
    // stare: the monster looks straight into the camera.
    gift(effect, now, user) {
      if (this.phase === 'off' || this.phase === 'eaten') return false;
      if (effect === 'sweep') {
        this.pending.push(user);
        if (this.phase === 'idle') this.nextAt = now;
        return true;
      }
      if (effect === 'stare') {
        if (this.phase === 'stare' || this.phase === 'stareWarn') {
          // Another viewer joins the stare: they share the credit.
          if (user && !(this.by || '').split(' + ').includes(user)) this.by = this.by ? `${this.by} + ${user}` : user;
          return true;
        }
        MC.sfx.growl(0.9, 0.8);
        this.set('stareWarn', now, { end: now + 900, by: user, hunting: false });
        return true;
      }
      return false;
    }

    // Called by the game when the streamer gets caught (by the light or by a curse).
    eat(now, face) {
      MC.sfx.caught();
      this.lit = false;
      this.set('eaten', now, { end: now + 1600, eatBox: face && face.box ? { ...face.box } : null });
    }

    update(now, face) {
      const s = this.s;
      switch (this.phase) {
        case 'idle':
          this.beam = null;
          if (now >= this.nextAt || this.pending.length) {
            // A gift turns the next pass into a hunt that homes in on the streamer.
            const hunting = this.pending.length > 0;
            const by = hunting ? this.pending.shift() : null;
            const dir = Math.random() < 0.5 ? 1 : -1;
            MC.sfx.approach(s.warnSeconds);
            if (hunting) MC.sfx.growl(s.warnSeconds, 0.6);
            this.set('warn', now, { dir, end: now + s.warnSeconds * 1000, swing: rand(0, TAU), by, hunting });
          }
          break;
        case 'warn':
          this.monster.x = this.dir > 0 ? -0.2 : 1.2;
          if (now >= this.end) { MC.sfx.click(); this.set('sweep', now, { end: now + s.sweepSeconds * 1000 }); }
          break;
        case 'sweep': {
          const p = Math.min(1, (now - this.t0) / (this.end - this.t0));
          this.monster.x = this.dir > 0 ? lerp(-0.15, 1.15, p) : lerp(1.15, -0.15, p);
          // The beam swings left and right while the monster walks.
          let angle = Math.sin(p * TAU * 1.3 + this.swing) * 0.55;
          const ox = this.monster.x + 0.05 * this.dir, oy = 0.17;
          const box = this.hunting && this.screenBox(face);
          if (box) {
            // Hunt: in the middle of the pass the beam locks onto the face.
            const W = this.cv.width, H = this.cv.height;
            const target = Math.atan2((box.x + box.w / 2 - ox) * W, (box.y + box.h / 2 - oy) * H);
            const lock = Math.sin(p * Math.PI) ** 0.6; // 0 at the edges, 1 in the middle
            angle = lerp(angle, target, lock);
          }
          this.beam = { ox, oy, angle, half: this.hunting ? 0.24 : 0.2 };
          if (now >= this.end) {
            this.beam = null;
            this.set('idle', now);
            this.nextAt = now + rand(...s.patrolGap) * 1000;
          }
          break;
        }
        case 'stareWarn':
          if (now >= this.end) { MC.sfx.click(); this.set('stare', now, { end: now + s.stareSeconds * 1000 }); }
          break;
        case 'stare':
          this.beam = null;
          if (now >= this.end) { this.set('idle', now); this.nextAt = now + rand(...s.patrolGap) * 1000; }
          break;
        case 'eaten':
          this.beam = null;
          if (now >= this.end) { this.set('idle', now); this.nextAt = now + 3000; }
          break;
      }
      this.checkLight(now, face);
    }

    // Is the face inside the beam (or is the monster staring)? If so, the light rules apply.
    checkLight(now, face) {
      const box = this.screenBox(face);
      let lit = false;
      if (this.phase === 'stare') lit = true;
      else if (this.beam && box) lit = this.inBeam(box);
      if (lit && !this.lit) this.litSince = now;
      this.lit = lit;
      if (!lit || now - this.litSince < 350) return; // short reaction time when the light lands
      if (now < this.shieldUntil) return; // chained: it sees you but can't get you
      if (!face.face && !(this.s.lightRules.sound && face.sound > this.s.soundThreshold)) return;
      const r = this.s.lightRules;
      const broke =
        (r.move && face.move > this.s.moveThreshold && 'moved') ||
        (r.smile && face.smile > this.s.smileThreshold && 'smiled') ||
        (r.blink && face.blink > this.s.blinkThreshold && 'blinked') ||
        (r.sound && face.sound > this.s.soundThreshold && 'made a sound');
      if (broke) this.onCaught(broke, this.by);
    }

    inBeam(box) {
      const W = this.cv.width, H = this.cv.height;
      const cx = (box.x + box.w / 2) * W, cy = (box.y + box.h / 2) * H;
      const ox = this.beam.ox * W, oy = this.beam.oy * H;
      const dx = cx - ox, dy = cy - oy;
      const dist = Math.hypot(dx, dy);
      const toFace = Math.atan2(dx, dy); // 0 = straight down
      const faceRadius = Math.atan2((box.w * W) / 2, dist) * 0.6;
      return Math.abs(toFace - this.beam.angle) < this.beam.half + faceRadius;
    }

    // Face box in canvas coordinates (0..1), mirrored like the video on screen.
    screenBox(face) {
      if (!face.face || !face.box) return null;
      const b = face.box;
      return { x: 1 - b.x - b.w, y: b.y, w: b.w, h: b.h };
    }

    // ---------- drawing ----------
    draw(now, video, face) {
      const { ctx, cv } = this;
      const W = cv.width, H = cv.height;
      ctx.save();
      // Shake while being eaten.
      if (this.phase === 'eaten' && now - this.t0 < 900) ctx.translate(rand(-12, 12), rand(-12, 12));

      this.drawCamera(video, face, W, H);
      // Outside a round the camera is shown normally, so the streamer can see themselves and calibrate.
      if (this.phase !== 'off') this.drawDarkness(now, W, H);
      if (this.phase !== 'stare') this.drawHunter(now, W, H);
      if (this.phase === 'stare' || this.phase === 'stareWarn') this.drawStare(now, W, H);
      if (this.phase === 'eaten') this.drawJaws(now, W, H);
      if (now < this.shieldUntil) this.drawChains(now, W, H);
      ctx.restore();
    }

    drawCamera(video, face, W, H) {
      const ctx = this.ctx;
      if (video && video.readyState >= 2 && video.videoWidth) {
        // Cover-fit, mirrored.
        const vr = video.videoWidth / video.videoHeight, cr = W / H;
        let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
        if (vr > cr) { sw = sh * cr; sx = (video.videoWidth - sw) / 2; } else { sh = sw / cr; sy = (video.videoHeight - sh) / 2; }
        ctx.save();
        ctx.translate(W, 0); ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
        ctx.restore();
      } else {
        // Manual mode: a stand-in room and person.
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#5a4a3c'); g.addColorStop(1, '#2c241e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const b = this.screenBox(face);
        if (b) {
          ctx.fillStyle = '#d9a37a';
          ctx.beginPath(); ctx.ellipse((b.x + b.w / 2) * W, (b.y + b.h / 2) * H, (b.w / 2) * W, (b.h / 2) * H, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3a6ea5';
          ctx.fillRect((b.x - b.w * 0.3) * W, (b.y + b.h) * H, b.w * 1.6 * W, H);
        }
      }
    }

    drawDarkness(now, W, H) {
      const d = this.dark;
      if (d.width !== W) { d.width = W; d.height = H; }
      const c = d.getContext('2d');
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, W, H);
      // Dark, but not black: the streamer stays a faint silhouette for viewers.
      c.fillStyle = `rgba(3, 5, 10, ${this.s.darkness})`;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-out';

      if (this.beam) {
        const { ox, oy, angle, half } = this.beam;
        const x = ox * W, y = oy * H, len = H * 1.6;
        // Soft-edged cone: a wide faint pass, then the bright core.
        for (const [k, a] of [[1.35, 0.35], [1, 0.75], [0.7, 0.95]]) {
          const g = c.createRadialGradient(x, y, 0, x, y, len);
          g.addColorStop(0, `rgba(0,0,0,${a})`);
          g.addColorStop(0.75, `rgba(0,0,0,${a * 0.7})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + Math.sin(angle - half * k) * len, y + Math.cos(angle - half * k) * len);
          c.lineTo(x + Math.sin(angle + half * k) * len, y + Math.cos(angle + half * k) * len);
          c.closePath();
          c.fill();
        }
      }
      if (this.phase === 'warn') {
        // A faint glow on the side the monster is coming from.
        const pulse = 0.12 + 0.1 * Math.sin(now / 120);
        const gx = this.dir > 0 ? 0 : W;
        const g = c.createRadialGradient(gx, H * 0.2, 0, gx, H * 0.2, W * 0.35);
        g.addColorStop(0, `rgba(0,0,0,${pulse})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      if (this.phase === 'stare') {
        const g = c.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.7);
        g.addColorStop(0, 'rgba(0,0,0,0.92)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      this.ctx.drawImage(d, 0, 0);

      // Warm tint where the light falls.
      if (this.beam) {
        const ctx = this.ctx;
        const { ox, oy, angle, half } = this.beam;
        const x = ox * W, y = oy * H, len = H * 1.6;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, len);
        g.addColorStop(0, 'rgba(255,214,140,0.22)'); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(angle - half) * len, y + Math.cos(angle - half) * len);
        ctx.lineTo(x + Math.sin(angle + half) * len, y + Math.cos(angle + half) * len);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // The hunter looms along the top edge: shoulders, head with glowing eyes, arm holding the lantern.
    drawHunter(now, W, H) {
      if (this.phase !== 'sweep') return;
      const ctx = this.ctx;
      const x = this.monster.x * W, bob = Math.sin(now / 140) * H * 0.008;
      const dir = this.dir;
      ctx.save();
      // Dark body with a warm rim from the lantern, so it reads against the dark room.
      ctx.fillStyle = '#171a23';
      ctx.shadowColor = 'rgba(255, 205, 120, 0.55)';
      ctx.shadowBlur = 22;
      // shoulders and head
      ctx.beginPath(); ctx.ellipse(x, -H * 0.02 + bob, W * 0.14, H * 0.13, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, H * 0.06 + bob, W * 0.055, H * 0.085, 0, 0, TAU); ctx.fill();
      // horns
      ctx.beginPath();
      ctx.moveTo(x - W * 0.035, H * 0.0 + bob); ctx.quadraticCurveTo(x - W * 0.08, -H * 0.05, x - W * 0.06, -H * 0.09); ctx.lineTo(x - W * 0.02, H * 0.0 + bob);
      ctx.moveTo(x + W * 0.035, H * 0.0 + bob); ctx.quadraticCurveTo(x + W * 0.08, -H * 0.05, x + W * 0.06, -H * 0.09); ctx.lineTo(x + W * 0.02, H * 0.0 + bob);
      ctx.fill();
      // arm towards the lantern
      const lx = (this.monster.x + 0.05 * dir) * W, ly = 0.17 * H;
      ctx.strokeStyle = '#171a23'; ctx.lineWidth = W * 0.018; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + W * 0.06 * dir, H * 0.06 + bob); ctx.quadraticCurveTo(x + W * 0.07 * dir, H * 0.15, lx, ly); ctx.stroke();
      // glowing eyes
      ctx.fillStyle = '#ffe36b';
      ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.ellipse(x - W * 0.02, H * 0.06 + bob, W * 0.009, H * 0.008, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + W * 0.02, H * 0.06 + bob, W * 0.009, H * 0.008, 0, 0, TAU); ctx.fill();
      // lantern
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#fff2c4';
      ctx.beginPath(); ctx.arc(lx, ly, W * 0.012, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // Big gift: a huge face fills the frame and looks straight at the streamer.
    drawStare(now, W, H) {
      const ctx = this.ctx;
      const t = this.phase === 'stareWarn' ? Math.min(1, (now - this.t0) / 900) : 1;
      ctx.save();
      ctx.globalAlpha = t;
      // dark frame around the edges (the monster's head)
      const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.32, W / 2, H * 0.55, W * 0.62);
      g.addColorStop(0, 'rgba(7,8,11,0)'); g.addColorStop(1, 'rgba(7,8,11,0.97)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // eyes at the top
      const blink = this.phase === 'stare' && (now - this.t0) % 2200 < 120 ? 0.15 : 1;
      ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 40;
      for (const ex of [0.3, 0.7]) {
        ctx.beginPath(); ctx.ellipse(W * ex, H * 0.12, W * 0.07, H * 0.06 * blink, 0, 0, TAU); ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.fillStyle = '#07080b';
      for (const ex of [0.3, 0.7]) {
        ctx.beginPath(); ctx.ellipse(W * ex, H * 0.12, W * 0.012, H * 0.05 * blink, 0, 0, TAU); ctx.fill();
      }
      // teeth along the bottom
      this.teeth(0, W, H, H * 0.12, true);
      ctx.restore();
    }

    // Row of teeth; `up` = pointing up from the bottom edge at `y`, else pointing down from the top edge.
    teeth(y, W, H, size, up) {
      const ctx = this.ctx;
      const n = 9, w = W / n;
      ctx.fillStyle = '#f3ecd8';
      ctx.strokeStyle = '#6b5a44'; ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        if (up) { ctx.moveTo(i * w, H - y); ctx.lineTo(i * w + w / 2, H - y - size); ctx.lineTo((i + 1) * w, H - y); }
        else { ctx.moveTo(i * w, y); ctx.lineTo(i * w + w / 2, y + size); ctx.lineTo((i + 1) * w, y); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    // Helpers chained the monster: chains across the top and a cold glow around the frame.
    drawChains(now, W, H) {
      const ctx = this.ctx;
      const left = this.shieldUntil - now;
      ctx.save();
      ctx.globalAlpha = Math.min(1, left / 400);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, 'rgba(90,170,255,0)'); g.addColorStop(1, 'rgba(90,170,255,0.35)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#c9d3e0'; ctx.lineWidth = W * 0.008;
      for (const y of [0.1, 0.16]) {
        for (let x = -0.02; x < 1.02; x += 0.045) {
          const sag = Math.sin(x * Math.PI) * 0.025;
          ctx.beginPath();
          ctx.ellipse(x * W, (y + sag) * H, W * 0.022, H * 0.016, ((x * 40) % 2 ? 0.3 : -0.3), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Caught: jaws close over the face, red flash.
    drawJaws(now, W, H) {
      const ctx = this.ctx;
      const t = now - this.t0;
      const close = Math.min(1, t / 450);
      const b = this.eatBox ? { x: 1 - this.eatBox.x - this.eatBox.w, y: this.eatBox.y, w: this.eatBox.w, h: this.eatBox.h } : { x: 0.3, y: 0.25, w: 0.4, h: 0.5 };
      const cy = (b.y + b.h / 2) * H;
      const gap = (1 - close) * H * 0.6;
      ctx.save();
      // red flash
      ctx.fillStyle = `rgba(200, 20, 30, ${Math.max(0, 0.55 - t / 2500)})`;
      ctx.fillRect(0, 0, W, H);
      // upper jaw coming down, lower jaw coming up, meeting at the face
      ctx.fillStyle = '#12090b';
      ctx.fillRect(0, 0, W, cy - gap / 2);
      ctx.fillRect(0, cy + gap / 2, W, H);
      ctx.save(); ctx.translate(0, cy - gap / 2); this.teeth(0, W, H, H * 0.11, false); ctx.restore();
      ctx.save(); ctx.translate(0, cy + gap / 2 - H); this.teeth(0, W, H, H * 0.11, true); ctx.restore();
      ctx.restore();
    }
  }

  MC.LightsOn = LightsOn;
})(window.MC = window.MC || {});
