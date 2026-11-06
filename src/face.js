// Face tracking with MediaPipe Face Landmarker. Runs locally in the browser; no video leaves the computer.
// Gives, every frame: is there a face, smile 0..1, blink 0..1, head movement speed, face box.
// Smile and blink are measured against a calibrated neutral face.
(function (MC) {
  const MP_VERSION = '0.10.14';
  const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
  const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  const clamp = (v) => Math.max(0, Math.min(1, v));
  // Highest smile / eye-closure a relaxed face can have during calibration.
  const MAX_NEUTRAL_SMILE = 0.3;
  const MAX_NEUTRAL_BLINK = 0.35;
  const score = (cats, name) => (cats.find((c) => c.categoryName === name) || { score: 0 }).score;

  class Face {
    constructor() {
      this.state = { status: 'off', face: false, smile: 0, blink: 0, move: 0, box: null, raw: { smile: 0, blink: 0 } };
      this.base = { smile: 0, blink: 0 };
      this.listeners = [];
      this.fake = null; // debug values used when there is no camera
      this.prevNose = null;
    }

    onFrame(fn) { this.listeners.push(fn); }

    async start(video) {
      this.video = video;
      this.state.status = 'camera';
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      await video.play();

      this.state.status = 'loading';
      const { FaceLandmarker, FilesetResolver } = await import(MP_URL);
      const files = await FilesetResolver.forVisionTasks(WASM_URL);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(files, options('GPU'));
      } catch (e) {
        this.landmarker = await FaceLandmarker.createFromOptions(files, options('CPU'));
      }
      this.state.status = 'ready';
      this.loop();
    }

    // Debug: drive the detector by hand (no camera needed).
    startFake() {
      this.fake = { smile: 0, blink: 0, move: 0, x: 0.5 };
      this.state.status = 'fake';
      this.loop();
    }

    loop() {
      if (this.looping) return;
      this.looping = true;
      let lastTime = -1;
      const tick = () => {
        if (this.fake) {
          Object.assign(this.state, { face: true, raw: { smile: this.fake.smile, blink: this.fake.blink } });
          this.state.smile = this.fake.smile;
          this.state.blink = this.fake.blink;
          this.state.move = this.fake.move;
          // A pretend face in the middle of the frame; `x` (0..1, as seen on screen) slides it sideways.
          this.state.box = { x: 1 - this.fake.x - 0.14, y: 0.3, w: 0.28, h: 0.4 };
        } else if (this.landmarker && this.video.currentTime !== lastTime) {
          lastTime = this.video.currentTime;
          this.read(this.landmarker.detectForVideo(this.video, performance.now()));
        }
        this.listeners.forEach((fn) => fn(this.state));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    read(res) {
      const s = this.state;
      const cats = res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories;
      const pts = res.faceLandmarks && res.faceLandmarks[0];
      s.face = !!(cats && pts);
      if (!s.face) { s.smile = s.blink = 0; s.move *= 0.8; this.prevNose = null; return; }

      s.raw.smile = (score(cats, 'mouthSmileLeft') + score(cats, 'mouthSmileRight')) / 2;
      s.raw.blink = (score(cats, 'eyeBlinkLeft') + score(cats, 'eyeBlinkRight')) / 2;
      s.smile = clamp((s.raw.smile - this.base.smile) / (1 - this.base.smile));
      s.blink = clamp((s.raw.blink - this.base.blink) / (1 - this.base.blink));

      // Head movement: how fast the nose tip moves (smoothed), in % of the frame per frame.
      const nose = pts[1];
      if (this.prevNose) {
        const speed = Math.hypot(nose.x - this.prevNose.x, nose.y - this.prevNose.y) * 100;
        s.move = s.move * 0.7 + speed * 0.3;
      }
      this.prevNose = { x: nose.x, y: nose.y };

      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      s.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    // Record the neutral face for `ms` and measure smile/blink relative to it.
    calibrate(ms = 3000) {
      return new Promise((resolve) => {
        const samples = [];
        const take = (st) => { if (st.face) samples.push({ ...st.raw }); };
        this.onFrame(take);
        setTimeout(() => {
          this.listeners = this.listeners.filter((f) => f !== take);
          if (!samples.length) { resolve({ ...this.base, samples: 0 }); return; }
          const avg = (list, k) => list.reduce((a, b) => a + b[k], 0) / list.length;
          // Ignore the frames where the eyes were closed, so a natural blink doesn't raise the baseline.
          const open = samples.filter((x) => x.blink < 0.4);
          const smile = avg(samples, 'smile');
          const blink = open.length ? avg(open, 'blink') : avg(samples, 'blink');
          // A neutral face scores low on both. Refuse a smiling or squinting calibration instead of
          // learning it as "normal", otherwise anyone could beat the game by calibrating with a grin.
          if (smile > MAX_NEUTRAL_SMILE || blink > MAX_NEUTRAL_BLINK) {
            resolve({ ...this.base, samples: samples.length, rejected: smile > MAX_NEUTRAL_SMILE ? 'smile' : 'eyes' });
            return;
          }
          this.base.smile = smile;
          this.base.blink = blink;
          resolve({ ...this.base, samples: samples.length });
        }, ms);
      });
    }
  }

  MC.Face = Face;
})(window.MC = window.MC || {});
