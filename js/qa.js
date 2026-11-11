/* Ocean Evolution - QA hooks. window.OE_QA exists only when the URL has ?qa=1 (see js/app.js).
   Contract: AIFigmaPipeline/docs/Ocean_Evolution.spec.json -> qaHooks. Extras beyond the contract (tap, hold, release,
   click, readUi, analytics, setSaveRaw) are listed in README.md. Coordinates: screen = logical stage px (1080 high). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  OE.installQA = function (ctx) {
    var game = ctx.game, ui = ctx.ui, STEP_MS = 1000 / 60, down = false;
    var M = OE.Model;

    function sim() { return game.sim; }
    function frame() { if (ctx.afterStep) ctx.afterStep(); }
    function descend(root, name) {
      var all = root.querySelectorAll('[data-layer]'), i;
      for (i = 0; i < all.length; i++) if (all[i].getAttribute('data-layer') === name) return all[i];
      return null;
    }
    // 'T_Game_Pause/Resume Button', 'T_Game_HUD/Arena', 'Coins Row/Value': window root first, then each segment is
    // searched inside the previous match (so repeated names like Value resolve by their path); a full 'A/B' layer name
    // is tried as a single segment first (Dev hooks such as World Carousel/Track).
    function findLayer(path) {
      var parts = String(path).split('/'), root = document, el;
      if (/^T_/.test(parts[0])) {
        root = document.querySelector('.win[data-screen="' + parts[0] + '"]') || document.querySelector('[data-layer="' + parts[0] + '"]');
        parts.shift();
      }
      if (!root) return null;
      if (!parts.length) return root;
      el = descend(root, parts.join('/'));
      if (el) return el;
      var cur = root;
      for (var i = 0; i < parts.length; i++) {
        var nxt = null;
        if (i + 1 < parts.length) { nxt = descend(cur, parts[i] + '/' + parts[i + 1]); if (nxt) { cur = nxt; i++; continue; } }
        nxt = descend(cur, parts[i]);
        if (!nxt) return null;
        cur = nxt;
      }
      return cur;
    }
    function visible(el) { return !!(el && el.offsetParent !== null || (el && el.getClientRects().length)); }

    var botHook = null;
    // the greedy chase of tests/bot.js: nearest prey (or an eligible surface target), Classic = pointer on it, Side-scroller = a kick when the target is above
    function greedyDecide(s, opts, tapped, lastTap) {
      var p = s.player, U = OE.util, best = null, bd = 1e9, st = null, goal;
      s.creatures.forEach(function (c) {
        if (c.dead || c.faded || c.hidden || c.def.k === 'haz') return;
        if (c.role === 'prey') { var d = U.dist(c.x, c.y, p.x, p.y); if (s.side && c.x < p.x + 40) return; if (d < bd) { bd = d; best = c; } }
      });
      s.surface.forEach(function (t) { if (t.tier <= s.form && !t.dead && (!st || Math.abs(t.x - p.x) < Math.abs(st.x - p.x))) st = t; });
      if (st && s.jumpEligible && s.jumpEligible() && Math.abs(st.x - p.x) < 240) { s.jump(st.x > p.x ? 1 : -1); return; }
      goal = best ? [best.x + (best.vx || 0) * 0.3, best.y + (best.vy || 0) * 0.3] : [p.x, OE.BAL.playerStart.y];
      if (s.side) { if (p.y > goal[1] + 30 && s.t - lastTap > 0.35) { s.sideTap(); tapped(); } return; }
      s.setPointer(goal[0] - s.cam.x, goal[1], true);
    }
    var QA = {
      version: 1,
      state: function () { return game.qaState(); },
      getSave: function () { return OE.util.deepCopy(game.save); },
      setSave: function (obj) {
        game.replaceSave(obj);
        frame();
        return true;
      },
      restart: function () { g.location.reload(); },
      startLevel: function (world, level) {
        game.startLevel(world, level, { skipBanner: true, force: true });
        frame();
        return game.qaState();
      },
      setLevelGP: function (n) { if (sim()) { sim().setLevelGP(n); game.drainSim(); } frame(); return true; },
      setHearts: function (n) { if (sim()) { sim().setHearts(n); game.drainSim(); } frame(); return true; },
      spawn: function (type, x, y, opts) { var s = sim(); if (!s) return null; var c = s.qaSpawn(type, x, y, opts); return c ? (c.id || true) : null; },
      spawnSurface: function (type, x, opts) { var s = sim(); if (!s) return null; var t = s.spawnSurface(type, x === undefined ? 'overPlayer' : x, opts || {}); return t ? t.id : null; },
      teleportPlayer: function (x, y) { if (sim()) sim().teleport(x, y); return true; },
      pointer: function (x, y, isDown) {
        if (isDown) { if (!down) { ctx.input.gesture.down(x, y, performance.now()); down = true; } else ctx.input.gesture.move(x, y, performance.now()); }
        else { ctx.input.gesture.up(x, y, performance.now()); down = false; }
        return true;
      },
      hold: function (x, y) { return QA.pointer(x, y, true); },
      release: function () { var p = sim() ? sim().player.ptr : { x: 0, y: 0 }; return QA.pointer(p.x, p.y, false); },
      // quick tap on the arena (defaults to the player's position)
      tapArena: function (x, y, gapMs) {
        if (gapMs) QA.step(gapMs);                                                       // explicit sim-time gap since the previous action
        var s = sim(); if (s && x === undefined) { x = s.player.x - s.cam.x; y = s.player.y; }   // screen coordinates
        var G = ctx.input.gesture, t = performance.now(); G.down(x, y, t); G.up(x, y, t + 60); down = false; frame(); return true;
      },
      swipe: function (dir, px, ms) {
        px = px === undefined ? 120 : px; ms = ms === undefined ? 200 : ms;
        if (game.mode === 'main' && (dir === 'left' || dir === 'right')) { ui.carouselStep(dir === 'left' ? 1 : -1); return true; }
        var s = sim(), G = ctx.input.gesture, x = s ? s.player.x - s.cam.x : 960, y = s ? s.player.y : 600, t = performance.now(), dx = dir === 'left' ? -px : (dir === 'right' ? px : 0), dy = dir === 'up' ? -px : (dir === 'down' ? px : 0);
        G.down(x, y, t); G.move(x + dx / 2, y + dy / 2, t + ms / 2); G.up(x + dx, y + dy, t + ms); down = false; frame(); return true;
      },
      key: function (name) { return ctx.input.key(name); },
      // exact simulated ms: whole 60 Hz frames, the remainder goes into the game's accumulator (carried to the next call), so n x step(ms) = n x ms of sim time
      step: function (ms) {
        var n = Math.floor(ms / STEP_MS + 1e-9), rem = ms - n * STEP_MS, i;
        for (i = 0; i < n; i++) game.update(STEP_MS);
        if (rem > 1e-6) game.update(rem);
        frame();
        return game.qaState();
      },
      // W4 current in px/s (Side-scroller and Classic); 0 disables it, null restores the world default
      setCurrent: function (v) { var s = sim(); if (!s) return false; s.currentOv = (v === null || v === undefined) ? null : Number(v); return true; },
      seed: function (n) { game.seed(n); return true; },
      // CR-2 hooks
      setControlMode: function (m) { var ok = game.setControlMode(m); frame(); return ok; },
      clearSpawns: function (freeze) { var s = sim(); if (!s || !s.clearSpawns) return false; s.clearSpawns(!!freeze); frame(); return true; },
      // CR-3 hooks: setForm(f) = level GP of form f (events and rewards as in play), setBonusTimer(s), windowBlur() = the frame lost focus (auto-pause)
      setForm: function (f) { if (sim()) { sim().setForm(f); game.drainSim(); } frame(); return true; },
      // spec v4.2: applied at once while the bonus phase is active; otherwise stored and applied when the bonus starts (it survives the 2 s goal banner; 9999 keeps the bonus open)
      setBonusTimer: function (v) { var r = game.run, n = Math.max(0, Number(v) || 0); if (r && r.bonus) { r.bonusT = n; frame(); return true; } game.bonusOverride = n; frame(); return false; },
      windowBlur: function () { game.focusLost(); frame(); return true; },
      // test aids: a different goal form for this level (the goal banner / bonus rules follow it), and no automatic end at goal + 2 (the Finish button and the timer still end the level)
      setGoalForm: function (f) { var s = sim(); if (!s) return false; f = Math.max(1, Math.min(8, Math.round(f))); s.goalForm = f; s.goalGP = OE.Model.gpForForm(f); if (s.form < f) s.goalReached = false; frame(); return true; },
      noAutoEnd: function (on) { game.noAutoEnd = on !== false; return true; },
      setNoAutoEnd: function (on) { return QA.noAutoEnd(on); },
      // emulate a touch phone (pointer coarse) or a desktop for the rotate prompt; null = the real device
      setTouch: function (on) { OE.Browser.touchOverride = on === null || on === undefined ? null : !!on; ctx.fit(); frame(); return true; },
      // spec v4.2: bot('greedy') starts an in-page greedy eating bot (the logic of tests/bot.js): it chases the nearest prey, swims at surface targets, ignores threats and never
      // dies (immortal) unless {careful: true, immortal: false}; bot() / bot('off') / bot(false) stops it. Works in both control modes. Returns true when running.
      bot: function (name, opts) {
        if (name === false || name === 'off' || name === undefined || name === null) { if (botHook) { game.update = botHook.orig; botHook = null; } return false; }
        if (botHook) { game.update = botHook.orig; botHook = null; }
        opts = opts || {};
        var orig = game.update, frames = 0, lastTap = -1e9;
        botHook = { orig: orig };
        game.update = function (dt) {
          var s = sim();
          if (s && game.mode === 'game' && game.run && game.run.phase === 'play' && !s.ended) {
            frames++;
            if (opts.immortal !== false) { s.hearts = Math.max(s.hearts, 3); s.player.invuln = Math.max(s.player.invuln, 0.2); }
            if (frames % 5 === 0) greedyDecide(s, opts, function () { lastTap = s.t; }, lastTap);
          }
          return orig.call(game, dt);
        };
        return true;
      },
      analyticsLog: function () { return OE.Analytics.buffer.slice(); },
      triggerEvent: function (id) { var s = sim(); if (!s) return false; var ok = s.startEvent(id, true); game.drainSim(); frame(); return ok; },
      setVisibility: function (v) { game.setVisibility(v); frame(); return true; },
      goOffline: function () {
        OE.offline = true;
        try { g.name = (g.name || '') + ' oe_offline'; } catch (e) { /* ignore */ }
        try { Object.defineProperty(g.navigator, 'onLine', { get: function () { return false; }, configurable: true }); } catch (e2) { /* ignore */ }
        try { g.dispatchEvent(new Event('offline')); } catch (e3) { /* ignore */ }
        return true;
      },
      blockStorage: function () {
        try { g.name = (g.name || '') + ' oe_block_storage'; } catch (e) { /* ignore */ }
        game.provider.forceBlock = true; game.provider.blocked = true;
        return true;
      },
      viewport: function (w, h) { ctx.setViewport(w, h); return true; },

      /* ---- extras ---- */
      click: function (path) { var el = findLayer(path); if (!el) return false; if (/Arena$/.test(path)) return QA.tapArena(); el.click(); frame(); return true; },
      tap: function (path) { return /Arena$/.test(path || '') || path === undefined ? QA.tapArena() : QA.click(path); },
      exists: function (path) { return !!findLayer(path); },
      readUi: function () {
        var out = { screen: game.top().screen, state: game.top().state, windows: [] };
        Array.prototype.forEach.call(document.querySelectorAll('.win.on'), function (w) {
          var layers = [];
          Array.prototype.forEach.call(w.querySelectorAll('[data-layer]'), function (el) {
            if (!visible(el)) return;
            layers.push({ layer: el.getAttribute('data-layer'), text: (el.children.length === 0 || /^(H1|H2|P|SPAN|B|SMALL|DIV)$/.test(el.tagName)) ? (el.textContent || '').trim().slice(0, 80) : '', cls: el.className && el.className.baseVal === undefined ? el.className : '', state: el.getAttribute('data-state') });
          });
          out.windows.push({ screen: w.getAttribute('data-screen'), state: w.getAttribute('data-state'), layers: layers });
        });
        return out;
      },
      analytics: function (name) { return name ? OE.Analytics.buffer.filter(function (e) { return e.name === name; }) : OE.Analytics.buffer.slice(); },
      sim: function () { return sim(); },
      game: function () { return game; }
    };
    g.OE_QA = QA;
    return QA;
  };
})(typeof window !== 'undefined' ? window : globalThis);
