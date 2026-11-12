/* Ocean Evolution - boot: save provider, game controller, stage fit (landscape), render loop,
   audio, input, QA hooks (?qa=1). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  var qa = /[?&]qa=1(&|$)/.test(g.location.search);
  var debug = /[?&]analytics=1(&|$)/.test(g.location.search);
  if (debug || qa) OE.Analytics.verbose = !!debug;

  var app = document.getElementById('app'), stage = document.getElementById('stage'), canvas = document.getElementById('arena-canvas'), arena = document.getElementById('arena');
  var provider = new OE.LocalSaveProvider();
  var game = new OE.Game({ provider: provider, analytics: OE.Analytics, assets: OE.Assets });
  var render = new OE.Render(canvas, game);
  var ui = new OE.UI(game, stage);
  var S = 1, forced = null;

  /* ---- fit: logical stage 1080 high, width = device aspect clamped to 1440..2520 (the centre 1920 is the design area; Figma
     already keeps the 96 / 32 margins), scaled into the available area (safe-area insets via #app padding), letterboxed when
     the aspect is clamped. A viewport taller than wide shows the rotate prompt (Flow F12): the DOM stage then keeps the
     1080-high scale and narrows to 480+ logical px (T_Main_Rotate data-min-w) while the game keeps its landscape view width.
     Below 1700 logical px the HUD uses Layout=Narrow (container query on the stage in ui.css, [data-narrow] as fallback). ---- */
  var U = OE.util, BAL = OE.BAL, Br = OE.Browser;
  Br.init();
  function fit() {
    // BUG-U2: the area is the REAL visible viewport (visualViewport) minus the service zones (env() insets, the host page's :root padding,
    // ?safe=); #app is placed there in px, so browser bars, a host header, notches and the home indicator never cover the stage
    var m = Br.measure(forced);
    app.style.padding = '0'; app.style.right = 'auto'; app.style.bottom = 'auto';
    app.style.left = m.l + 'px'; app.style.top = m.t + 'px'; app.style.width = m.aw + 'px'; app.style.height = m.ah + 'px';
    var aw = m.aw, ah = m.ah, tall = ah > aw;
    // the rotate prompt only where a phone can be turned (touch primary pointer; QA viewports always); a tapped-away prompt stays away (game.dismissRotate)
    var portrait = tall && Br.touchPhone(m.vw, m.vh) && !game.rotateDismissed;
    var viewW = OE.Model.viewWidth(aw, ah);
    var stageW = portrait ? Math.round(U.clamp(BAL.VIEW_H * aw / ah, 480, BAL.VIEW_W_MAX)) : viewW;
    S = Math.max(0.05, Math.min(aw / stageW, ah / BAL.VIEW_H));
    var left = (aw - stageW * S) / 2, top = (ah - BAL.VIEW_H * S) / 2;
    stage.style.width = stageW + 'px'; stage.style.height = BAL.VIEW_H + 'px';
    if (Br.ios) { stage.style.transform = 'none'; stage.style.zoom = S; stage.style.left = (left / S) + 'px'; stage.style.top = (top / S) + 'px'; }      // BUG-U6: CSS zoom lays the stage out at its real size (a transformed 1920 x 1080 stage is rasterized at 1920 x 1080 x dpr^2 by WebKit); left / top are zoomed too
    else { stage.style.zoom = ''; stage.style.transform = 'scale(' + S + ')'; stage.style.left = left + 'px'; stage.style.top = top + 'px'; }
    stage.style.setProperty('--view-w', stageW + 'px');
    stage.setAttribute('data-view-w', stageW);
    if (stageW < BAL.HUD_NARROW_W) stage.setAttribute('data-narrow', ''); else stage.removeAttribute('data-narrow');
    document.documentElement.setAttribute('data-insets', [m.t, m.r, m.b, m.l].map(Math.round).join(','));
    ui.fitGen = (ui.fitGen || 0) + 1;                                   // labels are re-fitted after a layout change (Wide / Narrow copies switch)
    render.resize(viewW * S, Math.min(Br.devDpr(), Br.dprCap()), viewW);      // BUG-U4: mobile tier <= 1.5, lite 1
    game.setView(viewW / BAL.ZOOM);                                   // CR-4: the game works in world units: visible width = view / ZOOM
    game.setPortrait(tall && Br.touchPhone(m.vw, m.vh));
    OE.fitInfo = { vw: m.vw, vh: m.vh, insets: [m.t, m.r, m.b, m.l], area: [m.aw, m.ah], scale: S, stageW: stageW, left: m.l + left, top: m.t + top };
  }
  function setViewport(w, h) {
    forced = w ? [w, h] : null;
    app.style.outline = forced ? '1px solid #345' : '';
    fit();
  }
  Br.watch(fit);

  fit();

  /* ---- input, audio ---- */
  OE.Input.init(game, stage, arena, function () { return S; }, ui);
  OE.Audio.setSettings(game.save.settings);
  game.on('change', function () { OE.Audio.setSettings(game.save.settings); });
  game.on('simEvent', function (e) { OE.Audio.onSimEvent(e); });
  // audio unlocks on the first gesture of any kind (pointer, key, touch); the pointerdown in Input.init also focuses the frame
  ['pointerdown', 'keydown', 'touchstart', 'mousedown'].forEach(function (ev) { g.addEventListener(ev, function () { OE.Audio.unlock(); }, { passive: true, capture: true }); });

  // BUG-U2: the page hidden, or the frame / window losing focus (a click on the host page, another tab, the address bar) pauses a running level;
  // the Pause window resumes it with one tap (no tap is eaten: pointer state is reset on every pause)
  document.addEventListener('visibilitychange', function () { game.setVisibility(document.hidden ? 'hidden' : 'visible'); });
  g.addEventListener('blur', function () {
    setTimeout(function () { if (!document.hasFocus || !document.hasFocus()) game.focusLost(); }, 0);   // hasFocus() is false when the whole frame lost focus
  });
  g.addEventListener('pagehide', function () { game.commit(); Br.bootOk(); });           // left normally: not a crash
  // Fullscreen problems (refused, or unavailable in this frame) show a short toast
  Br.onFullscreenProblem = function (reason, msg) { ui.toast(msg); };

  /* ---- assets, then the loop ---- */
  game.setLoadProgress(0);
  OE.Assets.init();
  // BUG-U4: the crash-loop guard sent this tab into lite mode (the page kept reloading): a small note says so
  if (Br.guardTripped) setTimeout(function () { ui.toast(OE.t('oe_lite_note')); }, 2500);
  OE.Assets.preload(OE.Assets.bootIds(1), function (p) { game.setLoadProgress(p); if (p >= 1 && !Br.bootT && !Br.bootCleared) Br.bootMark(10000); });     // BUG-U6: the crash guard's boot marker is cleared after 10 s of running
  game.on('change', function () { /* ui picks it up in sync() */ });

  var ctxQA = { game: game, ui: ui, input: OE.Input, setViewport: setViewport, fit: fit, afterStep: function () { ui.sync(0); render.draw(16); } };
  if (qa) OE.installQA(ctxQA);

  var last = performance.now(), manual = qa && /[?&]manual=1/.test(g.location.search), errCount = 0, errAt = 0;
  // BUG-U3: one failing frame must never end the loop (a thrown error before requestAnimationFrame froze the game for good). The error is
  // logged, the loop keeps going; if frames keep failing (3 in a row) the level is dropped back to the main screen so the player is never stuck.
  function loop(now) {
    var dt = Math.min(100, now - last); last = now;
    try {
      if (!manual) game.update(dt);
      ui.sync(dt / 1000);
      render.draw(dt);
      errCount = 0;
    } catch (e) {
      errCount++; OE.lastError = e;
      try { if (g.console) g.console.error('[frame error]', e); } catch (e2) { /* ignore */ }
      if (errCount === 3) { try { game.recover(); } catch (e3) { /* ignore */ } }
    }
    g.requestAnimationFrame(loop);
  }
  g.requestAnimationFrame(loop);
  OE.app = { game: game, ui: ui, render: render, fit: fit, provider: provider, loop: loop };
})(typeof window !== 'undefined' ? window : globalThis);
