/* Ocean Evolution - DOM windows. Binds the generated Figma layouts adopted into index.html (tools/_adopt_ui.py) to the Game state.
   Hooks = data-layer names = Figma layer names (full paths like 'Window/Title' resolve nested); data-screen / data-state on each
   <section class="win">. No rules here: every action calls a Game method.
   Variants: instances with a different look per state (toggle, cards, chips, dots, selector) swap their children from the
   <template data-component data-variant> blocks; hearts, stars and pips only change a sprite / colour. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var BAL = OE.BAL, M = OE.Model, T = OE.t, WORLDS = OE.WORLDS, Art = OE.Art, U = OE.util;

  /* ---------------------------------------------------------------- layer lookup */
  // 'A/B/C': A first in the root, B inside A, ...; a whole 'A/B' that is itself a layer name (Dev hooks) wins
  function one(root, path) {
    var el, parts, cur, i;
    if (path.indexOf('/') >= 0 && (el = root.querySelector('[data-layer="' + path + '"]'))) return el;
    parts = path.split('/'); cur = root;
    for (i = 0; i < parts.length; i++) { cur = cur.querySelector('[data-layer="' + parts[i] + '"]'); if (!cur) return null; }
    return cur;
  }
  // every match (the HUD has a Wide and a Narrow copy with the same layer names)
  function all(root, path) {
    var parts = path.split('/'), list = [root], i, j, k, out, found;
    for (i = 0; i < parts.length; i++) {
      out = [];
      for (j = 0; j < list.length; j++) {
        found = list[j].querySelectorAll('[data-layer="' + parts[i] + '"]');
        for (k = 0; k < found.length; k++) if (out.indexOf(found[k]) < 0) out.push(found[k]);
      }
      list = out;
    }
    return list;
  }
  function setText(el, s) {
    if (!el) return;
    var t = el.classList.contains('k-text') ? (el.querySelector('.t') || el) : el;
    if (t.textContent !== s) t.textContent = s;
  }
  function setOn(el, on) { if (el) el.classList.toggle('on', !!on); }
  function setAttr(el, k, v) { if (el && el.getAttribute(k) !== String(v)) el.setAttribute(k, v); }
  function show(el, on) { if (el && el.hidden === !!on) el.hidden = !on; }
  function setSprite(el, spr) {   // sprite swap on an Image layer: the --spr-* variable carries the file
    if (!el || el.getAttribute('data-sprite') === spr) return;
    el.setAttribute('data-sprite', spr); el.style.backgroundImage = 'var(--spr-' + spr + ')';
  }
  function loc(root) { Array.prototype.forEach.call(root.querySelectorAll('[data-loc]'), function (el) { var k = el.getAttribute('data-loc'); if (k) setText(el, T(k)); }); }

  var SIGNATURE_HINT = { Move: 'oe_hint_move', Eat: 'oe_hint_eat', Jump: 'oe_hint_jump', SideTap: 'oe_hint_side_tap', SideEat: 'oe_hint_side_eat', SideJump: 'oe_hint_side_jump' };
  var NEW_BOSS = { bloop: 'The Bloop', kraken: 'Elder Kraken tentacles' };
  var EVENT_ICON = { pirate: 'Pirate', cargo: 'Cargo', aircraft: 'Aircraft', island: 'Island' };
  var STRIDE1 = 598, STRIDE2 = 548, SCALE_SIDE = 500 / 600;      // carousel: Figma card centres (focused 600x720 card, neighbours 500x600)

  function UI(game, stage) {
    this.game = game; this.stage = stage;
    this.W = {}; this.last = {}; this.cards = []; this.dots = []; this.chips = [];
    this.pos = 0; this.anim = null; this.focusIdx = 0; this.suppressClick = false;
    this.build();
  }
  OE.UI = UI;
  var P = UI.prototype;

  /* ---------------------------------------------------------------- variants and window states */
  P.variant = function (inst, v) {
    if (!inst || inst.__v === v) return false;
    var tpl = this.tpl[inst.getAttribute('data-component') + '|' + v];
    if (!tpl) return false;
    inst.textContent = ''; inst.appendChild(tpl.content.cloneNode(true));
    inst.__v = v; inst.setAttribute('data-variant', v); loc(inst);
    return true;
  };
  // window data-state: shows/hides the layers that exist only in some states (data-show / data-hide) and applies the per-state rect (data-style-<State>)
  P.state = function (win, state) {
    if (win.__state === state) return;
    win.__state = state; win.setAttribute('data-state', state);
    var els = win.__st || (win.__st = Array.prototype.slice.call(win.querySelectorAll('[data-show],[data-hide],[data-style-base]')));
    els.forEach(function (el) {
      var sh = el.getAttribute('data-show'), hd = el.getAttribute('data-hide'), st = el.getAttribute('data-style-' + state);
      if (sh !== null) el.hidden = (' ' + sh + ' ').indexOf(' ' + state + ' ') < 0;
      else if (hd !== null) el.hidden = (' ' + hd + ' ').indexOf(' ' + state + ' ') >= 0;
      if (el.hasAttribute('data-style-base')) el.style.cssText = st !== null ? st : el.getAttribute('data-style-base');
    });
  };
  P.pip = function (inst, filled) {
    var c = inst && inst.firstElementChild; if (!c) return;
    var key = filled ? 'Filled' : 'Empty';
    if (inst.__v === key) return; inst.__v = key; inst.setAttribute('data-variant', 'State=' + key);
    c.style.cssText = this.pipStyle[key];
  };

  P.build = function () {
    var self = this, game = this.game, W = this.W, ids = ['loading', 'select', 'locked', 'pick', 'settings', 'hud', 'hint', 'event', 'start', 'pause', 'evo', 'complete', 'fail', 'world', 'rotate'], i;
    ids.forEach(function (k) { W[k] = document.getElementById('w-' + k); });
    this.tpl = {};
    Array.prototype.forEach.call(document.querySelectorAll('template[data-component]'), function (t) { self.tpl[t.getAttribute('data-component') + '|' + t.getAttribute('data-variant')] = t; });
    var pe = this.tpl['CMP_Cmn_Pip|State=Empty'], pf = this.tpl['CMP_Cmn_Pip|State=Filled'];
    this.pipStyle = { Empty: pe.content.firstElementChild.getAttribute('style'), Filled: pf.content.firstElementChild.getAttribute('style') };
    // BUG-U4: the form / creature art canvases (704x440, 320x200, 256x160 backing stores) are drawn at half the pixels on the mobile tier (they show at a third of that size on a phone)
    if (OE.Browser && OE.Browser.mobileTier && OE.Browser.mobileTier()) {
      var halve = function (root) { Array.prototype.forEach.call(root.querySelectorAll('canvas'), function (c) { if (c.id !== 'arena-canvas' && !c.getAttribute('data-half') && c.width > 64) { c.width = Math.round(c.width / 2); c.height = Math.round(c.height / 2); c.setAttribute('data-half', '1'); } }); };
      halve(document); Array.prototype.forEach.call(document.querySelectorAll('template'), function (t) { halve(t.content); });
    }
    // BUG-U6: Settings > Lite graphics, a copy of the Vibration row in the free right column (under Reset Progress); it takes effect on the next load
    var hr = W.settings && one(W.settings, 'Haptics Row');
    if (hr && !one(W.settings, 'Lite Row')) {
      var lr = hr.cloneNode(true), lt = lr.querySelector('[data-component="CMP_Cmn_Toggle"]'), ll = one(lr, 'Label'), li = one(lr, 'Icon');
      lr.setAttribute('data-layer', 'Lite Row'); lr.setAttribute('data-name', 'Lite Row'); lr.style.left = '520px'; lr.style.right = '30px';
      if (lt) { lt.setAttribute('data-layer', 'Lite Toggle'); lt.setAttribute('data-name', 'Lite Toggle'); }
      if (ll) { ll.setAttribute('data-loc', 'oe_settings_lite'); ll.style.left = '24px'; ll.style.width = '222px'; ll.style.fontSize = '36px'; ll.style.whiteSpace = 'nowrap'; }
      if (li) li.hidden = true;
      hr.parentNode.appendChild(lr);
    }
    loc(document);
    this.arena = document.getElementById('arena');
    this.notice = document.getElementById('notice');
    Object.keys(W).forEach(function (k) { if (W[k]) self.state(W[k], W[k].getAttribute('data-state')); });

    // world select: carousel of 7 cards (Dev-only Track), page dots, arrows
    var sel = W.select;
    this.carousel = one(sel, 'World Carousel'); this.track = one(sel, 'World Carousel/Track'); this.dotEls = [];
    for (i = 1; i <= 7; i++) { this.makeCard(i); this.dotEls.push(one(sel, 'Page Dots/Dot ' + i)); }
    this.bindCarousel();
    one(sel, 'Arrow Prev').addEventListener('click', function () { self.click(); self.carouselStep(-1); });
    one(sel, 'Arrow Next').addEventListener('click', function () { self.click(); self.carouselStep(1); });
    one(sel, 'Top Bar/Settings Button').addEventListener('click', function () { self.click(); game.openSettings(); });
    // BUG-U2: round Fullscreen buttons (World Select top bar, Pause window); hidden where the browser has no Fullscreen API for this frame
    this.fsBtns = [one(sel, 'Top Bar/Fullscreen Button'), one(W.pause, 'Fullscreen Toggle')].filter(Boolean);
    this.fsBtns.forEach(function (b) { b.addEventListener('click', function () { self.click(); if (OE.Browser) OE.Browser.toggleFullscreen(); }); });
    // rotate prompt: a tap dismisses it (play anyway); it comes back only after the view was landscape again
    var dis = one(W.rotate, 'Dismiss Button');
    if (dis) dis.addEventListener('click', function () { self.click(); game.dismissRotate(); if (OE.app) OE.app.fit(); });
    // DEBUG (BAL.DEBUG_UNLOCK): unlock every world and level
    this.dbgBtn = one(sel, 'Debug Unlock Button');
    if (this.dbgBtn) this.dbgBtn.addEventListener('click', function () { self.click(); game.debugUnlockAll(); });
    this.dotEls.forEach(function (d, n) { d.style.cursor = 'pointer'; d.addEventListener('click', function () { self.scrollToCard(n, true); }); });

    // popups
    one(W.locked, 'Toast').addEventListener('click', function () { game.closePopup(); });
    one(W.pick, 'Close Button').addEventListener('click', function () { self.click(); game.closePopup(); });
    for (i = 1; i <= 5; i++) (function (l) {
      var chip = one(W.pick, 'Level Chip #' + l); self.chips.push(chip);
      chip.addEventListener('click', function () { self.click(); game.startLevel(game.main.world, l); });
    })(i);
    one(W.settings, 'Close Button').addEventListener('click', function () { self.click(); game.closePopup(); });
    one(W.settings, 'Reset Progress Button').addEventListener('click', function () { self.click(); game.askReset(); });
    one(W.settings, 'Confirm Button').addEventListener('click', function () { self.click(); game.confirmReset(); });
    one(W.settings, 'Cancel Button').addEventListener('click', function () { self.click(); game.cancelReset(); });
    // control mode selector: Side Hit Area / Classic Hit Area are the tap targets (a click on a label bubbles here too)
    one(W.settings, 'Control Mode Selector').addEventListener('click', function (e) {
      var el = e.target, mode = null;
      while (el && el !== e.currentTarget) { var l = el.getAttribute && el.getAttribute('data-layer'); if (l && /^Side /.test(l)) { mode = 'side'; break; } if (l && /^Classic /.test(l)) { mode = 'classic'; break; } el = el.parentNode; }
      if (mode) { self.click(); game.setControlMode(mode); }
    });
    [W.settings, W.pause].forEach(function (win) {
      Array.prototype.forEach.call(win.querySelectorAll('[data-component="CMP_Cmn_Toggle"]'), function (el) {
        var setting = { 'Sound Toggle': 'sound', 'Music Toggle': 'music', 'Haptics Toggle': 'haptics' }[el.getAttribute('data-layer')];
        if (setting) el.addEventListener('click', function () { self.click(); game.toggleSetting(setting); });
        if (el.getAttribute('data-layer') === 'Lite Toggle') el.addEventListener('click', function () { self.click(); self.toggleLite(); });
      });
    });

    // game windows
    all(W.hud, 'HUD Top/Pause Button').forEach(function (b) { b.addEventListener('click', function () { self.click(); game.pause('button'); }); });
    one(W.pause, 'Resume Button').addEventListener('click', function () { self.click(); game.resume(); });
    one(W.pause, 'Restart Button').addEventListener('click', function () { self.click(); game.restartLevel(); });
    one(W.pause, 'Home Button').addEventListener('click', function () { self.click(); game.askQuit(); });
    one(W.pause, 'Confirm Button').addEventListener('click', function () { self.click(); game.confirmQuit(); });
    one(W.pause, 'Cancel Button').addEventListener('click', function () { self.click(); game.cancelQuit(); });
    one(W.evo, 'Continue Button').addEventListener('click', function () { self.click(); game.evolutionContinue(); });
    one(W.complete, 'Next Button').addEventListener('click', function () { self.click(); game.nextLevel(); });
    one(W.complete, 'Replay Button').addEventListener('click', function () { self.click(); game.replayLevel(); });
    one(W.complete, 'Home Button').addEventListener('click', function () { self.click(); game.goHome(); });
    one(W.fail, 'Retry Button').addEventListener('click', function () { self.click(); game.replayLevel(); });
    one(W.fail, 'Home Button').addEventListener('click', function () { self.click(); game.goHome(); });
    one(W.world, 'Continue Button').addEventListener('click', function () { self.click(); game.worldCompleteContinue(); });

    // HUD: both layouts (Wide, Narrow) carry the same layer names; every value is written to both
    var hud = W.hud;
    this.H = {
      hearts: all(hud, 'HUD Top/Hearts'), lvlLabel: all(hud, 'HUD Top/Level Label/Label'), lvlPips: all(hud, 'HUD Top/Level Label/Pips'),
      portrait: all(hud, 'HUD Top/Creature Chip/Form Portrait'), formName: all(hud, 'HUD Top/Creature Chip/Form Name'), size: all(hud, 'HUD Top/Creature Chip/Size'),
      coin: all(hud, 'HUD Top/Coin Counter'), coinVal: all(hud, 'HUD Top/Coin Counter/Value'), coinIcon: all(hud, 'HUD Top/Coin Counter/Coin Icon'),
      track: all(hud, 'HUD Top/Form Track'),
      fill: all(hud, 'HUD Top/Growth Bar/Fill Clip'), tick: all(hud, 'HUD Top/Growth Bar/Evolution Tick'), gbVal: all(hud, 'HUD Top/Growth Bar/Value')
    };
    this.fillL = this.H.fill.map(function (el) { return parseFloat(el.style.left) || 0; });
    this.vig = one(hud, 'Damage Vignette'); this.jumpInd = one(hud, 'Jump Indicator'); this.boss = one(hud, 'Boss Phase Pips'); this.bossName = one(hud, 'Boss Name'); this.bossArrow = one(hud, 'Boss Arrow'); this.bossHi = one(hud, 'Boss Highlight'); this.bossEat = one(hud, 'Boss Eat Text');
    this.tmplThreat = one(hud, 'Threat Markers/Threat Marker'); this.tmplBig = one(hud, 'Too Big Marker'); this.tmplFloat = one(hud, 'Float Text');
    this.threatBox = one(hud, 'Threat Markers');

    game.on('change', function () { self.changed = true; });
    game.on('simEvent', function (e) { self.onSimEvent(e); });
    this.changed = true;
  };
  // short message at the bottom of the stage (Fullscreen refused / unavailable); never takes input
  P.toast = function (msg) {
    var n = this.notice; if (!n) return;
    n.classList.remove('on'); void n.offsetWidth;
    n.textContent = msg; n.classList.add('info'); n.classList.add('on');
  };
  // browser features of the windows: Fullscreen button state / visibility, the debug control
  P.syncBrowser = function () {
    var Br = OE.Browser, sup = Br ? Br.fsSupported() : false, act = Br ? Br.fsActive() : false, key = (sup ? 1 : 0) + ':' + (act ? 1 : 0) + ':' + (BAL.DEBUG_UNLOCK ? 1 : 0) + ':' + (this.game.debugUnlocked() ? 1 : 0);
    if (this.last.browser === key) return;
    this.last.browser = key;
    var label = T(act ? 'oe_fs_exit' : 'oe_fs_enter'), self = this;
    (this.fsBtns || []).forEach(function (b) {
      // CR-3 kit: World Select = CMP_Cmn_BtnFullscreen Mode=Off / On / Unavailable, Pause = CMP_Cmn_Toggle Value=Off / On (greyed when unavailable)
      if (b.getAttribute('data-component') === 'CMP_Cmn_BtnFullscreen') self.variant(b, sup ? (act ? 'Mode=On' : 'Mode=Off') : 'Mode=Unavailable');
      else { self.variant(b, act ? 'Value=On' : 'Value=Off'); b.classList.toggle('unavail', !sup); }
      b.hidden = false; b.setAttribute('data-fs', act ? 'on' : 'off'); b.setAttribute('data-unavailable', sup ? '0' : '1');
      b.setAttribute('aria-label', label); b.setAttribute('title', sup ? label : T('oe_fs_unavailable')); b.setAttribute('aria-pressed', act ? 'true' : 'false');
    });
    if (this.dbgBtn) { this.dbgBtn.hidden = !BAL.DEBUG_UNLOCK; this.dbgBtn.setAttribute('data-on', this.game.debugUnlocked() ? '1' : '0'); }
  };
  // shrink-to-fit for one-line labels in fixed boxes (Best Form Chip, HUD Creature Chip: "Mosasaurus"): the font size drops until the text fits; hidden copies (Wide / Narrow HUD) are fitted when they show
  P.fitText = function (el, text) {
    if (!el) return;
    var key = text + '|' + (this.fitGen || 0);
    if (el.__fk === key) return;
    el.style.fontSize = ''; setText(el, text);
    if (!el.clientWidth) { el.__fk = null; return; }
    var fs = parseFloat(g.getComputedStyle(el).fontSize) || 32, n = 0;
    while (n++ < 12 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && fs > 12) { fs *= 0.92; el.style.fontSize = fs.toFixed(1) + 'px'; }
    el.__fk = key;
  };
  P.click = function () { if (OE.Audio) { OE.Audio.unlock(); OE.Audio.sfx('click'); } };

  /* ---------------------------------------------------------------- world cards + carousel */
  P.makeCard = function (n) {
    var self = this, card = document.createElement('div');
    card.className = 'k-instance card'; card.setAttribute('data-layer', 'World Card #' + n); card.setAttribute('data-component', 'CMP_Main_WorldCard');
    this.variant(card, 'State=Locked');
    card.addEventListener('click', function () {
      if (self.suppressClick) return; self.click();
      if (self.game.worldState(n) !== 'Available' && !self.game.main.popup) self.scrollToCard(n - 1, true);
      self.game.tapWorld(n);
    });
    this.track.appendChild(card); this.cards.push(card);
  };
  // fill one card from the save: variant (state), texts, preview art, pips
  P.fillCard = function (card, n, st, wv) {
    var look = st === 'New' ? 'New' : st;
    var changed = this.variant(card, 'State=' + look);
    var key = look + ':' + (wv.completed ? 5 : wv.levelsCompleted);
    if (!changed && card.__key === key) return;
    card.__key = key;
    var prev = one(card, 'Preview Art'); if (prev) { prev.setAttribute('data-sprite', 'SPR_UI_Img_Main_WorldPreview_' + n); prev.style.backgroundImage = 'var(--spr-SPR_UI_Img_Main_WorldPreview_' + n + ')'; }
    setText(one(card, 'World Num'), T('oe_world_num', n));
    setText(one(card, 'World Name'), T('oe_world_name_' + n));
    var done = wv.completed ? 5 : wv.levelsCompleted;
    setText(one(card, 'Status Text'), st === 'Locked' ? T('oe_card_locked') : (st === 'Completed' ? T('oe_card_completed') : T('oe_card_level', Math.min(5, done + 1))));
    var pips = one(card, 'Level Pips');
    for (var k = 0; k < 5; k++) this.pip(pips.children[k], k < done);
  };
  function offsetOf(d) { var a = Math.abs(d), o = a <= 1 ? STRIDE1 * a : STRIDE1 + (a - 1) * STRIDE2; return d < 0 ? -o : o; }
  P.layoutCards = function () {
    var i, d, s, c, a;
    for (i = 0; i < this.cards.length; i++) {
      c = this.cards[i]; d = i - this.pos; a = Math.abs(d); s = 1 - (1 - SCALE_SIDE) * Math.min(1, a);
      c.style.transform = 'translateX(' + offsetOf(d).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
      c.style.zIndex = String(100 - Math.round(a * 10));
      c.style.display = a > 3.2 ? 'none' : '';
    }
    var best = Math.round(this.pos), j;
    best = U.clamp(best, 0, 6);
    if (best !== this.focusIdx || !this.dotsInit) { this.focusIdx = best; this.dotsInit = true; this.game.main.focus = best + 1; }
    for (j = 0; j < this.dotEls.length; j++) this.variant(this.dotEls[j], j === best ? 'State=Active' : 'State=Inactive');
    one(this.W.select, 'Arrow Prev').disabled = best === 0; one(this.W.select, 'Arrow Next').disabled = best === 6;
  };
  P.scrollToCard = function (i, animate) {
    var self = this; i = U.clamp(i, 0, 6);
    this.focusIdx = i; this.game.main.focus = i + 1;
    if (!animate || Math.abs(this.pos - i) < 0.001) { this.anim = null; this.pos = i; this.layoutCards(); return; }
    this.anim = { from: this.pos, to: i, t: 0, dur: 0.25 };
    // keep the state correct even when the page does not render frames (hidden tab)
    setTimeout(function () { if (self.anim && self.anim.to === i) { self.anim = null; self.pos = i; self.layoutCards(); } }, 450);
  };
  P.carouselStep = function (d) { if (this.game.mode !== 'main' || this.game.main.popup) return false; this.scrollToCard(Math.round(this.pos) + d, true); return true; };
  P.bindCarousel = function () {
    var self = this, c = this.carousel, drag = null;
    c.addEventListener('pointerdown', function (e) {
      if (self.game.main.popup) return;
      var s = OE.Browser && OE.Browser.ios && OE.fitInfo ? OE.fitInfo.scale : self.stage.getBoundingClientRect().width / self.stage.offsetWidth, now = performance.now();
      drag = { x: e.clientX, pos: self.pos, s: s || 1, dx: 0, moved: false, lastX: e.clientX, lastT: now, v: 0 };
      self.anim = null;
    });
    g.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.x) / drag.s;
      if (Math.abs(dx) > 8) drag.moved = true;
      if (drag.moved) {
        self.pos = U.clamp(drag.pos - dx / STRIDE1, -0.3, 6.3); self.layoutCards();
        var now = performance.now(); drag.v = (drag.lastX - e.clientX) / drag.s / Math.max(1, now - drag.lastT); drag.lastX = e.clientX; drag.lastT = now;
      }
      drag.dx = dx;
    });
    function end() {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.moved) {
        self.suppressClick = true; setTimeout(function () { self.suppressClick = false; }, 60);
        var idx = Math.round(self.pos);
        if (Math.abs(d.v) > 0.35 && Math.abs(d.dx) > 40 && Math.abs(self.pos - idx) < 0.4) idx += d.dx < 0 ? 1 : -1;
        self.scrollToCard(idx, true);
      }
    }
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    c.addEventListener('wheel', function (e) { e.preventDefault(); if (self.wheelLock) return; self.wheelLock = true; setTimeout(function () { self.wheelLock = false; }, 300); self.carouselStep((e.deltaY || e.deltaX) > 0 ? 1 : -1); }, { passive: false });
  };

  /* ---------------------------------------------------------------- per-frame sync */
  P.sync = function (dt) {
    var game = this.game, W = this.W, top = game.top(), m = game.main, r = game.run, mode = game.mode;
    var phase = r ? r.phase : '', popup = m.popup;
    if (this.anim) {
      var a = this.anim; a.t += dt; var k = Math.min(1, a.t / a.dur), e = 1 - Math.pow(1 - k, 3);
      this.pos = a.from + (a.to - a.from) * e; this.layoutCards();
      if (k >= 1) this.anim = null;
    }
    setOn(W.loading, mode === 'loading');
    setOn(W.select, mode === 'main');
    setOn(W.locked, mode === 'main' && popup === 'locked');
    setOn(W.pick, mode === 'main' && popup === 'levelpick');
    setOn(W.settings, mode === 'main' && popup === 'settings');
    var inGame = mode === 'game';
    setOn(W.hud, inGame && phase !== 'start');
    W.hud.classList.toggle('live', inGame && phase === 'play');
    setOn(W.start, inGame && phase === 'start');
    setOn(W.hint, inGame && phase === 'play' && !!game.hint);
    setOn(W.event, inGame && phase === 'play' && !!game.banner);
    setOn(W.pause, inGame && phase === 'pause');
    setOn(W.evo, inGame && (phase === 'evolution' || (phase === 'play' && (r.evoLightT > 0 || r.krakenT > 0))));
    setOn(W.complete, inGame && phase === 'complete');
    setOn(W.fail, inGame && phase === 'fail');
    setOn(W.world, inGame && phase === 'worldcomplete');
    setOn(W.rotate, !!game.rotate);
    this.syncBrowser();
    setAttr(this.stage, 'data-current-screen', top.screen); setAttr(this.stage, 'data-current-state', top.state);   // not data-screen: that name belongs to the windows
    if (mode === 'loading') this.syncLoading();
    if (mode === 'main') this.syncMain();
    if (popup === 'locked' && mode === 'main') this.syncLocked();
    if (popup === 'levelpick' && mode === 'main') this.syncPick();
    if (mode === 'main') { this.state(W.settings, m.popupState); this.syncSettings(W.settings); }
    if (inGame) this.syncGame(top, dt);
    // storage notice (once)
    if (game.provider.blocked && !this.noticeShown && game.mode !== 'loading') {
      this.noticeShown = true; setText(this.notice, T('oe_notice_nosave')); this.notice.classList.remove('info'); this.notice.classList.add('on');
    }
  };
  // BUG-U6: Lite graphics on / off: kept in localStorage; the page restarts so the tier (what is decoded, the canvas resolution) changes now (not under ?qa=1)
  P.toggleLite = function () {
    var Br = OE.Browser, on = !(Br.litePref || Br.lite);
    Br.setLitePref(on); this.game.track('SettingChanged', { setting: 'lite', value: String(on) }); this.game.commit();
    this.W.settings.__v = null; this.syncSettings(this.W.settings);
    if (!/[?&]qa=1(&|$)/.test(g.location.search)) { this.toast(T('oe_lite_restart')); g.setTimeout(function () { try { g.location.reload(); } catch (e) { /* ignore */ } }, 900); }
  };
  // toggles (Value=On/Off), control mode selector (Selected=Side/Classic) and its hint
  P.syncSettings = function (win) {
    var s = this.game.save.settings, self = this;
    Array.prototype.forEach.call(win.querySelectorAll('[data-component="CMP_Cmn_Toggle"]'), function (el) {
      var setting = { 'Sound Toggle': 'sound', 'Music Toggle': 'music', 'Haptics Toggle': 'haptics' }[el.getAttribute('data-layer')];
      if (!setting) return;                                                   // the Pause Fullscreen Toggle follows the Fullscreen API (syncBrowser)
      var on = !!s[setting];
      self.variant(el, on ? 'Value=On' : 'Value=Off'); el.setAttribute('aria-checked', on);
    });
    var lite = one(win, 'Lite Toggle'), Br = OE.Browser;
    if (lite && Br) { var lon = !!(Br.litePref || Br.lite); self.variant(lite, lon ? 'Value=On' : 'Value=Off'); lite.setAttribute('aria-checked', lon); }
    var sel = one(win, 'Control Mode Selector');
    if (sel) {
      this.variant(sel, s.controlMode === 'classic' ? 'Selected=Classic' : 'Selected=Side');
      setText(one(win, 'Control Mode Hint'), T(s.controlMode === 'classic' ? 'oe_settings_control_classic_hint' : 'oe_settings_control_side_hint'));
    }
  };
  P.syncLoading = function () {
    var g2 = this.game, W = this.W.loading, p = Math.min(g2.loadProgress, g2.loadT / g2.loadMin);
    p = Math.max(0.04, Math.min(1, p));
    var clip = one(W, 'Loading Bar/Fill Clip'), L = parseFloat(clip.style.left) || 0;
    clip.style.width = (p * (100 - 2 * L)).toFixed(2) + '%';
    one(W, 'Fish Runner').style.left = 'calc(50% + ' + (-480 + 960 * p - 50).toFixed(1) + 'px)';
    setText(one(W, 'Tip Text'), T(g2.tip));
  };
  P.syncMain = function () {
    var game = this.game, sv = game.save, W = this.W.select, m = game.main, i;
    if (this.appliedEnter !== game.mainEnterId) {
      this.appliedEnter = game.mainEnterId;
      this.scrollToCard(m.focus - 1, false);
    }
    var sig = JSON.stringify([sv.coins, sv.stats.bestForm, sv.worlds, m.state, m.newWorld, m.newT > 0, game.debugUnlocked(), this.fitGen || 0]);
    var coinEl = one(W, 'Top Bar/Coin Counter/Value');
    if (this.last.coins !== sv.coins) { setText(coinEl, String(sv.coins)); this.last.coins = sv.coins; }
    this.state(W, m.state);
    if (this.last.mainSig !== sig || this.last.mainEnter !== this.game.mainEnterId) {
      this.last.mainSig = sig; this.last.mainEnter = this.game.mainEnterId;
      var form = sv.stats.bestForm || 1;                                            // CR-3: the Best Form Chip shows the best form reached in any level
      this.fitText(one(W, 'Top Bar/Best Form Chip/Form Name'), T('oe_best_form', T('oe_form_name_' + form)));
      if (this.last.formIcon !== form) { Art.icon(one(W, 'Top Bar/Best Form Chip/Form Portrait'), form); this.last.formIcon = form; }
      for (i = 1; i <= 7; i++) {
        var st = M.worldState(sv, i), card = this.cards[i - 1], pulse = m.state === 'NewWorldUnlocked' && m.newT > 0 && i === m.newWorld;
        card.setAttribute('data-state', st);
        this.fillCard(card, i, pulse ? 'New' : st, sv.worlds[i]);
        card.classList.toggle('pulse', pulse);
      }
      this.layoutCards();
    }
  };
  P.syncLocked = function () {
    var m = this.game.main, W = this.W.locked;
    setText(one(W, 'Toast/World Name'), T('oe_locked_title', T('oe_world_name_' + m.world)));
    setText(one(W, 'Toast/Unlock Hint'), T('oe_locked_hint', T('oe_world_name_' + Math.max(1, m.world - 1))));
    var card = this.cards[m.world - 1];
    if (card && this.shakeFor !== m.timer && m.timer > BAL.lockedToastS - 0.1) { this.shakeFor = m.timer; card.classList.add('shake'); setTimeout(function () { card.classList.remove('shake'); }, 420); }
  };
  P.syncPick = function () {
    var game = this.game, W = this.W.pick, m = game.main, sv = game.save, self = this;
    var key = m.world + ':' + JSON.stringify(sv.worlds[m.world].stars) + JSON.stringify(sv.worlds[m.world].bestForm);
    if (this.last.pick === key) return;
    this.last.pick = key;
    setText(one(W, 'Window/World Name'), T('oe_pick_title', T('oe_world_name_' + m.world)));
    for (var l = 1; l <= 5; l++) {
      var chip = this.chips[l - 1], st = sv.worlds[m.world].stars[l - 1] || 0;
      this.variant(chip, (l === 5 ? 'State=Final' : 'State=Default') + ', Stars=' + st);
      setText(one(chip, 'Level Number'), String(l));
    }
  };

  /* ---------------------------------------------------------------- game windows */
  // names (and the first creature id) of what is new in this level
  P.newCreatures = function (world, level) {
    var ld = WORLDS[world - 1].levels[level - 1], prev = level > 1 ? WORLDS[world - 1].levels[level - 2] : null, names = [], ids = [];
    function list(l) {
      var out = []; if (!l) return out;
      (l.food || []).forEach(function (a) { out.push(a[0]); }); (l.pred || []).forEach(function (a) { out.push(a[0]); });
      (l.haz || []).forEach(function (a) { out.push(a[0]); }); (l.pas || []).forEach(function (a) { out.push(a[0]); });
      return out;
    }
    var cur = list(ld), old = list(prev);
    cur.forEach(function (id) { if (old.indexOf(id) < 0 && names.indexOf(OE.CREATURES[id].n) < 0) { names.push(OE.CREATURES[id].n); ids.push(id); } });
    if (ld.boss && (!prev || prev.boss !== ld.boss)) { names.push(NEW_BOSS[ld.boss]); ids.push(ld.boss); }
    if (level === 1) { names = names.slice(0, 2); ids = ids.slice(0, 2); }
    // the Figma line fits about 16 characters after "New: ": add names while they fit
    var text = names[0] || '', n;
    for (n = 1; n < names.length && n < 3; n++) { if ((text + ', ' + names[n]).length > 16) break; text += ', ' + names[n]; }
    return { text: text, id: ids[0] };
  };
  P.syncGame = function (top, dt) {
    var game = this.game, r = game.run, s = game.sim, W = this.W, sv = game.save, p = s.player, H = this.H, i, j;
    // --- HUD values (Wide and Narrow copies)
    var hud = W.hud;
    this.state(hud, game.hudState());
    H.hearts.forEach(function (inst) {
      var hs = inst.querySelectorAll('[data-layer^="Heart "]');
      for (var n = 0; n < hs.length; n++) {
        var empty = n >= s.hearts, was = hs[n].getAttribute('data-sprite') === 'SPR_UI_Icn_Cmn_HeartEmpty';
        setSprite(hs[n], empty ? 'SPR_UI_Icn_Cmn_HeartEmpty' : 'SPR_UI_Icn_Cmn_HeartFull');
        if (empty && !was && this.last.hudHearts !== undefined) { hs[n].classList.remove('hpop'); void hs[n].offsetWidth; hs[n].classList.add('hpop'); }
      }
    }, this);
    this.last.hudHearts = s.hearts;
    var form = s.form;
    if (this.last.hudForm !== form) { H.portrait.forEach(function (cv) { Art.icon(cv, form); }); this.last.hudForm = form; }
    H.formName.forEach(function (el) { this.fitText(el, T('oe_form_name_' + form)); }, this);
    var sz = Math.round(s.S * 10) / 10, szText = T('oe_hud_size', sz % 1 === 0 ? String(sz) : sz.toFixed(1));
    H.size.forEach(function (el) { setText(el, szText); });
    if (this.last.hudCoins !== sv.coins) {
      H.coinVal.forEach(function (el) { setText(el, String(sv.coins)); });
      if (this.last.hudCoins !== undefined) H.coinIcon.forEach(function (cc) { cc.classList.remove('pulse'); void cc.offsetWidth; cc.classList.add('pulse'); });
      this.last.hudCoins = sv.coins;
    }
    var lvl = T('oe_hud_level', T('oe_world_name_' + r.world), r.level);
    H.lvlLabel.forEach(function (el) { setText(el, lvl); });
    H.lvlPips.forEach(function (box) { for (var k = 0; k < 5; k++) this.pip(box.children[k], k < r.level); }, this);
    var pct = M.formProgress(s.levelGP);                                                 // CR-3: the Growth Bar fills toward the NEXT form and restarts at every evolution
    H.fill.forEach(function (el, n) { var L = this.fillL[n]; el.style.width = (pct * (100 - 2 * L)).toFixed(2) + '%'; }, this);
    H.gbVal.forEach(function (el) { setText(el, Math.round(pct * 100) + '%'); });
    H.tick.forEach(function (el) { show(el, false); });
    // Form Track: the 8 forms (Reached / Current / Next / Beyond, the goal form carries the flag)
    var trKey = form + ':8';
    if (this.last.track !== trKey) {
      this.last.track = trKey;
      for (j = 1; j <= 8; j++) {
        var st = j < form ? 'Reached' : (j === form ? 'Current' : (j === form + 1 ? 'Next' : 'Beyond'));
        all(hud, 'HUD Top/Form Track/Form ' + j).forEach(function (inst) {
          this.variant(inst, 'State=' + st + ', Goal=' + (j === s.goalForm ? 'Yes' : 'No'));
          var pc = one(inst, 'Form Portrait'); if (pc && pc.tagName === 'CANVAS') Art.icon(pc, j);
        }, this);
      }
    }
    // CR-4 v5.1 (R-OE-52): level 5 of every world is a boss level: Boss Phase Pips (2 or 3 phases) and the Boss Name
    var bs = s.bossState ? s.bossState() : null, isBoss = !!bs;
    show(this.boss, isBoss); show(this.bossName, isBoss);
    if (isBoss) {
      for (i = 0; i < 3; i++) { var bp = one(this.boss, 'Phase ' + (i + 1)); if (bp) { show(bp, i < bs.pips); this.pip(bp, i < bs.phase); } }
      setAttr(this.boss, 'data-phase', bs.phase); setText(this.bossName, T('oe_boss_name_' + r.world));
    }
    // BossFinale (R-OE-53): the stunned boss gets the highlight ring, the arrow and the "Eat the boss!" text on its screen position
    if (top.state === 'BossFinale' && s.finaleBoss) {
      var fb = s.finaleBoss, bx = s.scrX(fb.x), by = s.scrY(fb.y);
      if (this.bossHi) { var bw = Math.max(140, fb.len * BAL.ZOOM * 1.2); this.bossHi.style.left = (bx - bw / 2) + 'px'; this.bossHi.style.top = (by - bw * 0.35) + 'px'; this.bossHi.style.width = bw + 'px'; this.bossHi.style.height = (bw * 0.7) + 'px'; }
      if (this.bossArrow) { this.bossArrow.style.left = (bx - 60) + 'px'; this.bossArrow.style.top = (by - fb.len * BAL.ZOOM * 0.45 - 150) + 'px'; this.bossArrow.style.transformOrigin = '50% 50%'; this.bossArrow.style.transform = 'rotate(90deg)'; }
      if (this.bossEat) setText(this.bossEat, T('oe_hud_boss_eat'));
    }
    // jump indicator on the player (state = component variant Ready / Cooldown)
    var ji = this.jumpInd, js = s.jumpState(), jst = js.airborne ? 'Hidden' : (js.eligible ? 'Ready' : (js.cooldown > 0 && (p.y - s.waterY) <= BAL.BODY.jumpBL.classic * p.len ? 'Cooldown' : 'Hidden'));
    setAttr(ji, 'data-state', jst); show(ji, jst !== 'Hidden');
    if (jst !== 'Hidden') { this.variant(ji, 'State=' + jst); ji.style.left = s.scrX(p.x) + 'px'; ji.style.top = s.scrY(p.y) + 'px'; }
    if (game.damagedT > BAL.invuln - 0.05 && this.last.vigT !== game.damagedT && !this.vigOn) { this.vigOn = true; this.vig.classList.remove('flash'); void this.vig.offsetWidth; this.vig.classList.add('flash'); }
    if (game.damagedT <= 0) this.vigOn = false;

    this.syncMarkers(s);
    this.syncThreats(s);
    // --- hint
    if (game.hint && r.phase === 'play') this.syncHint();
    // --- banner
    if (game.banner) {
      var ev = OE.EVENTS[game.banner.id], we = W.event;
      setText(one(we, 'Event Title'), T(ev.title)); setText(one(we, 'Event Hint'), T(ev.hint)); setAttr(we, 'data-state', game.banner.id);
      setSprite(one(we, 'Event Icon'), 'SPR_UI_Icn_Game_Event' + EVENT_ICON[ev.icon]);
    }
    // --- per-phase windows (filled once per run / result)
    switch (r.phase) {
      case 'start': this.syncStart(r); break;
      case 'pause': this.state(W.pause, r.pauseState); this.syncSettings(W.pause); break;
      case 'evolution': this.syncEvo(r); break;
      case 'play': if (r.evoLightT > 0 || r.krakenT > 0) this.syncEvo(r); break;
      case 'complete': this.syncComplete(r); break;
      case 'fail': this.syncFail(r); break;
      case 'worldcomplete': this.syncWorld(r); break;
      default: break;
    }
  };
  // Too Big Marker (Figma: pill with X and "Too big") above surface targets the current form cannot eat
  P.syncMarkers = function (s) {
    var list = [], i, hud = this.W.hud;
    for (i = 0; i < s.surface.length; i++) if (!s.surface[i].dead && s.surface[i].tier > s.form) list.push(s.surface[i]);
    this.markers = this.markers || [];
    while (this.markers.length < list.length) {
      var el = this.tmplBig.cloneNode(true); el.removeAttribute('data-template'); el.hidden = true;
      hud.appendChild(el); this.markers.push(el);
    }
    for (i = 0; i < this.markers.length; i++) {
      var m = this.markers[i], t = list[i];
      if (!t) { show(m, false); continue; }
      var show1 = t.tb > 0 || Math.abs(s.player.x - t.x) < t.w;
      show(m, show1);
      if (show1) { m.style.left = (s.scrX(t.x) - 110) + 'px'; m.style.top = (s.scrY(t.y - t.h / 2) - 90) + 'px'; m.setAttribute('data-target', t.type); }
    }
  };
  P.syncHint = function () {
    var game = this.game, W = this.W.hint, kind = game.hint, s = game.sim, p = s.player;
    this.state(W, kind);
    setText(one(W, 'Hint Text'), T(SIGNATURE_HINT[kind]));
    W.style.setProperty('--hint-dy', (s.scrY(p.y + p.len * 0.3) > 600 ? -420 : 0) + 'px');       // plate (y 640-880) moves up when the player is low
    var arrow = one(W, 'Hint Arrow'), prey = one(W, 'Prey Arrow'), danger = one(W, 'Danger Marker');
    if (kind === 'SideTap' && arrow) { arrow.style.left = (s.scrX(p.x) - arrow.offsetWidth / 2) + 'px'; arrow.style.top = Math.max(120, s.scrY(p.y - p.len * 0.3) - arrow.offsetHeight - 10) + 'px'; }      // above the shark (it rests on the seabed)
    if (kind === 'SideJump' && arrow) { arrow.style.left = (s.scrX(p.x) - arrow.offsetWidth / 2) + 'px'; arrow.style.top = Math.max(90, s.scrY(s.waterY) - 170) + 'px'; }
    if (kind === 'SideEat') {
      var best = null, bd = 1e9, i, c;
      for (i = 0; i < s.creatures.length; i++) { c = s.creatures[i]; if (c.role !== 'prey' || c.hidden || c.x < p.x) continue; var d = U.dist(c.x, c.y, p.x, p.y); if (d < bd) { bd = d; best = c; } }
      show(prey, !!best);
      if (best && prey) { prey.style.left = (s.scrX(best.x - best.len * 0.5) - prey.offsetWidth - 20) + 'px'; prey.style.top = (s.scrY(best.y) - prey.offsetHeight / 2) + 'px'; }
      var thr = s.threatMarkers(), red = null;
      for (i = 0; i < thr.length; i++) if (thr[i].kind === 'red') { red = thr[i]; break; }
      if (danger) { show(danger, !!red); if (red) { danger.style.left = (s.viewW * BAL.ZOOM - 96 - danger.offsetWidth) + 'px'; danger.style.top = (Math.max(190, Math.min(1000, s.scrY(red.y))) - danger.offsetHeight / 2) + 'px'; } }
    }
  };
  // Side-scroller: Threat Markers at the right edge (lane height) for incoming predators, ambushers, hazards (red = Kind=Threat) and surface
  // targets (yellow = Kind=Surface); a Threat Marker "!" over a creature that is about to dash / strike / ping
  P.syncThreats = function (s) {
    var box = this.threatBox, list = s.threatMarkers(), i, tm = this.tmplThreat, self = this;
    function clampY(y) { return Math.max(190, Math.min(1000, y)); }
    function mk(layer) { var el = tm.cloneNode(true); el.removeAttribute('data-template'); el.setAttribute('data-layer', layer); el.hidden = true; el.style.right = 'auto'; box.appendChild(el); return el; }
    this.threatEls = this.threatEls || [];
    while (this.threatEls.length < list.length) this.threatEls.push(mk('Threat Marker'));
    for (i = 0; i < this.threatEls.length; i++) {
      var e2 = this.threatEls[i], m = list[i];
      if (!m) { show(e2, false); continue; }
      var sy1 = s.scrY(m.y), dir1 = sy1 < 190 ? 'Up' : (sy1 > 1000 ? 'Down' : 'Right');
      show(e2, true); this.variant(e2, (m.kind === 'yellow' ? 'Kind=Surface' : 'Kind=Threat') + ', Direction=' + dir1);          // CR-4: Right / Up / Down (the marker sticks to the top / bottom edge for a lane outside the visible height)
      e2.setAttribute('data-state', 'Visible');
      e2.style.left = (s.viewW * BAL.ZOOM - 96 - 72) + 'px'; var sy0 = sy1; e2.style.top = (clampY(sy0) - 36) + 'px';
      e2.setAttribute('data-edge', dir1 === 'Right' ? '' : dir1.toLowerCase());
    }
    var warns = [], c;
    if (s.side) for (i = 0; i < s.creatures.length; i++) { c = s.creatures[i]; if (c.warn > 0 && !c.dead) warns.push(c); }
    this.warnEls = this.warnEls || [];
    while (this.warnEls.length < warns.length) this.warnEls.push(mk('Ambush Warning'));
    for (i = 0; i < this.warnEls.length; i++) {
      var we = this.warnEls[i], wc = warns[i];
      if (!wc) { show(we, false); continue; }
      show(we, true); we.style.left = (s.scrX(wc.x) - 36) + 'px'; we.style.top = (s.scrY(wc.y - wc.len * 0.4) - 90) + 'px';
    }
  };
  P.syncStart = function (r) {
    if (this.last.start === r) return; this.last.start = r;
    var W = this.W.start, fin = r.level === 5;
    W.classList.toggle('final', fin);
    setText(one(W, 'World Name'), T('oe_world_num', r.world) + ' - ' + T('oe_world_name_' + r.world));
    setText(one(W, 'Level Number'), fin ? T('oe_start_final') : T('oe_start_level', r.level));
    setAttr(one(W, 'Level Number'), 'data-state', fin ? 'Final' : 'Default');
    var gi = one(W, 'Goal Form Icon'), gpc = gi && one(gi, 'Form Portrait');
    setText(one(W, 'Goal Text'), T('oe_start_goal')); setText(one(W, 'Goal Text 2'), T('oe_start_goal2')); setText(one(W, 'Star Hint'), T('oe_start_stars'));      // CR-4 v5.1: every level goes to the Kraken, 3 stars = 3 hearts left
    if (gpc && gpc.tagName === 'CANVAS') Art.icon(gpc, 8);
    var nc = this.newCreatures(r.world, r.level), line = one(W, 'New Creature Line');
    setText(one(W, 'New Text'), nc.text ? T('oe_start_new', nc.text) : ''); show(line, !!nc.text);
    var cv = one(W, 'Creature Icon'), ctx = cv.getContext('2d'), def = nc.id && OE.CREATURES[nc.id];
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (def) { ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); Art.creature(ctx, def, { L: Math.min(cv.width * 0.86, cv.height * 1.5), t: 0.6, mouth: 0 }); ctx.restore(); }
    if (OE.Audio) OE.Audio.sfx('start');
  };
  P.syncEvo = function (r) {
    var W = this.W.evo, light = r.phase === 'play', kr = light && r.krakenT > 0, to = light ? r.evoLightTo : r.evo.to, key = (kr ? 'K' : (light ? 'L' : 'D')) + to + ':' + (light ? 0 : r.evo.from);
    this.state(W, kr ? 'LightKraken' : (light ? 'Light' : 'Default'));
    if (this.last.evo === key && !(light && this.last.evoLightT !== r.evoLightT && r.evoLightT > BAL.GROWTH.EVO_LIGHT_S - 0.05)) return; this.last.evo = key;
    if (kr) {
      setText(one(W, 'Light Banner/Form Name'), T('oe_evo_kraken')); setText(one(W, 'Light Banner/Ability Line'), T('oe_evo_kraken_sub'));
      var ka = one(W, 'Kraken Art'); if (ka && ka.tagName === 'CANVAS') Art.icon(ka, 8);
      var oc2 = one(W, 'Light Banner/Old Form Icon/Form Portrait'), nc2 = one(W, 'Light Banner/New Form Icon/Form Portrait');
      if (oc2 && oc2.tagName === 'CANVAS') Art.icon(oc2, 7); if (nc2 && nc2.tagName === 'CANVAS') Art.icon(nc2, 8);
      this.confetti(one(W, 'Confetti'));
      return;
    }
    if (light) {
      setText(one(W, 'Light Banner/Form Name'), T('oe_evo_light', T('oe_form_name_' + to)));
      setText(one(W, 'Light Banner/Ability Line'), T('oe_jump_name_' + to));
      var oc = one(W, 'Light Banner/Old Form Icon/Form Portrait'), nc = one(W, 'Light Banner/New Form Icon/Form Portrait');
      if (oc && oc.tagName === 'CANVAS') Art.icon(oc, r.evoLightFrom || Math.max(1, to - 1)); if (nc && nc.tagName === 'CANVAS') Art.icon(nc, to);
      return;
    }
    setText(one(W, 'Form Name'), T('oe_form_name_' + to));
    setText(one(W, 'Ability Text'), T('oe_evo_ability', T('oe_jump_name_' + to), T('oe_jump_target_' + to)));
    Art.icon(one(W, 'Form Art'), to);
  };
  // CR-4 v5.1: confetti of the Kraken celebration (css animated pieces in the Confetti layer, created once)
  P.confetti = function (box) {
    if (!box || box.getAttribute('data-made')) return;
    box.setAttribute('data-made', '1'); var cols = ['#ffd23f', '#ff6bd0', '#5dff9a', '#6fd3ff', '#ff8a4a'], i;
    for (i = 0; i < 60; i++) {
      var c = document.createElement('i'); c.className = 'confetti-piece'; c.style.left = (Math.random() * 100).toFixed(1) + '%'; c.style.background = cols[i % cols.length];
      c.style.animationDelay = (Math.random() * 1.2).toFixed(2) + 's'; c.style.animationDuration = (1.6 + Math.random() * 1.4).toFixed(2) + 's'; c.style.transform = 'rotate(' + Math.round(Math.random() * 360) + 'deg)';
      box.appendChild(c);
    }
  };
  P.stars = function (win, n, path) {
    var box = one(win, path || 'Stars'), st = box.querySelectorAll('[data-layer^="Star "]');
    for (var i = 0; i < 3; i++) {
      setSprite(st[i], i < n ? 'SPR_UI_Icn_Cmn_StarFull' : 'SPR_UI_Icn_Cmn_StarEmpty');
      st[i].classList.remove('pop'); st[i].style.animationDelay = '';
      if (i < n) { void st[i].offsetWidth; st[i].style.animationDelay = (0.25 + i * 0.3) + 's'; st[i].classList.add('pop'); }
    }
    box.setAttribute('data-variant', 'Stars=' + n);
  };
  P.fmtGP = function (v) { return (Math.round(v * 10) / 10).toString(); };
  P.syncComplete = function (r) {
    if (this.last.complete === r.result) return; this.last.complete = r.result;
    var W = this.W.complete, res = r.result;
    this.stars(W, res.stars);
    setText(one(W, 'Coins Row/Value'), '+' + res.coinsRow);
    setAttr(one(W, 'Coins Row'), 'data-value', res.coinsRow);
    // CR-4 v5.1: Hearts Row = the hearts left when the Kraken was reached (= the stars), Hearts Icons, the Kraken Line, the hint for the next star
    setText(one(W, 'Hearts Row/Label'), T('oe_lc_hearts')); setAttr(one(W, 'Hearts Row'), 'data-value', res.heartsLeft);
    setText(one(W, 'Kraken Line'), T('oe_lc_kraken'));
    var hi = one(W, 'Hearts Icons');
    if (hi) { var hh = hi.querySelectorAll('[data-layer^="Heart "]'); for (var q = 0; q < hh.length; q++) setSprite(hh[q], q < res.heartsLeft ? 'SPR_UI_Icn_Cmn_HeartFull' : 'SPR_UI_Icn_Cmn_HeartEmpty'); hi.setAttribute('data-variant', 'Count=' + res.heartsLeft); }
    var hint = one(W, 'Next Star Hint');
    if (hint) { show(hint, res.stars < 3); setText(hint, T('oe_lc_next_star', res.stars + 1)); }
    show(one(W, 'Coins Row/Note'), false);
  };
  P.syncFail = function (r) {
    if (this.last.fail === r.cause) return; this.last.fail = r.cause;
    var W = this.W.fail, c = r.cause;
    setText(one(W, 'Cause Text'), T(c.kind === 'eaten' ? 'oe_fail_cause_eaten' : 'oe_fail_cause_hazard', c.name));
    show(one(W, 'Kept Coins Note'), this.game.sim.coins > 0);
    var hs = one(W, 'Hearts').querySelectorAll('[data-layer^="Heart "]');
    for (var i = 0; i < hs.length; i++) setSprite(hs[i], 'SPR_UI_Icn_Cmn_HeartEmpty');
  };
  P.syncWorld = function (r) {
    if (this.last.world === r.result) return; this.last.world = r.result;
    var W = this.W.world, res = r.result, fin = res.finalWorld;
    this.state(W, fin ? 'FinalWorld' : (res.firstWorldClear ? 'Default' : 'Replay'));
    setText(one(W, 'Title'), T(fin ? 'oe_wc_final_title' : 'oe_wc_title'));
    var prev = one(W, 'World Art/Preview'); prev.setAttribute('data-sprite', 'SPR_UI_Img_Main_WorldPreview_' + res.world); prev.style.backgroundImage = 'var(--spr-SPR_UI_Img_Main_WorldPreview_' + res.world + ')';
    if (fin) { var kr = one(W, 'World Art/Kraken'); if (kr) Art.icon(kr, 8); }
    this.stars(W, res.stars);
    var uw = res.unlockedWorld;
    setText(one(W, 'Unlock Text'), uw ? T('oe_wc_unlocked', T('oe_world_name_' + uw)) : '');
    if (uw) { var up = one(W, 'Unlocked Card/Art Clip/Preview Art'); if (up) { up.setAttribute('data-sprite', 'SPR_UI_Img_Main_WorldPreview_' + uw); up.style.backgroundImage = 'var(--spr-SPR_UI_Img_Main_WorldPreview_' + uw + ')'; } }
    var lb = one(W, 'Lock Break'); if (lb) { lb.classList.remove('broken'); void lb.offsetWidth; lb.classList.add('broken'); }
    setText(one(W, 'Coins Row/Value'), '+' + res.coinsRow);
    var wbn = one(W, 'Coins Row/Note');
    if (wbn) { var parts = []; if (res.worldBonus > 0 && res.firstWorldClear) parts.push(T('oe_wc_world_bonus_val', res.worldBonus)); if (res.bossBonus > 0) parts.push(T(res.bossEaten ? 'oe_wc_boss_bonus' : 'oe_wc_boss_bonus_retreat', res.bossBonus)); setText(wbn, parts.join('   ')); show(wbn, parts.length > 0); }
  };

  /* ---------------------------------------------------------------- float texts (DOM, at the eat point) */
  P.floatText = function (x, y, text, color) {
    var hud = this.W.hud, el = this.tmplFloat.cloneNode(true), sm = this.game.sim;
    el.removeAttribute('data-template'); el.hidden = false; el.classList.add('float-text'); setText(el, text);
    el.style.left = ((sm ? sm.scrX(x) : x) - 100) + 'px'; el.style.top = ((sm ? sm.scrY(y) : y) - 32) + 'px'; el.style.width = '200px'; el.style.height = '64px';
    if (color) el.style.color = color;
    hud.appendChild(el); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 800);
  };
  P.onSimEvent = function (e) {
    switch (e.type) {
      case 'eat': this.floatText(e.x, e.y - 30, '+' + Math.max(1, Math.round(e.gp))); break;
      case 'coin': this.floatText(e.x, e.y - (e.src === 'pickup' ? 30 : 70), '+' + e.n, '#ffd23f'); break;
      case 'surfaceEat': case 'surfaceBite': this.floatText(e.x, e.y - 20, '+' + Math.max(1, Math.round(e.gp)) + ' GP'); break;
      default: break;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
