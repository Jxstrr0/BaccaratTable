// Procedural audio for the baccarat table. Everything is synthesized with the
// Web Audio API: no samples, no dependencies. Nothing is created until start()
// (which must be called from a user gesture), and every method is a no-op
// until then.

const LOOKAHEAD = 1.2; // seconds of music scheduled ahead of the audio clock
const TICK_MS = 100; // scheduler wake-up; timing itself comes from ctx.currentTime
const BPM = 70;
const BEAT = 60 / BPM;
const SWING = 0.58; // share of a beat taken by the on-beat eighth
const MAX_LIVE = 240; // soft cap on concurrent one-shot groups

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Chord qualities as semitones above the root. The first two entries are the
// guide tones (3rd, 7th) and are always voiced; the rest are optional colour.
const QUALITY = {
  min9: [3, 10, 7, 14],
  min11: [3, 10, 7, 17],
  dom13: [4, 10, 21, 14],
  dom9: [4, 10, 14, 7],
  maj9: [4, 11, 14, 7],
  maj69: [4, 9, 14, 7],
  maj7s11: [4, 11, 18, 14],
};

// Four-bar progressions as [degree in semitones from the tonic, quality].
const PROGRESSIONS = [
  [[2, 'min9'], [7, 'dom13'], [0, 'maj9'], [0, 'maj69']], // ii-V-I
  [[2, 'min11'], [7, 'dom9'], [0, 'maj7s11'], [0, 'maj9']],
  [[0, 'maj9'], [9, 'min9'], [2, 'min9'], [7, 'dom13']], // I-vi-ii-V
  [[2, 'min9'], [1, 'dom13'], [0, 'maj9'], [5, 'maj69']], // tritone sub
  [[4, 'min11'], [9, 'dom9'], [2, 'min9'], [7, 'dom13']], // iii-VI-ii-V
];
const KEYS = [0, 5, 10, 3, 7, 2]; // C F Bb Eb G D

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.voiceEnabled = true;

    this._muted = false;
    this._musicVol = 0.35;
    this._sfxVol = 0.8;
    this._live = 0;
    this._starting = null;

    // peel (card bend) state
    this._peel = null;
    this._peelT = 0;
    this._peelAmt = 0;
    this._peelVel = 0;
    this._peelCreakT = 0;
    this._peelIdle = null;

    // ambience state
    this._ambWanted = true;
    this._ambOn = false;
    this._amb = null;
    this._hum = null;
    this._timer = null;
    this._utter = null;
  }

  // ---------------------------------------------------------------- public

  async start() {
    if (this._starting) return this._starting;
    this._starting = this._init().finally(() => {
      this._starting = null;
    });
    return this._starting;
  }

  setMuted(m) {
    this._muted = !!m;
    if (this._muted) this._cancelSpeech();
    if (this.ctx) this._ramp(this.master.gain, this._muted ? 0 : 0.9, 0.02);
  }

  get muted() {
    return this._muted;
  }

  setMusicVolume(v) {
    this._musicVol = clamp(+v || 0, 0, 1);
    this._applyVolumes();
  }

  setSfxVolume(v) {
    this._sfxVol = clamp(+v || 0, 0, 1);
    this._applyVolumes();
  }

  get musicVolume() {
    return this._musicVol;
  }

  get sfxVolume() {
    return this._sfxVol;
  }

  // Card sliding across felt: band-limited noise swish plus a soft felt layer.
  cardSlide() {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const dur = rand(0.25, 0.4);
    const amp = rand(0.8, 1.2);
    const f0 = rand(1500, 2600);
    const f1 = f0 * rand(0.65, 1.35);
    const out = this._out(this.sfx, 0.12, rand(-0.2, 0.2));
    const src = this._noiseSrc(t, dur + 0.2);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const felt = ctx.createBiquadFilter();
    felt.type = 'bandpass';
    felt.frequency.value = rand(380, 520);
    felt.Q.value = 1;
    const feltG = ctx.createGain();
    feltG.gain.value = 0.55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.3 * amp, t + dur * 0.3);
    env.gain.setTargetAtTime(0, t + dur * 0.45, dur * 0.17);

    src.connect(bp).connect(lp);
    src.connect(felt).connect(feltG).connect(lp);
    lp.connect(env).connect(out.input);
    src.stop(t + dur + 0.2);
    this._dispose(src, [bp, felt, feltG, lp, env, ...out.nodes]);
  }

  // Crisp snap with a tiny second flick and a dry little body.
  cardFlip() {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.003;
    const out = this._out(this.sfx, 0.14, rand(-0.15, 0.15));
    const nodes = [...out.nodes];

    const snap = (at, f, gain, dec) => {
      const src = this._noiseSrc(at, dec + 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 1.1;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(gain, at + 0.001);
      env.gain.exponentialRampToValueAtTime(0.0001, at + dec);
      src.connect(bp).connect(env).connect(out.input);
      src.stop(at + dec + 0.02);
      nodes.push(src, bp, env);
    };
    snap(t, rand(3000, 4200), 0.7, 0.03);
    snap(t + rand(0.02, 0.032), rand(2000, 3000), 0.35, 0.045);

    const tok = ctx.createOscillator();
    tok.type = 'sine';
    tok.frequency.setValueAtTime(rand(520, 640), t);
    tok.frequency.exponentialRampToValueAtTime(300, t + 0.03);
    const tokG = ctx.createGain();
    tokG.gain.setValueAtTime(0, t);
    tokG.gain.linearRampToValueAtTime(0.2, t + 0.001);
    tokG.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    tok.connect(tokG).connect(out.input);
    tok.start(t);
    tok.stop(t + 0.12); // outlasts the noise snaps (<= ~0.1 s)
    nodes.push(tok, tokG);
    this._dispose(tok, nodes);
  }

  // Called while a card is being bent. Rate-limited; sound follows how fast
  // the amount is changing, with the odd paper creak on top.
  cardPeel(amount) {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const a = clamp(+amount || 0, 0, 1);

    if (!this._peel) this._peelBegin(a, now);
    const dt = now - this._peelT;
    if (dt < 0.04) return; // ~25 updates/s max

    const vel = Math.abs(a - this._peelAmt) / dt;
    this._peelVel = this._peelVel * 0.6 + clamp(vel, 0, 3) * 0.4;
    this._peelAmt = a;
    this._peelT = now;

    const p = this._peel;
    const level = 0.008 + a * 0.02 + clamp(this._peelVel, 0, 2) * 0.05;
    const freq = 900 + a * 2300;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setTargetAtTime(level, now, 0.05);
    p.bp.frequency.cancelScheduledValues(now);
    p.bp.frequency.setTargetAtTime(freq, now, 0.06);

    if (now >= this._peelCreakT && (this._peelVel > 0.12 || a > 0.6)) {
      this._creak(now, freq, a);
      this._peelCreakT = now + rand(0.1, 0.28) / (0.5 + this._peelVel);
    }

    clearTimeout(this._peelIdle);
    this._peelIdle = setTimeout(() => this.cardPeelEnd(), 220);
  }

  cardPeelEnd() {
    clearTimeout(this._peelIdle);
    this._peelIdle = null;
    const p = this._peel;
    if (!p || !this.ctx) return;
    this._peel = null;
    const now = this.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setTargetAtTime(0, now, 0.06);
    p.src.stop(now + 0.5);
  }

  // Several micro-impacts of clay on clay. `count` (1..8) scales density.
  chipClack(count = 1) {
    if (!this._ok()) return;
    const n = clamp(Math.round(+count || 1), 1, 8);
    const impacts = 2 + Math.round(n * 1.2);
    const window = 0.05 + n * 0.02;
    const density = 1 - (n - 1) * 0.04; // keep big stacks from getting loud
    const t = this.ctx.currentTime + 0.003;
    const out = this._out(this.sfx, 0.18, rand(-0.25, 0.25));
    let last = null;
    for (let i = 0; i < impacts; i++) {
      const at = t + (i === 0 ? 0 : rand(0.006, window));
      const c = this._click(out.input, at, {
        f: rand(2200, 5800),
        gain: rand(0.22, 0.5) * density * (i === 0 ? 1 : rand(0.5, 1)),
        dec: rand(0.02, 0.05),
        body: rand(0.3, 0.7),
      });
      if (!last || c.end > last.end) last = c;
    }
    this._dispose(last.src, out.nodes);
  }

  // One chip set down on a stack: low thock, one or two clicks.
  chipStack() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + 0.003;
    const out = this._out(this.sfx, 0.18, rand(-0.2, 0.2));
    let last = this._click(out.input, t, {
      f: rand(2600, 3800),
      gain: 0.6,
      dec: 0.04,
      body: 1,
    });
    if (Math.random() < 0.65) {
      const c = this._click(out.input, t + rand(0.018, 0.04), {
        f: rand(3800, 5600),
        gain: 0.3,
        dec: 0.03,
        body: 0.3,
      });
      if (c.end > last.end) last = c;
    }
    this._dispose(last.src, out.nodes);
  }

  // Dealer pushing a stack: gritty felt rumble with ceramic chatter.
  chipSlide() {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const dur = rand(0.5, 0.75);
    const out = this._out(this.sfx, 0.14, rand(-0.2, 0.2));
    const src = this._noiseSrc(t, dur + 0.3);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(rand(700, 900), t);
    bp.frequency.linearRampToValueAtTime(rand(550, 800), t + dur);
    bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;

    // amplitude chatter from a fast saw LFO
    const am = ctx.createGain();
    am.gain.value = 0.65;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = rand(30, 46);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.35;
    lfo.connect(lfoG).connect(am.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.4, t + 0.09);
    env.gain.setValueAtTime(0.4, t + dur * 0.7);
    env.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.12);

    src.connect(bp).connect(lp).connect(am).connect(env).connect(out.input);
    const end = t + dur + 0.3;
    src.stop(end);
    lfo.start(t);
    lfo.stop(end);

    let last = { src: lfo, end };
    const clicks = randInt(4, 7);
    for (let i = 0; i < clicks; i++) {
      const c = this._click(out.input, t + rand(0.05, dur * 0.9), {
        f: rand(2200, 4200),
        gain: rand(0.08, 0.2),
        dec: 0.025,
        body: 0.2,
      });
      if (c.end > last.end) last = c;
    }
    this._dispose(last.src, [bp, lp, am, lfoG, env, ...out.nodes, src, lfo]);
  }

  // Soft, short tick.
  uiClick() {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.002;
    const out = this._out(this.sfx, 0.08);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(950, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(out.input);
    o.start(t);
    o.stop(t + 0.07);
    this._dispose(o, [g, ...out.nodes]);
  }

  // Quiet major-chord bell arpeggio (FM bells through the reverb).
  win(big = false) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + 0.01;
    const notes = big ? [67, 72, 76, 79, 83, 86] : [72, 76, 79, 83];
    const gap = big ? 0.085 : 0.095;
    notes.forEach((m, i) => {
      const last = i === notes.length - 1;
      this._bell(
        t + i * gap,
        m,
        0.55 + 0.45 * (i / (notes.length - 1)),
        last ? (big ? 2.4 : 1.8) : big ? 1.4 : 1.1,
        (i / (notes.length - 1) - 0.5) * 0.5,
      );
    });
    if (big) {
      // a soft shimmer chord under the last note
      const at = t + notes.length * gap;
      this._bell(at, 79, 0.3, 2.2, -0.3);
      this._bell(at + 0.03, 88, 0.22, 2.2, 0.3);
      this._pad(t, 60, 1.8);
    }
  }

  // Barely-there low tone sinking a little.
  lose() {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const out = this._out(this.sfx, 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.04, t + 0.05);
    env.gain.setTargetAtTime(0, t + 0.12, 0.22);
    const oscs = [146.8, 220].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.89, t + 0.7);
      const g = ctx.createGain();
      g.gain.value = i ? 0.35 : 1;
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + 1.6);
      return [o, g];
    });
    lp.connect(env).connect(out.input);
    this._dispose(oscs[1][0], [lp, env, ...oscs.flat(), ...out.nodes]);
  }

  // Callbacks let the dealer animate along with its voice: onStart/onEnd bracket the
  // utterance, onBoundary fires on each word. Returns false if nothing was spoken.
  speak(text, { onStart, onEnd, onBoundary } = {}) {
    if (!this.ctx || this._muted || !this.voiceEnabled || !text) return false;
    const synth = this._synth();
    if (!synth) return false;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      const v = this._pickVoice(synth);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else {
        u.lang = 'en-US';
      }
      u.rate = 0.95;
      u.pitch = 0.9;
      u.volume = clamp(this._sfxVol, 0.2, 1);
      const done = () => {
        if (this._utter === u) this._utter = null;
        onEnd?.();
      };
      u.onend = done;
      u.onerror = done;
      if (onStart) u.onstart = onStart;
      if (onBoundary) u.onboundary = onBoundary;
      this._utter = u; // keep a reference; some browsers GC live utterances
      synth.speak(u);
      return true;
    } catch (e) {
      /* speech is best-effort */
      return false;
    }
  }

  startAmbience() {
    this._ambWanted = true;
    if (!this.ctx || this._ambOn) return;
    const ctx = this.ctx;
    const gate = (dest) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(dest);
      this._ramp(g.gain, 1, 0.8);
      return g;
    };
    this._amb = { dry: gate(this.music.dry), wet: gate(this.music.wet) };
    this._startHum();

    this._ambOn = true;
    this._step = 0;
    this._nextT = ctx.currentTime + 0.15;
    this._prog = null;
    this._progIdx = 0;
    this._chord = null;
    this._lastProg = -1;
    this._tonic = pick(KEYS);
    this._center = 64;
    this._melodyNote = 79;
    this._melodyCool = randInt(4, 8);
    this._lastVoicing = null;
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();
  }

  stopAmbience() {
    this._ambWanted = false;
    if (!this._ambOn) return;
    this._ambOn = false;
    clearInterval(this._timer);
    this._timer = null;
    const amb = this._amb;
    const hum = this._hum;
    this._amb = null;
    this._hum = null;
    const ctx = this.ctx;
    if (!ctx) return;
    this._ramp(amb.dry.gain, 0, 0.25);
    this._ramp(amb.wet.gain, 0, 0.25);
    const end = ctx.currentTime + 1.6;
    if (hum) hum.sources.forEach((s) => s.stop(end));
    setTimeout(() => {
      const all = [amb.dry, amb.wet, ...(hum ? hum.nodes : [])];
      for (const n of all) {
        try {
          n.disconnect();
        } catch (e) {
          /* already gone */
        }
      }
    }, 1800);
  }

  // Release everything (not part of the game flow; handy for hot reload).
  dispose() {
    this.stopAmbience();
    this.cardPeelEnd();
    this._cancelSpeech();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) ctx.close().catch(() => {});
  }

  // -------------------------------------------------------------- internals

  async _init() {
    if (!this.ctx) {
      const AC =
        typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
        this._build();
      } catch (e) {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch (e) {
        /* stays suspended until the next gesture */
      }
    }
    if (this._ambWanted) this.startAmbience();
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp).connect(ctx.destination);

    // shared reverb: highpass -> convolver -> lowpass -> master
    this.reverbIn = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const conv = ctx.createConvolver();
    conv.buffer = this._makeImpulse(1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const rOut = ctx.createGain();
    rOut.gain.value = 0.8;
    this.reverbIn.connect(hp).connect(conv).connect(lp).connect(rOut).connect(this.master);

    this.sfx = this._bus();
    this.music = this._bus();
    this._noiseBuf = this._makeNoise(3);
    this._applyVolumes(true);
  }

  // A bus is a dry path to master and a wet path into the reverb, so both
  // follow the same volume.
  _bus() {
    const dry = this.ctx.createGain();
    const wet = this.ctx.createGain();
    dry.connect(this.master);
    wet.connect(this.reverbIn);
    return { dry, wet };
  }

  _applyVolumes(immediate = false) {
    if (!this.ctx) return;
    const s = Math.pow(this._sfxVol, 1.5);
    const m = Math.pow(this._musicVol, 1.5);
    for (const [bus, v] of [[this.sfx, s], [this.music, m]]) {
      for (const g of [bus.dry.gain, bus.wet.gain]) {
        if (immediate) g.value = v;
        else this._ramp(g, v, 0.03);
      }
    }
  }

  _ramp(param, v, tau = 0.03) {
    param.setTargetAtTime(v, this.ctx.currentTime, tau);
  }

  _running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // Gate for one-shot sounds: context live and not flooded.
  _ok() {
    return this._running() && this._live < MAX_LIVE;
  }

  // Per-sound output stage: pan, dry send, scaled wet send.
  _out(bus, wet = 0.15, pan = 0) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const nodes = [input];
    let tail = input;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      input.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(bus.dry);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      tail.connect(w).connect(bus.wet);
      nodes.push(w);
    }
    return { input, nodes };
  }

  // Disconnect a one-shot's graph once its last source ends.
  _dispose(src, nodes) {
    this._live++;
    src.addEventListener('ended', () => {
      this._live--;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch (e) {
          /* already disconnected */
        }
      }
    });
  }

  _noiseSrc(t, dur, loop = false) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const bd = this._noiseBuf.duration;
    if (loop || dur > bd - 0.2) {
      src.loop = true;
      src.start(t, rand(0, bd));
    } else {
      src.start(t, rand(0, bd - dur - 0.1));
    }
    return src;
  }

  // White noise with an equal-power crossfade so it loops without a seam.
  _makeNoise(seconds) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const fade = Math.floor(rate * 0.1);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    const raw = new Float32Array(len + fade);
    for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 2 - 1;
    for (let i = 0; i < len; i++) d[i] = raw[i];
    for (let i = 0; i < fade; i++) {
      const x = (i / fade) * Math.PI * 0.5;
      d[i] = raw[i] * Math.sin(x) + raw[len + i] * Math.cos(x);
    }
    return buf;
  }

  // Small luxurious room: pre-delay, a few early taps, then a decaying noise
  // tail that gets darker over time.
  _makeImpulse(decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * decay * 1.25);
    const pre = Math.floor(rate * 0.012);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        const env = Math.exp((-t * 6.9) / decay);
        const a = 0.75 - 0.6 * Math.min(1, t / decay); // one-pole coefficient
        y += a * (Math.random() * 2 - 1 - y);
        d[i] = y * env;
      }
      for (let k = 0; k < 6; k++) {
        const at = pre + Math.floor(rate * rand(0.004, 0.07));
        d[at] += (Math.random() < 0.5 ? -1 : 1) * rand(0.25, 0.6);
      }
    }
    return buf;
  }

  _synth() {
    try {
      if (
        typeof window !== 'undefined' &&
        window.speechSynthesis &&
        typeof window.SpeechSynthesisUtterance !== 'undefined'
      ) {
        return window.speechSynthesis;
      }
    } catch (e) {
      /* fall through */
    }
    return null;
  }

  _cancelSpeech() {
    const s = this._synth();
    this._utter = null;
    if (!s) return;
    try {
      s.cancel();
    } catch (e) {
      /* ignore */
    }
  }

  _pickVoice(synth) {
    let voices = [];
    try {
      voices = synth.getVoices() || [];
    } catch (e) {
      return null;
    }
    const bad = /fred|zarvox|bad news|good news|bells|whisper|albert|boing|bubbles|cellos|deranged|hysterical|junior|kathy|organ|princess|ralph|trinoids|superstar|wobble|jester|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
    const nice = /natural|neural|premium|enhanced|daniel|samantha|karen|moira|serena|oliver|google uk english|aria|guy|jenny|libby|ryan|alex/i;
    let best = null;
    let bestScore = 0;
    for (const v of voices) {
      if (!/^en([-_]|$)/i.test(v.lang || '')) continue;
      let s = 1;
      if (bad.test(v.name)) s -= 10;
      if (nice.test(v.name)) s += 3;
      if (/^en[-_](GB|US|AU|IE)/i.test(v.lang)) s += 1;
      if (v.default) s += 0.5;
      if (s > bestScore) {
        best = v;
        bestScore = s;
      }
    }
    return best;
  }

  // One clay-chip impact: noise tick + resonant ring + short low body.
  // Returns the source that ends last so the caller can dispose after it.
  _click(dest, t, { f = 3500, gain = 0.25, dec = 0.03, body = 0.5 } = {}) {
    const ctx = this.ctx;
    const nodes = [];

    const n = this._noiseSrc(t, 0.03);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(gain, t + 0.0008);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    n.connect(bp).connect(ng).connect(dest);
    n.stop(t + 0.03);
    nodes.push(n, bp, ng);

    // ring: two inharmonic partials
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0, t);
    rg.gain.linearRampToValueAtTime(gain * 0.5, t + 0.0006);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    rg.connect(dest);
    nodes.push(rg);
    let ring = null;
    for (const r of [1, rand(1.45, 1.62)]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.value = r === 1 ? 1 : 0.5;
      o.connect(og).connect(rg);
      o.start(t);
      o.stop(t + dec + 0.01);
      nodes.push(o, og);
      ring = o;
    }

    // body: short falling thock
    const bo = ctx.createOscillator();
    bo.type = 'sine';
    const bf = rand(520, 900);
    bo.frequency.setValueAtTime(bf, t);
    bo.frequency.exponentialRampToValueAtTime(bf * 0.65, t + 0.02);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(gain * 0.6 * body, t + 0.001);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    bo.connect(bg).connect(dest);
    bo.start(t);
    bo.stop(t + 0.03);
    nodes.push(bo, bg);

    // `ring` ends at t+dec+0.01 (dec >= 0.02), after body (t+0.03) and noise
    this._dispose(ring, nodes);
    return { src: ring, end: t + dec + 0.01 };
  }

  _peelBegin(a, now) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.value = 900 + a * 2300;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const out = this._out(this.sfx, 0.05);
    src.connect(bp).connect(hp).connect(gain).connect(out.input);
    src.start(now, rand(0, this._noiseBuf.duration));
    this._dispose(src, [bp, hp, gain, ...out.nodes]);
    this._peel = { src, bp, gain, out };
    this._peelT = now - 0.1;
    this._peelAmt = a;
    this._peelVel = 0;
    this._peelCreakT = now + 0.05;
  }

  // Short, narrow, sweeping noise grain: a paper creak.
  _creak(t, freq, a) {
    const ctx = this.ctx;
    const dur = rand(0.04, 0.09);
    const src = this._noiseSrc(t, dur + 0.02);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = rand(6, 12);
    const f = freq * rand(0.8, 1.2);
    bp.frequency.setValueAtTime(f, t);
    bp.frequency.exponentialRampToValueAtTime(f * rand(0.8, 1.25), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.08 + a * 0.08, t + dur * 0.3);
    env.gain.linearRampToValueAtTime(0, t + dur);
    const dest = this._peel ? this._peel.out.input : null;
    if (!dest) return;
    src.connect(bp).connect(env).connect(dest);
    src.stop(t + dur + 0.02);
    this._dispose(src, [bp, env]);
  }

  // FM bell: inharmonic 3.5:1 modulator whose index decays quickly.
  _bell(t, midi, vel, dur, pan = 0) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const out = this._out(this.sfx, 0.55, pan);
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 3.5;
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * 1.6, t);
    modG.gain.setTargetAtTime(f * 0.08, t, 0.12);
    mod.connect(modG).connect(car.frequency);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f * 2;
    const subG = ctx.createGain();
    subG.gain.value = 0.18;
    sub.connect(subG);

    const env = ctx.createGain();
    const peak = 0.04 * vel;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.004);
    env.gain.setTargetAtTime(0, t + 0.004, dur / 5);
    car.connect(env);
    subG.connect(env);
    env.connect(out.input);

    const end = t + dur * 1.3;
    for (const o of [car, mod, sub]) {
      o.start(t);
      o.stop(end);
    }
    this._dispose(car, [mod, modG, sub, subG, env, ...out.nodes]);
  }

  // Soft sine pad used under the big win.
  _pad(t, midi, dur) {
    const ctx = this.ctx;
    const out = this._out(this.sfx, 0.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.05, t + 0.08);
    env.gain.setTargetAtTime(0, t + 0.15, dur / 5);
    env.connect(out.input);
    const oscs = [0, 7, 12].map((iv) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(midi + iv);
      o.connect(env);
      o.start(t);
      o.stop(t + dur * 1.3);
      return o;
    });
    this._dispose(oscs[0], [env, ...oscs, ...out.nodes]);
  }

  // --------------------------------------------------------------- ambience

  // Very quiet room/city bed: low rumble plus a faint airy band, both drifting.
  _startHum() {
    const ctx = this.ctx;
    const nodes = [];
    const sources = [];
    const dest = this._amb.dry;

    const low = this._noiseSrc(ctx.currentTime, 1, true);
    const lowLp = ctx.createBiquadFilter();
    lowLp.type = 'lowpass';
    lowLp.frequency.value = 150;
    lowLp.Q.value = 0.6;
    const lowG = ctx.createGain();
    lowG.gain.value = 0.25;
    low.connect(lowLp).connect(lowG).connect(dest);

    const air = this._noiseSrc(ctx.currentTime, 1, true);
    const airBp = ctx.createBiquadFilter();
    airBp.type = 'bandpass';
    airBp.frequency.value = 420;
    airBp.Q.value = 0.4;
    const airLp = ctx.createBiquadFilter();
    airLp.type = 'lowpass';
    airLp.frequency.value = 1100;
    const airG = ctx.createGain();
    airG.gain.value = 0.045;
    air.connect(airBp).connect(airLp).connect(airG).connect(dest);

    // slow drift
    const l1 = ctx.createOscillator();
    l1.frequency.value = 0.05;
    const l1g = ctx.createGain();
    l1g.gain.value = 45;
    l1.connect(l1g).connect(lowLp.frequency);
    const l2 = ctx.createOscillator();
    l2.frequency.value = 0.083;
    const l2g = ctx.createGain();
    l2g.gain.value = 0.012;
    l2.connect(l2g).connect(airG.gain);
    l1.start();
    l2.start();

    sources.push(low, air, l1, l2);
    nodes.push(lowLp, lowG, airBp, airLp, airG, l1g, l2g, ...sources);
    this._hum = { sources, nodes };
  }

  _tick() {
    if (!this._ambOn || !this._running()) return;
    const now = this.ctx.currentTime;
    if (this._nextT < now) this._nextT = now + 0.05; // recover from a stall
    while (this._nextT < now + LOOKAHEAD) {
      this._playStep(this._step, this._nextT);
      this._nextT += BEAT * (this._step % 2 === 0 ? SWING : 1 - SWING);
      this._step = (this._step + 1) % 8; // eighth notes, 8 per bar
    }
  }

  _nextChord() {
    if (!this._prog || this._progIdx >= this._prog.length) {
      let i;
      do i = randInt(0, PROGRESSIONS.length - 1);
      while (i === this._lastProg);
      this._lastProg = i;
      if (Math.random() < 0.45) {
        let k;
        do k = pick(KEYS);
        while (k === this._tonic);
        this._tonic = k;
      }
      this._prog = PROGRESSIONS[i].map(([deg, q]) => ({
        pc: (this._tonic + deg) % 12,
        tones: QUALITY[q],
      }));
      this._progIdx = 0;
    }
    return this._prog[this._progIdx++];
  }

  _playStep(step, t) {
    if (step === 0) {
      this._chord = this._nextChord();
      this._voicing = this._voice(this._chord);
      this._comp(t, this._voicing, 1, rand(2.3, 3.2));
      this._bass(t, this._chord, false);
    } else if (!this._chord) {
      return;
    } else if (step === 4 && Math.random() < 0.6) {
      this._bass(t, this._chord, Math.random() < 0.5);
    } else if ((step === 3 || step === 5) && Math.random() < 0.2) {
      this._comp(t, this._voicing.slice(1), 0.5, 0.5);
    }

    if (--this._melodyCool <= 0 && Math.random() < 0.22) {
      this._melody(t, this._chord);
      this._melodyCool = randInt(4, 10);
    }
  }

  // Rootless voicing: guide tones plus one or two extensions, placed near the
  // previous voicing's centre so the harmony moves smoothly.
  _voice(chord) {
    const ivs = [
      ...chord.tones.slice(0, 2),
      ...shuffle(chord.tones.slice(2)).slice(0, Math.random() < 0.5 ? 1 : 2),
    ];
    let best = null;
    let bestCost = Infinity;
    for (let tries = 0; tries < 10; tries++) {
      const target = this._center + rand(-5, 5);
      const notes = [
        ...new Set(
          ivs.map((iv) => {
            const base = 48 + chord.pc + iv;
            return clamp(base + 12 * Math.round((target - base) / 12), 55, 79);
          }),
        ),
      ].sort((a, b) => a - b);
      const mean = notes.reduce((s, n) => s + n, 0) / notes.length;
      let cost = Math.abs(mean - this._center);
      if (notes[notes.length - 1] - notes[0] > 17) cost += 4;
      for (let i = 1; i < notes.length; i++) if (notes[i] - notes[i - 1] === 1) cost += 3;
      if (cost < bestCost) {
        best = notes;
        bestCost = cost;
      }
    }
    const mean = best.reduce((s, n) => s + n, 0) / best.length;
    this._center = clamp(this._center * 0.5 + mean * 0.5, 61, 69);
    return best;
  }

  // Strummed chord with slight timing and velocity spread.
  _comp(t, notes, vel, dur) {
    let off = 0;
    for (const m of notes) {
      this._ep(t + off + rand(0, 0.008), m, dur, vel * rand(0.65, 1), 0.1);
      off += rand(0.012, 0.03);
    }
  }

  _melody(t, chord) {
    const ivs = [...new Set([0, 7, ...chord.tones])];
    const cands = [];
    for (const iv of ivs) {
      for (let n = 48 + chord.pc + iv - 12; n <= 90; n += 12) {
        if (n >= 72 && n <= 88) cands.push(n);
      }
    }
    // prefer stepwise motion from the previous note, with some jitter
    const score = (n) => Math.abs(n - this._melodyNote) + rand(0, 3);
    const m = cands.map((n) => [score(n), n]).sort((a, b) => a[0] - b[0])[0][1];
    this._melodyNote = m;
    this._ep(t + rand(0, 0.02), m, rand(0.5, 1.5), rand(0.45, 0.75), 0.085, true);
  }

  // Soft sine bass with a whisper of second harmonic.
  _bass(t, chord, fifth) {
    if (!this._amb) return;
    const ctx = this.ctx;
    const m = 36 + chord.pc + (fifth ? 7 : 0);
    const f = mtof(m);
    const dur = BEAT * (fifth ? 1.6 : 2.4);
    const out = this._out(this._amb, 0.06);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.17, t + 0.02);
    env.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o1.connect(env);
    o2.connect(g2).connect(env);
    env.connect(out.input);
    const end = t + dur * 1.8;
    o1.start(t);
    o2.start(t);
    o1.stop(end);
    o2.stop(end);
    this._dispose(o1, [o2, g2, env, ...out.nodes]);
  }

  // Electric-piano voice: FM pair (1:1, decaying index) plus a brief tine.
  _ep(t, midi, dur, vel, level, soft = false) {
    if (!this._amb) return;
    const ctx = this.ctx;
    const f = mtof(midi);
    const out = this._out(this._amb, soft ? 0.6 : 0.45, clamp((midi - 66) / 36 + rand(-0.12, 0.12), -0.6, 0.6));

    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f;
    const modG = ctx.createGain();
    const idx = 0.7 + vel * 1.3;
    modG.gain.setValueAtTime(f * idx, t);
    modG.gain.setTargetAtTime(f * idx * 0.18, t, 0.35);
    mod.connect(modG).connect(car.frequency);

    const tine = ctx.createOscillator();
    tine.type = 'sine';
    tine.frequency.value = f * 4;
    const tineG = ctx.createGain();
    tineG.gain.setValueAtTime(0.1 * vel, t);
    tineG.gain.setTargetAtTime(0, t, 0.04);
    tine.connect(tineG);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = clamp(f * 3 + 600 + vel * 900, 1200, 5000);
    lp.Q.value = 0.4;

    const env = ctx.createGain();
    const peak = vel * level;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.007);
    env.gain.setTargetAtTime(peak * 0.35, t + 0.007, 0.8);
    env.gain.setTargetAtTime(0, t + dur, 0.14);

    car.connect(env);
    tineG.connect(env);
    env.connect(lp).connect(out.input);

    const end = t + dur + 1.0;
    for (const o of [car, mod, tine]) {
      o.start(t);
      o.stop(end);
    }
    this._dispose(car, [mod, modG, tine, tineG, lp, env, ...out.nodes]);
  }
}
