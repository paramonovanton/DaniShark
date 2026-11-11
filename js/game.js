/* Ocean Evolution - game flow controller (pure JS, no DOM): screens, windows, saves, analytics, level lifecycle.
   The view (ui.js / render.js) reads this object; user input and the QA hooks call its methods.
   All timers run inside update(dtMs), so QA step(ms) and the real frame loop behave the same. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var BAL = OE.BAL, U = OE.util, M = OE.Model, WORLDS = OE.WORLDS;
  var STEP = 1 / 60;

  function Game(opts) {
    opts = opts || {};
    this.provider = opts.provider;
    this.A = opts.analytics || OE.Analytics;
    this.assets = opts.assets || null;     // optional loader (OE.Assets): lazy sprites per world; absent in the model tests
    this.listeners = { change: [], simEvent: [] };
    this.save = this.provider.load();
    this.mode = 'loading';                 // loading | main | game
    this.loadT = 0; this.loadReady = false; this.loadProgress = 0; this.loadMin = 0.8;
    this.main = { state: 'Default', popup: null, popupState: 'Default', world: 1, focus: 1, timer: 0, newT: 0 };
    this.run = null; this.sim = null;
    this.seedValue = null;
    this.acc = 0; this.saveDirty = false; this.saveT = 0; this.busy = false;
    this.banner = null; this.hint = null; this.damagedT = 0;
    this.noticePending = !!this.provider.blocked;
    this.visibility = 'visible';
    this.viewW = BAL.DESIGN_W; this.rotate = false;
    this.floatQueue = [];
    this.tip = 'oe_loading_tip_' + (1 + Math.floor(Math.random() * 3));
  }
  OE.Game = Game;
  var P = Game.prototype;

  P.on = function (what, fn) { this.listeners[what].push(fn); };
  P.changed = function () { var l = this.listeners.change; for (var i = 0; i < l.length; i++) l[i](this); };
  P.track = function (name, params) { this.A.track(name, params); };

  /* ---------------------------------------------------------------- helpers */
  P.worldState = function (n) { return M.worldState(this.save, n); };
  P.debugUnlocked = function () { return !!(BAL.DEBUG_UNLOCK && this.save.debugUnlock); };
  P.lvlNumber = function (w, l) { return (w - 1) * 5 + l; };
  P.commit = function () { this.provider.save(this.save); this.saveDirty = false; this.saveT = 0; if (this.provider.blocked) this.noticePending = this.noticePending || !this.noticeShown; };
  P.saveSoon = function () { this.saveDirty = true; };
  P.seed = function (n) { this.seedValue = n; if (this.sim) this.sim.rng.seed(n); };
  // replace the whole save (QA setSave, future server sync); a running level restarts with the new totals
  P.replaceSave = function (obj) {
    this.save = M.looseSave(obj) || M.defaultSave();
    this.commit();
    if (this.mode === 'main') this.enterMain();
    else if (this.mode === 'game') { var r = this.run; this.startLevel(r.world, r.level, { skipBanner: true }); }
    else this.changed();
  };
  P.setLoadProgress = function (p) { this.loadProgress = p; if (p >= 1) this.loadReady = true; };

  /* ---------------------------------------------------------------- windows (what the view should show) */
  P.top = function () {
    if (this.rotate) return { screen: 'T_Main_Rotate', state: 'Default' };
    if (this.mode === 'loading') return { screen: 'T_Main_Loading', state: 'Default' };
    if (this.mode === 'main') {
      var m = this.main;
      if (m.popup === 'locked') return { screen: 'T_Main_WorldLocked', state: 'Default' };
      if (m.popup === 'levelpick') return { screen: 'T_Main_LevelPick', state: 'Default' };
      if (m.popup === 'settings') return { screen: 'T_Main_Settings', state: m.popupState };
      return { screen: 'T_Main_WorldSelect', state: m.state };
    }
    var r = this.run;
    switch (r.phase) {
      case 'start': return { screen: 'T_Game_LevelStart', state: 'Default' };
      case 'pause': return { screen: 'T_Game_Pause', state: r.pauseState };
      case 'evolution': return { screen: 'T_Game_Evolution', state: 'Default' };
      case 'complete': return { screen: 'T_Game_LevelComplete', state: 'Default' };
      case 'fail': return { screen: 'T_Game_Fail', state: 'Default' };
      case 'worldcomplete': return { screen: 'T_Game_WorldComplete', state: r.result.firstWorldClear ? (r.result.finalWorld ? 'FinalWorld' : 'Default') : 'Replay' };
      default:
        if (r.goalT > 0) return { screen: 'T_Game_GoalReached', state: 'Default' };          // CR-3: banners over the running game (the arena is not frozen)
        if (r.evoLightT > 0) return { screen: 'T_Game_Evolution', state: 'Light' };
        return { screen: 'T_Game_HUD', state: this.hudState() };
    }
  };
  P.hudState = function () {
    var s = this.sim; if (!s) return 'Default';
    if (this.run && this.run.bonus) return 'BonusPhase';                          // CR-3: Finish Button + Bonus Timer for the whole bonus phase
    if (s.player.airborne) return 'Airborne';
    if (this.damagedT > 0) return 'Damaged';
    if (s.jumpEligible()) return 'JumpReady';
    return 'Default';
  };

  /* ---------------------------------------------------------------- loading and main screen */
  P.enterMain = function (opts) {
    opts = opts || {};
    this.mode = 'main'; this.run = null; this.sim = null; this.banner = null; this.hint = null;
    this.mainEnterId = (this.mainEnterId || 0) + 1;
    var m = this.main;
    m.popup = null; m.popupState = 'Default'; m.timer = 0; m.newT = 0;
    m.state = M.allCompleted(this.save) ? 'AllCompleted' : 'Default';
    m.focus = opts.focus || M.currentWorld(this.save);
    m.newWorld = opts.newWorld || 0;
    if (opts.newWorld) { m.state = 'NewWorldUnlocked'; m.focus = opts.newWorld; m.newT = 3; }
    if (opts.final) { m.state = 'AllCompleted'; m.focus = 7; }
    this.busy = false;
    this.preloadCards();
    this.changed();
  };
  // world card backgrounds: the focused world and its neighbours (the rest load when their level starts)
  P.preloadCards = function () {
    if (!this.assets) return;
    var f = this.main.focus, ids = [], n, mob = !!this.assets.tier && this.assets.tier() !== 'desktop';
    for (n = mob ? f : Math.max(1, f - 1); n <= (mob ? f : Math.min(7, f + 1)); n++) ids.push('BG_W' + n + '_Back');     // mobile: only the focused world's background
    if (this.assets.bootIds) ids = ids.concat(this.assets.bootIds(1));
    if (this.assets.retain) this.assets.retain(ids);                                           // BUG-U4: the last level's creatures and backgrounds are released on the menu
    this.assets.preload(ids);
  };
  P.tapWorld = function (n) {
    if (this.mode !== 'main' || this.main.popup) return;
    var st = this.worldState(n);
    this.main.focus = n;
    this.preloadCards();
    if (this.debugUnlocked()) {                               // DEBUG unlock: every world opens the level pick; any level in any order
      this.main.popup = 'levelpick'; this.main.world = n; this.changed();
    } else if (st === 'Available') {
      var lv = M.nextLevel(this.save, n);
      this.track('WorldSelected', { world: n, level_in_world: lv });
      this.startLevel(n, lv);
    } else if (st === 'Locked') {
      this.main.popup = 'locked'; this.main.world = n; this.main.timer = BAL.lockedToastS;
      this.track('WorldLockedTapped', { world: n });
      this.changed();
    } else {
      this.main.popup = 'levelpick'; this.main.world = n; this.changed();
    }
  };
  P.closePopup = function () {
    if (this.mode !== 'main' || !this.main.popup) return;
    this.main.popup = null; this.main.popupState = 'Default'; this.changed();
  };
  P.openSettings = function () { if (this.mode !== 'main' || this.main.popup) return; this.main.popup = 'settings'; this.main.popupState = 'Default'; this.changed(); };
  P.toggleSetting = function (key) {
    if (!(key in this.save.settings) || typeof this.save.settings[key] !== 'boolean') return;
    this.save.settings[key] = !this.save.settings[key];
    this.track('SettingChanged', { setting: key, value: String(this.save.settings[key]) });
    this.commit(); this.changed();
  };
  // CR-2: control mode (Side-scroller default | Classic). Saved at once, read at the next level start; a running level is never changed.
  P.setControlMode = function (m) {
    if (m !== 'side' && m !== 'classic') return false;
    if (this.save.settings.controlMode === m) return true;
    this.save.settings.controlMode = m;
    this.track('SettingChanged', { setting: 'control_mode', value: m });
    this.commit(); this.changed();
    return true;
  };
  // DEBUG (BAL.DEBUG_UNLOCK): every world and every level selectable, in any order. Saved with the progress; no other effect (growth, coins, stars untouched).
  P.debugUnlockAll = function () {
    if (!BAL.DEBUG_UNLOCK || this.mode !== 'main') return false;
    this.save.debugUnlock = true;
    this.track('DebugUnlockAll', {});
    this.commit(); this.changed();
    return true;
  };
  P.askReset = function () { if (this.main.popup === 'settings') { this.main.popupState = 'ConfirmReset'; this.changed(); } };
  P.cancelReset = function () { if (this.main.popup === 'settings') { this.main.popupState = 'Default'; this.changed(); } };
  P.confirmReset = function () {
    if (this.main.popup !== 'settings' || this.main.popupState !== 'ConfirmReset') return;
    var keep = this.save.settings;
    this.save = this.provider.reset();
    this.save.settings = keep;      // sound choices survive a progress reset
    this.track('ProgressReset', {});
    this.commit();
    this.enterMain();
  };

  /* ---------------------------------------------------------------- level lifecycle */
  P.startLevel = function (world, level, opts) {
    opts = opts || {};
    world = U.clamp(world | 0, 1, 7); level = U.clamp(level | 0, 1, 5);
    var replay = M.isReplay(this.save, world, level);                                   // already completed before (tracking only: every level plays the same)
    this.mode = 'game'; this.busy = false; this.banner = null; this.damagedT = 0; this.floatQueue = []; this.ptrDown = false;
    this.sim = new OE.Sim({ world: world, level: level, viewW: this.viewW, controlMode: this.save.settings.controlMode, seed: this.seedValue === null ? (Date.now() & 0xffffff) : this.seedValue });
    this.run = { world: world, level: level, replay: replay, phase: opts.skipBanner ? 'play' : 'start', timer: BAL.levelStartS, result: null, pauseState: 'Default', winDelay: 0, evoT: 0, evo: null, hintDone: {}, lastPhaseBeforePause: 'play', goalT: 0, evoLightT: 0, evoLightTo: 0, bonus: false, bonusT: 0, endReason: null, goalFormAtEnd: 0 };
    this.acc = 0;
    if (this.assets) { var lids = this.assets.levelIds(world, 1, level); if (this.assets.retain) this.assets.retain(lids); this.assets.preload(lids); }   // world sprites + current/next form; everything else is released (BUG-U4); the banner waits for them (see update)
    this.initHint();
    this.track('Level_Start', { lvl: this.lvlNumber(world, level), world: world, level_in_world: level, goal_form: this.sim.goalForm, replay: replay, control_mode: this.sim.controlMode });
    this.changed();
  };
  P.finishStart = function () {
    this.run.phase = 'play'; this.run.timer = 0;
    this.changed();
  };
  P.initHint = function () {
    var r = this.run, s = this.save, first = r.world === 1 && r.level === 1 && !r.replay && s.worlds[1].levelsCompleted === 0;
    if (this.sim.side) { r.hintStage = !s.tutorial.sideTap && first ? 'SideTap' : null; }
    else { r.hintMove = !s.tutorial.moveEat && first; r.hintStage = r.hintMove ? 'Move' : null; }
    r.hintShown = {};
  };
  P.updateHint = function () {
    var r = this.run, s = this.sim, sv = this.save, kind = null;
    if (r.phase !== 'play') { this.hint = null; return; }
    if (s.side) {                                    // Side-scroller hints: SideTap (3 kicks), SideEat (first prey), SideJump (first jump-ready)
      if (r.hintStage === 'SideTap' && s.stats.kicks >= 3) { r.hintStage = 'SideEat'; r.sideEatT0 = s.t; }
      // SideEat stays until the first eat or 4 s (whichever first); jump-ready does not pre-empt it, SideJump may follow afterwards
      if (r.hintStage === 'SideEat' && (s.stats.firstEat || s.t - r.sideEatT0 >= 4)) { r.hintStage = null; sv.tutorial.sideTap = true; this.commit(); this.tutorialDoneCheck(); }
      if (r.hintStage) kind = r.hintStage;
      if (!sv.tutorial.sideJump) {
        if (s.stats.jumpedOnce) { sv.tutorial.sideJump = true; this.commit(); this.tutorialDoneCheck(); }
        else if (s.jumpEligible() && r.hintStage !== 'SideEat') kind = 'SideJump';
      }
    } else {
      if (r.hintStage === 'Move' && s.stats.moved >= 200) r.hintStage = 'Eat';
      if (r.hintStage === 'Eat' && s.stats.firstEat) { r.hintStage = null; sv.tutorial.moveEat = true; this.commit(); this.tutorialDoneCheck(); }
      if (r.hintStage) kind = r.hintStage;
      if (!sv.tutorial.jump) {
        if (s.stats.jumpedOnce) { sv.tutorial.jump = true; this.commit(); this.tutorialDoneCheck(); }
        else if (s.jumpEligible()) kind = 'Jump';
      }
    }
    if (kind && !r.hintShown[kind]) {
      r.hintShown[kind] = true;
      this.track('tutorial', { step: /Move|SideTap/.test(kind) ? 0 : (/Eat/.test(kind) ? 5 : 10) });
    }
    if (kind !== this.hint) { this.hint = kind; this.changed(); }
  };
  P.tutorialDoneCheck = function () { var t = this.save.tutorial; if ((this.sim && this.sim.side) ? (t.sideTap && t.sideJump) : (t.moveEat && t.jump)) this.track('tutorial', { step: 1000 }); };

  P.pause = function (source) {
    var r = this.run;
    if (this.mode !== 'game' || r.phase !== 'play') return false;
    this.releasePointer();
    r.phase = 'pause'; r.pauseState = 'Default'; r.pauseSource = source || 'button';
    this.track('PauseOpened', { world: r.world, level_in_world: r.level, source: source || 'button' });
    if (this.saveDirty) this.commit();
    this.changed();
    return true;
  };
  P.resume = function () {
    var r = this.run;
    if (this.mode !== 'game' || r.phase !== 'pause') return;
    r.phase = 'play'; this.acc = 0; this.releasePointer(); this.changed();
  };
  P.askQuit = function () { var r = this.run; if (r && r.phase === 'pause') { r.pauseState = 'ConfirmQuit'; this.changed(); } };
  P.cancelQuit = function () { var r = this.run; if (r && r.phase === 'pause') { r.pauseState = 'Default'; this.changed(); } };
  P.confirmQuit = function () {
    var r = this.run, s = this.sim;
    if (!r || r.phase !== 'pause' || r.pauseState !== 'ConfirmQuit') return;
    this.track('LevelQuit', { world: r.world, level_in_world: r.level, level_gp_pct: Math.min(100, Math.round(100 * s.levelGP / s.goalGP)), hearts_left: s.hearts });
    var w = r.world;
    this.commit();
    this.enterMain({ focus: w });
  };
  P.restartLevel = function () {      // from pause
    var r = this.run;
    if (!r || r.phase !== 'pause') return;
    this.track('LevelRestart', { world: r.world, level_in_world: r.level });
    this.startLevel(r.world, r.level);
  };
  P.back = function () {                // Esc / Android back
    if (this.mode === 'main') {
      if (this.main.popup === 'settings' && this.main.popupState === 'ConfirmReset') this.cancelReset();
      else if (this.main.popup) this.closePopup();
      return true;
    }
    if (this.mode === 'game') {
      var r = this.run;
      if (r.phase === 'play') return this.pause('back');
      if (r.phase === 'pause') { if (r.pauseState === 'ConfirmQuit') this.cancelQuit(); else this.resume(); return true; }
      // BUG-U3: Esc / Android back is a way out of every other window too
      if (r.phase === 'evolution') { this.evolutionContinue(); return true; }
      if (r.phase === 'complete' || r.phase === 'fail') { this.goHome(); return true; }
      if (r.phase === 'worldcomplete') { this.worldCompleteContinue(); return true; }
    }
    return false;
  };
  // BUG-U2: a pointer that was held when the page lost focus never reports its release; without this reset the next press would look like a
  // continuation (Side-scroller counts a kick only on a fresh press) and the first tap after the pause would be eaten
  P.releasePointer = function () {
    this.ptrDown = false;
    if (this.sim && !this.sim.side) { var q = this.sim.player.ptr; this.sim.setPointer(q.sx, q.sy, false); }
  };
  // the window / frame lost keyboard focus (a click on the host page, another app): pause a running level like a hidden page
  P.focusLost = function () {
    this.releasePointer();
    if (this.mode === 'game' && this.run.phase === 'play') this.pause('hidden');
  };
  // last resort when frames keep failing (app.js loop): back to the main screen, never a dead game
  P.recover = function () {
    this.releasePointer();
    this.track('FrameRecovered', {});
    if (this.mode === 'game') { this.commit(); this.enterMain({ focus: this.run ? this.run.world : 1 }); }
    else if (this.mode === 'loading') { this.loadReady = true; this.loadT = Math.max(this.loadT, this.loadMin); }
  };
  P.setVisibility = function (v) {
    this.visibility = v;
    if (v === 'hidden') {
      this.releasePointer();
      if (this.mode === 'game' && this.run.phase === 'play') this.pause('hidden');
      this.commit();
    }
  };
  P.evolutionContinue = function () {
    var r = this.run;
    if (!r || r.phase !== 'evolution' || this.busy) return;
    r.phase = 'play'; r.evo = null; this.acc = 0;
    this.sim.resume();
    this.save.tutorial.evoIntroSeen = true; this.commit();
    if (this.assets) this.assets.preload(this.assets.formIds(this.sim.form + 1));
    this.changed();
  };
  // CR-3: the Finish Button (bonus phase) ends the level with the stars earned so far
  P.finishBonus = function () {
    var r = this.run;
    if (this.mode !== 'game' || !r || r.phase !== 'play' || !r.bonus) return false;
    this.requestEnd('finish'); return true;
  };
  // the level ends when the player is in the water (a jump finishes first); Game.update() then calls sim.finish()
  P.requestEnd = function (reason) { var r = this.run; if (reason === 'form' && this.noAutoEnd) return; if (!r.endReason) r.endReason = reason; };
  // Classic: a tap or swipe up jumps when Jump Ready. Side-scroller: the press itself is the action (see tap()).
  P.jump = function (dirHint) { if (this.mode === 'game' && this.run.phase === 'play' && !this.sim.side) return this.sim.jump(dirHint); return false; };
  // Side-scroller: tap = kick up, or the surface jump near the waterline (mouse click, Space and Up arrow too)
  P.tap = function () { if (this.mode === 'game' && this.run.phase === 'play' && this.sim.side) return this.sim.sideTap(); return false; };
  // the key that is the main action: Space (Classic: jump, Side-scroller: kick)
  P.action = function () { return this.sim && this.sim.side ? this.tap() : this.jump(0); };
  P.pointer = function (sx, sy, down) {      // screen coordinates
    if (!this.sim) return;
    if (this.sim.side) { if (down && !this.ptrDown) this.tap(); this.ptrDown = !!down; return; }
    this.sim.setPointer(sx, sy, down);
  };
  // logical view width (1440..2520) from the fit; portrait = height > width (rotate prompt, Flow F12)
  P.setView = function (w) { this.viewW = w; if (this.sim) this.sim.setView(w); };
  // portrait = the view is taller than wide. Touch phones get the rotate prompt (Flow F12); a tap on it dismisses it ("play anyway", BUG-U3: no window
  // may block input without a way out) until the view is landscape again. Desktop browsers and the artifact side panel never show it (they cannot rotate).
  P.setPortrait = function (p) {
    p = !!p;
    if (!p) this.rotateDismissed = false;
    if (p && this.rotateDismissed) p = false;
    if (p === this.rotate) return;
    if (p) {
      var under = this.top().screen;
      if (this.mode === 'game' && this.run.phase === 'play') this.pause('rotate');      // a running level pauses first
      this.rotate = true;
      this.track('RotatePromptShown', { screen: under });
    } else this.rotate = false;
    this.changed();
  };
  P.dismissRotate = function () { if (!this.rotate) return false; this.rotateDismissed = true; this.rotate = false; this.changed(); return true; };

  P.nextLevel = function () {
    var r = this.run; if (!r || r.phase !== 'complete' || this.busy) return;
    this.busy = true;
    this.startLevel(r.world, Math.min(5, r.level + 1));
  };
  P.replayLevel = function () {
    var r = this.run; if (!r || (r.phase !== 'complete' && r.phase !== 'fail') || this.busy) return;
    this.busy = true;
    this.startLevel(r.world, r.level);
  };
  P.goHome = function () {
    var r = this.run; if (!r || (r.phase !== 'complete' && r.phase !== 'fail') || this.busy) return;
    this.busy = true;
    this.enterMain({ focus: r.world });
  };
  P.worldCompleteContinue = function () {
    var r = this.run; if (!r || r.phase !== 'worldcomplete' || this.busy) return;
    this.busy = true;
    var res = r.result;
    if (res.finalWorld) this.enterMain({ final: true });
    else if (res.firstWorldClear) this.enterMain({ newWorld: res.world + 1 });
    else this.enterMain({ focus: res.world });
  };

  /* ---------------------------------------------------------------- sim events */
  P.handleSimEvent = function (e) {
    var r = this.run, s = this.sim, sv = this.save, i;
    switch (e.type) {
      case 'coin':
        sv.coins += e.n; this.saveSoon();
        var src1 = 'pickup', src2 = 'world_' + r.world;
        if (e.src.indexOf('surface:') === 0) { src1 = 'surface'; src2 = e.src.slice(8); }
        else if (e.src === 'obstacle') { src1 = 'obstacle'; src2 = 'world_' + r.world; }
        this.track('ProductMovement', { type: 'earn', id: 'coins', amount: e.n, source1: src1, source2: src2 });
        break;
      case 'eat': break;
      case 'damage':
        this.damagedT = BAL.invuln;
        this.track('PlayerDamaged', { source: e.source, hearts_left: e.hearts });
        break;
      case 'jump': this.track('SurfaceJump', { form: s.form, world: r.world, level_in_world: r.level }); break;
      case 'surfaceEat':
      case 'surfaceBite':
        this.track('SurfaceTargetEaten', { target_id: e.type, form: s.form, gp_gain: Math.round(e.gp * 100) / 100, coins: e.coins });
        sv.stats.surfaceEaten += 1;
        break;
      case 'evolve':
        // CR-3 (R-OE-39): +1 heart and 1.5 s invulnerability were applied by the sim. The FIRST evolution ever = blocking popup (arena frozen);
        // every other = the non-blocking Light banner; the evolution that reaches the goal form shows the goal banner instead (TR-OE-60)
        if (this.assets) { var eids = this.assets.levelIds(r.world, e.to, r.level); if (this.assets.retain) this.assets.retain(eids); this.assets.preload(eids); }     // the forms below the new one are released
        var reachesGoal = e.from < s.goalForm && e.to >= s.goalForm, light = !(sv.tutorial.evoIntroSeen === false && !reachesGoal);
        this.track('Evolved', { form_from: e.from, form_to: e.to, world: r.world, level_in_world: r.level, level_time_s: Math.round(s.t), light: light });
        if (!light) { r.phase = 'evolution'; r.evoT = BAL.evoAutoS; r.evo = { from: e.from, to: e.to }; s.halted = true; sv.tutorial.evoIntroSeen = true; this.commit(); }
        else if (!reachesGoal) { r.evoLightT = BAL.GROWTH.EVO_LIGHT_S; r.evoLightTo = e.to; r.evoLightFrom = e.from; }
        if (r.bonus || s.goalReached) { if (e.to >= Math.min(8, s.goalForm + 2)) this.requestEnd('form'); }
        break;
      case 'goal':
        r.goalT = BAL.GROWTH.GOAL_BANNER_S; r.evoLightT = 0;
        this.track('GoalReached', { world: r.world, level_in_world: r.level, goal_form: s.goalForm, duration_s: Math.round(s.t) });
        if (e.form >= Math.min(8, s.goalForm + 2)) this.requestEnd('form');
        break;
      case 'win': r.winDelay = 0.6; break;
      case 'fail': this.onFail(e); break;
      case 'eventStart':
        this.banner = { id: e.id, t: BAL.eventBannerS };
        this.track('SurfaceEventStarted', { event_id: e.id, world: r.world, level_in_world: r.level });
        break;
      case 'eventEnd': this.track('SurfaceEventCompleted', { event_id: e.id, success: !!e.success }); break;
      default: break;
    }
    var l = this.listeners.simEvent;
    for (i = 0; i < l.length; i++) { try { l[i](e, this); } catch (err) { this.lastError = err; if (g.console) g.console.error('[sim event listener]', err); } }   // sound / FX can never break the sim step
  };
  P.drainSim = function () {
    var ev = this.sim.drain();
    for (var i = 0; i < ev.length; i++) this.handleSimEvent(ev[i]);
  };
  P.finishWin = function () {
    var r = this.run, s = this.sim;
    if (r.result) return;
    var out = M.applyLevelWin(this.save, { world: r.world, level: r.level, formAtEnd: s.maxForm, coinsCollected: s.coins });
    this.save = out.save;
    r.result = out.res; r.result.duration = s.t; r.result.reason = r.endReason || 'hearts'; r.result.evolutions = s.evolutionsThisLevel;
    this.commit();
    var res = out.res;
    this.track('Level_Success', { control_mode: s.controlMode, lvl: this.lvlNumber(r.world, r.level), world: r.world, level_in_world: r.level, stars: res.stars, duration_s: Math.round(s.t), form_reached: s.maxForm, goal_form: s.goalForm, evolutions: s.evolutionsThisLevel, coins_gain: res.coinsRow, replay: res.replay });
    if (r.level === 5) {
      r.phase = 'worldcomplete';
      this.track('WorldCompleted', { world: r.world, first_time: res.firstWorldClear, stars: res.stars, coins_gain: res.coinsRow });
    } else r.phase = 'complete';
    r.bonus = false; r.goalT = 0; r.evoLightT = 0; this.bonusOverride = null;
    this.busy = false;
    this.changed();
  };
  P.onFail = function (e) {
    var r = this.run, s = this.sim;
    if (s.goalReached) { r.endReason = r.endReason || 'hearts'; this.finishWin(); return; }        // CR-3 (R-OE-19): hearts 0 after the goal form completes the level
    r.phase = 'fail'; r.cause = e.cause || s.cause || { name: '?', kind: 'hazard', id: '?' };
    this.save.stats.levelsLost += 1;
    this.commit();
    this.track('Level_Failure', { control_mode: s.controlMode, lvl: this.lvlNumber(r.world, r.level), world: r.world, level_in_world: r.level, cause: r.cause.id, level_gp_pct: Math.min(100, Math.round(100 * s.levelGP / s.goalGP)), duration_s: Math.round(s.t), form_reached: s.maxForm });
    this.busy = false;
    this.changed();
  };

  /* ---------------------------------------------------------------- frame update (dt in ms) */
  P.update = function (dtMs) {
    var dt = dtMs / 1000;
    if (this.rotate) { if (this.saveDirty) { this.saveT += dt; if (this.saveT >= 1) this.commit(); } return; }   // portrait: everything waits behind the rotate prompt
    if (this.saveDirty) { this.saveT += dt; if (this.saveT >= 1) this.commit(); }
    if (this.damagedT > 0) this.damagedT -= dt;
    if (this.mode === 'loading') {
      this.loadT += dt;
      if (!this.loadReady && this.loadT >= BAL.loadMaxS) this.loadReady = true;        // BUG-U3: a stalled image request must not hold the loading screen for ever
      if (this.loadReady && this.loadT >= this.loadMin) {
        this.track('AppOpen', {});
        this.enterMain();
      }
      return;
    }
    if (this.mode === 'main') {
      var m = this.main;
      if (m.popup === 'locked') { m.timer -= dt; if (m.timer <= 0) this.closePopup(); }
      if (m.newT > 0) { m.newT -= dt; if (m.newT <= 0 && m.state === 'NewWorldUnlocked') { m.state = 'Default'; this.changed(); } }
      return;
    }
    var r = this.run, s = this.sim;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) { this.banner = null; this.changed(); } }
    switch (r.phase) {
      case 'start':
        if (this.assets && !this.assets.ready() && (r.assetWait = (r.assetWait || 0) + dt) < BAL.assetWaitS) return;   // hold the banner while sprites load, capped
        r.timer -= dt;
        if (r.timer <= 0) this.finishStart();
        return;
      case 'evolution':
        r.evoT -= dt;
        if (r.evoT <= 0) this.evolutionContinue();
        return;
      case 'play':
        if (r.goalT > 0) { r.goalT -= dt; if (r.goalT <= 0) { r.goalT = 0; r.bonus = true; r.bonusT = this.bonusOverride !== undefined && this.bonusOverride !== null ? this.bonusOverride : BAL.GROWTH.BONUS_S; this.bonusOverride = null; this.changed();   /* QA setBonusTimer before the bonus starts */ } }
        else if (r.bonus && r.bonusT > 0) { r.bonusT -= dt; if (r.bonusT <= 0) { r.bonusT = 0; this.requestEnd('timer'); } }
        if (r.evoLightT > 0) { r.evoLightT -= dt; if (r.evoLightT <= 0) { r.evoLightT = 0; this.changed(); } }
        if (r.endReason && !s.ended && !s.dying && !s.player.airborne) s.finish();          // the level ends in the water: a jump lands first
        this.acc += dt;
        var n = 0;
        while (this.acc >= STEP && n < 12) {
          this.acc -= STEP; n++;
          if (!s.halted) s.step(STEP);
          this.drainSim();
          if (r.phase !== 'play') break;
        }
        if (this.acc > STEP * 12) this.acc = 0;
        if (r.phase === 'play' && s.ended === 'win' && r.winDelay > 0) {
          r.winDelay -= dt;
          if (r.winDelay <= 0) this.finishWin();
        }
        this.updateHint();
        return;
      default: return;
    }
  };

  /* ---------------------------------------------------------------- QA / debug state */
  P.qaState = function () {
    var t = this.top(), s = this.sim, r = this.run, sv = this.save, out;
    out = {
      screen: t.screen, state: t.state, camera: { x: 0 }, view: { w: this.viewW, h: BAL.VIEW_H }, world: null, level: null, goalForm: null,
      levelGP: null, formProgress: 0, evolutionsThisLevel: 0, starsNow: 0, bonus: { active: false, secondsLeft: 0 },
      bestForm: sv.stats.bestForm, form: 1, size: 10, hearts: null, coins: sv.coins, background: null, bossPhase: 0,
      jump: { eligible: false, airborne: false, cooldown: 0 }, player: null, creatures: [], surfaceTargets: [],
      hint: this.hint, banner: this.banner ? this.banner.id : null, mode: this.mode,
      controlMode: sv.settings.controlMode, forwardSpeed: 0, threats: []
    };
    if (this.mode === 'main') { out.world = this.main.focus; }
    if (s) {
      var p = s.player, i, img = this.assets && this.assets.get ? this.assets.get('PLY_F' + s.form) : null, nat = img && img.width ? img.width : 512;
      out.world = r.world; out.level = r.level; out.goalForm = s.goalForm; out.levelGP = s.levelGP; out.formProgress = M.formProgress(s.levelGP);
      out.evolutionsThisLevel = s.evolutionsThisLevel; out.starsNow = s.goalReached ? M.starsFor(s.maxForm, s.goalForm) : 0;
      out.bonus = { active: !!r.bonus, secondsLeft: r.bonus ? Math.max(0, r.bonusT) : 0 };
      out.form = s.form; out.size = s.S; out.hearts = s.hearts; out.background = WORLDS[r.world - 1].bg;
      out.bossPhase = s.phaseNow(); out.jump = s.jumpState();
      out.player = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, len: p.len, bodyR: p.r, mouthR: BAL.BODY.mouthR * p.len, spriteScale: p.len / nat, spriteNaturalLen: nat };
      out.camera = { x: s.cam.x }; out.controlMode = s.controlMode; out.forwardSpeed = s.side ? s.fwd : 0; if (s.side) out.threats = s.threatMarkers();
      out.coinsCollected = s.coins; out.replay = r.replay; out.waterY = s.waterY; out.invuln = p.invuln;
      for (i = 0; i < s.creatures.length; i++) { var c = s.creatures[i]; out.creatures.push({ id: c.id, type: c.type, x: c.x, y: c.y, vx: c.vx, vy: c.vy, pattern: c.mv ? c.mv.pat : (s.side ? '' : 'CLASSIC'), size: c.size, len: c.len, role: c.role, state: c.state, hidden: c.hidden }); }
      for (i = 0; i < s.surface.length; i++) { var q = s.surface[i]; out.surfaceTargets.push({ id: q.id, type: q.type, tier: q.tier, x: q.x, y: q.y, eligible: q.tier <= s.form, bites: q.biteN }); }
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
