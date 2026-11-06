// Curses: rules with their own timer ("don't blink 5 s"). Gifts add them, the camera checks them.
// Breaking an active curse = caught. Same curse again extends its timer up to a cap.
(function (MC) {
  const TYPES = ['blink', 'smile', 'move', 'sound'];

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
        // Everyone who fed this curse shares the credit if it catches the streamer.
        if (!cur.users.includes(by)) cur.users.push(by);
        cur.by = cur.users.join(' + ');
      } else if (this.active.length < this.s.maxCurses) {
        const starts = now + this.s.graceMs;
        this.active.push({ type, starts, ends: starts + cfg.seconds * 1000, by, users: [by] });
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
      if (now < this.immuneUntil) return;

      for (const c of this.active) {
        if (now < c.starts) continue; // still in the warning period
        // Face rules need a face in view; sound counts even when the face is lost.
        const loud = face.sound > this.s.soundThreshold;
        const broke =
          (face.face && c.type === 'blink' && face.blink > this.s.blinkThreshold) ||
          (face.face && c.type === 'smile' && face.smile > this.s.smileThreshold) ||
          // Freeze = no moving and no sound; Silence = no sound.
          (c.type === 'move' && ((face.face && face.move > this.s.moveThreshold) || loud)) ||
          (c.type === 'sound' && loud);
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
