/* Ocean Evolution - ads (PT4-4, spec v5.6 R-OE-71 / R-OE-72, BAL.ADS). Pure JS, no DOM.
   The game talks to ads ONLY through OE.Ads:
     isReady(placement) -> bool
     showRewarded(placement[, onDone]) -> Promise<{ result: 'rewarded' | 'skipped' | 'failed', reason?: 'no_fill' | 'timeout' | 'error' | 'offline', watchedS }>
       (onDone, when given, is called synchronously with the same result: the game and the QA steps never wait for a microtask)
     setProvider(impl) -> a real network plugs in here later without game changes. impl = { id, isReady(placement), showRewarded(placement, ctl) }
       where ctl.started() is called when the ad is on screen and ctl.done(result) when it ends (or the impl returns a Promise of the result).
   OE.Ads adds the show timeout (BAL.ADS.showTimeoutS: an ad that has not started by then ends as failed / timeout, a late result is ignored)
   and the listeners the game uses for AdShown / audio pause. Timers run on the game UI clock: Game.update calls OE.Ads.update(dt) while the page is visible.
   The built-in placeholder (BAL.ADS.provider 'placeholder') is a full-screen test ad (T_Game_AdPlaceholder, drawn by js/ui.js): a countdown of
   BAL.ADS.PLACEHOLDER.durationS, Close available from closeFromS; Close before the end = skipped, after it (state Complete) = rewarded.
   It never sends ad_impression / TrackAdRevenue (reserved for the real network's observer). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var BAL = OE.BAL;

  /* ---------------------------------------------------------------- the placeholder provider */
  function Placeholder() {
    this.id = 'placeholder';
    this.force = null;          // QA forceAd: { result, reason } for the next show; 'unavailable' keeps isReady false until reset
    this.cur = null;            // the test ad on screen: { placement, t, dur, state: 'Loading' | 'Countdown' | 'Complete', ctl }
    this.lastResult = null;
  }
  Placeholder.prototype.isReady = function () {
    if (this.force && this.force.result === 'unavailable') return false;
    return BAL.ADS.PLACEHOLDER.readyAlways !== false;
  };
  Placeholder.prototype.showRewarded = function (placement, ctl) {
    var f = this.force, P = BAL.ADS.PLACEHOLDER;
    if (f && f.result !== 'unavailable') this.force = null;                                   // a forced result is used once
    if (f && f.result === 'failed') { ctl.done({ result: 'failed', reason: f.reason || 'error', watchedS: 0 }); return; }
    if (f && f.result === 'timeout') { this.cur = { placement: placement, t: 0, dur: P.durationS, state: 'Loading', ctl: ctl, never: true }; return; }   // never starts: OE.Ads ends it at showTimeoutS
    this.cur = { placement: placement, t: 0, dur: P.durationS, load: f && f.result ? 0 : (P.loadS || 0), state: 'Loading', ctl: ctl, forced: f ? f.result : null };
    if (!this.cur.load) this.start();
  };
  Placeholder.prototype.start = function () {
    var c = this.cur; if (!c || c.state !== 'Loading') return;
    c.state = 'Countdown'; c.t = 0; c.ctl.started();
    if (c.forced === 'rewarded') { c.t = c.dur; c.state = 'Complete'; this.close(); }
    else if (c.forced === 'skipped') this.close();
  };
  Placeholder.prototype.update = function (dt) {
    var c = this.cur; if (!c) return;
    if (c.state === 'Loading') { if (c.never) return; c.load -= dt; if (c.load <= 1e-9) this.start(); return; }
    if (c.state === 'Countdown') { c.t = Math.min(c.dur, c.t + dt); if (c.t >= c.dur - 1e-9) c.state = 'Complete'; }
  };
  // the Close Button (and Esc / back): before the end = skipped (watchedS = time watched), in Complete = rewarded
  Placeholder.prototype.close = function () {
    var c = this.cur, P = BAL.ADS.PLACEHOLDER;
    if (!c || c.state === 'Loading') return false;
    if (c.state === 'Countdown' && c.t < (P.closeFromS || 0)) return false;
    this.cur = null;
    var res = c.state === 'Complete' ? { result: 'rewarded', watchedS: c.dur } : { result: 'skipped', watchedS: Math.round(c.t * 100) / 100 };
    c.ctl.done(res);
    return true;
  };
  Placeholder.prototype.cancel = function () { this.cur = null; };                            // OE.Ads gave up (timeout): drop the overlay
  Placeholder.prototype.showing = function () { return !!(this.cur && this.cur.state !== 'Loading'); };
  Placeholder.prototype.info = function () {
    var c = this.cur;
    return { showing: this.showing(), state: c ? c.state : null, remainingS: c && c.state !== 'Loading' ? Math.round(Math.max(0, c.dur - c.t) * 1000) / 1000 : null, placement: c ? c.placement : null, t: c ? c.t : 0, dur: c ? c.dur : BAL.ADS.PLACEHOLDER.durationS };
  };

  /* ---------------------------------------------------------------- OE.Ads */
  var Ads = {
    impl: null, req: null, seq: 0, listeners: [], lastResult: null, placeholder: null,
    setProvider: function (impl) {
      if (this.req) this.finish(this.req, { result: 'failed', reason: 'error', watchedS: 0 });
      this.impl = impl || this.placeholder;
      return this.impl;
    },
    providerId: function () { return this.impl ? (this.impl.id || 'custom') : 'none'; },
    isReady: function (placement) { try { return !!(this.impl && this.impl.isReady(placement)); } catch (e) { return false; } },
    busy: function () { return !!this.req; },
    on: function (fn) { this.listeners.push(fn); },
    emit: function (what, data) { for (var i = 0; i < this.listeners.length; i++) { try { this.listeners[i](what, data); } catch (e) { if (g.console) g.console.error('[ads listener]', e); } } },
    showRewarded: function (placement, onDone) {
      var self = this, resolveP = null, req, p;
      p = typeof Promise !== 'undefined' ? new Promise(function (res) { resolveP = res; }) : null;
      if (this.req) { var busy = { result: 'failed', reason: 'error', watchedS: 0 }; if (onDone) onDone(busy); if (resolveP) resolveP(busy); return p; }
      req = this.req = { id: ++this.seq, placement: placement, t: 0, started: false, done: false, onDone: onDone, resolve: resolveP };
      var ctl = {
        started: function () { if (req.done || req.started) return; req.started = true; self.emit('shown', { placement: placement }); },
        done: function (r) { self.finish(req, r); }
      };
      if (!this.isReady(placement)) { this.finish(req, { result: 'failed', reason: 'no_fill', watchedS: 0 }); return p; }
      try {
        var out = this.impl.showRewarded(placement, ctl);
        if (out && typeof out.then === 'function') out.then(function (r) { ctl.started(); ctl.done(r); }, function () { ctl.done({ result: 'failed', reason: 'error', watchedS: 0 }); });
      } catch (e) { this.finish(req, { result: 'failed', reason: 'error', watchedS: 0 }); }
      return p;
    },
    finish: function (req, r) {
      if (!req || req.done) return;                                            // a late result (after the timeout) is ignored
      req.done = true; if (this.req === req) this.req = null;
      r = r || { result: 'failed', reason: 'error' };
      var out = { result: r.result === 'rewarded' || r.result === 'skipped' ? r.result : 'failed', watchedS: Math.max(0, +r.watchedS || 0) };
      if (out.result === 'failed') out.reason = /^(no_fill|timeout|error|offline)$/.test(r.reason) ? r.reason : 'error';
      this.lastResult = out;
      if (this.impl && this.impl.lastResult !== undefined) this.impl.lastResult = out;
      this.emit('closed', { placement: req.placement, result: out, started: req.started });
      if (req.onDone) req.onDone(out);
      if (req.resolve) req.resolve(out);
    },
    // the game UI clock (frozen while the page is hidden): the show timeout and the placeholder countdown
    update: function (dt) {
      var r = this.req;
      if (this.impl && this.impl.update) this.impl.update(dt);
      if (r && !r.started && !r.done) {
        r.t += dt;
        if (r.t >= BAL.ADS.showTimeoutS - 1e-9) { if (this.impl && this.impl.cancel) this.impl.cancel(); this.finish(r, { result: 'failed', reason: 'timeout', watchedS: 0 }); }
      }
    },
    // the game left the offer (new attempt, main screen, recovery): drop the overlay and end a pending request (its result is ignored by the game)
    abort: function () { if (this.impl && this.impl.cancel) this.impl.cancel(); if (this.req) this.finish(this.req, { result: 'failed', reason: 'error', watchedS: 0 }); },
    // Close Button / Esc / back on an ad the game draws itself (the placeholder); a real network handles its own close
    close: function () { return !!(this.impl && this.impl.close && this.impl.close()); },
    showing: function () { return !!(this.impl && this.impl.showing && this.impl.showing()); },
    info: function () { return this.impl && this.impl.info ? this.impl.info() : { showing: false, state: null, remainingS: null }; }
  };
  Ads.placeholder = new Placeholder();
  Ads.impl = Ads.placeholder;
  OE.Ads = Ads;
  OE.AdsPlaceholder = Placeholder;
})(typeof window !== 'undefined' ? window : globalThis);
