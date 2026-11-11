/* Ocean Evolution - browser robustness (BUG-U2): the real visible viewport, service zones (browser bars, a host header, notches, home
   indicator), focus helpers and Fullscreen. No game rules here.
   Works in a normal desktop / mobile browser AND inside a sandboxed iframe (the claude.ai artifact viewer).

   Visible area  = visualViewport (falls back to innerWidth / innerHeight), never window.innerHeight alone, minus the "service insets":
     inset(side) = max( env(safe-area-inset-side), padding the HOST writes on :root (the artifact viewer pads :root by the safe-area
                   insets and by its own header), ?safe= override )
   max() (not a sum) so an env() inset that the host already moved into its :root padding is never counted twice.
   ?safe=44            all four sides 44 px          ?safe=24,44        vertical 24, horizontal 44
   ?safe=t,r,b,l       explicit (px)                 (dev / tests: simulates notches and bars on a desktop browser)
   Fullscreen: requestFullscreen on the document element (webkit prefix too), landscape lock where supported, rejections are caught. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  function num(v) { v = parseFloat(v); return isFinite(v) ? v : 0; }
  function parseSafe(search) {
    var m = /[?&]safe=([^&]*)/.exec(search || ''), p;
    if (!m) return null;
    p = decodeURIComponent(m[1]).split(',').map(num);
    if (p.length === 1) return [p[0], p[0], p[0], p[0]];
    if (p.length === 2) return [p[0], p[1], p[0], p[1]];
    if (p.length === 3) return [p[0], p[1], p[2], p[1]];
    return [p[0], p[1], p[2], p[3]];
  }

  var B = {
    override: null,        // [t, r, b, l] px
    probe: null,
    listeners: [],
    // the Fullscreen API behind one small object so tests can replace it with a mock
    api: {
      enabled: function () {
        var d = g.document, el = d.documentElement;
        var en = d.fullscreenEnabled !== undefined ? d.fullscreenEnabled : d.webkitFullscreenEnabled;
        return !!en && !!(el.requestFullscreen || el.webkitRequestFullscreen);
      },
      element: function () { var d = g.document; return d.fullscreenElement || d.webkitFullscreenElement || null; },
      request: function () {
        var el = g.document.documentElement, r = el.requestFullscreen || el.webkitRequestFullscreen;
        var p = r.call(el);
        return p && p.then ? p : Promise.resolve();
      },
      exit: function () {
        var d = g.document, x = d.exitFullscreen || d.webkitExitFullscreen, p = x ? x.call(d) : null;
        return p && p.then ? p : Promise.resolve();
      }
    },
    onFullscreenProblem: null,   // function (reason, message) - set by app.js (shows a toast)

    init: function () {
      this.override = parseSafe(g.location && g.location.search);
    },

    /* ---- insets and viewport ---- */
    envInsets: function () {
      var d = g.document;
      if (!d || !d.body) return [0, 0, 0, 0];
      if (!this.probe) {
        var p = d.createElement('div');
        p.setAttribute('aria-hidden', 'true');
        p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        d.body.appendChild(p); this.probe = p;
      }
      var cs = g.getComputedStyle(this.probe);
      return [num(cs.paddingTop), num(cs.paddingRight), num(cs.paddingBottom), num(cs.paddingLeft)];
    },
    // what the host page (artifact viewer) pads :root / body with
    hostInsets: function () {
      var d = g.document, r = g.getComputedStyle(d.documentElement), b = d.body ? g.getComputedStyle(d.body) : null;
      return [num(r.paddingTop) + (b ? num(b.paddingTop) : 0), num(r.paddingRight) + (b ? num(b.paddingRight) : 0),
        num(r.paddingBottom) + (b ? num(b.paddingBottom) : 0), num(r.paddingLeft) + (b ? num(b.paddingLeft) : 0)];
    },
    insets: function () {
      var e = this.envInsets(), h = this.hostInsets(), o = this.override || [0, 0, 0, 0], out = [], i;
      for (i = 0; i < 4; i++) out.push(Math.max(e[i], h[i], o[i]));
      return out;
    },
    // visible size in CSS px (layout viewport size: a pinch zoom does not shrink the game)
    viewport: function () {
      var vv = g.visualViewport, w, h;
      if (vv && vv.width > 0 && vv.height > 0) { w = vv.width * (vv.scale || 1); h = vv.height * (vv.scale || 1); }
      else { w = g.innerWidth; h = g.innerHeight; }
      var de = g.document.documentElement;
      if (!(w > 0)) w = de.clientWidth; if (!(h > 0)) h = de.clientHeight;
      return [Math.round(w * 100) / 100, Math.round(h * 100) / 100];
    },
    // {vw, vh, t, r, b, l, aw, ah}: the area the game may use = visible viewport minus the service insets
    measure: function (forced) {
      var v = forced || this.viewport(), n = this.insets();
      return { vw: v[0], vh: v[1], t: n[0], r: n[1], b: n[2], l: n[3], aw: Math.max(1, v[0] - n[1] - n[3]), ah: Math.max(1, v[1] - n[0] - n[2]) };
    },
    signature: function () {
      var m = this.measure();
      return [m.vw, m.vh, m.t, m.r, m.b, m.l].join('|');
    },
    // call fn whenever the visible area may have changed: resize, orientation change (iOS reports stale sizes at first: re-checked
    // after 120 and 400 ms), visualViewport resize / scroll (URL bar, keyboard), fullscreen change, pageshow, and a 400 ms poll for
    // changes no event announces (the host padding :root later)
    watch: function (fn) {
      var self = this, last = this.signature(), timer = null;
      function go() { if (g.scrollX || g.scrollY) { try { g.scrollTo(0, 0); } catch (e) { /* ignore */ } } last = self.signature(); fn(); }
      function later() { go(); setTimeout(go, 120); setTimeout(go, 400); }
      g.addEventListener('resize', go);
      g.addEventListener('orientationchange', later);
      g.addEventListener('pageshow', later);
      if (g.visualViewport) { g.visualViewport.addEventListener('resize', go); g.visualViewport.addEventListener('scroll', go); }
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { g.document.addEventListener(ev, later); });
      timer = setInterval(function () { var s = self.signature(); if (s !== last) go(); }, 400);
      return function stop() { clearInterval(timer); };
    },

    // the primary pointer is a finger (phone / tablet): only there a rotate prompt makes sense
    touchOverride: null,       // QA setTouch(on): true / false forces a touch phone / a desktop
    touchPrimary: function () { if (this.touchOverride !== null) return this.touchOverride; try { return !!(g.matchMedia && g.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; } },
    // R-OE-24: the rotate prompt only shows on touch PHONES (coarse pointer, shorter side <= 600 CSS px), never on desktop browsers or tablets
    touchPhone: function (vw, vh) { return this.touchPrimary() && Math.min(vw, vh) <= 600; },

    /* ---- focus ---- */
    // the frame (iframe) and the stage get the keyboard focus; called on every pointerdown so the first tap focuses AND acts
    focus: function (el) {
      try { g.focus(); } catch (e) { /* ignore */ }
      try { if (el && el.focus) el.focus({ preventScroll: true }); } catch (e2) { /* ignore */ }
    },

    /* ---- fullscreen ---- */
    fsSupported: function () { try { return !!this.api.enabled(); } catch (e) { return false; } },
    fsActive: function () { try { return !!this.api.element(); } catch (e) { return false; } },
    isIOS: function () {
      var ua = (g.navigator && g.navigator.userAgent) || '';
      return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && g.navigator.maxTouchPoints > 1);
    },
    problem: function (reason) {
      var msg = reason === 'unsupported' && this.isIOS() ? OE.t('oe_fs_ios') : OE.t('oe_fs_unavailable');
      if (this.onFullscreenProblem) this.onFullscreenProblem(reason, msg);
      return msg;
    },
    // enter or leave fullscreen; resolves true when the state changed or was requested, false when refused / unavailable
    toggleFullscreen: function () {
      var self = this, api = this.api;
      if (!this.fsSupported()) { this.problem('unsupported'); return Promise.resolve(false); }
      try {
        if (this.fsActive()) {
          return api.exit().then(function () { self.unlockOrientation(); return true; }, function () { self.problem('denied'); return false; });
        }
        return api.request().then(function () { self.lockLandscape(); return true; }, function () { self.problem('denied'); return false; });
      } catch (e) { this.problem('denied'); return Promise.resolve(false); }
    },
    lockLandscape: function () {
      try { var o = g.screen && g.screen.orientation; if (o && o.lock) { var p = o.lock('landscape'); if (p && p.catch) p.catch(function () { /* unsupported or refused: ignore */ }); } } catch (e) { /* ignore */ }
    },
    unlockOrientation: function () {
      try { var o = g.screen && g.screen.orientation; if (o && o.unlock) o.unlock(); } catch (e) { /* ignore */ }
    }
  };
  OE.Browser = B;
})(typeof window !== 'undefined' ? window : globalThis);
