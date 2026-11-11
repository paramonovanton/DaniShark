/* Ocean Evolution - input: one pointer handler for mouse and touch, gesture recognition (swim / tap / swipe up),
   keyboard (Space jump, Esc back, arrows on the carousel). Thresholds from the spec:
   tap < 180 ms and < 15 px; swipe up >= 90 px in < 250 ms within 35 degrees of vertical. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  var TAP_MS = 180, TAP_PX = 15, SWIPE_PX = 90, SWIPE_MS = 250, SWIPE_ANGLE = 35 * Math.PI / 180;

  // Pure gesture recogniser (no DOM): feed it down / move / up with design-space coordinates and a timestamp in ms.
  function Gesture(onSwim, onJump) {
    this.onSwim = onSwim; this.onJump = onJump; this.active = false;
  }
  Gesture.prototype.down = function (x, y, t) {
    this.active = true; this.x0 = x; this.y0 = y; this.t0 = t; this.x = x; this.y = y; this.moved = 0;
    this.onSwim(x, y, true);
  };
  Gesture.prototype.move = function (x, y, t) {
    if (!this.active) return;
    this.x = x; this.y = y;
    var d = Math.sqrt((x - this.x0) * (x - this.x0) + (y - this.y0) * (y - this.y0)); if (d > this.moved) this.moved = d;
    this.onSwim(x, y, true);
  };
  Gesture.prototype.up = function (x, y, t) {
    if (!this.active) return null;
    this.active = false;
    var dx = x - this.x0, dy = y - this.y0, dt = t - this.t0, d = Math.sqrt(dx * dx + dy * dy), kind = null;
    this.onSwim(x, y, false);
    if (dt < TAP_MS && Math.max(d, this.moved) < TAP_PX) kind = 'tap';
    else if (-dy >= SWIPE_PX && dt < SWIPE_MS && Math.abs(Math.atan2(Math.abs(dx), -dy)) <= SWIPE_ANGLE) kind = 'swipe';
    if (kind) this.onJump(kind, x, y, dx);
    return kind;
  };
  Gesture.prototype.cancel = function () { if (this.active) { this.active = false; this.onSwim(this.x, this.y, false); } };

  var In = {
    Gesture: Gesture, THRESH: { TAP_MS: TAP_MS, TAP_PX: TAP_PX, SWIPE_PX: SWIPE_PX, SWIPE_MS: SWIPE_MS, SWIPE_ANGLE_DEG: 35 },
    init: function (game, stageEl, arenaEl, scaleFn, ui) {
      var self = this;
      this.game = game; this.stage = stageEl; this.scaleFn = scaleFn; this.ui = ui;
      this.gesture = new Gesture(function (x, y, down) { game.pointer(x, y, down); }, function (kind, x, y, dx) {
        var sim = game.sim, dir = 0;
        if (sim) { var px = sim.player.x, wx = sim.worldX(x); dir = Math.abs(wx - px) > 30 ? (wx > px ? 1 : -1) : 0; if (kind === 'swipe' && Math.abs(dx) > 30) dir = dx > 0 ? 1 : -1; }
        game.jump(dir);
      });
      function pt(e) {
        var r = stageEl.getBoundingClientRect(), s = scaleFn();
        return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
      }
      function stopPointer() { self.pid = null; self.gesture.cancel(); game.releasePointer(); }
      // BUG-U2: every press, on the arena or on a DOM button, first gives the frame and the stage the keyboard focus, so the first tap both
      // focuses the iframe and acts, and Space / arrows / Esc / P work after any click. Capture phase: runs before any handler can stop the event.
      g.addEventListener('pointerdown', function () { if (OE.Browser) OE.Browser.focus(stageEl); if (OE.Audio) OE.Audio.unlock(); }, true);
      // a pressed DOM button must not keep the keyboard focus (Space would press it again): after the click the stage takes it back
      g.addEventListener('click', function () { var a = document.activeElement; if (a && a !== stageEl && /^(BUTTON|A|INPUT|SELECT)$/.test(a.tagName)) { try { stageEl.focus({ preventScroll: true }); } catch (x) { /* ignore */ } } });
      arenaEl.addEventListener('pointerdown', function (e) {
        if (OE.Audio) OE.Audio.unlock();
        if (e.button !== undefined && e.button > 0) return;
        if (self.pid !== null && self.pid !== undefined && self.pid !== e.pointerId) self.gesture.cancel();   // a stale pointer (its release was never seen) never blocks a new press: the newest press wins
        try { arenaEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        var p = pt(e); self.pid = e.pointerId; self.gesture.down(p[0], p[1], performance.now());
        e.preventDefault();
      });
      arenaEl.addEventListener('pointermove', function (e) {
        if (e.pointerId !== self.pid) return;
        var p = pt(e); self.gesture.move(p[0], p[1], performance.now());
      });
      function end(e) {
        if (e.pointerId !== self.pid) return;
        var p = pt(e); self.pid = null; self.gesture.up(p[0], p[1], performance.now());
        game.releasePointer();                                                                   // Side-scroller: the next press is a new kick
      }
      arenaEl.addEventListener('pointerup', end);
      arenaEl.addEventListener('pointercancel', function (e) { if (e.pointerId === self.pid) stopPointer(); });
      // pointer capture keeps the events coming while the finger / mouse is off the canvas; if the capture is lost anyway, release the gesture
      arenaEl.addEventListener('lostpointercapture', function (e) { if (e.pointerId === self.pid) end(e); });
      // fallback for browsers where capture failed: the release outside the arena still ends the gesture
      g.addEventListener('pointerup', function (e) { if (e.pointerId === self.pid) end(e); });
      g.addEventListener('pointercancel', function (e) { if (e.pointerId === self.pid) stopPointer(); });
      // no context menu, text selection, drag ghost, double-tap zoom, pinch, pull-to-refresh or scrolling while playing
      var appEl = document.getElementById('app') || stageEl;
      ['contextmenu', 'selectstart', 'dragstart'].forEach(function (ev) { appEl.addEventListener(ev, function (e) { e.preventDefault(); }); });
      document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      arenaEl.addEventListener('touchstart', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
      document.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
      ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }); });   // iOS pinch
      document.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });                                          // ctrl + wheel / trackpad pinch zoom
      document.addEventListener('dblclick', function (e) { e.preventDefault(); });
      g.addEventListener('keydown', function (e) {
        if (OE.Audio) OE.Audio.unlock();
        if (e.ctrlKey || e.metaKey || e.altKey) return;                                          // browser shortcuts stay the browser's
        var t = e.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        var code = e.code || e.key;
        if (e.repeat && !/^Arrow(Left|Right)$/.test(code)) { if (/^(Space|ArrowUp|ArrowDown|KeyW|Escape)$/.test(code)) e.preventDefault(); return; }   // a held key does not auto-repeat kicks, pauses or fullscreen toggles
        var used = self.key(code);
        if (used || e.code === 'Space' || e.code === 'Escape' || /^Arrow/.test(e.code)) e.preventDefault();
      });
      g.addEventListener('blur', function () { stopPointer(); });
    },
    key: function (name) {
      var game = this.game;
      if (name === 'Space' || name === ' ' || name === 'space') { game.action(); return true; }
      if (name === 'ArrowUp' || name === 'Up' || name === 'KeyW' || name === 'w' || name === 'W') { if (game.sim && game.mode === 'game') { game.action(); return true; } return false; }
      if (name === 'Escape' || name === 'Esc' || name === 'Back') { game.back(); return true; }
      if (name === 'KeyP' || name === 'p' || name === 'P') { if (game.mode === 'game') { game.back(); return true; } return false; }       // pause / resume
      if (name === 'KeyF' || name === 'f' || name === 'F') { if (OE.Browser) OE.Browser.toggleFullscreen(); return true; }
      if (name === 'ArrowLeft' || name === 'ArrowRight') { if (this.ui) this.ui.carouselStep(name === 'ArrowLeft' ? -1 : 1); return true; }
      return false;
    }
  };
  OE.Input = In;
})(typeof window !== 'undefined' ? window : globalThis);
