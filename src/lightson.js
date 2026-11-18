// Lights On: a tall hunter walks through the room with a lantern.
// Dark → footsteps (warning) → a pass through the room → dark again (a breather for the streamer).
// Each pass is a random trick: walk across swinging the light, stop with its back turned and then spin round
// and shine the lantern in the streamer's eyes, or peek in from the edge and glare.
// While the beam is on the streamer's face, the light rules apply (don't move / smile / blink).
// A big gift makes the monster stare straight into the camera: the whole frame is lit.
(function (MC) {
  const TAU = Math.PI * 2;
  // End-of-round finale (ms): lights out, jump scare, then devoured (lost) or the monster pulls back (won).
  const PORTAL_IDLE = 0.45; // Void portal size (0..1) while open but nothing is coming out of it
  const FIN = { black: 2300, jump: 650, devour: 3500, retreat: 900 };
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
    start(now) {
      this.bites = []; this.finalHead = false; this.finale = 0; this.voidBeams = []; this.emerges = [];
      // Void: places where a portal can open, away from the middle where the streamer sits and from the gift list
      // (top right). Each pass picks a few of them.
      const spots = [[0.13, 0.24], [0.11, 0.64], [0.88, 0.7], [0.47, 0.13], [0.3, 0.13], [0.66, 0.15]];
      this.holes = spots.map(([x, y]) => ({ x, y, open: 0, out: 0, spin: rand(0, TAU) }));
      this.portals = [];
      this.set('idle', now); this.nextAt = now + this.gap();
    }

    isVoid() { return this.s.monster === 'void'; }
    // Every lantern beam on screen: the hunter's, or one per creature out of a hole.
    beams() { return [this.beam, ...(this.voidBeams || [])].filter(Boolean); }

    // Void: portals open in the room (announced: they grow and spin during the warning), then a creature comes out
    // of one, glares at the streamer with its lantern and sinks back, then out of another... Near the end of the
    // round more portals open, the creature comes out more often and jumps from portal to portal faster.
    makeVoidPlan(hunting) {
      const k = this.intensity || 0;
      const n = Math.min(4, (k > 0.75 ? 3 : k > 0.4 ? 2 : 1) + (hunting ? 1 : 0));
      const portals = this.holes.map((h, i) => i).sort(() => Math.random() - 0.5).slice(0, n);
      const count = n * (k > 0.9 ? 3 : k > 0.6 ? 2 : 1); // appearances this pass
      const gap = 1400 - 900 * k; // ms between one appearance and the next
      const emerges = [];
      let last = -1;
      for (let i = 0; i < count; i++) {
        const choices = portals.filter((p) => p !== last || portals.length === 1);
        const hole = choices[Math.floor(Math.random() * choices.length)];
        last = hole;
        // Late in the round it sometimes tears its way out: claws grip the rim and pull the portal wider first.
        const claw = k > 0.6 && Math.random() < 0.6;
        emerges.push({ hole, claw, t0: 700 + i * gap + rand(0, 200), glare: rand(1300, 2200) * (1 - 0.35 * k) + (hunting ? 400 : 0), sounded: false });
      }
      return { portals, emerges };
    }
    // During the warning: the chosen portals open, growing and spinning up.
    updateVoidWarn(now) {
      const k = Math.min(1, (now - this.t0) / Math.max(1, this.end - this.t0));
      // Small and spinning while announced; each one grows when the creature comes out of it (updateVoid).
      this.holes.forEach((h, i) => { h.open = this.portals.includes(i) ? PORTAL_IDLE * k * k * (3 - 2 * k) : 0; h.out = 0; h.tear = 0; });
    }
    updateVoid(now, face) {
      const W = this.cv.width, H = this.cv.height, t = now - this.t0;
      const box = this.screenBox(face);
      if (box) this.faceX = box.x + box.w / 2;
      // Portals stay open for the whole pass and close in its last 0.4 s.
      const open = Math.max(0, Math.min(1, (this.end - now) / 400));
      const size = this.holes.map((h, i) => (this.portals.includes(i) ? PORTAL_IDLE : 0));
      this.holes.forEach((h) => { h.out = 0; h.tear = 0; });
      this.voidBeams = [];
      for (const e of this.emerges) {
        const h = this.holes[e.hole], local = t - e.t0, total = 300 + e.glare + 400, pre = e.claw ? 700 : 450;
        if (local < -pre || local > total + 450) continue;
        // The portal grows before the creature comes out (claws tearing it wider, late in the round) and
        // shrinks back after it has gone.
        const grow = Math.max(0, Math.min(1, (local + pre) / pre, (total + 450 - local) / 450));
        size[e.hole] = Math.max(size[e.hole], PORTAL_IDLE + (1 - PORTAL_IDLE) * grow * grow * (3 - 2 * grow));
        if (e.claw) h.tear = Math.max(h.tear, Math.max(0, Math.min(1, (local + pre) / pre, (total - local) / 400)));
        if (e.claw && !e.scratched && local >= -pre) { e.scratched = true; MC.sfx.growl(0.7, 0.6); }
        if (local < 0 || local > total) continue;
        // come out 0.3 s → glare → go back 0.4 s
        h.out = Math.max(h.out, Math.max(0, Math.min(1, local / 300, (total - local) / 400)));
        if (!e.sounded) { e.sounded = true; MC.sfx.growl(0.5, 0.7); MC.sfx.click(); }
        const glaring = local > 300 && local < 300 + e.glare;
        if (!glaring) continue;
        // The lantern sits at the lip of the hole, towards the streamer.
        const fx = box ? box.x + box.w / 2 : 0.5, fy = box ? box.y + box.h / 2 : 0.5;
        const dirA = Math.atan2((fx - h.x) * W, (fy - h.y) * H);
        const r = 0.07;
        const ox = h.x + Math.sin(dirA) * r * h.out * (H / W), oy = h.y + Math.cos(dirA) * r * h.out;
        const target = Math.atan2((fx - ox) * W, (fy - oy) * H);
        // First it searches, then locks on.
        const lock = Math.min(1, (local - 300) / 500);
        const angle = target + (1 - lock) * Math.sin(now / 200 + e.hole) * 0.7;
        this.voidBeams.push({ ox, oy, angle, half: 0.26 });
      }
      this.holes.forEach((h, i) => { h.open = size[i] * open; });
      if (now >= this.end) {
        this.voidBeams = []; this.emerges = []; this.portals = [];
        this.set('idle', now);
        this.nextAt = now + this.gap();
      }
    }

    // A lost life leaves a bite on the streamer, matching how they got caught. Stays until the next round.
    bite(why) {
      const w = String(why).toLowerCase();
      const want = /smil/.test(w) ? 'mouth' : /blink/.test(w) ? 'eye' : /sound|silence/.test(w) ? 'ear' : /mov|freeze/.test(w) ? 'shoulder' : null;
      const parts = ['mouth', 'eye', 'ear', 'shoulder'];
      const free = (p) => p === 'mouth' ? !this.bites.some((b) => b.part === 'mouth') : this.bites.filter((b) => b.part === p).length < 2;
      const part = want && free(want) ? want : parts.filter(free)[Math.floor(Math.random() * parts.filter(free).length)] || 'shoulder';
      // Eyes, ears and shoulders come in pairs: take the side not bitten yet.
      const side = this.bites.some((b) => b.part === part && b.side === -1) ? 1 : -1;
      this.bites.push({ part, side, seed: Math.random() * 10, t: performance.now() });
    }
    stop(now) { this.set('off', now); this.lit = false; }

    // Darkness before the next pass. Near the end of the round (`intensity` 0..1, set by the game) it comes back sooner.
    gap() { return rand(...this.s.patrolGap) * 1000 * (1 - 0.65 * (this.intensity || 0)); }

    set(phase, now, extra = {}) {
      // Portals close, except while a Void pass is being announced (warn) or under way (sweep).
      if (phase !== 'sweep' && phase !== 'warn') { this.voidBeams = []; this.portals = []; (this.holes || []).forEach((h) => { h.open = 0; h.out = 0; }); }
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
            // Void: the portals for this pass are picked now, so they can open during the warning (at least 2.5 s).
            const warnMs = this.isVoid() ? Math.max(2500, s.warnSeconds * 1000) : s.warnSeconds * 1000;
            if (this.isVoid()) {
              const plan = this.makeVoidPlan(hunting);
              this.portals = plan.portals; this.voidPlan = plan.emerges;
              MC.sfx.growl(warnMs / 1000, 0.35); // a low rumble from somewhere in the room
            } else MC.sfx.approach(s.warnSeconds);
            if (hunting) MC.sfx.growl(warnMs / 1000, 0.6);
            this.set('warn', now, { dir, end: now + warnMs, swing: rand(0, TAU), by, hunting });
          }
          break;
        case 'warn':
          this.monster.x = this.dir > 0 ? -0.2 : 1.2;
          { const b = this.screenBox(face); if (b) this.faceX = b.x + b.w / 2; }
          if (this.isVoid()) this.updateVoidWarn(now);
          if (now >= this.end) {
            if (this.isVoid()) {
              this.emerges = this.voidPlan || [];
              this.set('sweep', now, { end: now + Math.max(0, ...this.emerges.map((e) => e.t0 + 300 + e.glare + 400)) + 500 });
            } else {
              this.plan = this.makePlan(this.dir, this.hunting);
              this.set('sweep', now, { end: now + this.plan.reduce((t, g) => t + g.dur, 0) });
            }
          }
          break;
        case 'sweep': {
          if (this.isVoid()) { this.updateVoid(now, face); break; }
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
            this.nextAt = now + this.gap();
          }
          break;
        }
        case 'stareWarn':
          if (now >= this.end) { MC.sfx.click(); this.set('stare', now, { end: now + s.stareSeconds * 1000 }); }
          break;
        case 'stare':
          this.beam = null;
          if (now >= this.end) { this.set('idle', now); this.nextAt = now + this.gap(); }
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
      else if (box) lit = this.beams().some((b) => this.inBeam(box, b));
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

    inBeam(box, beam) {
      const W = this.cv.width, H = this.cv.height;
      const cx = (box.x + box.w / 2) * W, cy = (box.y + box.h / 2) * H;
      const ox = beam.ox * W, oy = beam.oy * H;
      const dx = cx - ox, dy = cy - oy;
      const dist = Math.hypot(dx, dy);
      const toFace = Math.atan2(dx, dy); // 0 = straight down
      const faceRadius = Math.atan2((box.w * W) / 2, dist) * 0.6;
      const diff = Math.abs(((toFace - beam.angle + Math.PI) % TAU + TAU) % TAU - Math.PI); // wraps round (beams can point up)
      return diff < beam.half + faceRadius;
    }

    // Face box in canvas coordinates (0..1), mirrored like the video on screen.
    screenBox(face) {
      if (!face.face || !face.box) return null;
      const b = face.box, c = this.crop || { sx: 0, sy: 0, sw: 1, sh: 1 };
      // The camera is cover-fitted (a 16:9 webcam loses its sides on the 4:3 stage) and mirrored.
      return { x: 1 - (b.x + b.w - c.sx) / c.sw, y: (b.y - c.sy) / c.sh, w: b.w / c.sw, h: b.h / c.sh };
    }
    // A face point (video coordinates) in canvas pixels.
    toCanvas(pt, W, H) {
      const c = this.crop || { sx: 0, sy: 0, sw: 1, sh: 1 };
      return { x: (1 - (pt.x - c.sx) / c.sw) * W, y: ((pt.y - c.sy) / c.sh) * H };
    }

    // ---------- drawing ----------
    draw(now, video, face) {
      const { ctx, cv } = this;
      const W = cv.width, H = cv.height;
      ctx.save();
      // Shake while being eaten.
      if (this.phase === 'eaten' && now - this.t0 < 900) ctx.translate(rand(-12, 12), rand(-12, 12));

      this.drawCamera(video, face, W, H);
      this.drawScene(now, W, H);
      // The darkness shows before a round too, exactly as it will be in the round, so the brightness can be set
      // beforehand (calibration reads the camera itself, not this picture).
      const dark = true;
      if (dark) this.drawDarkness(now, W, H, face);
      // The scene's edges (walls, trees, pipes) stay faintly visible through the dark.
      if (dark && this.sceneLayer && this.s.scene && this.s.scene !== 'none') {
        ctx.save(); ctx.globalAlpha = 0.4; ctx.drawImage(this.sceneLayer.cv, 0, 0); ctx.restore();
      }
      this.drawBites(now, face, W, H);
      if (this.finalHead && !this.finale) this.drawMonsterHead(now, face, W, H);
      this.drawCurses(now, W, H, face);
      this.drawGuide(now, W, H); // under the monster: it walks in front of the gift list
      if (this.isVoid()) { if (this.phase !== 'off') this.drawVoid(now, W, H); }
      else if (this.phase !== 'stare') this.drawHunter(now, W, H);
      if (this.phase === 'stare' || this.phase === 'stareWarn') this.drawStare(now, W, H);
      if (this.phase === 'eaten') this.drawJaws(now, W, H);
      if (now < this.shieldUntil) this.drawChains(now, W, H);
      if (this.intensity > 0.5 && this.phase !== 'off') this.drawHeartbeat(now, W, H);
      if (this.finale) this.drawFinale(now, face, W, H);
      ctx.restore();
    }

    drawCamera(video, face, W, H) {
      const ctx = this.ctx;
      if (video && video.readyState >= 2 && video.videoWidth) {
        // Cover-fit, mirrored.
        const vr = video.videoWidth / video.videoHeight, cr = W / H;
        let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
        if (vr > cr) { sw = sh * cr; sx = (video.videoWidth - sw) / 2; } else { sh = sw / cr; sy = (video.videoHeight - sh) / 2; }
        // Remember the crop, so face points (in video coordinates) land on the right spot of the canvas.
        this.crop = { sx: sx / video.videoWidth, sy: sy / video.videoHeight, sw: sw / video.videoWidth, sh: sh / video.videoHeight };
        ctx.save();
        ctx.translate(W, 0); ctx.scale(-1, 1);
        if (this.s.camBoost > 1) ctx.filter = `brightness(${this.s.camBoost}) contrast(1.05)`;
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
        ctx.restore();
      } else {
        this.crop = null;
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
      const out = { cx: (b.x + b.w / 2) * W, w: b.w * W, h: b.h * H, eyesY: (b.y + b.h * 0.4) * H, mouthY: (b.y + b.h * 0.78) * H };
      // With the face mesh, use the real eyes and mouth instead of fixed proportions of the box.
      if (face.parts) {
        const [e1, e2] = face.parts.eyes.map((pt) => this.toCanvas(pt, W, H));
        out.cx = (e1.x + e2.x) / 2; out.eyesY = (e1.y + e2.y) / 2;
        out.mouthY = this.toCanvas(face.parts.mouth, W, H).y;
      }
      return out;
    }

    // A bite mark: a round hole whose edge is a row of tooth scallops (sharp points inward, like a bitten cookie),
    // slightly uneven so no two bites look the same.
    biteShape(x, y, r, seed, squash = 0.85) {
      const ctx = this.ctx, teeth = 13, n = 160;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const k = 0.92 + 0.08 * Math.abs(Math.sin((teeth * a) / 2 + seed)) + 0.06 * Math.sin(2 * a + seed * 2) + 0.03 * Math.sin(5 * a + seed);
        const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k * squash;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    }

    // Where a bite sits on the face, in canvas pixels: on the real eye / mouth corner / ear when the face mesh
    // gives them, otherwise estimated from the face box (manual mode).
    bitePlace(b, face, W, H) {
      const p = this.facePoints(face, W, H);
      if (!p) return null;
      const parts = face.parts;
      const bySide = (two) => { const [a, c] = two.map((pt) => this.toCanvas(pt, W, H)); return (a.x < c.x) === (b.side < 0) ? a : c; };
      if (parts && b.part === 'eye') { const e = bySide(parts.eyes); return { x: e.x, y: e.y, r: Math.max(parts.eyeW / this.cropW() * W * 0.62, p.w * 0.07) }; }
      if (parts && b.part === 'mouth') {
        // A bite out of one corner: half the mouth stays visible, so viewers can still see a smile.
        const c = bySide(parts.mouthCorners), m = this.toCanvas(parts.mouth, W, H);
        return { x: c.x + (c.x - m.x) * 0.15, y: c.y, r: p.w * 0.17 };
      }
      if (parts && b.part === 'ear') { const e = bySide(parts.ears); return { x: e.x + b.side * p.w * 0.04, y: e.y, r: p.w * 0.13 }; }
      if (b.part === 'mouth') return { x: p.cx + b.side * p.w * 0.14, y: p.mouthY, r: p.w * 0.17 };
      if (b.part === 'eye') return { x: p.cx + b.side * p.w * 0.2, y: p.eyesY - p.h * 0.03, r: p.w * 0.1 };
      if (b.part === 'ear') return { x: p.cx + b.side * p.w * 0.5, y: p.eyesY + p.h * 0.08, r: p.w * 0.13 };
      return { x: p.cx + b.side * p.w * 0.75, y: p.mouthY + p.h * 0.5, r: p.w * 0.24 }; // shoulder
    }
    cropW() { return this.crop ? this.crop.sw : 1; }

    // Cartoon bites (no blood): a dark hole with depth and a faint bitten rim, following the face.
    // A new bite arrives with a quick chomp: two rows of teeth snap shut on the spot, then the hole pops in.
    drawBites(now, face, W, H) {
      const bites = this.bites || [];
      if (!bites.length) return;
      const ctx = this.ctx;
      for (const b of bites) {
        const pl = this.bitePlace(b, face, W, H);
        if (!pl) continue;
        const { x, y, r } = pl, age = now - b.t;
        ctx.save();
        if (age < 260) { this.drawChomp(x, y, r, age / 260); ctx.restore(); continue; }
        // Pop in with a small overshoot.
        const t = Math.min(1, (age - 260) / 220), pop = t < 1 ? 1 + 0.25 * Math.sin(t * Math.PI) : 1;
        const rr = r * pop;
        // Soft shadow around the hole.
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = rr * 0.35;
        this.biteShape(x, y, rr, b.seed);
        const g = ctx.createRadialGradient(x, y - rr * 0.2, 0, x, y, rr);
        g.addColorStop(0, '#020104'); g.addColorStop(0.65, '#0b0610'); g.addColorStop(1, '#2a1424');
        ctx.fillStyle = g; ctx.fill();
        // Bitten rim: a thin pale edge, lit from above.
        ctx.shadowBlur = 0;
        ctx.lineWidth = Math.max(1.5, rr * 0.06);
        const rim = ctx.createLinearGradient(x, y - rr, x, y + rr);
        rim.addColorStop(0, 'rgba(240, 200, 180, 0.35)'); rim.addColorStop(1, 'rgba(60, 25, 35, 0.5)');
        ctx.strokeStyle = rim; ctx.stroke();
        // A few seconds later the wound gets patched up: an eye patch on an eye, crossed plasters elsewhere.
        if (age > 2500) { this.drawBandage(b, x, y, r, Math.min(1, (age - 2500) / 180), face, W, H); ctx.restore(); continue; }
        if (b.part === 'eye') {
          // Something looks back from inside the empty eye.
          ctx.fillStyle = 'rgba(255, 70, 70, 0.8)'; ctx.shadowColor = '#ff3030'; ctx.shadowBlur = rr * 0.4;
          ctx.beginPath(); ctx.arc(x, y, rr * 0.11, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    }

    // `k` 0..1: the bandage slaps on (comes in big, settles to size).
    drawBandage(b, x, y, r, k, face, W, H) {
      const ctx = this.ctx, sc = 1 + 0.4 * (1 - k);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'; ctx.shadowBlur = r * 0.25; ctx.shadowOffsetY = r * 0.08;
      if (b.part === 'eye') {
        // Pirate eye patch with its strap round the head: one end runs out to the near side of the head,
        // the other curves up over the forehead to the far side; both stop at the edge of the face.
        const p = this.facePoints(face, W, H), tilt = b.side * -0.35;
        if (p) {
          const s = Math.sign(x - p.cx) || 1, half = p.w * 0.46;
          const nearX = p.cx + s * half, farX = p.cx - s * half;
          ctx.strokeStyle = '#141018'; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y); ctx.quadraticCurveTo((x + nearX) / 2, y - p.h * 0.05, nearX, y - p.h * 0.08);
          ctx.moveTo(x, y); ctx.quadraticCurveTo(p.cx, p.eyesY - p.h * 0.34, farX, p.eyesY - p.h * 0.2);
          ctx.stroke();
        }
        ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(sc, sc);
        ctx.fillStyle = '#1a1520';
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.85, 0, 0, TAU); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = r * 0.08;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.67, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      } else {
        // Two plasters in an X over the hole.
        ctx.translate(x, y); ctx.scale(sc, sc);
        const L = r * 2.4, T = r * 0.7;
        for (const a of [0.6 + b.seed * 0.05, -0.75 + b.seed * 0.04]) {
          ctx.save(); ctx.rotate(a);
          ctx.fillStyle = '#e9b98f';
          ctx.beginPath(); ctx.roundRect(-L / 2, -T / 2, L, T, T / 2); ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = '#f6e3cf'; ctx.fillRect(-T * 0.6, -T * 0.32, T * 1.2, T * 0.64); // pad in the middle
          ctx.fillStyle = 'rgba(120, 80, 60, 0.35)'; // little air holes on the ends
          for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(sx * (L * 0.3 + i * T * 0.22), (i % 2 ? 0.15 : -0.15) * T, T * 0.05, 0, TAU); ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // Two rows of teeth closing on (x, y); `k` 0..1 is how far the jaws have closed.
    drawChomp(x, y, r, k) {
      const ctx = this.ctx, gap = r * 1.3 * (1 - k * k), n = 6, tw = (r * 2.2) / n;
      ctx.fillStyle = '#f2ead8'; ctx.strokeStyle = 'rgba(40, 20, 20, 0.7)'; ctx.lineWidth = 1.5;
      for (const dir of [-1, 1]) {
        const base = y + dir * (gap + r * 0.55);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const tx = x - r * 1.1 + i * tw;
          ctx.moveTo(tx, base); ctx.lineTo(tx + tw / 2, base - dir * r * 0.55); ctx.lineTo(tx + tw, base);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    // ---------- Gift guide ----------
    // The list that tells viewers what each gift does, drawn on the stage itself (top right) so the monster passes
    // in front of it. `page` = { title, lines: [{ gifts: [{ icon, img, text }], effect }] }; `layout` = { top, scale } in canvas pixels
    // (top: below the HUD pills; scale: bigger text on a small stage, e.g. a phone). The box fits its content.
    setGuide(page, layout) {
      const key = page ? JSON.stringify(page) : '';
      if (key !== this.guideKey) { this.guideKey = key; this.guideAt = performance.now(); } // fade in a new page
      this.guide = page; this.guideLayout = layout || {};
    }

    drawGuide(now, W, H) {
      const g = this.guide;
      if (!g || !g.lines.length) return;
      const ctx = this.ctx, k = this.guideLayout.scale || 1;
      const pad = 12 * k, fs = 21 * k, fsSmall = 17 * k, gap = 6 * k;
      const fontTitle = `700 ${fs}px Rubik, system-ui, sans-serif`;
      const fontGift = `500 ${fs}px Rubik, system-ui, sans-serif`;
      const fontEffect = `400 ${fsSmall}px Rubik, system-ui, sans-serif`;
      const boxMax = W * 0.4, inner = boxMax - pad * 2;
      // Wrap a line into rows that fit `w` (gift lists break after a comma when they can).
      const wrap = (text, font, w) => {
        ctx.font = font;
        const words = text.split(' '), rows = [];
        let row = '';
        for (const word of words) {
          const next = row ? row + ' ' + word : word;
          if (row && ctx.measureText(next).width > w) { rows.push(row); row = word; } else row = next;
        }
        if (row) rows.push(row);
        return rows;
      };
      // Gifts: their picture (from the Monster Cam server) or, until it has loaded, their emoji; then the name.
      // Rows break between gifts; every gift but the last of a line gets a comma.
      const pic = fs * 1.15, space = () => ctx.measureText(' ').width;
      const giftRows = (gifts, w) => {
        ctx.font = fontGift;
        const rows = [];
        let row = [], rw = 0;
        gifts.forEach((gift, i) => {
          const img = MC.settings.giftPicture(gift.img);
          const text = gift.text + (i < gifts.length - 1 ? ',' : '');
          const head = img ? pic + 5 * k : ctx.measureText(gift.icon + ' ').width;
          const iw = head + ctx.measureText(text).width;
          const gap = row.length ? space() : 0;
          if (row.length && rw + gap + iw > w) { rows.push({ items: row, w: rw }); row = []; rw = 0; }
          rw += (row.length ? space() : 0) + iw;
          row.push({ img, icon: gift.icon, text, head });
        });
        if (row.length) rows.push({ items: row, w: rw });
        return rows;
      };
      const items = g.lines.map((l) => ({ gifts: giftRows(l.gifts, inner), effect: wrap('→ ' + l.effect, fontEffect, inner) }));
      // Box size from the longest row.
      let w = 0;
      ctx.font = fontTitle; w = Math.max(w, ctx.measureText(g.title).width);
      items.forEach((it) => it.gifts.forEach((r) => { w = Math.max(w, r.w); }));
      ctx.font = fontEffect; items.forEach((it) => it.effect.forEach((r) => { w = Math.max(w, ctx.measureText(r).width); }));
      const bw = Math.min(boxMax, w + pad * 2);
      const lhG = fs * 1.25, lhE = fsSmall * 1.25;
      const bh = pad * 2 + lhG + 4 * k + items.reduce((s, it) => s + it.gifts.length * lhG + it.effect.length * lhE + gap, 0) - gap;
      const x = W - bw - 12 * k, y = this.guideLayout.top || 64, maxH = H - y - 12 * k;

      ctx.save();
      ctx.globalAlpha = Math.min(1, (now - (this.guideAt || 0)) / 400);
      ctx.beginPath(); ctx.roundRect(x, y, bw, Math.min(bh, maxH), 10 * k);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)'; ctx.fill();
      ctx.clip(); // a very long page is cut at the bottom of the stage
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'; ctx.shadowBlur = 4 * k; ctx.shadowOffsetY = k;
      let ty = y + pad;
      ctx.font = fontTitle; ctx.fillStyle = '#f2c14e'; ctx.fillText(g.title, x + pad, ty);
      ty += lhG + 4 * k;
      for (const it of items) {
        ctx.font = fontGift; ctx.fillStyle = '#f1efe9';
        for (const r of it.gifts) {
          let tx = x + pad;
          for (const gift of r.items) {
            if (gift.img) ctx.drawImage(gift.img, tx, ty + (lhG - pic) / 2 - k, pic, pic);
            else ctx.fillText(gift.icon + ' ', tx, ty);
            tx += gift.head;
            ctx.fillText(gift.text, tx, ty);
            tx += ctx.measureText(gift.text).width + space();
          }
          ty += lhG;
        }
        ctx.font = fontEffect; ctx.fillStyle = '#c3c7d1';
        for (const r of it.effect) { ctx.fillText(r, x + pad, ty); ty += lhE; }
        ty += gap;
      }
      ctx.restore();
    }

    // ---------- Finale: lights out, jump scare, then devoured (lost) or spared (won) ----------
    // At the end of every round, after the game is decided (it changes nothing in the result):
    // 1. lights out: the room goes black for a moment, a heartbeat, a pair of eyes blinks somewhere;
    // 2. jump scare: the light snaps back on with the monster's huge open mouth right in the camera, a scream;
    // 3a. lost: its mouth lands over the streamer's face and chomps a few times, then "DEVOURED";
    // 3b. won: it pulls back into the dark and is gone.
    // Afterwards the game shows the result (and, when lost, the monster head in the streamer's place).
    startFinale(now, won = false) {
      this.finale = now; this.finaleWon = won; this.finaleChomp = -1; this.finaleP = null; this.finaleJumped = false; this.finaleBeats = 0;
      this.finaleMs = FIN.black + FIN.jump + (won ? FIN.retreat : FIN.devour);
      MC.sfx.click(); // the light switch
    }
    get FINALE_MS() { return this.finaleMs || FIN.black + FIN.jump + FIN.devour; }
    get FINALE_BLACK() { return FIN.black; } // how long the lights are out at the start of the finale

    drawFinale(now, face, W, H) {
      const T = now - this.finale, ctx = this.ctx;
      if (T > this.finaleMs) { this.finale = 0; return; }
      const ease = (k) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
      const p = this.facePoints(face, W, H) || this.finaleP || { cx: W / 2, eyesY: H * 0.4, mouthY: H * 0.55, w: W * 0.25, h: H * 0.4 };
      this.finaleP = p;
      const fx = p.cx, fy = (p.eyesY + p.mouthY) / 2, fw = Math.max(p.w, W * 0.18);

      // 1. Lights out.
      if (T < FIN.black) {
        ctx.fillStyle = `rgba(0, 0, 0, ${0.97 * ease(T / 250)})`; ctx.fillRect(0, 0, W, H);
        const beat = Math.floor((T - 500) / 700);
        if (T > 500 && beat >= this.finaleBeats) { this.finaleBeats = beat + 1; MC.sfx.heartbeat(0.7); }
        // Two eyes open somewhere in the dark, then shut.
        const e = (T - FIN.black * 0.45) / 500;
        if (e > 0 && e < 1) {
          const open = Math.sin(e * Math.PI), ex = W * (fx < W / 2 ? 0.72 : 0.28), ey = H * 0.3;
          ctx.save(); ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ff4a2a'; ctx.shadowBlur = 20;
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(ex + side * W * 0.03, ey, W * 0.016, W * 0.01 * open + 0.5, side * 0.2, 0, TAU); ctx.fill(); }
          ctx.restore();
        }
        return;
      }

      // 2. Jump scare: the light comes back with the monster right in the camera.
      const J = T - FIN.black;
      if (!this.finaleJumped) { this.finaleJumped = true; MC.sfx.caught(); MC.sfx.growl(1.2, 1); }
      if (J < FIN.jump) {
        const k = ease(J / FIN.jump);
        ctx.save();
        ctx.translate(rand(-22, 22) * (1 - k * 0.5), rand(-22, 22) * (1 - k * 0.5));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'; ctx.fillRect(-30, -30, W + 60, H + 60);
        // Bursts in huge, settles a little; mouth wide open over the face.
        const s = fw * (2.4 - 0.5 * k);
        this.drawBigHead(fx, fy + fw * 0.15, fw * (0.95 - 0.15 * k), fw * 0.75, s, 1);
        ctx.restore();
        ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - J / FIN.jump) ** 2})`; ctx.fillRect(0, 0, W, H); // the light snapping on
        return;
      }

      // 3b. Won: it pulls back into the dark and is gone.
      if (this.finaleWon) {
        const k = ease((J - FIN.jump) / FIN.retreat);
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'; ctx.fillRect(0, 0, W, H);
        const s = fw * (1.9 - 1.6 * k);
        this.drawBigHead(fx, fy - k * H * 0.2, fw * 0.8 * (1 - k * 0.7), fw * 0.4 * (1 - k), s, 0);
        ctx.restore();
        return;
      }

      // 3a. Lost: devoured. The mouth sits on the face and chomps (5 bites of 420 ms), then shuts and chews.
      const t = J - FIN.jump, CH = 420, N = 5, chewStart = CH * N, end = FIN.devour;
      let open;
      if (t < chewStart) {
        const k = (t % CH) / CH; // 0 open → 0.5 shut → 1 open
        open = Math.abs(Math.cos(k * Math.PI));
        const i = Math.floor(t / CH);
        if (k > 0.45 && i > this.finaleChomp) { this.finaleChomp = i; MC.sfx.click(); MC.sfx.growl(0.3, 0.7); }
      } else open = 0.04 + 0.03 * Math.abs(Math.sin(t / 120));
      const shut = t < chewStart ? 1 - Math.abs(Math.cos(((t % CH) / CH) * Math.PI)) : 0; // 1 at the bite
      const fade = t > end - 450 ? (end - t) / 450 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      if (shut > 0.85) ctx.translate(rand(-14, 14), rand(-14, 14));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(-20, -20, W + 40, H + 40);
      this.drawBigHead(fx, fy, fw * 0.8, fw * 0.85 * open + 1, fw * 1.9, shut);
      ctx.restore();
      // Red flash at every bite.
      if (shut > 0.6) { ctx.fillStyle = `rgba(200, 15, 25, ${0.4 * (shut - 0.6) / 0.4 * fade})`; ctx.fillRect(0, 0, W, H); }
      // Title once the mouth is shut.
      if (t > chewStart) {
        const k = ease((t - chewStart) / 350);
        ctx.save();
        ctx.globalAlpha = k * fade;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(H * 0.14 * (1.4 - 0.4 * k))}px Creepster, cursive`;
        ctx.lineWidth = H * 0.012; ctx.strokeStyle = '#000'; ctx.fillStyle = '#e0393e';
        ctx.strokeText('DEVOURED', W / 2, H * 0.2); ctx.fillText('DEVOURED', W / 2, H * 0.2);
        ctx.restore();
      }
    }

    // The monster's head filling the screen: mouth centre (mx, my) with radii mrx/mry cut out (the streamer's face
    // shows through it), head radius s, eyes glowing brighter with `shut` (0..1, the moment of a bite).
    drawBigHead(mx, my, mrx, mry, s, shut) {
      // Never so big that the eyes leave the top of the picture.
      s = Math.min(s, Math.max(this.cv.height * 0.18, my - this.cv.height * 0.1));
      const ctx = this.ctx, hx = mx, hy = my - s * 0.45;
      ctx.save();
      ctx.fillStyle = '#120d16';
      ctx.shadowColor = 'rgba(255, 60, 60, 0.35)'; ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.ellipse(hx, hy, s * 1.25, s * 1.35, 0, 0, TAU);
      ctx.ellipse(mx, my, Math.max(1, mrx), Math.max(1, mry), 0, 0, TAU);
      ctx.fill('evenodd');
      ctx.shadowBlur = 0;
      // Horns.
      ctx.strokeStyle = '#120d16'; ctx.lineWidth = s * 0.2; ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(hx + side * s * 0.6, hy - s * 1.1);
        ctx.bezierCurveTo(hx + side * s * 1.3, hy - s * 2, hx + side * s * 2, hy - s * 1, hx + side * s * 1.5, hy - s * 0.3);
        ctx.stroke();
      }
      // Eyes.
      ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ff4a2a'; ctx.shadowBlur = 25 + 40 * shut;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + side * s * 0.45, hy - s * 0.55, s * 0.2, s * 0.12, side * 0.3, 0, TAU); ctx.fill(); }
      ctx.shadowBlur = 0; ctx.fillStyle = '#120d16';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + side * s * 0.45, hy - s * 0.55, s * 0.035, s * 0.1, 0, 0, TAU); ctx.fill(); }
      // Teeth round the mouth: upper row points down, lower row points up.
      if (mry > 2) {
        ctx.fillStyle = '#efe6d2'; ctx.strokeStyle = 'rgba(60, 20, 20, 0.6)'; ctx.lineWidth = 1.5;
        const n = 9, tl = Math.max(mrx * 0.28, 6);
        for (const dir of [-1, 1]) {
          for (let i = 0; i < n; i++) {
            const ang = Math.PI * (0.12 + (0.76 * i) / (n - 1));
            const ex = mx - Math.cos(ang) * mrx, ey = my + dir * Math.sin(ang) * mry;
            const half = (mrx * 1.5) / n;
            ctx.beginPath();
            ctx.moveTo(ex - half, ey - dir * 2); ctx.lineTo(ex + half, ey - dir * 2);
            ctx.lineTo(ex, ey - dir * tl * (0.6 + 0.4 * Math.sin(ang)));
            ctx.closePath(); ctx.fill(); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // End of a lost round: the monster's head where the streamer's head was.
    drawMonsterHead(now, face, W, H) {
      const p = this.facePoints(face, W, H);
      const cx = p ? p.cx : W / 2, cy = p ? (p.eyesY + p.mouthY) / 2 : H * 0.45;
      const s = p ? Math.max(p.w, p.h * 0.8) * 0.75 : H * 0.25; // head radius
      const ctx = this.ctx, chew = Math.abs(Math.sin(now / 160)) * s * 0.06;
      ctx.save();
      ctx.fillStyle = ctx.strokeStyle = '#13101a';
      ctx.shadowColor = 'rgba(255, 205, 120, 0.45)'; ctx.shadowBlur = 25;
      // horns
      ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * s * 0.45, cy - s * 0.75);
        ctx.bezierCurveTo(cx + side * s * 1.1, cy - s * 1.6, cx + side * s * 1.75, cy - s * 0.7, cx + side * s * 1.25, cy - s * 0.05);
        ctx.stroke();
      }
      // head
      ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.95, s * 1.1, 0, 0, TAU); ctx.fill();
      // eyes
      ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 30;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * s * 0.38, cy - s * 0.25, s * 0.17, s * 0.11, side * 0.25, 0, TAU); ctx.fill(); }
      ctx.shadowBlur = 0; ctx.fillStyle = '#13101a';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * s * 0.38, cy - s * 0.25, s * 0.03, s * 0.09, 0, 0, TAU); ctx.fill(); }
      // chewing mouth with teeth
      const my = cy + s * 0.4;
      ctx.fillStyle = '#3a0a10';
      ctx.beginPath(); ctx.ellipse(cx, my, s * 0.55, s * 0.18 + chew, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#efe6d2';
      for (let i = -4; i <= 4; i++) {
        const tx = cx + i * s * 0.11;
        ctx.beginPath(); ctx.moveTo(tx - s * 0.05, my - s * 0.14 - chew); ctx.lineTo(tx + s * 0.05, my - s * 0.14 - chew); ctx.lineTo(tx, my - s * 0.02); ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx - s * 0.05, my + s * 0.14 + chew); ctx.lineTo(tx + s * 0.05, my + s * 0.14 + chew); ctx.lineTo(tx, my + s * 0.02); ctx.fill();
      }
      ctx.restore();
    }

    // Last half minute: the edges pulse red like a heartbeat, faster as the end gets closer.
    drawHeartbeat(now, W, H) {
      const bpm = 70 + 80 * this.intensity;
      const t = (now / (60000 / bpm)) % 1; // 0..1 within one beat
      const beat = Math.max(Math.exp(-((t - 0.05) ** 2) / 0.002), 0.6 * Math.exp(-((t - 0.25) ** 2) / 0.002)); // lub-dub
      if (beat > 0.5 && !this.lastBeat) MC.sfx.heartbeat((0.25 + 0.35 * this.intensity) * (t < 0.15 ? 1 : 0.55)); // the "dub" is softer
      this.lastBeat = beat > 0.5;
      const ctx = this.ctx;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, 'rgba(160, 0, 0, 0)');
      g.addColorStop(1, `rgba(160, 0, 0, ${(0.15 + 0.35 * this.intensity) * beat})`);
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
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

      // The scene's own light (a bulb, the moon, a flickering tube) keeps a patch of the room visible.
      const sl = this.sceneLight(now);
      if (sl) {
        const g = c.createRadialGradient(sl.x * W, sl.y * H, 0, sl.x * W, sl.y * H, sl.r * W);
        g.addColorStop(0, `rgba(0,0,0,${sl.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }

      for (const beam of this.beams()) {
        const { ox, oy, angle, half } = beam;
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
      if (this.phase === 'warn' && !this.isVoid()) {
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
      for (const beam of this.beams()) {
        const ctx = this.ctx;
        const { ox, oy, angle, half } = beam;
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

    // ---------- scenes: an atmosphere over the streamer's own room ----------
    // Static parts are drawn once into a layer; light and flicker are added per frame.
    sceneLight(now) {
      const flick = this.flicker(now);
      switch (this.s.scene) {
        case 'basement': return { x: 0.5, y: 0.05, r: 0.45, a: 0.45 * (0.85 + 0.15 * Math.sin(now / 900)) }; // swinging bulb
        case 'forest': return { x: 0.3, y: 0.2, r: 0.6, a: 0.3 }; // moonlight from the moon (top left)
        case 'hospital': return { x: 0.5, y: 0.0, r: 0.55, a: 0.5 * flick }; // flickering tube
        default: return null;
      }
    }
    // Hospital tube: mostly on, with short random drop-outs.
    flicker(now) {
      if (now > (this.flickUntil || 0)) {
        this.flickOn = Math.random() < 0.9;
        this.flickUntil = now + (this.flickOn ? rand(400, 2500) : rand(60, 220));
      }
      return this.flickOn === false ? 0.15 : 1;
    }
    drawScene(now, W, H) {
      const scene = this.s.scene;
      if (!scene || scene === 'none') return;
      if (!this.sceneLayer || this.sceneLayer.key !== scene + W) this.sceneLayer = this.buildScene(scene, W, H);
      const ctx = this.ctx;
      ctx.drawImage(this.sceneLayer.cv, 0, 0);
      if (scene === 'hospital') {
        // Heart monitor: a green line sweeping across, with a beat about once a second.
        const x0 = W * 0.02, y0 = H * 0.372, mw = W * 0.104, mh = H * 0.095, mid = y0 + mh * 0.55;
        const head = ((now / 1600) % 1) * mw;
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, mw, mh); ctx.clip();
        ctx.strokeStyle = '#3dff8a'; ctx.lineWidth = 2; ctx.shadowColor = '#3dff8a'; ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let px = 0; px <= mw; px += 2) {
          const ph = (px / mw) * 2 % 1; // two beats across the screen
          const beat = ph > 0.42 && ph < 0.5 ? Math.sin(((ph - 0.42) / 0.08) * TAU) * (ph < 0.46 ? 1 : 0.4) : 0;
          const y = mid - beat * mh * 0.42;
          px ? ctx.lineTo(x0 + px, y) : ctx.moveTo(x0 + px, y);
        }
        ctx.globalAlpha = 0.9; ctx.stroke();
        ctx.fillStyle = 'rgba(0, 20, 10, 1)'; ctx.fillRect(x0 + head, y0, mw * 0.12, mh); // the gap ahead of the sweep
        ctx.restore();
        if (this.flicker(now) < 1) { ctx.fillStyle = 'rgba(0,10,5,0.35)'; ctx.fillRect(0, 0, W, H); }
      }
      if (scene === 'forest') {
        // Drifting fog low down and a few fireflies.
        ctx.save();
        for (let i = 0; i < 3; i++) {
          const fx = ((now / (9000 + i * 2500) + i * 0.33) % 1.4 - 0.2) * W, fy = H * (0.8 + i * 0.06);
          const fog = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.3);
          fog.addColorStop(0, 'rgba(190, 210, 220, 0.18)'); fog.addColorStop(1, 'rgba(190, 210, 220, 0)');
          ctx.fillStyle = fog; ctx.fillRect(fx - W * 0.3, fy - W * 0.3, W * 0.6, W * 0.6);
        }
        ctx.fillStyle = '#d8ff7a'; ctx.shadowColor = '#d8ff7a'; ctx.shadowBlur = 12;
        for (let i = 0; i < 9; i++) {
          const side = i % 2 ? 0.08 : 0.88, t = now / 1000 + i * 7.3;
          const x = (side + 0.06 * Math.sin(t * 0.7 + i) + 0.03 * Math.sin(t * 1.9)) * W, y = (0.35 + 0.45 * ((i * 0.13) % 1) + 0.04 * Math.sin(t * 1.1)) * H;
          ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.3 + i));
          ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      if (scene === 'basement') {
        // the bulb, swinging a little on its cord
        const sw = Math.sin(now / 900) * W * 0.02, bx = W / 2 + sw, by = H * 0.09;
        ctx.save();
        ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = '#ffe2a0'; ctx.shadowColor = '#ffcf70'; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(bx, by + 6, 9, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    buildScene(scene, W, H) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d');
      const vignette = (color) => {
        const g = c.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, W * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, color);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      };
      let seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280); // same picture every time
      if (scene === 'basement') {
        c.fillStyle = 'rgba(60, 35, 15, 0.18)'; c.fillRect(0, 0, W, H); // warm, dusty
        // brick walls at the sides
        for (const x0 of [0, W * 0.86]) {
          for (let y = 0, row = 0; y < H; y += 26, row++) {
            for (let x = x0 - (row % 2) * 30; x < x0 + W * 0.14; x += 60) {
              c.fillStyle = `rgba(${90 + rnd() * 40}, ${40 + rnd() * 20}, 25, 0.55)`;
              c.fillRect(Math.max(x0, x) + 2, y + 2, 56 - Math.max(0, x0 - x), 22);
            }
          }
        }
        // pipes along the ceiling
        c.strokeStyle = 'rgba(40, 40, 45, 0.9)'; c.lineCap = 'round';
        for (const [y, wdt] of [[H * 0.03, 14], [H * 0.07, 9]]) { c.lineWidth = wdt; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
        vignette('rgba(20, 10, 0, 0.75)');
      } else if (scene === 'forest') {
        // A night forest round the streamer: moon top left, tree trunks at the sides, grass and ferns at the bottom.
        c.fillStyle = 'rgba(10, 40, 60, 0.26)'; c.fillRect(0, 0, W, H); // cold night
        // the moon with its halo (top left: the gift list is top right)
        const mx = W * 0.3, my = H * 0.2; // clear of the HUD pills at the top left
        const halo = c.createRadialGradient(mx, my, 10, mx, my, W * 0.16);
        halo.addColorStop(0, 'rgba(220, 235, 255, 0.45)'); halo.addColorStop(1, 'rgba(220, 235, 255, 0)');
        c.fillStyle = halo; c.fillRect(mx - W * 0.16, 0, W * 0.32, my + W * 0.16);
        c.fillStyle = 'rgba(235, 242, 255, 0.95)'; c.beginPath(); c.arc(mx, my, W * 0.03, 0, TAU); c.fill();
        c.fillStyle = 'rgba(180, 195, 215, 0.6)';
        for (const [dx, dy, rr] of [[-0.008, -0.006, 0.006], [0.01, 0.008, 0.004], [0.002, 0.014, 0.003]]) { c.beginPath(); c.arc(mx + dx * W, my + dy * W, rr * W, 0, TAU); c.fill(); }
        // trunks with bark and bare branches, near the edges
        const dark = 'rgba(6, 10, 9, 0.95)';
        c.lineCap = 'round';
        for (const [x, wdt] of [[W * 0.035, W * 0.075], [W * 0.14, W * 0.035], [W * 0.96, W * 0.085], [W * 0.85, W * 0.032]]) {
          c.fillStyle = dark; c.beginPath();
          c.moveTo(x - wdt / 2, H); c.lineTo(x - wdt * 0.42, 0); c.lineTo(x + wdt * 0.42, 0); c.lineTo(x + wdt / 2, H); c.closePath(); c.fill();
          // roots spreading at the bottom
          c.beginPath(); c.moveTo(x - wdt * 1.2, H); c.quadraticCurveTo(x - wdt * 0.4, H * 0.93, x - wdt * 0.4, H * 0.86); c.lineTo(x + wdt * 0.4, H * 0.86); c.quadraticCurveTo(x + wdt * 0.4, H * 0.93, x + wdt * 1.2, H); c.fill();
          // bark lines
          c.strokeStyle = 'rgba(60, 70, 65, 0.35)'; c.lineWidth = 1.5;
          for (let i = 0; i < 7; i++) {
            const bx = x + (rnd() - 0.5) * wdt * 0.6, y0 = rnd() * H;
            c.beginPath(); c.moveTo(bx, y0); c.lineTo(bx + (rnd() - 0.5) * 4, y0 + H * (0.05 + rnd() * 0.1)); c.stroke();
          }
          // branches
          c.strokeStyle = dark;
          for (let i = 0; i < 4; i++) {
            const y = H * (0.06 + rnd() * 0.4), dir = x < W / 2 ? 1 : -1, len = W * (0.09 + rnd() * 0.08);
            c.lineWidth = wdt * 0.22; c.beginPath(); c.moveTo(x, y);
            c.quadraticCurveTo(x + dir * len * 0.6, y - H * 0.03, x + dir * len, y - H * (0.07 + rnd() * 0.06)); c.stroke();
          }
        }
        // grass and ferns along the bottom
        c.fillStyle = 'rgba(4, 12, 8, 0.95)';
        c.beginPath(); c.moveTo(0, H);
        for (let x = 0; x <= W; x += 7) {
          const tall = (x < W * 0.25 || x > W * 0.75 ? 0.07 : 0.035) * H * (0.5 + rnd());
          c.lineTo(x + 3, H - tall); c.lineTo(x + 7, H - tall * 0.25);
        }
        c.lineTo(W, H); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(4, 12, 8, 0.95)'; c.lineWidth = 3;
        for (const [fx, dir] of [[W * 0.2, 1], [W * 0.8, -1], [W * 0.07, 1], [W * 0.93, -1]]) {
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + dir * (0.25 + i * 0.22);
            c.beginPath(); c.moveTo(fx, H); c.quadraticCurveTo(fx + Math.cos(a) * W * 0.05, H + Math.sin(a) * H * 0.12, fx + Math.cos(a) * W * 0.09, H + Math.sin(a) * H * 0.1); c.stroke();
          }
        }
        vignette('rgba(0, 10, 18, 0.75)');
      } else if (scene === 'hospital') {
        // A hospital room round the streamer: tiled wall, IV stand and heart monitor on the left,
        // a ward curtain on the right, a tube light on the ceiling. The heart line is drawn per frame (drawScene).
        c.fillStyle = 'rgba(60, 110, 95, 0.22)'; c.fillRect(0, 0, W, H); // sick green
        // tiles on the left wall
        c.strokeStyle = 'rgba(210, 240, 225, 0.3)'; c.lineWidth = 1.5;
        for (let x = 0; x <= W * 0.13; x += 30) { c.beginPath(); c.moveTo(x, H * 0.35); c.lineTo(x, H); c.stroke(); }
        for (let y = H * 0.35; y <= H; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(W * 0.13, y); c.stroke(); }
        c.fillStyle = 'rgba(210, 240, 225, 0.12)'; c.fillRect(0, H * 0.35, W * 0.13, H * 0.65);
        // the ward curtain on the right: rail, rings, soft folds
        c.fillStyle = 'rgba(190, 200, 205, 0.9)'; c.fillRect(W * 0.8, H * 0.02, W * 0.2, 5);
        const cx0 = W * 0.84;
        for (let i = 0; i < 8; i++) {
          const x = cx0 + (i * (W - cx0)) / 8, wdt = (W - cx0) / 8;
          const fold = c.createLinearGradient(x, 0, x + wdt, 0);
          fold.addColorStop(0, 'rgba(120, 170, 175, 0.75)'); fold.addColorStop(0.5, 'rgba(175, 215, 215, 0.8)'); fold.addColorStop(1, 'rgba(95, 140, 145, 0.75)');
          c.fillStyle = fold;
          c.beginPath(); c.moveTo(x, H * 0.035); c.lineTo(x + wdt + 1, H * 0.035);
          c.lineTo(x + wdt + 1, H * (0.9 + (i % 2) * 0.025)); c.quadraticCurveTo(x + wdt / 2, H * (0.93 + (i % 2) * 0.02), x, H * (0.9 + ((i + 1) % 2) * 0.025)); c.closePath(); c.fill();
          c.strokeStyle = 'rgba(200, 205, 210, 0.95)'; c.lineWidth = 2; c.beginPath(); c.arc(x + wdt / 2, H * 0.03, 5, 0, TAU); c.stroke();
        }
        // the IV stand on the left: pole, feet, drip bag, tube
        const ix = W * 0.17;
        c.strokeStyle = 'rgba(190, 200, 205, 0.9)'; c.lineWidth = 4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(ix, H * 0.12); c.lineTo(ix, H * 0.97); c.stroke();
        c.beginPath(); c.moveTo(ix - W * 0.035, H * 0.12); c.lineTo(ix + W * 0.035, H * 0.12); c.stroke();
        for (const d of [-1, 1]) { c.beginPath(); c.moveTo(ix, H * 0.95); c.lineTo(ix + d * W * 0.04, H); c.stroke(); }
        c.fillStyle = 'rgba(225, 240, 245, 0.55)'; c.strokeStyle = 'rgba(225, 240, 245, 0.9)'; c.lineWidth = 2;
        c.beginPath(); c.roundRect(ix - W * 0.045, H * 0.14, W * 0.032, H * 0.12, 8); c.fill(); c.stroke();
        c.fillStyle = 'rgba(200, 40, 40, 0.55)'; c.fillRect(ix - W * 0.043, H * 0.2, W * 0.028, H * 0.055); // blood bag
        c.strokeStyle = 'rgba(220, 230, 235, 0.7)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(ix - W * 0.029, H * 0.26); c.bezierCurveTo(ix - W * 0.03, H * 0.45, ix + W * 0.04, H * 0.5, ix + W * 0.06, H * 0.62); c.stroke();
        // heart monitor on the left wall (its screen is drawn per frame)
        c.fillStyle = 'rgba(25, 30, 32, 0.95)'; c.beginPath(); c.roundRect(W * 0.012, H * 0.36, W * 0.12, H * 0.13, 8); c.fill();
        c.fillStyle = 'rgba(0, 20, 10, 0.95)'; c.fillRect(W * 0.02, H * 0.372, W * 0.104, H * 0.095);
        // the tube light on the ceiling
        c.fillStyle = 'rgba(70, 80, 80, 0.9)'; c.fillRect(W * 0.37, H * 0.004, W * 0.26, 14);
        c.fillStyle = 'rgba(225, 255, 240, 0.9)'; c.fillRect(W * 0.38, H * 0.01, W * 0.24, 7);
        // stains on the tiles
        c.fillStyle = 'rgba(80, 45, 25, 0.28)'; c.beginPath(); c.ellipse(W * 0.06, H * 0.75, 30, 18, 0.4, 0, TAU); c.fill();
        vignette('rgba(0, 18, 10, 0.72)');
      }
      return { cv, key: scene + W };
    }

    // Void: dark swirling holes in the room. Before a creature comes out its hole pulses; then it opens wide,
    // a head with glowing eyes rises to the lip and holds a lantern at the streamer.
    drawVoid(now, W, H) {
      const ctx = this.ctx, warn = this.phase === 'warn';
      for (const h of this.holes || []) {
        if (!(h.open > 0)) continue; // closed portals are invisible
        const x = h.x * W, y = h.y * H, o = h.open;
        // Spins fast while it opens (the warning), slower once it's open.
        const rot = h.spin + now / (warn ? 180 : 420);
        const r = W * 0.105 * o * (1 + (warn ? 0.04 * Math.sin(now / 70) : 0));
        ctx.save();
        const tear = h.tear || 0; // claws pulling it wider (late in the round)
        ctx.translate(x, y); ctx.scale(1 + 0.4 * tear, 0.82 * (1 - 0.12 * tear)); // seen a little from the side
        // Glow round the portal.
        const glow = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.6);
        glow.addColorStop(0, 'rgba(150, 70, 255, 0.55)'); glow.addColorStop(1, 'rgba(90, 30, 200, 0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
        // Black core with a violet rim.
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        core.addColorStop(0, '#000'); core.addColorStop(0.62, 'rgba(6, 0, 14, 0.98)'); core.addColorStop(0.9, 'rgba(120, 50, 220, 0.9)'); core.addColorStop(1, 'rgba(200, 150, 255, 0.95)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        // Spiral arms turning into the middle.
        ctx.lineCap = 'round';
        for (let a = 0; a < 4; a++) {
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) {
            const k = i / 24, th = rot + (a * TAU) / 4 + k * 4.2, rr = r * (0.95 - 0.8 * k);
            i ? ctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr) : ctx.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
          }
          ctx.strokeStyle = `rgba(${a % 2 ? '190, 130, 255' : '120, 170, 255'}, 0.55)`; ctx.lineWidth = Math.max(1.5, r * 0.05);
          ctx.stroke();
        }
        // Sparks being sucked in.
        ctx.fillStyle = 'rgba(225, 200, 255, 0.85)';
        for (let i = 0; i < 10; i++) {
          const k = ((now / 900 + i * 0.137 + h.spin) % 1);
          const th = i * 2.4 + rot * 1.5 + k * 3, rr = r * (1.45 - 1.3 * k);
          ctx.beginPath(); ctx.arc(Math.cos(th) * rr, Math.sin(th) * rr, Math.max(1, r * 0.035 * (1 - k)), 0, TAU); ctx.fill();
        }
        // Claws: two dark hands grip the upper rim from inside and pull the portal apart, four bony fingers
        // curled over the edge with pale talons hooked outside.
        if (tear > 0) {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const side of [-1, 1]) {
            const th = side > 0 ? -0.75 : Math.PI + 0.75; // upper right / upper left of the rim
            const shake = Math.sin(now / 40 + side) * r * 0.025 * tear;
            ctx.save(); ctx.globalAlpha = Math.min(1, tear * 2.5);
            ctx.translate(Math.cos(th) * r * 0.93 + shake, Math.sin(th) * r * 0.93);
            ctx.rotate(th); // +x points out of the portal
            ctx.fillStyle = '#0d0812';
            ctx.beginPath(); ctx.ellipse(-r * 0.2, 0, r * 0.2, r * 0.17, 0, 0, TAU); ctx.fill(); // the hand, inside
            for (let f = 0; f < 4; f++) {
              const fy = (f - 1.5) * r * 0.1;
              // finger: from the hand, over the rim, bending back down outside
              ctx.strokeStyle = '#0d0812'; ctx.lineWidth = r * 0.07;
              ctx.beginPath(); ctx.moveTo(-r * 0.15, fy * 0.6);
              ctx.quadraticCurveTo(r * 0.08, fy - r * 0.02, r * 0.16, fy * 1.15);
              ctx.stroke();
              // talon: a pale hook pointing back towards the outside wall
              ctx.strokeStyle = '#e9e1cf'; ctx.lineWidth = r * 0.03;
              ctx.beginPath(); ctx.moveTo(r * 0.16, fy * 1.15);
              ctx.quadraticCurveTo(r * 0.26, fy * 1.2, r * 0.25, fy * 1.25 + r * 0.06 * Math.sign(fy || 1));
              ctx.stroke();
            }
            ctx.restore();
          }
        }
        ctx.restore();
        ctx.save();
        if (h.out > 0) {
          // the creature: a head rising out of the hole, eyes, a claw holding the lantern
          const hr = r * 0.55 * h.out;
          ctx.fillStyle = '#100a16'; ctx.shadowColor = 'rgba(255,205,120,0.5)'; ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.ellipse(x, y - hr * 0.3, hr, hr * 0.9, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 16;
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + side * hr * 0.38, y - hr * 0.35, hr * 0.16, hr * 0.1, 0, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
      }
      // lanterns at the start of each beam
      for (const b of this.voidBeams || []) {
        ctx.save();
        ctx.fillStyle = '#fff2c4'; ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.arc(b.ox * W, b.oy * H, W * 0.011, 0, TAU); ctx.fill();
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
