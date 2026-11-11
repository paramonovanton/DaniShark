/* Ocean Evolution - boss fights (CR-4 v5.1 item 10, R-OE-52 / R-OE-53), a part of the Sim.
   Level 5 of every world is a boss level. The boss does not replace the goal (the Kraken): its attacks are SCRIPTED straight / diagonal movers, never chasing, the same in both
   control modes (in Classic they start at the edges of the visible area), each one telegraphed at least 1.0 s (Threat Marker on the lane, eye / fin flash), gaps >= 380 units,
   waves go through the fairness checks of the Side-scroller spawner (a wave is delayed up to 2 s rather than break them). Phases follow the level GP: 180 and 300
   (the Lionfish Pair has two phases, the change at 240). Intensity grows with the world: B = (world - 1) / 6, pattern intervals x (1 - 0.35 B), speeds x (1 + 0.3 B).
   World 7 (The Bloop) keeps its shock rings / tentacle columns of sim_world.js / sim_side.js (same phases, gaps 380).
   Finale (R-OE-53): after the Kraken evolution on level 5 the boss is stunned and edible (size 0.8 x the player, drifts left at 120 px/s) for up to 10 s; spawner stopped,
   threats removed, no damage; boss bonus coins 50 x world when eaten, 25 x world when it retreats. */
(function (g) {
  'use strict';
  var OE = g.OE, BAL = OE.BAL, U = OE.util, CR = OE.CREATURES, Sim = OE.Sim, P = Sim.prototype, BB = BAL.BOSSES, FLOOR = BAL.seabedY, clamp = U.clamp;

  P.bossInit = function () {
    this.projs = []; this.bossTele = []; this.bossQ = []; this.finale = null; this.finaleBoss = null; this.bossHoldT = 0; this.bossSeq = 0; this.bossStats = { waves: 0, committed: 0, dropped: 0, purged: 0, maxWait: 0 };
    var L = this.level === 5 && BB.LIST[this.world];
    if (!L) { this.bossInfo = null; return; }
    var B = (this.world - 1) / 6;
    this.bossInfo = { id: L.id, name: L.name, phases: L.phases, phase: 1, B: B, ivMul: 1 - 0.35 * B, spMul: 1 + 0.3 * B, T: {}, lastPhase: 0, nextTele: 0 };
    this.bossPhase = 1;
  };
  P.bossIsScripted = function () { return !!this.bossInfo && this.ldef.boss !== 'bloop'; };
  // phase by level GP (180 / 300; two phases: 240)
  P.phaseNow = function () {
    if (!this.bossInfo) return 0;
    var gp = this.levelGP, L = this.bossInfo.phases === 2 ? BB.PHASE_GP_2 : BB.PHASE_GP_3, ph = 1, i;
    for (i = 0; i < L.length; i++) if (gp >= L[i]) ph = i + 2;
    return ph;
  };
  P.bossState = function () {
    var b = this.bossInfo; if (!b) return null;
    var lead = 0, i, t;
    for (i = 0; i < this.bossTele.length; i++) { t = Math.min(10, this.bossTele[i].until - this.t); if (t > lead) lead = t; }
    return { id: b.id, name: b.name, phase: this.phaseNow() || 1, pips: b.phases, pattern: b.pattern || '', edible: !!this.finale, finale: !!this.finale, nextTelegraphLead: Math.round(lead * 100) / 100 };
  };

  P.stepBoss = function (dt) {
    if (!this.bossInfo) return;
    if (this.finale) { this.updateFinale(dt); return; }
    if (this.dying) return;
    if (this.bossIsScripted() && !this.noSpawn) this.updateBossDirector(dt);
    this.updateProjs(dt);
  };

  /* ---- scripted creatures and projectiles ---- */
  // a creature that flies a straight line: it never reacts to the player. y is clamped into the water column; flags: warn (s), cost 0
  P.spawnScr = function (id, x, y, vx, vy, o) {
    o = o || {};
    var c = this.spawnCreature(id, x, y, { size: o.size, cross: true, facing: vx < 0 ? -1 : 1 });
    if (!c) return null;
    this.capBr(c, o.maxBr || BB.MAX_BR);
    c.scr = { vx: vx, vy: vy }; c.vx = vx; c.vy = vy; c.cross = true; c.cdir = vx < 0 ? -1 : 1; c.cost = 0; c.bossAtk = true; c.persist = false;
    if (o.warn) c.warn = o.warn;
    return c;
  };
  // a scripted body never gets so big that the gap rule (>= BB.GAP_MIN on one side) cannot hold: its radius is capped (a pair in the fan: half), never below a predator (1.2 x S)
  P.capBr = function (c, cap) {
    c.brCap = Math.min(cap, this.bossBrCap()); this.sizeCreature(c);
  };
  // the largest collider radius for which a single body still leaves a free corridor of GAP_MIN beside it in the sim's own metric (blockHalf = 0.9 br + the player's radius): shrinks with the player
  P.bossBrCap = function () {
    var r = this.player.r, v = (990 - this.waterY - 10 - (BB.GAP_MIN || 380) - r) / 1.9;
    return Math.max(40, Math.min(BB.MAX_BR, v));
  };
  P.moveScr = function (c, dt) {
    c.vx = c.scr.vx; c.vy = c.scr.vy; if (c.warn > 0) c.warn = Math.max(0, c.warn - dt);
  };
  P.scrGone = function (c) {
    var vl = this.cam.x - 700, vr = this.cam.x + this.viewW + 1800;
    return c.x < vl - c.len || c.x > vr || c.y < -700 || c.y > 1700;
  };
  P.addProj = function (x, y, vx, vy, kind, r) {
    this.projs.push({ id: this.nextId++, kind: kind || 'spine', x: x, y: y, vx: vx, vy: vy, r: r || 14, t: 0, dead: false });
  };
  P.updateProjs = function (dt) {
    var i, o, p = this.player, keep = [];
    for (i = 0; i < this.projs.length; i++) {
      o = this.projs[i]; o.t += dt; o.x += o.vx * dt; o.y += o.vy * dt;
      if (!this.dying && Math.hypot(o.x - p.x, o.y - p.y) < o.r + p.r * 0.8 && !p.airborne) { if (this.damage({ name: o.kind === 'torpedo' ? 'Torpedo' : 'Spine', kind: 'hazard', id: o.kind }, o.x, o.y)) o.dead = true; }
      if (o.x < this.cam.x - 800 || o.x > this.cam.x + this.viewW + 1800 || o.y < -400 || o.y > 1500) o.dead = true;
      if (!o.dead) keep.push(o);
    }
    this.projs = keep;
  };

  /* ---- spawn helpers (mode aware) ---- */
  P.bossLane = function (band) {
    var L = this.lanes, n = L.length - 1;                                     // the last lane is the floor lane
    if (band === 'mid') return L[this.rng.int(2, 3)];
    if (band === 'top') return L[0];
    if (band === 'low') return L[n - 1];
    return L[this.rng.int(0, n - 1)];
  };
  // x where a leftward attack enters: Side: ahead of the view by the closing speed x 1 s (at least 240); Classic: 240 beyond the visible right edge
  P.bossEdgeX = function (speed) {
    var closing = Math.min(BAL.SIDE.maxClosing, speed + (this.side ? this.fwdBase() : 0));
    return this.viewRight() + Math.max(BAL.SIDE.spawnAhead, closing * BB.TELEGRAPH_S);
  };
  P.bossTelegraph = function (y, s, kind) {
    var id = this.nextId++; this.bossTele.push({ id: id, y: y, until: this.t + s, kind: kind || 'lane' }); return id;
  };
  // run fn after `delay` seconds (the telegraph)
  P.bossAtS = function (delay, fn) { var it = this.bossAt(delay, fn); it.stag = true; return it; };       // a staggered second body: counts as a pending wave for the director timers
  P.bossAt = function (delay, fn) { var it = { t: this.t + delay, fn: fn, wait: 0 }; this.bossQ.push(it); return it; };
  // fairness: in the Side-scroller a wave that would break the corridor / window rule is delayed (0.25 s steps, up to 2 s) and then goes anyway
  P.bossFair = function (fresh, tries) {
    if (!this.side || !fresh.length) return true;
    return this.fairOK(fresh) && this.fairOver(fresh, null, true) && this.bossUnionFair(fresh);
  };
  // QA's metric (UC-OE-76 / XR-OE-76-BOSS): over any 1.5 s look-ahead the bodies that overlap the player's column block [y - br, y + br] over the whole stretch they sweep while they overlap it;
  // the largest free gap of the play band must stay >= 300. The extents are computed from the straight lines the scripted bodies fly (walls and the other threats included).
  P.bossUnionFair = function (fresh) {
    var p = this.player, Y0 = this.waterY + 20, Y1 = 990, self = this, win = 1.5, fs = [this.fwd, this.fwd * 0.6];          // the forward speed now and a slower one (current, seaweed, a bump): the crossing takes longer
    return fs.every(function (f) { return self.bossUnionAt(fresh, f, p, Y0, Y1, win); });
  };
  P.bossUnionAt = function (fresh, fwd, p, Y0, Y1, win) {
    var items = [], tmax = 0, ts, k;
    function addBody(c) {
      var half = c.len * 0.5 + p.len * 0.35, cl = fwd - (c.vx || 0), d = c.x - p.x, t0, t1, ya, yb;
      if (cl < 60) return;
      t0 = (d - half) / cl; t1 = (d + half) / cl; if (t1 < 0) return;
      t0 = Math.max(0, t0); ya = c.y + (c.vy || 0) * t0; yb = c.y + (c.vy || 0) * t1;
      items.push({ t0: t0, t1: t1, lo: Math.min(ya, yb) - c.br, hi: Math.max(ya, yb) + c.br });
    }
    this.creatures.forEach(function (c) { if (!c.dead && (c.role === 'predator' || c.role === 'hazard') && fresh.indexOf(c) < 0 && c.x > p.x - 400) addBody(c); });
    fresh.forEach(function (c) { if (c.role === 'predator' || c.role === 'hazard') addBody(c); });
    this.objs.forEach(function (o) {
      if ((o.kind !== 'wall' && o.kind !== 'swall') || o.x < p.x - 100) return;
      var cl = Math.max(60, fwd - (o.vx || 0)), t = (o.x - p.x) / cl, h = (o.w / 2 + p.r * 0.7) / cl;
      items.push({ t0: Math.max(0, t - h), t1: t + h, lo: Y0, hi: o.gapY - o.gapH / 2 }, { t0: Math.max(0, t - h), t1: t + h, lo: o.gapY + o.gapH / 2, hi: Y1 });
    });
    items.forEach(function (it) { tmax = Math.max(tmax, it.t1); });
    for (ts = 0; ts <= tmax + 0.05; ts += 0.1) {
      var blocks = [], cur = Y0, gap = 0;
      for (k = 0; k < items.length; k++) if (items[k].t1 >= ts && items[k].t0 <= ts + win) blocks.push([items[k].lo, items[k].hi]);
      blocks.sort(function (a, b) { return a[0] - b[0]; });
      blocks.forEach(function (b) { gap = Math.max(gap, b[0] - cur); cur = Math.max(cur, b[1]); }); gap = Math.max(gap, Y1 - cur);
      if (gap < 300 + 8) return false;
    }
    return true;
  };
  // BOSS PRIORITY (QA round 7): while a wave is queued, telegraphed or on its way, the normal threat / hazard spawner holds; the normal threats that are still outside the view are removed, and
  // the ones inside it that would make the wave unfair are removed after 0.5 s of waiting. A wave is therefore committed within about 1 s; the telegraph is shown for a wave that is going to come.
  P.bossBusy = function () {
    if (!this.bossInfo || !this.bossIsScripted() || this.finale) return false;
    if (this.bossHoldT > this.t || this.bossQ.length) return true;
    var i, c; for (i = 0; i < this.creatures.length; i++) { c = this.creatures[i]; if (c.bossAtk && !c.dead && c.role !== 'prey' && c.x > this.player.x - 200) return true; }       // until the body has passed the player
    return false;
  };
  P.bossPurge = function (fromX) {
    var i, c, n = 0;
    for (i = 0; i < this.creatures.length; i++) {
      c = this.creatures[i];
      if (c.dead || c.bossAtk || c.boss || c.finaleBoss || c.def.k === 'pas' || (c.role !== 'predator' && c.role !== 'hazard') || c.x <= fromX) continue;
      c.dead = true; n++;
    }
    if (n) this.bossStats.purged += n;
    return n;
  };
  P.bossTeleHold = function (id, until) { var i; for (i = 0; i < this.bossTele.length; i++) if (this.bossTele[i].id === id) this.bossTele[i].until = until; };
  // a body that crosses horizontally keeps at least BB.GAP_MIN of free height on one side (a big boss in the middle lane would leave two narrow gaps)
  P.bossFitY = function (y, br, gap) {
    var Y0 = this.waterY + 20, Y1 = 990, need = gap || BB.GAP_MIN || 380, m = 0.9 * br + this.player.r, lo = Y0 + need + m, hi = Y1 - need - m;    // m = the room the player needs around the body; lo: free above the body; hi: free below it
    y = clamp(y, this.waterY + br + 10, Y1 - br);                              // where the body can really be (the sim clamps it to the play band)
    if (y - m - Y0 >= need || Y1 - (y + m) >= need) return y;
    if (hi < this.waterY + br + 10) return clamp(lo, this.waterY + br + 10, Y1 - br);    // no room below: sit low
    if (lo > Y1 - br) return clamp(hi, this.waterY + br + 10, Y1 - br);
    return Math.abs(y - hi) <= Math.abs(y - lo) ? hi : lo;
  };
  // the body radius a scripted species will have now (a throw-away spawn): lets a lane be fitted BEFORE its telegraph is shown
  P.bossBr = function (id) {
    var n0 = this.creatures.length, c = this.spawnCreature(id, this.cam.x + 5000, this.waterY + 400, { cross: true, facing: -1 }), br = c ? c.br : 60;
    this.creatures.length = n0; return Math.min(br, BB.MAX_BR, this.bossBrCap());
  };
  // build() makes the bodies of the wave (it may add its own telegraph through bossTelegraph); teleId = a telegraph made BEFORE the wave (kept until the wave is committed, removed when it never comes)
  // build(variant) makes the bodies of the wave (it may add its own telegraph through bossTelegraph); nVar = how many shapes the wave can take (a flatter angle, a single body... the first
  // one that is fair for the current size of the player is committed); teleId = a telegraph made BEFORE the wave (kept until the wave is committed, removed when it never comes)
  P.bossWave = function (build, delay, teleId, nVar) {
    var self = this, st = this.bossStats, seq = ++this.bossSeq, T = BB.COMMON.WAVE_TIMING, due = this.t + (delay || 0), nv = nVar || 1;
    st.waves++;
    this.bossHoldT = Math.max(this.bossHoldT, this.t + (delay || 0) + 1.0);
    this.bossPurge(this.viewRight() - 100);
    if (teleId) this.bossTeleHold(teleId, 1e9);
    function commit(item, late) {
      st.committed++; st.maxWait = Math.max(st.maxWait, late);
      if (teleId) self.bossTeleHold(teleId, self.t + 0.1);
      self.bossHoldT = Math.max(self.bossHoldT, self.t + 0.5);
      return true;
    }
    var qi = this.bossAt(delay, function (item) {
      // spec v5.3 (BB.COMMON.WAVE_TIMING): forms 1-6 never drop a wave and delay it <= 2 s; forms 7-8 may drop up to 15 % and delay <= 4 s
      var v, n0 = self.creatures.length, t0 = self.bossTele.length, fresh, late = self.t - due, high = self.form >= T.highFromForm, limit = high ? T.maxDelayHigh : T.maxDelayLow, force = late >= limit - 0.3, pass;
      if (!force && self.bossQ.some(function (q) { return q.wave && q.seq < seq && q !== item; })) { item.t = self.t + 0.25; return false; }      // the waves go one after the other (two big bodies never arrive together)
      for (v = 0; v < nv; v++) {
        build.call(self, v); fresh = self.creatures.slice(n0);
        if (!fresh.length) { if (v === nv - 1) { if (teleId) self.bossTeleHold(teleId, 0); return true; } continue; }
        pass = self.bossFair(fresh) || (force && self.fairOK(fresh) && self.fairOver(fresh, null, true));
        if (pass || (force && v === nv - 1 && !(high && st.dropped < T.dropHighPct * Math.max(1, st.waves)))) return commit(item, late);   // a late wave goes with the best shape it has
        fresh.forEach(function (c) { c.dead = true; });
        self.creatures.length = n0; self.bossTele.length = Math.min(self.bossTele.length, t0);          // refused: undo (and its own telegraph), try the next shape
      }
      if (late >= 1.0 && !item.purged) { item.purged = true; self.bossPurge(self.player.x - 100); }      // after 1 s the normal threats inside the view make way as well
      else if (late >= 0.25 && !item.purged0) { item.purged0 = true; self.bossPurge(self.player.x + 150); }
      if (force && high) { st.dropped++; if (teleId) self.bossTeleHold(teleId, 0); return true; }          // forms 7-8 only, and only within the 15 % budget
      item.t = self.t + 0.25; return false;
    });
    qi.wave = true; qi.seq = seq;
  };

  /* ---- the attack primitives ---- */
  P.atkCross = function (id, speed, band, warn) {
    var b = this.bossInfo, sp = speed * b.spMul, y = this.bossLane(band), self = this;
    var br = this.bossBr(id); y = this.bossFitY(clamp(y, this.waterY + br + 10, FLOOR - br - 6), br);
    var tg = warn ? this.bossTelegraph(y, warn) : 0;
    this.bossWave(function () { var c = self.spawnScr(id, self.bossEdgeX(sp), y, -sp, 0, { warn: 0 }); if (c) c.y = y; return c; }, warn || 0, tg);
  };
  P.atkSchool = function (id, n, speed) {
    var y = this.bossLane('any'), self = this, sp = speed * this.bossInfo.spMul;
    this.bossAt(0, function () { var i, x0 = self.bossEdgeX(sp); for (i = 0; i < n; i++) { var c = self.spawnScr(id, x0 + i * 70, y + self.rng.range(-18, 18), -sp, 0); if (c) c.role = 'prey'; } return true; });
  };
  P.atkDiag = function (id, speed, deg, warn, fromFloor) {
    var sp = speed * this.bossInfo.spMul, self = this, up = fromFloor || this.rng.chance(0.5), y0 = up ? FLOOR - 40 : this.waterY + 120, angs = [deg, deg * 0.5, 6];
    var tg = this.bossTelegraph(y0, warn || BB.TELEGRAPH_S);
    this.bossWave(function (v) { var a = angs[v] * Math.PI / 180; return self.spawnScr(id, self.bossEdgeX(sp), y0, -sp * Math.cos(a), (up ? -1 : 1) * sp * Math.sin(a)); }, warn || BB.TELEGRAPH_S, tg, angs.length);   // flatter angles when the steep one would sweep a whole column
  };

  P.atkFan = function (n, deg, gapDeg) {
    // two lionfish cross slowly in a top and a bottom lane (the corridor between them stays >= 380); one flares (1.0 s) and fires a fan of straight spines.
    // A pair that is too big for the corridor (a big player means big lionfish) becomes ONE lionfish in the top or the bottom lane. The wave goes through the fairness-checked commit;
    // the flare and the fan follow once it exists
    var b = this.bossInfo, self = this, sp = 200 * b.spMul, flip = this.rng.chance(0.5), shooter = null;
    this.bossWave(function (v) {
      var x0 = self.bossEdgeX(sp), a = null, c = null;
      if (v === 0) { a = self.spawnScr('lionfish', x0, self.waterY + 130, -sp, 0, { maxBr: BB.MAX_BR / 2 }); c = self.spawnScr('lionfish', x0 + 260, FLOOR - 120, -sp, 0, { maxBr: BB.MAX_BR / 2 }); if (!a || !c) return null; }
      else if (v === 1) a = self.spawnScr('lionfish', x0, self.waterY + 130, -sp, 0, { maxBr: BB.MAX_BR });
      else c = self.spawnScr('lionfish', x0, FLOOR - 120, -sp, 0, { maxBr: BB.MAX_BR });
      if (a) a.y = self.waterY + 20 + a.br; if (c) c.y = 990 - c.br;            // the top and the bottom edge of the play band: the corridor is the widest it can be
      shooter = v === 0 ? (flip ? a : c) : (a || c); shooter.warn = 0; self.bossTelegraph(shooter.y, 2.4);                // (undone with the bodies when the wave is refused)
      return shooter;
    }, 0, 0, 3);
    this.bossAfter(function () { return shooter; }, 1.4, function () { shooter.warn = 1.0; });
    this.bossAfter(function () { return shooter; }, 2.4, function () {
      var i, base = Math.PI, step = (gapDeg || 15) * Math.PI / 180, mid = (n - 1) / 2, spd = 450 * b.spMul;
      for (i = 0; i < n; i++) { var ang = base + (i - mid) * step; self.addProj(shooter.x - shooter.len * 0.3, shooter.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 'spine', 14); }
    });
  };

  // run fn `delay` seconds after the creature that get() returns has been spawned (wait up to 6 s for it; nothing happens when it never comes or is gone)
  P.bossAfter = function (get, delay, fn) {
    var self = this, t0 = null;
    this.bossAt(0.05, function (item) {
      var c = get();
      if (!c || (t0 === null && c.dead)) { item.wait += 0.1; item.t = self.t + 0.1; return item.wait > 6; }      // not spawned yet (or the refused try that was undone)
      if (t0 === null) t0 = self.t;
      if (self.t - t0 < delay) { item.t = self.t + 0.05; return false; }
      if (!c.dead) fn(); return true;
    });
  };
  P.atkSub = function (mines, sonar) {
    var b = this.bossInfo, self = this, sp = 140 * b.spMul, br = this.bossBr('submarine'), y = this.bossFitY(clamp(this.bossLane('mid'), this.waterY + br + 10, FLOOR - br - 6), br), sub = null;
    var tg = sonar ? this.bossTelegraph(y, 2.0) : 0;
    // the submarine comes through the fairness-checked wave; its sonar ping and its mines follow once it exists (a wave that finds no fair moment is dropped with them)
    this.bossWave(function () { var c = self.spawnScr('submarine', self.bossEdgeX(sp), y, -sp, 0); if (c) { c.y = y; sub = c; } return c; }, 0, tg);
    function after(delay, fn) { self.bossAfter(function () { return sub; }, delay, fn); }
    if (sonar) after(1.0, function () { self.emit('sonar', { x: sub.x, y: sub.y }); });
    after(2.0, function () { var i; for (i = 0; i < mines; i++) self.objs.push({ id: self.nextId++, kind: 'mine', x: sub.x - 80 + i * 110, y: sub.y + 40, vy: 200, life: 8, t: 0, arm: 1.0 }); });
  };
  P.atkTorpedo = function () {
    var b = this.bossInfo, self = this, y = this.bossLane('any'), spd = 500 * b.spMul;
    this.bossTelegraph(y, 1.0);
    this.bossAt(1.0, function () { self.addProj(self.viewRight() + 120, y, -spd, 0, 'torpedo', 20); return true; });
  };
  P.atkTent = function () { this.bossColumns(3); };
  P.atkRock = function (n) {
    var i; for (i = 0; i < n; i++) this.objs.push({ id: this.nextId++, kind: 'frock', x: this.player.x + this.rng.range(250, 900), y: this.waterY, st: 'tele', t: 0, r: 44 });
  };
  P.atkPlume = function () {
    var x = this.player.x + this.rng.range(500, 1000);
    this.bossTelegraph(FLOOR - 80, 1.0, 'plume');
    this.zones.push({ id: this.nextId++, kind: 'vent', x: x, y: FLOOR - 250, w: 220, h: 520, t0: 6 - 3.5 - (this.t % 6), boss: true, until: this.t + 5.6 });
  };
  P.atkLava = function () {
    var self = this, x = this.player.x + this.rng.range(500, 900);
    this.bossTelegraph(FLOOR - 30, 1.0, 'lava');
    this.bossAt(1.0, function () { self.zones.push({ id: self.nextId++, kind: 'lava', x: x, y: FLOOR - 40, w: 420, h: 80, cd: 0, boss: true, until: self.t + 4 }); return true; });
  };
  P.atkDash = function (id, speed, warn, up, deg) {
    // an ambush dash from the floor (anglerfish) or a horizontal rush (mosasaurus): a warning flash, then one straight line (the floor dash flattens when the steep one would sweep a whole column)
    var b = this.bossInfo, self = this, sp = speed * b.spMul, ySt = up ? FLOOR - 60 : this.bossLane('mid'), angs = [deg || 0, 50, 70, 84];
    if (!up) { var brd = this.bossBr(id); ySt = this.bossFitY(clamp(ySt, this.waterY + brd + 10, FLOOR - brd - 6), brd); }
    var tg = this.bossTelegraph(ySt, warn), px0 = this.rng.range(300, 700);
    this.bossWave(function (v) {
      var a = angs[v] * Math.PI / 180, vx = up ? -sp * Math.sin(a) - 80 : -sp, vy = up ? -sp * Math.cos(a) : 0, c = self.spawnScr(id, up ? self.player.x + px0 : self.bossEdgeX(sp), ySt, vx, vy);
      if (c) { c.warn = 0; if (up) c.y = FLOOR - c.br - 6; else c.y = ySt; }
      return c;
    }, warn, tg, up ? angs.length : 1);
  };


  /* ---- the schedule by world and phase (BAL.BOSSES.LIST in the spec: World 1 baseline, every interval x (1 - 0.35 B)) ---- */
  P.bossTimers = function (ph) {
    var w = this.world, T = {};
    function every(k, s, fn) { T[k] = { every: s, fn: fn }; }
    var self = this;
    if (w === 1) {
      every('sweep', 10, function () { self.atkCross('grouper_boss', 240, 'mid', 0); });
      every('school', 12, function () { self.atkSchool('sardine', 14, 220); });
      if (ph === 2) every('charge', 8, function () { self.atkCross('grouper_boss', 650, 'any', 1.0); });
      if (ph === 3) every('twin', 8, function () { self.atkCross('grouper_boss', 650, 'top', 1.0); self.bossAt(1.6, function () { self.atkCross('grouper_boss', 650, 'low', 1.0); return true; }); });
    } else if (w === 2) {
      every('fan', 9, function () { self.atkFan(ph === 1 ? 3 : 5, 15, ph === 1 ? 15 : 22); });
      if (ph === 2) every('swap', 12, function () { self.atkDiag('lionfish', 200, 25, 1.0, false); });
    } else if (w === 3) {
      every('dash', ph === 3 ? 8 : 9, function () { self.atkDash('anglerfish', 700, 1.0, true, ph === 3 ? 25 : 0); });
      if (ph >= 2) every('decoy', 12, function () { var y = self.bossLane('any'); self.bossAt(0, function () { var c = self.spawnScr('lanternfish', self.bossEdgeX(120), y, -120, 0); if (c) { c.role = 'prey'; c.size = self.S * 0.5; } return true; }); });
      this.dark = ph === 1 ? 300 : 260;
    } else if (w === 4) {
      every('line', 10, function () { self.atkCross('orca', 300, 'mid', 1.0); self.bossAtS(3.4, function () { self.atkCross('orca', 300, 'low', 0); return true; }); });
      if (ph >= 2) every('vee', 9, function () { self.atkCross('orca', 300, 'top', 1.0); self.bossAtS(3.4, function () { self.atkCross('orca', 300, 'mid', 0); return true; }); self.bossAtS(6.8, function () { self.atkCross('orca', 300, 'low', 0); return true; }); });
      if (ph === 3) every('lead', 8, function () { self.atkDiag('orca', 300, 30, 1.0, false); });
    } else if (w === 5) {
      every('sonar', 6, function () { self.atkSub(ph === 1 ? 2 : 3, true); });
      if (ph >= 2) every('squid', 14, function () { self.atkDiag('giantsquid', 260, 25, 1.0, false); });
      if (ph === 3) { every('torp', 10, function () { self.atkTorpedo(); }); every('tent', 12, function () { self.atkTent(); }); }
    } else if (w === 6) {
      every('rush', ph === 1 ? 10 : 9, function () { self.atkDash('mosa', 700, 1.0, false, 0); if (ph === 3) self.bossAtS(1.3, function () { self.atkDash('mosa', 700, 1.0, false, 0); return true; }); });
      every('rock', 8, function () { self.atkRock(ph === 1 ? 1 : 2); });
      if (ph >= 2) every('plume', 9, function () { self.atkPlume(); });
      if (ph === 3) every('lava', 12, function () { self.atkLava(); });
    }
    return T;
  };
  P.updateBossDirector = function (dt) {
    var b = this.bossInfo, ph = this.phaseNow() || 1, k, T, i, item, keep = [];
    if (!b) return;
    if (ph !== b.lastPhase) {                                                   // a new phase: new schedule, first attack after about 3 s
      b.lastPhase = ph; b.phase = ph; this.bossPhase = ph; b.T = {};
      var tm = this.bossTimers(ph); for (k in tm) b.T[k] = { every: tm[k].every * b.ivMul, fn: tm[k].fn, t: 3 + this.rng.range(0, 3) };
      b.pattern = Object.keys(b.T).join('+');
      this.emit('bossPhase', { phase: ph, boss: b.id });
    }
    // a timer that fires while a wave (or the second body of a staggered wave) is still pending waits: the wave count shrinks instead of waves piling up and being refused
    var self = this, pendF = function () { return self.bossQ.some(function (q) { return q.wave || q.stag; }) || self.creatures.some(function (c) { return c.bossAtk && !c.dead && c.role !== 'prey' && c.x > self.player.x - 100; }); }, pend = pendF();
    for (k in b.T) { T = b.T[k]; T.t -= dt; if (T.t <= 0) { if (pend) T.t = 0.5; else { T.t = T.every; T.fn(); pend = pendF(); } } }
    // scheduled steps (telegraph delays, fairness retries)
    for (i = 0; i < this.bossQ.length; i++) { item = this.bossQ[i]; if (this.t >= item.t) { if (!item.fn(item)) keep.push(item); } else keep.push(item); }
    this.bossQ = keep;
    // finished telegraphs, temporary boss zones
    this.bossTele = this.bossTele.filter(function (q) { return q.until > this.t; }, this);
    this.zones = this.zones.filter(function (z) { return !(z.boss && this.t >= z.until); }, this);
  };

  /* ---- the finale ---- */
  P.startFinale = function () {
    var b = this.bossInfo, id = b ? b.id : 'grouper_boss', p = this.player, i;
    this.finale = { t: 0, eaten: false, boss: id }; this.noSpawn = true; this.bossQ = []; this.bossTele = []; this.projs = [];
    this.creatures = []; this.objs = []; this.zones = this.zones.filter(function (z) { return !z.boss && z.kind !== 'lava'; });
    p.invuln = 1e9;
    var c = this.spawnCreature(id, this.viewRight() - 220, clamp(p.y, this.waterY + 150, FLOOR - 150), { size: BB.FINALE.rel * this.S, facing: -1, cross: true });
    if (c) { c.scr = { vx: -BB.FINALE.drift, vy: 0 }; c.finaleBoss = true; c.cost = 0; c.role = 'prey'; c.stun = true; this.finaleBoss = c; }
    this.emit('finaleStart', { boss: id });
  };
  P.updateFinale = function (dt) {
    var f = this.finale; if (!f || f.done) return;
    f.t += dt; this.player.invuln = 1e9;
    var c = this.finaleBoss;
    if (c && !c.dead) { c.role = 'prey'; c.cross = true; }
    if ((c && c.dead) || f.eaten) { f.eaten = true; f.done = true; this.emit('finaleEnd', { eaten: true, boss: f.boss }); }
    else if (f.t >= BB.FINALE.length_s) { f.done = true; if (c) c.dead = true; this.emit('finaleEnd', { eaten: false, boss: f.boss }); }
  };
  // QA: eat the finale boss now
  P.eatBoss = function () {
    var c = this.finaleBoss; if (!this.finale || !c || c.dead) return false;
    this.eatCreature(c); return true;
  };

  /* ---- blockers (UC-OE-107): the list the QA hooks read, the warning lead, the spawn hook ---- */
  var BLOCK_COL = { wall: '#ffe066', swall: '#ff8af5', column: '#ffb050', shockring: '#ff8af5', tentacle: '#ffb050', mine: '#ffcf5a', struct: '#c9a8ff' };
  var BLOCK_GLOW = { wall: 22, swall: 22, column: 22, shockring: 30, tentacle: 22, mine: 24, struct: 22 };
  function lum(hex) {
    var v = [1, 3, 5].map(function (i) { var c = parseInt(hex.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  // blocker class of an object / obstacle ('' = not a blocker); Classic rings and tentacles are the shock ring and the tentacle column of the Bloop and of the W7 shock sources
  P.blockerKind = function (o, isObs) {
    if (isObs) return o.kind === 'struct' ? 'struct' : '';
    switch (o.kind) { case 'wall': case 'swall': case 'column': case 'mine': return o.kind; case 'ring': return 'shockring'; case 'tent': return 'tentacle'; default: return ''; }
  };
  // the warning lead in seconds: how long before it can reach the player's side of the view it exists (and is announced); stamped once
  P.stampLeads = function () {
    var i, o, sp, vr = this.viewRight(), fwd = this.side ? this.fwd : this.pmax();
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i]; if (o.lead !== undefined) continue;
      if (o.kind === 'ring') o.lead = Math.max(0, (Math.hypot(this.player.x - o.x, this.player.y - o.y) - o.r) / o.v);
      else if (o.kind === 'tent') o.lead = 1.0;
      else if (o.kind === 'mine') o.lead = Math.max(o.arm || 0, (o.x - vr) / Math.max(60, fwd));                 // a mine is announced by its arming flash (o.arm seconds) or by the distance
      else if (o.x !== undefined) { sp = Math.max(60, fwd + Math.abs(o.vx || 0)); o.lead = Math.max(o.tele || 0, (o.x - (o.w || 0) / 2 - vr) / sp); }
    }
    for (i = 0; i < this.obs.length; i++) { o = this.obs[i]; if (o.kind === 'struct' && o.lead === undefined) o.lead = Math.max(0, (o.x - (o.w || 0) / 2 - vr) / Math.max(60, fwd + Math.abs(o.vx || 0))); }
  };
  P.blockerList = function () {
    var out = [], i, o, k, cam = this.cam.x, vw = this.viewW, self = this, bg = lum('#0a0618');
    function add(o, isObs) {
      k = self.blockerKind(o, isObs); if (!k) return;
      var gapH = o.gapH || (o.h || 0), pocket = (o.kind === 'ring') ? o.r + 220 : (o.kind === 'mine' ? 220 : (isObs ? Math.max(340, o.h * 1.0) : Math.max(340, (o.gapH || 0) * 1.5)));
      out.push({ id: o.id, kind: k, x: o.x, y: o.gapY !== undefined ? o.gapY : o.y, gapH: o.gapH || 0, w: o.w || 0, state: o.st || '', glowPx: BLOCK_GLOW[k] || 22, pocketR: Math.round(pocket),
        contrast: Math.round((lum(BLOCK_COL[k] || '#ffe066') + 0.05) / (bg + 0.05) * 10) / 10, warnLead: o.lead !== undefined ? Math.round(o.lead * 100) / 100 : 0,
        visible: o.x + (o.w || 0) / 2 >= cam && o.x - (o.w || 0) / 2 <= cam + vw });
    }
    for (i = 0; i < this.objs.length; i++) add(this.objs[i], false);
    for (i = 0; i < this.obs.length; i++) add(this.obs[i], true);
    return out;
  };
  // QA hook: spawn a blocker by name in either mode (wall, shockring, tentacle / column, mine); x = number | 'ahead' | 'onPlayer'
  P.qaSpawnBlocker = function (type, x, y, o) {
    var p = this.player, SD = BAL.SIDE, vr = this.viewRight(), fwd = this.side ? this.fwdBase() : 0, gh = this.side ? this.gapFor() : 380, obj;
    function xs(w, vx) { return x === 'onPlayer' ? p.x : (typeof x === 'number' ? x : vr + Math.max(100, 3.2 * (fwd + Math.abs(vx || 0))) + w / 2); }
    if (y && typeof y === 'object' && o === undefined) { o = y; y = undefined; }
    if (type === 'tentacle') type = 'column';
    if (type === 'shockwall' || type === 'shock') type = 'shockring';
    if (type === 'mine') { obj = { id: this.nextId++, kind: 'mine', x: x === 'onPlayer' ? p.x : (typeof x === 'number' ? x : vr + Math.max(300, 3.2 * (fwd || 300))), y: y === undefined ? 520 : y, vy: SD.mineFall, life: 8, t: 0, arm: 1.0 }; this.objs.push(obj); return obj; }
    if (this.side) {
      if (type === 'wall') obj = { id: this.nextId++, kind: 'wall', x: xs(80, 60), vx: -60, gapY: y === undefined ? 640 : y, gapH: gh, w: 80 };
      else if (type === 'shockring') { obj = { id: this.nextId++, kind: 'swall', x: xs(46, SD.boss.wallSpeed), vx: -SD.boss.wallSpeed, gapY: y === undefined ? 640 : y, gapH: gh, w: 46, t: 0 }; this.emit('ring', { x: obj.x, y: obj.gapY }); }
      else if (type === 'column') obj = { id: this.nextId++, kind: 'column', x: xs(96, 0), vx: 0, gapY: y === undefined ? 640 : y, gapH: gh, w: 96, st: 'tele', t: 0, tele: SD.boss.tentWarnS, life: 1.4 };
      else return null;
      this.objs.push(obj); return obj;
    }
    if (type === 'wall') { obj = { id: this.nextId++, kind: 'struct', shape: 'r', x: xs(80, 0), y: y === undefined ? 700 : y, w: 80, h: 260, solid: true, vx: 0 }; this.obs.push(obj); return obj; }
    if (type === 'shockring') { this.addRing(xs(0, 0), y === undefined ? 600 : y, 4); return this.objs[this.objs.length - 1]; }
    if (type === 'column') { this.addTentacle(xs(0, 0)); return this.objs[this.objs.length - 1]; }
    return null;
  };

  /* ---- QA round 8: the shock walls and the tentacle columns of the bosses exist in BOTH modes (the same objects: 'swall' and 'column'), Classic gets Threat Markers ---- */
  // a shock wall (the "ring"): Side-scroller through its fairness-checked spawner; Classic: a wall that crosses the water from the right edge with a gap of GAP_MIN
  P.bossShockWall = function (speedMul) {
    if (this.side) return this.addShockWall(speedMul, true);
    var SD = BAL.SIDE, gh = Math.max(SD.boss.gap, Math.round(2.4 * this.player.r + 110)), sp = SD.boss.wallSpeed * (speedMul || 1), x = this.viewRight() + Math.max(100, 1.3 * (sp + 100)), gy;
    gy = this.rng.range(this.waterY + 180, Math.max(this.waterY + 200, BAL.seabedY - 0.6 * this.player.r - gh / 2));
    this.objs.push({ id: this.nextId++, kind: 'swall', x: x, vx: -sp, gapY: gy, gapH: gh, w: 46, t: 0 });
    this.emit('ring', { x: x, y: gy });
    return true;
  };
  // n tentacle columns: Side-scroller outside the view (marker first); Classic across the visible part, each telegraphed for BB.TELEGRAPH_S before it rises
  P.bossColumns = function (n) {
    if (this.side) return this.addColumns(n);
    var SD = BAL.SIDE, gh = Math.max(SD.boss.gap, Math.round(2.4 * this.player.r + 110)), i, gy;
    for (i = 0; i < n; i++) {
      gy = this.rng.range(this.waterY + 170, Math.max(this.waterY + 190, BAL.seabedY - 0.6 * this.player.r - gh / 2));
      this.objs.push({ id: this.nextId++, kind: 'column', x: this.cam.x + this.viewW * (0.3 + 0.22 * i) + this.rng.range(-40, 40), vx: 0, gapY: gy, gapH: gh, w: 96, st: 'tele', t: 0, tele: SD.boss.tentWarnS, life: 1.4 });
    }
    return true;
  };
  // Classic update / collision of the wall objects (the Side-scroller has its own in sim_side.js)
  P.updateWallObjs = function (dt) {
    var i, o;
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i];
      if (o.kind === 'wall' || o.kind === 'swall') { o.x += o.vx * dt; if (o.x < this.cam.x - 800) o.dead = true; }
      else if (o.kind === 'column') {
        if (o.st === 'tele' && o.t >= o.tele) { o.st = 'on'; o.t = 0; } else if (o.st === 'on' && o.t >= o.life) o.dead = true;
      }
    }
  };
  P.collideWallObjs = function () {
    var p = this.player, i, o;
    if (p.airborne || this.side) return;                                      // the Side-scroller has collideSide
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i];
      if ((o.kind === 'swall' || o.kind === 'wall' || (o.kind === 'column' && o.st === 'on')) && Math.abs(p.x - o.x) < o.w / 2 + p.r * 0.7 && Math.abs(p.y - o.gapY) + p.r * 0.4 > o.gapH / 2)
        this.damage({ name: o.kind === 'column' ? 'Tentacle' : (o.kind === 'wall' ? 'Wall' : 'Shockwave'), kind: 'hazard', id: o.kind === 'column' ? 'tentacle' : (o.kind === 'wall' ? 'struct' : 'shockwave') }, o.x, p.y);
    }
  };
  // Threat Markers: Side-scroller as before; Classic marks the committed blockers and the boss telegraphs that are still outside the visible right edge (the same marker UI, edge-clamped)
  var sideMarkers = P.threatMarkers;
  P.classicMarkers = function () {
    var out = [], i, o, vr = this.viewRight();
    for (i = 0; i < this.objs.length; i++) { o = this.objs[i]; if ((o.kind === 'wall' || o.kind === 'swall' || o.kind === 'column') && o.x - o.w * 0.5 > vr) out.push({ id: o.id, kind: 'red', y: o.gapY }); }
    for (i = 0; i < this.obs.length; i++) { o = this.obs[i]; if (o.kind === 'struct' && o.x - o.w * 0.5 > vr) out.push({ id: o.id, kind: 'red', y: o.y }); }
    for (i = 0; i < this.creatures.length; i++) { o = this.creatures[i]; if (!o.dead && o.bossAtk && o.role !== 'prey' && o.x - o.len * 0.5 > vr) out.push({ id: o.id, kind: 'red', y: o.y }); }
    for (i = 0; i < this.bossTele.length; i++) out.push({ id: this.bossTele[i].id, kind: 'red', y: this.bossTele[i].y });
    return out;
  };
  P.threatMarkers = function () { return this.side ? sideMarkers.call(this) : this.classicMarkers(); };
})(typeof window !== 'undefined' ? window : globalThis);
