/* Ocean Evolution - simple WebAudio: procedural sfx and a soft ambient loop, with sound / music toggles.
   Audio unlocks on the first user gesture. No asset files (sound assets are out of scope for this slice). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  var A = {
    ctx: null, master: null, sfxGain: null, musGain: null, sound: true, music: true, haptics: true, started: false, musicTimer: null, step: 0,
    init: function () {
      if (this.ctx) return true;
      var AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
        this.musGain = this.ctx.createGain(); this.musGain.gain.value = 0.18; this.musGain.connect(this.master);
      } catch (e) { this.ctx = null; return false; }
      return true;
    },
    unlock: function () {
      if (!this.init()) return;
      if (this.ctx.state === 'suspended') { try { var rp = this.ctx.resume(); if (rp && rp.catch) rp.catch(function () { /* a refused resume is not an error: the next gesture tries again */ }); } catch (e) { /* ignore */ } }
      if (!this.started) { this.started = true; this.applySettings(); }
      this.primeVoice();
    },
    setSettings: function (s) {
      this.sound = s.sound !== false; this.music = s.music !== false; this.haptics = s.haptics !== false;
      this.applySettings();
    },
    applySettings: function () {
      if (!this.ctx || !this.started) return;
      this.sfxGain.gain.value = this.sound ? 1 : 0;
      if (this.music) this.startMusic(); else this.stopMusic();
    },
    tone: function (freq, dur, type, vol, slideTo, delay) {
      if (!this.ctx || !this.sound || !this.started) return;
      var c = this.ctx, t0 = c.currentTime + (delay || 0), o = c.createOscillator(), gn = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.sfxGain); o.start(t0); o.stop(t0 + dur + 0.05);
    },
    noise: function (dur, vol, f0, f1) {
      if (!this.ctx || !this.sound || !this.started) return;
      var c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0), i;
      for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(f0 || 1200, c.currentTime); if (f1) f.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
      gn.gain.value = vol || 0.25; s.connect(f); f.connect(gn); gn.connect(this.sfxGain); s.start();
    },
    sfx: function (name) {
      switch (name) {
        case 'click': this.tone(520, 0.08, 'triangle', 0.25, 760); break;
        case 'eat': this.tone(300, 0.12, 'sine', 0.35, 700); break;
        case 'coin': this.tone(880, 0.08, 'square', 0.14); this.tone(1320, 0.14, 'square', 0.14, null, 0.07); break;
        case 'bump': this.tone(120, 0.15, 'sine', 0.4, 70); break;
        case 'damage': this.tone(220, 0.35, 'sawtooth', 0.3, 80); this.noise(0.25, 0.2, 800, 200); this.vibrate(80); break;
        case 'jump': this.noise(0.3, 0.22, 400, 2200); break;
        case 'splash': this.noise(0.35, 0.28, 2500, 500); break;
        case 'break': this.noise(0.4, 0.3, 1800, 300); this.tone(160, 0.25, 'square', 0.15, 60); break;
        case 'tooBig': this.tone(200, 0.12, 'square', 0.2, 120); break;
        case 'evolve': [392, 523, 659, 784, 1046].forEach(function (f, i) { A.tone(f, 0.28, 'triangle', 0.3, null, i * 0.09); }); this.vibrate(60); break;
        case 'win': [523, 659, 784, 1046].forEach(function (f, i) { A.tone(f, 0.3, 'triangle', 0.3, null, i * 0.12); }); break;
        case 'star': this.tone(1046, 0.18, 'triangle', 0.3); break;
        case 'fail': [330, 262, 196].forEach(function (f, i) { A.tone(f, 0.35, 'sawtooth', 0.22, f * 0.8, i * 0.2); }); break;
        case 'event': this.tone(330, 0.25, 'square', 0.2); this.tone(494, 0.35, 'square', 0.2, null, 0.15); break;
        case 'sonar': this.tone(1500, 0.5, 'sine', 0.12, 900); break;
        case 'ring': this.tone(90, 0.6, 'sawtooth', 0.2, 50); break;
        case 'start': this.tone(262, 0.2, 'triangle', 0.3); this.tone(392, 0.3, 'triangle', 0.3, null, 0.15); break;
        default: break;
      }
    },
    vibrate: function (ms) {
      var ua = g.navigator && g.navigator.userActivation;
      if (ua ? !ua.hasBeenActive : !this.started) return;           // browsers block vibrate before the first tap (console noise)
      if (this.haptics && g.navigator && g.navigator.vibrate) { try { g.navigator.vibrate(ms); } catch (e) { /* ignore */ } } },
    /* ---- CR-4 item 7: the voice line "Go, Dani, go!!!" on every evolution ----
       1. assets/audio/vo_go_dani.(mp3|m4a|ogg) when the manifest lists it (OE.assetManifest.vo_go_dani = { mp3, m4a, ogg }), played through an <audio> element;
       2. otherwise the Web Speech API (speechSynthesis): English voice, rate 1.15, pitch 1.3, one utterance at a time (the previous one is cancelled).
       Respects the Sound toggle, never throws (unsupported = silent), and is primed on the first tap (iOS Safari only speaks / plays after a gesture). Dev log only: voiceLog. */
    voiceLog: [],
    voiceFile: function () {
      var m = OE.assetManifest && OE.assetManifest.vo_go_dani, a;
      if (!m) return null;
      try { a = g.document.createElement('audio'); } catch (e) { return null; }
      var types = [['m4a', 'audio/mp4'], ['mp3', 'audio/mpeg'], ['ogg', 'audio/ogg; codecs=vorbis']], i;
      for (i = 0; i < types.length; i++) if (m[types[i][0]] && a.canPlayType && a.canPlayType(types[i][1])) return m[types[i][0]];
      return m.mp3 || m.m4a || m.ogg || null;
    },
    enVoice: function () {
      var ss = g.speechSynthesis, list, i, pref = /Samantha|Google US English|Aaron|Daniel|Karen|Moira|Microsoft (Aria|Jenny|Guy)/;
      try { list = ss.getVoices ? ss.getVoices() : []; } catch (e) { return null; }
      for (i = 0; i < list.length; i++) if (/^en[-_]US/i.test(list[i].lang) && pref.test(list[i].name)) return list[i];
      for (i = 0; i < list.length; i++) if (/^en[-_]US/i.test(list[i].lang)) return list[i];
      for (i = 0; i < list.length; i++) if (/^en/i.test(list[i].lang)) return list[i];
      return null;
    },
    // first user gesture: iOS Safari only lets speech / audio start after one, so an empty silent utterance and a silent <audio> start are done inside it
    primeVoice: function () {
      if (this.voicePrimed) return;
      this.voicePrimed = true;
      try { var ss = g.speechSynthesis, U = g.SpeechSynthesisUtterance; if (ss && U) { var u = new U(''); u.volume = 0; ss.speak(u); } } catch (e) { /* unsupported */ }
      try {
        var f = this.voiceFile();
        if (f) { this.voEl = new g.Audio(f); this.voEl.preload = 'auto'; this.voEl.muted = true; var pp = this.voEl.play(); if (pp && pp.then) pp.then(function () { A.voEl.pause(); A.voEl.currentTime = 0; A.voEl.muted = false; }).catch(function () { if (A.voEl) A.voEl.muted = false; }); }
      } catch (e2) { /* ignore */ }
    },
    voiceLine: function () {
      if (!this.sound || !this.started) return false;                                   // Sound off = no voice
      var done = false;
      try {
        var f = this.voiceFile();
        if (f) {
          if (!this.voEl) { this.voEl = new g.Audio(f); }
          this.voEl.muted = false; this.voEl.volume = 1; this.voEl.currentTime = 0;
          var p = this.voEl.play(); if (p && p.catch) p.catch(function () { /* a refused play is not an error */ });
          done = true; this.voiceLog.push('file ' + f);
        }
      } catch (e) { done = false; }
      if (!done) {
        try {
          var ss = g.speechSynthesis, U = g.SpeechSynthesisUtterance;
          if (ss && U && ss.speak) {
            if (ss.cancel) ss.cancel();
            var u = new U('Go, Dani, go!'), v = this.enVoice();
            if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
            u.rate = 1.15; u.pitch = 1.3; u.volume = 1;
            ss.speak(u); done = true; this.voiceLog.push('speech ' + (v ? v.name : 'default'));
          }
        } catch (e3) { done = false; }
      }
      if (this.voiceLog.length > 20) this.voiceLog.shift();
      if (g.console && g.console.debug && /[?&]debug=1(&|$)/.test((g.location && g.location.search) || '')) g.console.debug('[voice] go_dani ' + (done ? this.voiceLog[this.voiceLog.length - 1] : 'unsupported'));
      return done;
    },
    // soft pentatonic ambience
    startMusic: function () {
      if (this.musicTimer || !this.ctx) return;
      var self = this, notes = [261.6, 293.7, 329.6, 392, 440, 523.3, 440, 392], bass = [130.8, 98, 110, 87.3];
      this.musicTimer = setInterval(function () {
        if (!self.ctx || !self.music || self.ctx.state !== 'running') return;
        var c = self.ctx, t0 = c.currentTime + 0.05, f = notes[(self.step * 3 + (self.step >> 2)) % notes.length];
        var o = c.createOscillator(), gn = c.createGain();
        o.type = 'sine'; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.5, t0 + 0.1); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
        o.connect(gn); gn.connect(self.musGain); o.start(t0); o.stop(t0 + 1.7);
        if (self.step % 4 === 0) {
          var b = c.createOscillator(), bg = c.createGain(); b.type = 'triangle'; b.frequency.value = bass[(self.step >> 2) % bass.length];
          bg.gain.setValueAtTime(0.0001, t0); bg.gain.exponentialRampToValueAtTime(0.6, t0 + 0.2); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
          b.connect(bg); bg.connect(self.musGain); b.start(t0); b.stop(t0 + 3.5);
        }
        self.step++;
      }, 800);
    },
    stopMusic: function () { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },
    // map a sim event to a sound
    onSimEvent: function (e) {
      try { this.mapEvent(e); } catch (err) { /* sound must never break the game */ }
    },
    mapEvent: function (e) {
      switch (e.type) {
        case 'eat': this.sfx('eat'); break;
        case 'coin': this.sfx('coin'); break;
        case 'bump': this.sfx('bump'); break;
        case 'damage': this.sfx('damage'); break;
        case 'jump': this.sfx('jump'); break;
        case 'land': this.sfx('splash'); break;
        case 'surfaceEat': case 'surfaceBite': this.sfx('break'); break;
        case 'break': this.sfx('break'); break;
        case 'tooBig': this.sfx('tooBig'); break;
        case 'evolve': this.sfx('evolve'); this.voiceLine(); break;
        case 'win': this.sfx('win'); break;
        case 'fail': this.sfx('fail'); break;
        case 'eventStart': this.sfx('event'); break;
        case 'sonar': this.sfx('sonar'); break;
        case 'ring': this.sfx('ring'); break;
        default: break;
      }
    }
  };
  OE.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
