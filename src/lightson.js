// Lights On: a tall hunter walks through the room with a lantern.
// Dark → footsteps (warning) → a pass through the room → dark again (a breather for the streamer).
// Each pass is a random trick: walk across swinging the light, stop with its back turned and then spin round
// and shine the lantern in the streamer's eyes, or peek in from the edge and glare.
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
      this.monster = { x: -0.2, facing: 1, back: false, moving: false };
      this.plan = []; // the current pass: segments { dur, x0, x1, beam: 'swing' | 'face' | 'off', back, facing }
      this.stepAt = 0; // next footstep sound
      this.curses = []; // active curses, set by the game each frame: { type, on } (on = past the warning)
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
      this.lastSound = face.sound || 0;
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
          { const b = this.screenBox(face); if (b) this.faceX = b.x + b.w / 2; }
          if (now >= this.end) {
            this.plan = this.makePlan(this.dir, this.hunting);
            this.set('sweep', now, { end: now + this.plan.reduce((t, g) => t + g.dur, 0) });
          }
          break;
        case 'sweep': {
          // Find the segment of the plan we're in.
          let t = now - this.t0, seg = this.plan[this.plan.length - 1], p = 1;
          for (const g of this.plan) { if (t <= g.dur) { seg = g; p = g.dur ? t / g.dur : 1; break; } t -= g.dur; }
          if (seg !== this.seg) {
            // Entering a new segment: the spin round is loud.
            if (seg.beam === 'face' && this.seg && this.seg.back) { MC.sfx.growl(0.6, 0.9); MC.sfx.click(); }
            else if (seg.beam !== 'off' && (!this.seg || this.seg.beam === 'off')) MC.sfx.click();
            this.seg = seg;
          }
          const m = this.monster;
          m.x = lerp(seg.x0, seg.x1, p);
          m.facing = seg.facing;
          m.back = seg.back;
          m.moving = seg.x0 !== seg.x1;
          if (m.moving && now >= this.stepAt) { MC.sfx.footstep(0.45); this.stepAt = now + 420; }
          const ox = m.x + 0.075 * m.facing, oy = 0.42;
          const box = this.screenBox(face);
          if (box) this.faceX = box.x + box.w / 2;
          const W = this.cv.width, H = this.cv.height;
          // Default aim: across the room, towards its middle.
          const centre = Math.atan2((0.5 - ox) * W, (0.5 - oy) * H);
          if (seg.beam === 'off') this.beam = null;
          else if (seg.beam === 'face') {
            // Straight into the streamer's eyes (or the middle of the room if there's no face).
            const target = box ? Math.atan2((box.x + box.w / 2 - ox) * W, (box.y + box.h / 2 - oy) * H) : centre;
            this.beam = { ox, oy, angle: target, half: 0.3 };
          } else {
            let angle = centre + Math.sin((now - this.t0) / 650 + this.swing) * 0.6;
            if (this.hunting && box) {
              // Hunt: in the middle of the walk the beam locks onto the face.
              const target = Math.atan2((box.x + box.w / 2 - ox) * W, (box.y + box.h / 2 - oy) * H);
              angle = lerp(angle, target, Math.sin(p * Math.PI) ** 0.6);
            }
            this.beam = { ox, oy, angle, half: this.hunting ? 0.24 : 0.2 };
          }
          if (now >= this.end) {
            this.beam = null;
            this.seg = null;
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

    // One pass through the room, picked at random. Times in ms, x in frame widths (−0.2 and 1.2 are off screen).
    makePlan(dir, hunting) {
      const s = this.s, from = dir > 0 ? -0.2 : 1.2, to = dir > 0 ? 1.2 : -0.2, f = dir;
      const walk = s.sweepSeconds * 1000;
      const trick = hunting ? (Math.random() < 0.6 ? 'turn' : 'walk') : ['walk', 'walk', 'turn', 'peek'][Math.floor(Math.random() * 4)];
      if (trick === 'turn') {
        // Walks in, stops with its back to the streamer, then spins round and shines the lantern in their eyes.
        // Stops on the far side from the streamer, so it doesn't stand in front of their face.
        const fx = this.faceX == null ? 0.5 : this.faceX;
        const stop = fx < 0.5 ? rand(0.66, 0.82) : rand(0.18, 0.34);
        const inFrac = Math.abs(stop - from) / 1.4;
        return [
          { dur: walk * inFrac, x0: from, x1: stop, beam: 'swing', back: false, facing: f },
          { dur: rand(1000, 3000), x0: stop, x1: stop, beam: 'off', back: true, facing: -f },
          { dur: rand(1200, 2000), x0: stop, x1: stop, beam: 'face', back: false, facing: f },
          { dur: walk * (1 - inFrac), x0: stop, x1: to, beam: 'swing', back: false, facing: f },
        ];
      }
      if (trick === 'peek') {
        // Leans in from the edge, glares, and leaves the way it came.
        const edge = dir > 0 ? 0.08 : 0.92;
        return [
          { dur: 700, x0: from, x1: edge, beam: 'off', back: false, facing: f },
          { dur: rand(1200, 2200), x0: edge, x1: edge, beam: 'face', back: false, facing: f },
          { dur: 700, x0: edge, x1: from, beam: 'off', back: false, facing: -f },
        ];
      }
      return [{ dur: walk, x0: from, x1: to, beam: 'swing', back: false, facing: f }];
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
      if (this.phase !== 'off') this.drawDarkness(now, W, H, face);
      this.drawCurses(now, W, H, face);
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

    // Where the eyes and the mouth are, in canvas pixels (from the face box; good enough for a spotlight).
    facePoints(face, W, H) {
      const b = this.screenBox(face);
      if (!b) return null;
      const cx = (b.x + b.w / 2) * W;
      return { cx, w: b.w * W, h: b.h * H, eyesY: (b.y + b.h * 0.4) * H, mouthY: (b.y + b.h * 0.78) * H };
    }

    // Curses made visible: a red light on the eyes (don't blink) and / or the mouth (don't smile),
    // the monster's ears at the edges (silence; they grow with noise), frost around the frame (freeze).
    drawCurses(now, W, H, face) {
      if (!this.curses.length) return;
      const ctx = this.ctx, has = (t) => this.curses.find((c) => c.type === t);
      const pulse = 0.6 + 0.4 * Math.sin(now / 180);
      const p = this.facePoints(face, W, H);
      ctx.save();
      for (const [type, y, rx, ry] of p ? [['blink', p.eyesY, p.w * 0.42, p.h * 0.12], ['smile', p.mouthY, p.w * 0.28, p.h * 0.1]] : []) {
        const c = has(type);
        if (!c) continue;
        // Warning period: dashed and faint; active: solid and pulsing.
        ctx.strokeStyle = `rgba(255, 60, 60, ${c.on ? 0.55 + 0.4 * pulse : 0.45})`;
        ctx.lineWidth = c.on ? 4 : 2;
        ctx.setLineDash(c.on ? [] : [8, 8]);
        ctx.shadowColor = '#ff3030'; ctx.shadowBlur = c.on ? 24 * pulse : 6;
        ctx.beginPath(); ctx.ellipse(p.cx, y, rx, ry, 0, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
      const quiet = has('sound') || has('move');
      if (quiet) {
        // Big monster ears at both edges, cupped towards the streamer: it's listening. Louder = bigger.
        const loud = Math.min(1, (this.lastSound || 0) / Math.max(0.05, this.s.soundThreshold));
        const k = (quiet.on ? 1 : 0.7) * (1 + 0.35 * loud + 0.04 * Math.sin(now / 300));
        for (const side of [-1, 1]) this.drawEar(side < 0 ? 0 : W, H * 0.5, H * 0.22 * k, side, loud);
      }
      const frost = has('move');
      if (frost) {
        // Frost creeping in from the edges.
        const a = frost.on ? 0.55 : 0.3;
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.68);
        g.addColorStop(0, 'rgba(170, 220, 255, 0)'); g.addColorStop(1, `rgba(170, 220, 255, ${a})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `rgba(220, 245, 255, ${a})`; ctx.lineWidth = 2; ctx.shadowBlur = 0;
        for (let i = 0; i < 14; i++) {
          // Fixed crystals along the edges (seeded by index so they don't jump around).
          const t = i / 14, ex = i % 2 ? t * W : (i % 4 < 2 ? 12 : W - 12), ey = i % 2 ? (i % 4 < 2 ? 12 : H - 12) : t * H;
          for (let r = 0; r < 3; r++) { const ang = (r * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(ex - Math.cos(ang) * 14, ey - Math.sin(ang) * 14); ctx.lineTo(ex + Math.cos(ang) * 14, ey + Math.sin(ang) * 14); ctx.stroke(); }
        }
      }
      ctx.restore();
    }

    // One pointed monster ear at the edge of the frame, opening towards the middle.
    drawEar(x, y, size, side, loud) {
      const ctx = this.ctx, d = -side; // points inwards
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(d, 1);
      ctx.fillStyle = '#1a1420';
      ctx.shadowColor = loud > 0.6 ? 'rgba(255, 60, 60, 0.9)' : 'rgba(255, 205, 120, 0.5)';
      ctx.shadowBlur = 20 + 30 * loud;
      ctx.beginPath();
      ctx.moveTo(-size * 0.1, -size * 0.9);
      ctx.quadraticCurveTo(size * 0.95, -size * 1.2, size * 0.75, -size * 0.1);
      ctx.quadraticCurveTo(size * 0.6, size * 0.6, size * 0.15, size * 0.95);
      ctx.lineTo(-size * 0.1, size * 0.9);
      ctx.closePath(); ctx.fill();
      // inner ear
      ctx.shadowBlur = 0;
      ctx.fillStyle = loud > 0.6 ? 'rgba(200, 40, 50, 0.85)' : 'rgba(120, 50, 70, 0.8)';
      ctx.beginPath();
      ctx.moveTo(size * 0.02, -size * 0.6);
      ctx.quadraticCurveTo(size * 0.65, -size * 0.8, size * 0.5, -size * 0.1);
      ctx.quadraticCurveTo(size * 0.4, size * 0.4, size * 0.1, size * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawDarkness(now, W, H, face) {
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
      // Cursed eyes / mouth stay lit, so viewers can see them.
      const pts = this.facePoints(face, W, H);
      if (pts) {
        for (const [type, y, rx, ry] of [['blink', pts.eyesY, pts.w * 0.42, pts.h * 0.12], ['smile', pts.mouthY, pts.w * 0.28, pts.h * 0.1]]) {
          if (!this.curses.some((x) => x.type === type)) continue;
          const g = c.createRadialGradient(pts.cx, y, 0, pts.cx, y, rx * 1.2);
          g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.7, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g;
          c.beginPath(); c.ellipse(pts.cx, y, rx * 1.2, ry * 1.6, 0, 0, TAU); c.fill();
        }
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

    // The hunter: a tall, thin creature walking through the room on long legs, lantern in one hand.
    // Seen from behind (`back`) it has no eyes and the lantern is hidden.
    drawHunter(now, W, H) {
      if (this.phase !== 'sweep') return;
      const ctx = this.ctx, m = this.monster;
      const x = m.x * W, f = m.facing;
      const walkT = now / 260;
      const stride = m.moving ? Math.sin(walkT) : 0;
      const bob = m.moving ? Math.abs(Math.cos(walkT)) * H * 0.012 : Math.sin(now / 500) * H * 0.004; // breathing when still
      const hipY = H * 0.62 - bob, shoulderY = H * 0.27 - bob, headY = H * 0.17 - bob;
      ctx.save();
      ctx.fillStyle = ctx.strokeStyle = '#11131b';
      ctx.shadowColor = 'rgba(255, 205, 120, 0.5)';
      ctx.shadowBlur = m.back ? 10 : 22;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // legs: thigh + shin with a backwards knee, swinging when walking
      for (const side of [-1, 1]) {
        const sw = stride * side;
        const hip = x + side * W * 0.022;
        const knee = { x: hip + sw * W * 0.05 + f * W * 0.012, y: H * 0.8 };
        const foot = { x: hip + sw * W * 0.09, y: H * 1.0 };
        ctx.lineWidth = W * 0.022;
        ctx.beginPath(); ctx.moveTo(hip, hipY); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      }
      // body: hunched, thin torso
      ctx.beginPath();
      ctx.moveTo(x - W * 0.05, shoulderY);
      ctx.quadraticCurveTo(x - W * 0.065, H * 0.42, x - W * 0.03, hipY);
      ctx.lineTo(x + W * 0.03, hipY);
      ctx.quadraticCurveTo(x + W * 0.065, H * 0.42, x + W * 0.05, shoulderY);
      ctx.closePath(); ctx.fill();
      // head, pushed forward, with horns
      const hx = x + f * W * 0.015;
      ctx.beginPath(); ctx.ellipse(hx, headY, W * 0.04, H * 0.065, 0, 0, TAU); ctx.fill();
      // horns: curling out and down like a ram's, thick at the root
      ctx.lineWidth = W * 0.012;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + side * W * 0.02, headY - H * 0.05);
        ctx.bezierCurveTo(hx + side * W * 0.06, headY - H * 0.12, hx + side * W * 0.11, headY - H * 0.06, hx + side * W * 0.085, headY + H * 0.01);
        ctx.stroke();
      }
      // arms: long, the lantern arm reaching forward, the other hanging (swinging when walking)
      // jaw: a pale grin under the eyes when facing the streamer
      if (!m.back) {
        ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(230, 220, 200, 0.75)';
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(hx + i * W * 0.008 - W * 0.003, headY + H * 0.03); ctx.lineTo(hx + i * W * 0.008 + W * 0.003, headY + H * 0.03); ctx.lineTo(hx + i * W * 0.008, headY + H * 0.045); ctx.fill(); }
        ctx.restore();
      }
      ctx.lineWidth = W * 0.014;
      const lx = (m.x + 0.075 * f) * W, ly = H * 0.42;
      if (!m.back) {
        ctx.beginPath(); ctx.moveTo(x + f * W * 0.045, shoulderY + H * 0.02); ctx.quadraticCurveTo(x + f * W * 0.08, H * 0.3, lx, ly); ctx.stroke();
      }
      const hang = x - f * W * 0.045;
      ctx.beginPath(); ctx.moveTo(hang, shoulderY + H * 0.02); ctx.quadraticCurveTo(hang - f * W * 0.02, H * 0.4, hang - stride * W * 0.03, H * 0.62); ctx.stroke();
      if (!m.back) {
        // glowing eyes and the lantern
        ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 18;
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + side * W * 0.015 + f * W * 0.006, headY, W * 0.008, H * 0.007, 0, 0, TAU); ctx.fill(); }
        ctx.shadowBlur = 30; ctx.fillStyle = '#fff2c4';
        ctx.beginPath(); ctx.arc(lx, ly, W * 0.012, 0, TAU); ctx.fill();
      } else {
        // Back turned: just a faint glow of the hidden lantern on the far side.
        const g = ctx.createRadialGradient(x - f * W * 0.06, H * 0.42, 0, x - f * W * 0.06, H * 0.42, W * 0.05);
        g.addColorStop(0, 'rgba(255,214,140,0.35)'); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.fillRect(x - W * 0.2, H * 0.3, W * 0.4, H * 0.25);
      }
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
