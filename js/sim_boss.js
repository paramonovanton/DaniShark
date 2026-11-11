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
    this.projs = []; this.bossTele = []; this.bossQ = []; this.finale = null; this.finaleBoss = null;
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
    for (i = 0; i < this.bossTele.length; i++) { t = this.bossTele[i].until - this.t; if (t > lead) lead = t; }
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
    if (c.br <= cap) return;
    c.size = Math.max(c.size * cap / c.br, 1.2 * this.S); this.sizeCreature(c); c.role = this.roleOf(c);
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
  P.bossAt = function (delay, fn) { this.bossQ.push({ t: this.t + delay, fn: fn, wait: 0 }); };
  // fairness: in the Side-scroller a wave that would break the corridor / window rule is delayed (0.25 s steps, up to 2 s) and then goes anyway
  P.bossFair = function (fresh, tries) {
    if (!this.side || !fresh.length) return true;
    return this.fairOK(fresh) && this.fairOver(fresh, null, true);
  };
  // a body that crosses horizontally keeps at least BB.GAP_MIN of free height on one side (a big boss in the middle lane would leave two narrow gaps)
  P.bossFitY = function (y, br, gap) {
    var Y0 = this.waterY + 20, Y1 = 990, need = gap || BB.GAP_MIN || 380, lo = Y0 + need + br, hi = Y1 - need - br;    // lo: free above the body; hi: free below it
    y = clamp(y, this.waterY + br + 10, Y1 - br);                              // where the body can really be (the sim clamps it to the play band)
    if (y - br - Y0 >= need || Y1 - (y + br) >= need) return y;
    if (hi < Y0 + br) return Math.max(y, lo);                                  // no room below at all: sit low
    if (lo > Y1 - br) return Math.min(y, hi);
    return Math.abs(y - hi) <= Math.abs(y - lo) ? hi : lo;
  };
  // the body radius a scripted species will have now (a throw-away spawn): lets a lane be fitted BEFORE its telegraph is shown
  P.bossBr = function (id) {
    var n0 = this.creatures.length, c = this.spawnCreature(id, this.cam.x + 5000, this.waterY + 400, { cross: true, facing: -1 }), br = c ? c.br : 60;
    this.creatures.length = n0; return Math.min(br, BB.MAX_BR);
  };
  P.bossWave = function (build, delay) {
    var self = this;
    this.bossAt(delay, function (item) {
      var n0 = self.creatures.length, made = build.call(self), fresh = self.creatures.slice(n0);
      if (!fresh.length || self.bossFair(fresh)) return true;
      fresh.forEach(function (c) { c.dead = true; });
      self.creatures.length = n0;                                             // refused: undo and retry later
      item.wait += 0.25; if (item.wait >= 4) return true;                      // never forced: a wave that finds no fair moment within 4 s is dropped (the next timer brings another)
      item.t = self.t + 0.25; return false;
    });
  };

  /* ---- the attack primitives ---- */
  P.atkCross = function (id, speed, band, warn) {
    var b = this.bossInfo, sp = speed * b.spMul, y = this.bossLane(band), self = this;
    var br = this.bossBr(id); y = this.bossFitY(clamp(y, this.waterY + br + 10, FLOOR - br - 6), br);
    if (warn) { this.bossTelegraph(y, warn); }
    this.bossWave(function () { var c = self.spawnScr(id, self.bossEdgeX(sp), y, -sp, 0, { warn: 0 }); if (c) c.y = y; return c; }, warn || 0);
  };
  P.atkSchool = function (id, n, speed) {
    var y = this.bossLane('any'), self = this, sp = speed * this.bossInfo.spMul;
    this.bossAt(0, function () { var i, x0 = self.bossEdgeX(sp); for (i = 0; i < n; i++) { var c = self.spawnScr(id, x0 + i * 70, y + self.rng.range(-18, 18), -sp, 0); if (c) c.role = 'prey'; } return true; });
  };
  P.atkDiag = function (id, speed, deg, warn, fromFloor) {
    var sp = speed * this.bossInfo.spMul, a = deg * Math.PI / 180, self = this, up = fromFloor || this.rng.chance(0.5), y0 = up ? FLOOR - 40 : this.waterY + 120;
    this.bossTelegraph(y0, warn || BB.TELEGRAPH_S);
    this.bossWave(function () { return self.spawnScr(id, self.bossEdgeX(sp), y0, -sp * Math.cos(a), (up ? -1 : 1) * sp * Math.sin(a)); }, warn || BB.TELEGRAPH_S);
  };
  P.atkFan = function (n, deg, gapDeg) {
    // two lionfish cross slowly in a top and a bottom lane (the corridor between them stays >= 380); one flares (1.0 s) and fires a fan of straight spines.
    // The pair goes through the fairness-checked wave; the flare and the fan follow once it exists
    var b = this.bossInfo, self = this, sp = 200 * b.spMul, flip = this.rng.chance(0.5), shooter = null;
    this.bossWave(function () {
      var x0 = self.bossEdgeX(sp), a = self.spawnScr('lionfish', x0, self.waterY + 130, -sp, 0, { maxBr: BB.MAX_BR / 2 }), c = self.spawnScr('lionfish', x0 + 260, FLOOR - 120, -sp, 0, { maxBr: BB.MAX_BR / 2 });
      if (!a || !c) return null;
      a.y = self.waterY + 20 + a.br; c.y = 990 - c.br;                         // the top and the bottom edge of the play band: the corridor between them is the widest it can be
      shooter = flip ? a : c; shooter.warn = 0; self.bossTelegraph(shooter.y, 2.4);
      return a;
    }, 0);
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
    if (sonar) this.bossTelegraph(y, 2.0);
    // the submarine comes through the fairness-checked wave; its sonar ping and its mines follow once it exists (a wave that finds no fair moment is dropped with them)
    this.bossWave(function () { var c = self.spawnScr('submarine', self.bossEdgeX(sp), y, -sp, 0); if (c) { c.y = y; sub = c; } return c; }, 0);
    function after(delay, fn) { self.bossAfter(function () { return sub; }, delay, fn); }
    if (sonar) after(1.0, function () { self.emit('sonar', { x: sub.x, y: sub.y }); });
    after(2.0, function () { var i; for (i = 0; i < mines; i++) self.objs.push({ id: self.nextId++, kind: 'mine', x: sub.x - 80 + i * 110, y: sub.y + 40, vy: 200, life: 8 }); });
  };
  P.atkTorpedo = function () {
    var b = this.bossInfo, self = this, y = this.bossLane('any'), spd = 500 * b.spMul;
    this.bossTelegraph(y, 1.0);
    this.bossAt(1.0, function () { self.addProj(self.viewRight() + 120, y, -spd, 0, 'torpedo', 20); return true; });
  };
  P.atkTent = function () {
    if (this.side) this.addColumns(3);
    else { var i; for (i = 0; i < 3; i++) this.addTentacle(this.cam.x + this.viewW * (0.35 + 0.2 * i)); }
  };
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
    // an ambush dash from the floor (anglerfish) or a horizontal rush (mosasaurus): a warning flash, then one straight line
    var b = this.bossInfo, self = this, sp = speed * b.spMul, x = this.bossEdgeX(150) - this.rng.range(0, 300), a = (deg || 0) * Math.PI / 180, ySt = up ? FLOOR - 60 : this.bossLane('mid');
    this.bossTelegraph(ySt, warn);
    this.bossWave(function () {
      var vx = up ? -sp * Math.sin(a) - 80 : -sp, vy = up ? -sp * Math.cos(a) : 0, c = self.spawnScr(id, up ? self.player.x + self.rng.range(300, 700) : self.bossEdgeX(sp), ySt, vx, vy);
      if (c) { c.warn = 0; if (up) c.y = FLOOR - c.br - 6; }
      return c;
    }, warn);
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
      every('line', 10, function () { self.atkCross('orca', 300, 'mid', 1.0); self.bossAt(0.2, function () { self.atkCross('orca', 300, 'low', 0); return true; }); });
      if (ph >= 2) every('vee', 9, function () { self.atkCross('orca', 300, 'top', 1.0); self.atkCross('orca', 300, 'mid', 1.0); self.atkCross('orca', 300, 'low', 1.0); });
      if (ph === 3) every('lead', 8, function () { self.atkDiag('orca', 300, 30, 1.0, false); });
    } else if (w === 5) {
      every('sonar', 6, function () { self.atkSub(ph === 1 ? 2 : 3, true); });
      if (ph >= 2) every('squid', 14, function () { self.atkDiag('giantsquid', 260, 25, 1.0, false); });
      if (ph === 3) { every('torp', 10, function () { self.atkTorpedo(); }); every('tent', 12, function () { self.atkTent(); }); }
    } else if (w === 6) {
      every('rush', ph === 1 ? 10 : 9, function () { self.atkDash('mosa', 700, 1.0, false, 0); if (ph === 3) self.bossAt(0.3, function () { self.atkDash('mosa', 700, 1.0, false, 0); return true; }); });
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
    for (k in b.T) { T = b.T[k]; T.t -= dt; if (T.t <= 0) { T.t = T.every; T.fn(); } }
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
})(typeof window !== 'undefined' ? window : globalThis);
