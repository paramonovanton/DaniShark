/* Ocean Evolution - progression model (pure JS, no DOM): growth, forms, save shape, unlocks, level results. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var BAL = OE.BAL, U = OE.util;

  var SAVE_VERSION = 2;                       // v2 (CR-3): no totalGP; worlds[n].bestForm[5], stats.bestForm, tutorial.evoIntroSeen. v1 saves are migrated.
  var GR = BAL.GROWTH;

  /* ---- growth, size, forms (CR-3: per level, level GP 0..450, restarts at 0) ---- */
  // CR-4: S at the start of form f = 10 x 1.2^(f-1); inside a form S grows linearly with GP by IN_FORM (20 %) of the gap to the next start, then steps at the evolution
  function sizeStart(f) { return 10 * Math.pow(BAL.SIZE_STEP, f - 1); }
  function sizeForGP(gp) {
    gp = U.clamp(gp, 0, BAL.maxGP);
    var T = GR.FORM_GP, f = 1, i;
    for (i = 0; i < T.length; i++) if (gp >= T[i] - 1e-9) f = i + 1;
    var lo = T[f - 1], hi = f < T.length ? T[f] : BAL.maxGP, t = hi > lo ? U.clamp((gp - lo) / (hi - lo), 0, 1) : 0, a = sizeStart(f), b = sizeStart(f + 1);
    return a + BAL.IN_FORM * t * (b - a);
  }
  function formForGP(gp) {
    var f = 1;
    for (var i = 0; i < GR.FORM_GP.length; i++) if (gp >= GR.FORM_GP[i] - 1e-9) f = i + 1;
    return f;
  }
  function gpForForm(f) { return GR.FORM_GP[U.clamp(f, 1, 8) - 1]; }
  // 0..1 progress toward the next form (1 at the last form)
  function formProgress(gp) {
    var f = formForGP(gp);
    if (f >= 8) return 1;
    return U.clamp((gp - GR.FORM_GP[f - 1]) / (GR.FORM_GP[f] - GR.FORM_GP[f - 1]), 0, 1);
  }
  function goalForm() { return GR.GOAL_FORM; }                                // CR-4 v5.1: every level ends at the Kraken (form 8, 7 evolutions)
  // player length in world units (CR-4, R-OE-28): 9 x S = 90 (Tiny Fish) .. 322.5 (Kraken at its start), at most 335; on screen x ZOOM
  function lenPx(S) { return U.clamp(BAL.LEN_PER_S * S, BAL.playerLenMin, BAL.playerLenMax); }

  /* ---- save ---- */
  function defaultSave() {
    var worlds = {};
    for (var w = 1; w <= 7; w++) worlds[w] = { levelsCompleted: 0, completed: false, stars: [0, 0, 0, 0, 0], bestForm: [0, 0, 0, 0, 0] };
    return {
      version: SAVE_VERSION, coins: 0, worlds: worlds,
      settings: { sound: true, music: true, haptics: true, controlMode: BAL.CONTROL_DEFAULT },
      tutorial: { moveEat: false, jump: false, sideTap: false, sideJump: false, evoIntroSeen: false },
      stats: { levelsWon: 0, levelsLost: 0, surfaceEaten: 0, bestForm: 1 }
    };
  }
  function num(v, d, lo, hi) { v = Number(v); if (!isFinite(v)) return d; return U.clamp(v, lo, hi); }
  // Validate and complete a save object; returns null when unusable (wrong type or newer version). Version 1 saves are migrated (totalGP dropped).
  function normalizeSave(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (obj.version !== SAVE_VERSION && obj.version !== 1) return null;
    var migrated = obj.version === 1, d = defaultSave();
    d.coins = Math.floor(num(obj.coins, 0, 0, 1e9));
    for (var w = 1; w <= 7; w++) {
      var src = obj.worlds && obj.worlds[w];
      if (!src || typeof src !== 'object') continue;
      var lc = Math.floor(num(src.levelsCompleted, 0, 0, 5));
      d.worlds[w].levelsCompleted = lc;
      d.worlds[w].completed = !!src.completed || lc >= 5;
      if (d.worlds[w].completed) d.worlds[w].levelsCompleted = 5;
      for (var i = 0; i < 5; i++) {
        d.worlds[w].stars[i] = Math.floor(num(src.stars && src.stars[i], 0, 0, 3));
        d.worlds[w].bestForm[i] = Math.floor(num(src.bestForm && src.bestForm[i], 0, 0, 8));
        if (migrated && i < d.worlds[w].levelsCompleted && !d.worlds[w].bestForm[i]) d.worlds[w].bestForm[i] = goalForm(w, i + 1);   // a v1 level that was completed reached at least its goal
      }
    }
    var s = obj.settings || {};
    d.settings.sound = s.sound !== false; d.settings.music = s.music !== false; d.settings.haptics = s.haptics !== false;
    d.settings.controlMode = s.controlMode === 'classic' ? 'classic' : BAL.CONTROL_DEFAULT;   // anything else (or an old save) = the default
    var tu = obj.tutorial || {};
    d.tutorial.moveEat = !!tu.moveEat; d.tutorial.jump = !!tu.jump; d.tutorial.sideTap = !!tu.sideTap; d.tutorial.sideJump = !!tu.sideJump;
    d.tutorial.evoIntroSeen = !!tu.evoIntroSeen || (migrated && num(obj.totalGP, 0, 0, 1e9) >= 60);   // an old save that already evolved has seen the popup
    var st = obj.stats || {};
    d.stats.levelsWon = Math.floor(num(st.levelsWon, 0, 0, 1e9));
    d.stats.levelsLost = Math.floor(num(st.levelsLost, 0, 0, 1e9));
    d.stats.surfaceEaten = Math.floor(num(st.surfaceEaten, 0, 0, 1e9));
    d.stats.bestForm = Math.floor(num(st.bestForm, 1, 1, 8));
    for (w = 1; w <= 7; w++) for (var j = 0; j < 5; j++) d.stats.bestForm = Math.max(d.stats.bestForm, d.worlds[w].bestForm[j]);
    if (obj.debugUnlock === true) d.debugUnlock = true;       // DEBUG flag (BAL.DEBUG_UNLOCK): kept with the save, ignored when the flag is off
    if (obj.updatedAt) d.updatedAt = obj.updatedAt;
    return d;
  }
  // QA convenience: accepts the spec's test-data shorthand {coins, levelsCompleted:{1:2}, stats:{bestForm}} as well as a full save.
  function looseSave(obj) {
    if (obj && (obj.version === SAVE_VERSION || obj.version === 1)) return normalizeSave(obj);
    var d = defaultSave();
    if (!obj) return d;
    if (obj.coins !== undefined) d.coins = Math.floor(num(obj.coins, 0, 0, 1e9));
    var lc = obj.levelsCompleted || {};
    for (var k in lc) {
      var w = Number(k); if (!(w >= 1 && w <= 7)) continue;
      var n = Math.floor(num(lc[k], 0, 0, 5));
      d.worlds[w].levelsCompleted = n; d.worlds[w].completed = n >= 5;
      for (var i = 0; i < n; i++) { d.worlds[w].stars[i] = 3; d.worlds[w].bestForm[i] = Math.min(8, goalForm(w, i + 1) + 2); }
    }
    if (Object.keys(lc).length) { d.tutorial.moveEat = true; d.tutorial.sideTap = true; d.tutorial.evoIntroSeen = true; }   // saved progress implies the first-level hints and the evolution popup are done
    if (obj.stats) Object.assign(d.stats, obj.stats);
    for (var w2 = 1; w2 <= 7; w2++) for (var j = 0; j < 5; j++) d.stats.bestForm = Math.max(d.stats.bestForm, d.worlds[w2].bestForm[j]);
    if (obj.debugUnlock === true) d.debugUnlock = true;
    if (obj.settings) Object.assign(d.settings, obj.settings);
    if (obj.tutorial) Object.assign(d.tutorial, obj.tutorial);
    return d;
  }

  /* ---- unlock state (derived from the save, never stored) ---- */
  function worldState(save, n) {
    var w = save.worlds[n];
    if (w && w.completed) return 'Completed';
    if (n === 1 || (save.worlds[n - 1] && save.worlds[n - 1].completed)) return 'Available';
    if (BAL.DEBUG_UNLOCK && save.debugUnlock) return 'Available';      // DEBUG unlock-all: no world is locked
    return 'Locked';
  }
  // the carousel centres on the lowest Available world; the last world when all are completed
  function currentWorld(save) {
    for (var n = 1; n <= 7; n++) if (worldState(save, n) === 'Available') return n;
    return 7;
  }
  function nextLevel(save, n) { return Math.min(5, save.worlds[n].levelsCompleted + 1); }
  function allCompleted(save) { for (var n = 1; n <= 7; n++) if (!save.worlds[n].completed) return false; return true; }
  function isReplay(save, world, level) { return level <= save.worlds[world].levelsCompleted; }

  // CR-4 v5.1 (R-OE-14): stars = hearts left when the Kraken is reached (3 / 2 / 1)
  function starsFor(hearts) { return U.clamp(hearts | 0, 1, 3); }
  // target time to the Kraken (spec v5.1): (7 x step time + 15) x level factor
  function targetDuration(world, level) { return Math.round((7 * GR.STEP_TIME_S_BY_WORLD[world] + 15) * GR.LEVEL_DURATION_FACTOR[level - 1]); }

  // Apply a won level (R-OE-19). Pure: returns {save, res}; the caller persists save. run: {world, level, formAtEnd, coinsCollected}
  function applyLevelWin(save, run) {
    var s = U.deepCopy(save), w = s.worlds[run.world], lv = run.level, goal = goalForm(run.world, lv);
    var replay = lv <= w.levelsCompleted, firstWorldClear = false;
    var stars = starsFor(run.hearts === undefined ? 3 : run.hearts);
    if (!replay) w.levelsCompleted = Math.max(w.levelsCompleted, lv);
    var prevBest = w.bestForm[lv - 1];
    if (stars > w.stars[lv - 1]) w.stars[lv - 1] = stars;
    w.bestForm[lv - 1] = 8; run.formAtEnd = 8;
    if (8 > s.stats.bestForm) s.stats.bestForm = 8;
    if (lv === 5 && !w.completed) { w.completed = true; firstWorldClear = true; }
    var levelBonus = 10 + 5 * run.world + 5 * stars;
    var worldBonus = firstWorldClear ? 50 * run.world : 0;
    var bossBonus = lv === 5 ? run.world * (run.bossEaten ? 50 : 25) : 0;          // CR-4 v5.1 (R-OE-53): 50 x world when the finale boss is eaten, 25 x world when it retreats
    s.coins += levelBonus + worldBonus + bossBonus;
    s.stats.levelsWon += 1;
    return {
      save: s,
      res: {
        world: run.world, level: lv, replay: replay, stars: stars, heartsLeft: run.hearts === undefined ? 3 : run.hearts, goalForm: goal, formAtEnd: 8, firstWorldClear: firstWorldClear,
        newBest: prevBest < 8, levelBonus: levelBonus, worldBonus: worldBonus, bossBonus: bossBonus, bossEaten: !!run.bossEaten,
        coinsCollected: run.coinsCollected || 0, coinsRow: (run.coinsCollected || 0) + levelBonus + worldBonus + bossBonus,
        unlockedWorld: firstWorldClear && run.world < 7 ? run.world + 1 : 0, finalWorld: firstWorldClear && run.world === 7
      }
    };
  }

  // logical canvas width for a viewport (height is always 1080): device aspect clamped to 1440 (4:3) .. 2520 (21:9)
  function viewWidth(aw, ah) { return Math.round(U.clamp(BAL.VIEW_H * aw / ah, BAL.VIEW_W_MIN, BAL.VIEW_W_MAX)); }

  OE.Model = {
    viewWidth: viewWidth,
    SAVE_VERSION: SAVE_VERSION, sizeForGP: sizeForGP, sizeStart: sizeStart, formForGP: formForGP, lenPx: lenPx, gpForForm: gpForForm, formProgress: formProgress, goalForm: goalForm, starsFor: starsFor, targetDuration: targetDuration,
    defaultSave: defaultSave, normalizeSave: normalizeSave, looseSave: looseSave,
    worldState: worldState, currentWorld: currentWorld, nextLevel: nextLevel, allCompleted: allCompleted,
    isReplay: isReplay, applyLevelWin: applyLevelWin
  };
})(typeof window !== 'undefined' ? window : globalThis);
