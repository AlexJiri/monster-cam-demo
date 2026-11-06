// Curses: rules with their own timer ("don't blink 5 s"). Gifts add them, the camera checks them.
// Breaking an active curse = caught. Same curse again extends its timer up to a cap.
(function (MC) {
  const TYPES = ['blink', 'smile', 'move'];

  class Curses {
    constructor(settings, { onCaught, onChange }) {
      this.s = settings;
      this.onCaught = onCaught;
      this.onChange = onChange;
      this.active = []; // { type, starts, ends, by }
      this.queue = [];
      this.immuneUntil = 0;
    }

    add(type, by, now = performance.now()) {
      if (type === 'all') { TYPES.forEach((t) => this.add(t, by, now)); return; }
      const cfg = this.s.curses[type];
      if (!cfg) return;
      const cur = this.active.find((c) => c.type === type);
      if (cur) {
        // Every gift adds time, but at most `maxSeconds` can be left on the clock at once.
        const cap = Math.max(now, cur.starts) + cfg.maxSeconds * 1000;
        cur.ends = Math.min(cur.ends + cfg.seconds * 1000, cap);
        cur.capped = cur.ends >= cap;
        cur.bumped = now;
        cur.by = by;
      } else if (this.active.length < this.s.maxCurses) {
        const starts = now + this.s.graceMs;
        this.active.push({ type, starts, ends: starts + cfg.seconds * 1000, by });
      } else {
        this.queue.push({ type, by });
      }
      this.onChange();
    }

    // Called every frame with the face state.
    tick(face, now = performance.now()) {
      const before = this.active.length;
      this.active = this.active.filter((c) => c.ends > now);
      while (this.queue.length && this.active.length < this.s.maxCurses) {
        const next = this.queue.shift();
        this.add(next.type, next.by, now);
      }
      if (this.active.length !== before) this.onChange();
      if (!face.face || now < this.immuneUntil) return;

      for (const c of this.active) {
        if (now < c.starts) continue; // still in the warning period
        const broke =
          (c.type === 'blink' && face.blink > this.s.blinkThreshold) ||
          (c.type === 'smile' && face.smile > this.s.smileThreshold) ||
          (c.type === 'move' && face.move > this.s.moveThreshold);
        if (broke) {
          this.active = this.active.filter((x) => x !== c);
          this.immuneUntil = now + 2000; // short breather after getting caught
          this.onCaught(c);
          this.onChange();
          return;
        }
      }
    }

    clear() { this.active = []; this.queue = []; this.onChange(); }
  }

  MC.Curses = Curses;
})(window.MC = window.MC || {});
