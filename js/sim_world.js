/* Ocean Evolution - arena content for the simulation (extends OE.Sim): obstacles, zones, hazards, spawns,
   surface targets, surface events, boss. Pure JS, no DOM. */
(function (g) {
  'use strict';
  var OE = g.OE, BAL = OE.BAL, U = OE.util, M = OE.Model, CR = OE.CREATURES, SF = OE.SURFACE, EV = OE.EVENTS, Sim = OE.Sim, P = Sim.prototype;
  var W = BAL.W, H = BAL.H, FLOOR = BAL.seabedY;
  var dist = U.dist, clamp = U.clamp;
  function SD() { return BAL.SIDE; }

  /* ================================================================ build */
  P.build = function () {
    var ld = this.ldef, wd = this.wdef, i, k, n;
    if (wd.drift) { this.driftDir = 1; this.drift = wd.drift.v; }
    var kinds = ld.obs || {};
    // obstacle counts in the level tables are per screen; the world is two screens wide
    for (k in kinds) { if (k === 'fall' || k === 'shock') continue; var cnt = Math.max(2, kinds[k] * 2); for (i = 0; i < cnt; i++) this.addObstacle(k, i, cnt); }
    if (kinds.fall) this.fallT = 3;
    if (kinds.shock) this.shockT = 4;
    // creatures: food target counts the whole world (about 1.6 screens of the table's "on screen" number)
    n = 0;
    while (this.foodCost() < this.foodTarget() - 0.01 && n++ < 80) this.spawnFood(true, n === 1 ? ld.food[0][0] : null);   // first entry first: a swarm in W1
    var pr = ld.pred || [], hz = ld.haz || [];
    // CR-4 round 8: the start population follows the difficulty table in Classic too (at most max-predators predators, one of each hazard up to the hazard types)
    var np0 = 0, nh0 = 0;
    for (i = 0; i < pr.length && !(this.bossIsScripted && this.bossIsScripted()); i++) { if (np0 >= this.diff.maxpred) break; this.spawnSpecial(pr[i][0], Math.min(pr[i][1], this.diff.maxpred - np0)); np0 += Math.min(pr[i][1], this.diff.maxpred - np0); }
    for (i = 0; i < hz.length && nh0 < this.diff.haztypes; i++) { this.spawnSpecial(hz[i][0], 1); nh0++; }
    var pas = ld.pas || [];
    for (i = 0; i < pas.length; i++) this.pasT[i] = pas[i][1];
    var per = ld.per || [];
    for (i = 0; i < per.length; i++) this.perT[i] = per[i].at;
    // coin bubbles near rocks, coral, wrecks (spread over the whole world)
    for (i = 0; i < Math.round((ld.coins || 8) * 1.6); i++) {
      var near = this.obs.length && this.rng.chance(0.6) ? this.rng.pick(this.obs) : null;
      var x = near ? clamp(near.x + this.rng.range(-130, 130), 60, W - 60) : this.rng.range(80, W - 80);
      var y = near ? clamp((near.y || FLOOR - 60) - (near.r || 40) - this.rng.range(30, 120), this.waterY + 80, FLOOR - 40) : this.rng.range(this.waterY + 100, FLOOR - 80);
      this.addPickup(x, y, this.world);
    }
    if (ld.boss === 'bloop') {
      var b = this.spawnCreature('bloop', 2100, 760, { facing: -1 });
      b.boss = true; this.bossPhase = 1;
    }
    if (ld.boss === 'kraken') this.tentT = 1;
  };
  P.foodTarget = function () { return BAL.foodMax[this.level - 1] * BAL.foodWorldMul * (((BAL.BUDGET_C || {})[this.world] || [])[this.level - 1] || 1); };
  P.viewLeft = function () { return this.cam.x; };
  P.viewRight = function () { return this.cam.x + this.viewW; };
  P.foodCost = function () {
    var s = 0;
    for (var i = 0; i < this.creatures.length; i++) { var c = this.creatures[i]; if (!c.dead && c.k === 'food' && !c.cross && !c.peerSlot) s += c.cost; }
    return s;
  };
  // random world position at least minD (horizontal) from the player in the given y range
  P.randomFar = function (minD, yr) {
    var p = this.player, x, y, tries = 0;
    do { x = this.rng.range(90, W - 90); y = this.rng.range(yr[0], yr[1]); tries++; } while (Math.abs(x - p.x) < minD && tries < 30);
    return [x, y];
  };
  // y for a species: its own spawn band ('surface' | 'mid' | 'deep' | 'floor'), default mostly mid
  P.bandPick = function (def) {
    var B = this.bands, name = def.sband;
    if (!name) { var r = this.rng.next(); name = r < 0.7 ? 'mid' : (r < 0.85 ? 'surface' : 'deep'); }
    if (def.ai === 'bottom') return BAL.seabedY + 22;
    var b = B[name];
    return this.rng.range(b[0], b[1]);
  };
  // spawn point outside the view (>= 240 px beyond the camera edge) and at least minD from the player; null when none fits
  P.edgeSpawn = function (minD) {
    var p = this.player, side = this.rng.chance(0.5) ? 1 : 0, tries = 2, x;
    while (tries-- > 0) {
      x = side ? this.viewRight() + BAL.spawnMarginX + this.rng.range(0, 200) : this.viewLeft() - BAL.spawnMarginX - this.rng.range(0, 200);
      if (x > 60 && x < W - 60 && Math.abs(x - p.x) >= minD) return x;
      side = 1 - side;
    }
    return null;
  };
  P.spawnFood = function (initial, forceId) {
    var ld = this.ldef, id = forceId || this.foodPick(), def = CR[id], i, pos, c, tries = 0, peerSize = typeof forceId === 'object' && forceId ? forceId.size : undefined;
    if (typeof forceId === 'object' && forceId) { id = forceId.id; def = CR[id]; }
    // one school per species at a time
    while (def.ai === 'school' && tries++ < 4 && this.creatures.some(function (q) { return q.type === id && !q.dead; })) { id = this.foodPick(); def = CR[id]; }
    if (def.ai === 'school' && this.creatures.some(function (q2) { return q2.type === id && !q2.dead; })) return;
    if (def.ai === 'ambush') {
      var amb = 0; for (i = 0; i < this.creatures.length; i++) if (this.creatures[i].def.ai === 'ambush' && this.creatures[i].k === 'food') amb++;
      if (amb >= 3) return;
      var home = this.homeSpot(); this.spawnCreature(id, home.x, home.y, {}); return;
    }
    if (initial) { pos = this.randomFar(350, [this.bands.surface[0], this.bands.deep[1]]); pos[1] = this.bandPick(def); }
    else { var ex = this.edgeSpawn(BAL.spawnNear); if (ex === null) return; pos = [ex, this.bandPick(def)]; }
    var hides = !!ld.hide && id === 'clownfish';
    if (def.ai === 'school') {
      var n = this.rng.int(def.grp[0], def.grp[1]);
      var cst = def.cost || 1, left0 = this.foodCost(), room = Math.max(1, Math.floor((this.foodTarget() + 2 - left0) / cst));
      n = Math.max(2, Math.min(n, room));
      var gr = this.newGroup(pos[0], pos[1], 'school'); gr.n = n;
      for (i = 0; i < n; i++) this.spawnCreature(id, pos[0] + this.rng.range(-80, 80), pos[1] + this.rng.range(-60, 60), { group: gr });
    } else {
      c = this.spawnCreature(id, pos[0], pos[1], { hides: hides, size: peerSize });
      if (typeof forceId === 'object' && forceId && c) c.peerSlot = true;      // peers (spec v4.1) do not use up the prey budget
      if (hides && this.obs.length) {      // start the hiding clownfish inside coral
        var cor = null, bd = 1e9; for (i = 0; i < this.obs.length; i++) if (this.obs[i].kind === 'coral') { var dd = Math.abs(this.obs[i].x - c.x); if (dd < bd) { bd = dd; cor = this.obs[i]; } }
        if (cor) { c.x = cor.x; c.y = cor.y; c.hideSt = 'hidden'; c.hideT = this.rng.range(1, 3); c.hidden = true; }
      }
    }
  };
  P.homeSpot = function () {
    var cr = [], i;
    for (i = 0; i < this.obs.length; i++) if (this.obs[i].kind === 'crevice') cr.push(this.obs[i]);
    var p = this.player, far = cr.filter(function (o) { return Math.abs(o.x - p.x) > 600; });
    if (far.length) { var o = this.rng.pick(far); return { x: o.x, y: o.y }; }
    return { x: this.randomFar(600, [FLOOR - 120, FLOOR - 40])[0], y: this.rng.range(FLOOR - 120, FLOOR - 40) };
  };
  // persistent predators / hazards of a level: at least spawnFar (930 px) from the player
  // Classic: retire the farthest living threat of a role that is outside the view (true when one was retired)
  P.retireFar = function (role) {
    var far = null, fd = 0, px = this.player.x, i, c, d;
    for (i = 0; i < this.creatures.length; i++) { c = this.creatures[i]; d = Math.abs(c.x - px); if (!c.dead && !c.bossAtk && c.role === role && c.def.k !== 'pas' && d > this.viewW * 0.5 + c.len * 0.5 + 20 && d > fd) { far = c; fd = d; } }          // fully outside the visible width
    if (far) { far.persist = false; far.dead = true; return true; }
    // none outside the view: the one that has been around longest swims off in a straight line (it still counts as a threat while it is on screen, not for the stream)
    for (i = 0, fd = -1; i < this.creatures.length; i++) { c = this.creatures[i]; if (!c.dead && !c.bossAtk && !c.leaving && c.role === role && c.def.k !== 'pas' && c.t > fd) { far = c; fd = c.t; } }
    if (far) { far.leaving = true; far.persist = false; far.cross = true; far.cdir = far.x >= px ? 1 : -1; far.scr = { vx: far.cdir * 300, vy: 0 }; far.vx = far.scr.vx; }
    return false;
  };
  P.spawnSpecial = function (id, count, boost) {
    var def = CR[id], sz = boost ? Math.max(this.rosterSize(id, CR[id]), boost * this.S) : undefined, i, pos, yr = [this.bands.mid[0], this.bands.deep[1]], gr = null, self = this;
    for (i = 0; i < count; i++) {
      pos = this.randomFar(BAL.spawnFar, yr);
      pos[0] = clamp(pos[0], this.cam.x + this.viewW / 2 - (BAL.despawnX - 400), this.cam.x + this.viewW / 2 + (BAL.despawnX - 400));          // CR-4 round 9: never so far that the distance rule removes it again at once
      if (def.ai === 'ambush') { var h = this.homeSpot(); pos = [h.x, h.y]; }
      else if (def.ai === 'rush') {
        var vent = null, j; for (j = 0; j < this.zones.length; j++) if (this.zones[j].kind === 'vent' && Math.abs(this.zones[j].x - this.player.x) > BAL.spawnFar) vent = this.zones[j];
        pos = vent ? [vent.x, FLOOR - 100] : [this.randomFar(BAL.spawnFar, yr)[0], FLOOR - 100];
      } else if (def.ai === 'sub') pos = [this.randomFar(BAL.spawnFar, yr)[0], this.waterY + 260 + i * 120];
      else if (id === 'snapcrab') {
        var rocks = this.obs.filter(function (o) { return (o.kind === 'rock' || o.kind === 'coral') && Math.abs(o.x - self.player.x) > 500; });
        var rk = rocks.length ? this.rng.pick(rocks) : { x: this.randomFar(600, yr)[0], r: 50 };
        pos = [clamp(rk.x + (this.rng.chance(0.5) ? 1 : -1) * (rk.r + 40), 60, W - 60), BAL.seabedY + 25];
      } else if (def.sband === 'floor') pos[1] = BAL.seabedY + 25;
      var c;
      if ((def.ai === 'group' || def.ai === 'pod')) {
        if (!gr) { gr = this.newGroup(pos[0], pos[1], 'hunt'); gr.R = 4 * this.visLen(def.size, def); }
        c = this.spawnCreature(id, pos[0] + this.rng.range(-90, 90), pos[1] + this.rng.range(-60, 60), { group: gr, size: sz });
      } else c = this.spawnCreature(id, pos[0], pos[1], { size: sz });
      c.persist = true;
    }
  };
  P.addPickup = function (x, y, value) {
    var pk = { id: this.nextId++, x: x, y: y, value: value, t: this.rng.range(0, 6) };
    this.pickups.push(pk); return pk;
  };
  P.addObstacle = function (kind, i, n, xAt) {
    var rng = this.rng, bx = xAt !== undefined ? xAt : (i + 0.5) * W / n + rng.range(-120, 120), r, h;
    var clamp = this.side ? function (v) { return v; } : U.clamp;       // Side-scroller: the world has no edges (x is given)
    if (!this.side) bx = clamp(bx, 90, W - 90);
    switch (kind) {
      case 'coral': r = rng.range(60, 90); this.obs.push({ id: this.nextId++, kind: 'coral', shape: 'c', x: bx, y: FLOOR - r * 0.4, r: r, solid: true, fore: true }); break;
      case 'rock': r = rng.range(40, 70); this.obs.push({ id: this.nextId++, kind: 'rock', shape: 'c', x: clamp(bx + 90, 90, W - 90), y: FLOOR - r * 0.45, r: r, solid: true }); break;
      case 'anemone': this.obs.push({ id: this.nextId++, kind: 'anemone', shape: 'c', x: clamp(bx + 40, 60, W - 60), y: FLOOR - 20, r: 36, haz: true, name: 'Sea anemone' }); break;
      case 'crevice': this.obs.push({ id: this.nextId++, kind: 'crevice', shape: 'c', x: clamp(bx - 70, 80, W - 80), y: FLOOR - rng.range(30, 160), r: 30 }); break;
      case 'brock': this.obs.push({ id: this.nextId++, kind: 'brock', shape: 'c', x: clamp(bx + 50, 90, W - 90), y: FLOOR - rng.range(60, 140), r: 48, solid: true, breakable: 24, coins: rng.int(3, 5) }); break;
      case 'ruin': h = rng.range(180, 360); this.obs.push({ id: this.nextId++, kind: 'ruin', shape: 'r', x: bx, y: FLOOR - h / 2, w: 80, h: h, solid: true, breakable: 29, coins: 3 }); break;
      case 'struct': h = rng.range(200, 340); this.obs.push({ id: this.nextId++, kind: 'struct', shape: 'r', x: Math.max(bx, BAL.playerStart.x + this.viewW * 0.5 + 560), y: rng.range(this.waterY + 120 + h / 2, FLOOR - h / 2 - 20), w: rng.range(60, 90), h: h, solid: true, vx: (rng.chance(0.5) ? 1 : -1) * 55 }); break;
      case 'seaweed': this.zones.push({ id: this.nextId++, kind: 'seaweed', x: bx, y: FLOOR - 150, w: 170, h: 300, mul: 0.6 }); break;
      case 'kelp': this.zones.push({ id: this.nextId++, kind: 'kelp', x: clamp(bx + 60, 100, W - 100), y: FLOOR - 190, w: 210, h: 380, mul: 0.4, stealth: true }); break;
      case 'current': this.zones.push({ id: this.nextId++, kind: 'current', x: bx, y: rng.range(this.waterY + 140, FLOOR - 160), w: 420, h: 200, vx: (i % 2 ? -1 : 1) * 120, vy: 0 }); break;
      case 'elec': this.zones.push({ id: this.nextId++, kind: 'elec', x: clamp(bx, 170, W - 170), y: rng.range(this.waterY + 140, FLOOR - 160), w: 260, h: 200, t0: rng.range(0, 3) }); break;
      case 'vent': this.zones.push({ id: this.nextId++, kind: 'vent', x: bx, y: FLOOR - 200, w: 120, h: 400, t0: rng.range(0, 6) }); break;
      case 'thermal': this.zones.push({ id: this.nextId++, kind: 'thermal', x: clamp(bx, 150, W - 150), y: FLOOR - 230, w: 260, h: 460, vy: -100 }); break;
      case 'lava': this.zones.push({ id: this.nextId++, kind: 'lava', x: clamp(bx, 160, W - 160), y: FLOOR - 30, w: 300, h: 80, cd: 0 }); break;
      case 'whirl': this.zones.push({ id: this.nextId++, kind: 'whirl', shape: 'c', x: this.side ? bx : rng.range(220, W - 220), y: rng.range(this.waterY + 200, FLOOR - 200), r: 220, cd: 0, sgn: rng.chance(0.5) ? 1 : -1 }); break;
      case 'collapse': this.objs.push({ id: this.nextId++, kind: 'crock', x: clamp(bx, 100, W - 100), y0: this.waterY + 110, y: this.waterY + 110, st: 'idle', t: 0, tw: rng.range(2, 6), r: 40 }); break;
      default: break;
    }
  };
  P.breakObstacle = function (ob) {
    if (ob.dead) return;
    ob.dead = true;
    this.addCoins(ob.coins || 3, 'obstacle', ob.x, ob.y);
    this.emit('break', { x: ob.x, y: ob.y, kind: ob.kind, r: ob.r || 60 });
  };

  /* ================================================================ environment */
  function inRect(z, x, y, pad) { return Math.abs(x - z.x) < z.w / 2 + pad && Math.abs(y - z.y) < z.h / 2 + pad; }
  P.updateEnv = function (dt) {
    var p = this.player, wd = this.wdef, i, z;
    if (wd.waves) this.waterY = BAL.waterY + BAL.wavesAmp * Math.sin(2 * Math.PI * BAL.wavesHz * this.t);
    if (wd.drift && wd.drift.flip) { this.driftT += dt; if (this.driftT >= wd.drift.flip) { this.driftT = 0; this.driftDir *= -1; } }
    p.ext.x = p.ext.y = 0; p.zoneMul = 1; p.stealth = false; this.tide = 0;
    if (p.airborne || this.dying) return;
    var dv = this.currentOv != null ? this.currentOv : this.drift;                       // QA: setCurrent overrides the W4 current, 0 = off
    if (dv) p.ext.x += dv * this.driftDir;
    for (i = 0; i < this.zones.length; i++) {
      z = this.zones[i];
      if (z.shape === 'c') {
        var d = dist(p.x, p.y, z.x, z.y);
        if (d < z.r) {                                    // whirlpool: pull to the centre, the centre ejects
          if (z.cd > 0) z.cd -= dt;
          var dx = z.x - p.x, dy = z.y - p.y, dd = d || 1;
          p.ext.x += dx / dd * 150; p.ext.y += dy / dd * 150;
          if (d < 44 && z.cd <= 0) { z.cd = 2; this.push(-dx || 1, -dy, 420); this.emit('eject', { x: z.x, y: z.y }); }
        }
        continue;
      }
      if (!inRect(z, p.x, p.y, 0)) continue;
      if (z.kind === 'seaweed' || z.kind === 'kelp') { p.zoneMul = Math.min(p.zoneMul, z.mul); if (z.stealth) p.stealth = true; }
      else if (z.kind === 'current') { p.ext.x += z.vx; p.ext.y += z.vy; }
      else if (z.kind === 'thermal') p.ext.y += z.vy;
      else if (z.kind === 'vent' && this.ventActive(z)) p.ext.y -= 200;
    }
    // passive giants with a tide push (blue whale)
    for (i = 0; i < this.creatures.length; i++) {
      var c = this.creatures[i];
      if (c.def.sp && c.def.sp.tide && !c.dead && this.bodyHit(c)) { p.ext.x += (c.cvx >= 0 ? 1 : -1) * c.def.sp.tide; this.tide = c.def.sp.tide; }
    }
    // boss phase 2: whirlpool pull toward the boss
    if (this.ldef.boss === 'bloop' && this.bossPhase === 2) {
      for (i = 0; i < this.creatures.length; i++) if (this.creatures[i].boss) {
        var b = this.creatures[i], bx = b.x - p.x, by = b.y - p.y, bl = Math.sqrt(bx * bx + by * by) || 1;
        p.ext.x += bx / bl * 150; p.ext.y += by / bl * 150;
      }
    }
  };
  P.ventActive = function (z) { var ph = (this.t + z.t0) % 6; return ph >= 4.5; };       // plume every 6 s (1.5 s, warning 1 s before)
  P.ventWarn = function (z) { var ph = (this.t + z.t0) % 6; return ph >= 3.5 && ph < 4.5; };
  P.elecPhase = function (z) { var ph = (this.t + z.t0) % 3; return ph < 1.5 ? 'warn' : (ph < 2.5 ? 'active' : 'off'); };
  P.phaseNow = function () {
    if (!this.ldef.boss || this.ldef.boss !== 'bloop') return 0;
    var f = this.levelGP / this.goalGP;       // CR-3 (R-OE-23): phases at 0-33 / 33-66 / 66-100 % of the way to the goal form
    return f >= 2 / 3 ? 3 : (f >= 1 / 3 ? 2 : 1);
  };

  /* ================================================================ moving objects and hazards */
  P.addTentacle = function (x, kind) {
    var dir = this.rng.chance(0.5) ? 1 : -1;
    this.objs.push({ id: this.nextId++, kind: 'tent', x: x, baseY: FLOOR + 40, st: 'tele', t: 0, a0: -dir * 1.2, a1: dir * 1.2, len: this.rng.range(450, 620), ang: 0, side: kind || 0, pts: [] });
  };
  P.tentPoints = function (o) {
    var pts = [], n = 8, i, a = o.ang;
    for (i = 1; i <= n; i++) {
      var f = i / n;
      pts.push([o.x + Math.sin(a) * o.len * f + Math.sin(a * 2) * 40 * f * f, o.baseY - Math.cos(a) * o.len * f]);
    }
    return pts;
  };
  P.updateObjs = function (dt) {
    var i, o, p = this.player, b;
    // moving structures
    for (i = 0; i < this.obs.length; i++) {
      o = this.obs[i];
      if (o.kind === 'struct') { o.x += o.vx * dt; if (o.x < 60 || o.x > W - 60) o.vx = -o.vx; }
    }
    // spawners
    if (this.fallT !== undefined) {
      this.fallT -= dt;
      if (this.fallT <= 0) { this.fallT = this.rng.range(3.5, 5.5) / Math.max(1, this.ldef.obs.fall); this.objs.push({ id: this.nextId++, kind: 'frock', x: this.cam.x + this.rng.range(100, this.viewW - 100), y: this.waterY, st: 'tele', t: 0, r: 44 }); }
    }
    if (this.shockT !== undefined) {
      this.shockT -= dt;
      if (this.shockT <= 0) {
        this.shockT = 5;
        var src = null, st = []; for (i = 0; i < this.obs.length; i++) if (this.obs[i].kind === 'struct') st.push(this.obs[i]);
        src = st.length ? this.rng.pick(st) : { x: this.cam.x + this.rng.range(200, this.viewW - 200), y: this.rng.range(500, 900) };
        this.addRing(src.x, src.y, 4);
      }
    }
    if (this.ldef.boss === 'kraken') {
      var tc = 0; for (i = 0; i < this.objs.length; i++) if (this.objs[i].kind === 'tent') tc++;
      this.tentT -= dt;
      if (tc < 3 && this.tentT <= 0) { this.addTentacle(this.cam.x + this.rng.range(120, this.viewW - 120)); this.tentT = 1.2; }
    }
    if (this.ldef.boss === 'bloop') this.updateBoss(dt);
    this.updateWallObjs(dt);
    // objects
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i]; o.t = (o.t || 0) + dt;
      switch (o.kind) {
        case 'mine': if (o.y < FLOOR - 40) o.y += o.vy * dt; o.life -= dt; if (o.life <= 0) o.dead = true; break;
        case 'frock':
          if (o.st === 'tele' && o.t >= 1) { o.st = 'fall'; o.vy = 0; }
          if (o.st === 'fall') { o.vy = 700; o.y += 700 * dt; if (o.y > FLOOR) o.dead = true; }
          break;
        case 'crock':
          if (o.st === 'idle' && o.t >= o.tw) { o.st = 'shake'; o.t = 0; }
          else if (o.st === 'shake' && o.t >= 1) { o.st = 'fall'; o.t = 0; }
          else if (o.st === 'fall') { o.y += 700 * dt; if (o.y > FLOOR - 30) { o.st = 'gone'; o.t = 0; } }
          else if (o.st === 'gone' && o.t >= 6) { o.st = 'idle'; o.t = 0; o.y = o.y0; o.tw = this.rng.range(3, 6); }
          break;
        case 'ring': o.r += o.v * dt; if (o.r > 2200) o.dead = true; break;
        case 'shockring': if (o.t > o.life) o.dead = true; o.r = o.max * Math.min(1, o.t / 0.4); break;
        case 'sonar': o.r += 260 * dt; if (o.t > o.life) o.dead = true; break;
        case 'ink': if (o.t > o.life) o.dead = true; break;
        case 'tent':
          if (o.st === 'tele') { o.ang = o.a0; if (o.t >= 1.0) { o.st = 'sweep'; o.t = 0; } }
          else if (o.st === 'sweep') { o.ang = o.a0 + (o.a1 - o.a0) * Math.min(1, o.t / 2.4); if (o.t >= 2.4) { o.st = 'retract'; o.t = 0; } }
          else if (o.st === 'retract') { o.len -= 900 * dt; if (o.len < 20 || o.t > 1) o.dead = true; }
          o.pts = this.tentPoints(o);
          break;
        default: break;
      }
    }
    var alive = [];
    for (i = 0; i < this.objs.length; i++) if (!this.objs[i].dead) alive.push(this.objs[i]);
    this.objs = alive;
    var oa = [];
    for (i = 0; i < this.obs.length; i++) if (!this.obs[i].dead) oa.push(this.obs[i]);
    this.obs = oa;
    // pickups bob
    for (i = 0; i < this.pickups.length; i++) this.pickups[i].t += dt;
  };
  P.addRing = function (x, y, thick, speedMul) {
    this.objs.push({ id: this.nextId++, kind: 'ring', x: x, y: y, r: 40, v: 280 * (speedMul || 1), gap: Math.atan2(this.player.y - y, this.player.x - x) + this.rng.range(-0.5, 0.5), gapW: 1.25, thick: 46 });   // the gap opens towards the player's side (the water column is only 660 px high)
    this.emit('ring', { x: x, y: y });
  };
  P.updateBoss = function (dt) {
    var ph = this.phaseNow(), boss = null, i;
    for (i = 0; i < this.creatures.length; i++) if (this.creatures[i].boss) boss = this.creatures[i];
    if (!boss) return;
    if (ph !== this.bossPhase) { this.bossPhase = ph; this.emit('bossPhase', { phase: ph }); this.bt = 0; this.tentT2 = 2; }
    // CR-4 round 7 (UC-OE-120, same as the Side-scroller): phase 1 shock rings every 4 s; phase 2 tentacle columns, 3 at a time every 5 s; phase 3 both, the rings 20 % faster
    this.bt = (this.bt === undefined ? 2 : this.bt) - dt;
    if (ph !== 2 && this.bt <= 0) { this.bt = ph === 1 ? 4 : 5 / 1.2; this.bossShockWall(ph === 3 ? 1.2 : 1); }
    if (ph === 2 || ph === 3) {
      this.tentT2 = (this.tentT2 === undefined ? 1 : this.tentT2) - dt;
      if (this.tentT2 <= 0) { this.tentT2 = ph === 3 ? 5 / 1.2 : 5; this.bossColumns(3); }
    }
  };

  /* ================================================================ collisions */
  P.collide = function (dt) {
    var p = this.player;
    this.collectPickups();
    if (p.airborne) return;
    this.collideCreatures();
    this.collideObjs(dt);
    this.collideWallObjs();
  };
  P.collectPickups = function () {
    var p = this.player, i, pk, m = this.mouth();
    if (p.airborne) return;
    var keep = [];
    for (i = 0; i < this.pickups.length; i++) {
      pk = this.pickups[i];
      if (dist(p.x, p.y, pk.x, pk.y) < p.r + 28 || dist(m.x, m.y, pk.x, pk.y) < m.r + 20) {
        this.addCoins(pk.value, 'pickup', pk.x, pk.y);
      } else keep.push(pk);
    }
    this.pickups = keep;
  };
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }
  P.collideObjs = function (dt) {
    var p = this.player, i, o, z, j;
    for (i = 0; i < this.obs.length; i++) {
      o = this.obs[i];
      if (o.haz && dist(p.x, p.y, o.x, o.y) < p.r + o.r) this.damage({ name: o.name, kind: 'hazard', id: o.kind }, o.x, o.y);
    }
    for (i = 0; i < this.zones.length; i++) {
      z = this.zones[i];
      if (z.kind === 'lava' && inRect(z, p.x, p.y, -p.r * 0.3)) { z.cd -= dt; if (z.cd <= 0) { if (this.damage({ name: 'Lava', kind: 'hazard', id: 'lava' }, z.x, z.y)) z.cd = 1; else z.cd = 0.2; } }
      if (z.kind === 'elec' && this.elecPhase(z) === 'active' && inRect(z, p.x, p.y, -p.r * 0.2)) this.damage({ name: 'Electric zone', kind: 'hazard', id: 'electric' }, z.x, z.y);
    }
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i];
      switch (o.kind) {
        case 'mine': if ((o.t || 0) >= (o.arm || 0) && dist(p.x, p.y, o.x, o.y) < p.r + 32) { if (this.damage({ name: 'Sea mine', kind: 'hazard', id: 'mine' }, o.x, o.y)) { o.dead = true; this.emit('break', { x: o.x, y: o.y, kind: 'mine', r: 60 }); } } break;
        case 'frock': if (o.st === 'fall' && dist(p.x, p.y, o.x, o.y) < p.r + o.r) this.damage({ name: 'Falling rock', kind: 'hazard', id: 'fallingrock' }, o.x, o.y); break;
        case 'crock': if (o.st === 'fall' && dist(p.x, p.y, o.x, o.y) < p.r + o.r) this.damage({ name: 'Collapsing rock', kind: 'hazard', id: 'collapsingrock' }, o.x, o.y); break;
        case 'ring':
          var d = dist(p.x, p.y, o.x, o.y);
          if (Math.abs(d - o.r) < o.thick / 2 + p.r * 0.7) {
            var a = Math.atan2(p.y - o.y, p.x - o.x);
            if (angDiff(a, o.gap) > o.gapW / 2) this.damage({ name: 'Shockwave', kind: 'hazard', id: 'shockwave' }, o.x, o.y);
          }
          break;
        case 'tent':
          if (o.st !== 'tele') for (j = 0; j < o.pts.length; j++) if (dist(p.x, p.y, o.pts[j][0], o.pts[j][1]) < p.r + 34) { this.damage({ name: 'Tentacle', kind: 'hazard', id: 'tentacle' }, o.pts[j][0], o.pts[j][1]); break; }
          break;
        default: break;
      }
    }
  };

  /* ================================================================ spawn logic */
  P.spawnLogic = function (dt) {
    if (this.noSpawn) return;
    var ld = this.ldef, i, e;
    // food
    this.foodT -= dt;
    // spawn events (spec v4.1, R-OE-42): prey (the calibrated stream), peers and threats at the rates 55 : 15 : 30
    var I = [2.2, 2.0, 1.8, 1.6, 1.4][this.level - 1] * this.preyMult(), cl = this.classes(), hasT = cl.threat.length > 0, W = BAL.GROWTH.SPAWN_WEIGHTS, qq;
    if (this.foodT <= 0) { this.foodT = I; this.ev.prey++; if (this.foodCost() < this.foodTarget() - 0.01) this.spawnFood(false); }                  // an event whose slot is full (the world holds all the food it should) still counts as a prey event
    if (hasT) {
      this.peerT = (this.peerT === undefined ? I * W.prey / W.peer * 0.6 : this.peerT) - dt;
      if (this.peerT <= 0) { this.peerT = I * W.prey / W.peer; this.ev.peer++; var livePeers = 0; for (qq = 0; qq < this.creatures.length; qq++) if (this.creatures[qq].peerSlot && !this.creatures[qq].dead) livePeers++; if (this.foodCost() < this.foodTarget() - 0.01 && livePeers < Math.max(3, Math.round(this.foodTarget() * 0.35))) this.spawnFood(false, this.peerPick()); }   // peers are never eaten: at most about a third of the prey budget alive
      // spec v4.2 (R-OE-42, Classic): the mix is a LIVE composition - threats are about 25..40 % of the live non-surface creatures. Every 0.5 s: below the band a threat
      // (sized for the CURRENT form) is spawned, above it the farthest threat outside the view is recycled; prey / peers keep their own streams
      // CR-4 round 8 (R-OE-50 in Classic): predator and hazard STREAMS on the difficulty table (interval, max predators alive, hazard types) like the Side-scroller; boss waves have priority (no
      // normal spawn while one is queued / telegraphed / active); the live share is only a sanity band: below 20 % a threat is topped up, above 55 % the farthest one outside the view is recycled
      var D = this.diff, busy = !!(this.bossBusy && this.bossBusy()), scripted = this.bossIsScripted && this.bossIsScripted(), np = 0, nh = 0, hz = {}, tcnt, tc2;
      for (qq = 0; qq < this.creatures.length; qq++) { tc2 = this.creatures[qq]; if (tc2.dead || tc2.faded || tc2.def.k === 'pas' || tc2.bossAtk) continue; if (tc2.leaving) continue; if (tc2.role === 'predator') np++; else if (tc2.role === 'hazard') { nh++; hz[tc2.type] = 1; } }
      for (qq = 0; qq < this.respawn.length; qq++) { if (CR[this.respawn[qq].type].k === 'pred') np++; }                           // a predator waiting to come back counts
      tcnt = Object.keys(hz).length;
      if ((ld.pred || []).length && !scripted) {
        this.predT = (this.predT === undefined ? D.pred : this.predT) - dt;
        if (this.predT <= 0) { if (busy) this.predT = 0.4; else if (np >= D.maxpred && !this.retireFar('predator')) this.predT = 1; else { this.spawnSpecial(this.rng.wpick(ld.pred), 1); this.ev.threat++; this.predT = D.pred; } }      // at the cap the farthest predator outside the view is retired for the new one
      }
      if ((ld.haz || []).length) {
        this.hazT = (this.hazT === undefined ? D.haz : this.hazT) - dt;
        if (this.hazT <= 0) {
          var hid = this.rng.wpick(ld.haz);
          if (busy) this.hazT = 0.4; else if ((tcnt >= D.haztypes && !hz[hid]) || (nh >= Math.min(BAL.GROWTH.CLASSIC_THREAT_MAX, D.haztypes * 2) && !this.retireFar('hazard'))) this.hazT = 1; else { this.spawnSpecial(hid, 1); this.ev.threat++; this.hazT = D.haz; }
        }
      }
      this.thrT2 = (this.thrT2 === undefined ? 1 : this.thrT2) - dt;
      if (this.thrT2 <= 0 && !this.dying) {
        this.thrT2 = 0.5;
        var liveT = 0, liveN = 0, liveP = 0;
        for (qq = 0; qq < this.creatures.length; qq++) { var tc = this.creatures[qq]; if (tc.dead || tc.faded || tc.def.k === 'pas' || tc.role === 'passive') continue;
          if (tc.persist && tc.role !== 'predator' && tc.role !== 'hazard' && Math.abs(tc.x - this.player.x) > this.viewW * 0.6) { tc.dead = true; continue; }          // a threat the player has outgrown and that is out of sight is retired (the next one is sized for the current form)
          liveN++; if (tc.role === 'predator') liveP++; if (tc.role === 'predator' || tc.role === 'hazard') liveT++; }
        if (!busy && liveT / Math.max(1, liveN) < (this.bossInfo ? 0.4 : BAL.GROWTH.CLASSIC_THREAT_BAND_SANITY[0]) && liveT < (this.bossInfo ? 24 : BAL.GROWTH.CLASSIC_THREAT_MAX)) {      /* the boss levels (the director supplies the predators) top up hazards towards 40 % (the crossers do not stay), the other levels only below the 20 % sanity edge */ this.spawnSpecial(liveP >= D.maxpred && (this.ldef.haz || []).length ? this.rng.wpick(this.ldef.haz) : this.pickThreat(true), 1); this.ev.threat++; }
        else if (liveT > 1 && liveT / liveN > BAL.GROWTH.CLASSIC_THREAT_BAND_SANITY[1]) {      // too many: recycle the farthest threat that is outside the view
          var far = null, fd = 0, px = this.player.x;
          for (qq = 0; qq < this.creatures.length; qq++) { var fc = this.creatures[qq]; if (!fc.dead && !fc.faded && (fc.role === 'predator' || fc.role === 'hazard') && fc.def.k !== 'pas' && Math.abs(fc.x - px) > this.viewW * 0.6 && Math.abs(fc.x - px) > fd) { far = fc; fd = Math.abs(fc.x - px); } }
          if (far) far.dead = true;
        }
      }
    }
    // CR-3: roles follow the current size, so after growth the old predators become prey: keep at least one threat in the level (spawned by the CURRENT size, outside the view)
    this.threatT = (this.threatT === undefined ? 4 : this.threatT) - dt;
    if (this.threatT <= 0) {
      this.threatT = 3;
      var lst = (ld.pred || []).concat(ld.haz || []), th = 0, q;
      if (lst.length && !this.dying) {
        for (q = 0; q < this.creatures.length; q++) { var cc = this.creatures[q]; if (!cc.dead && !cc.faded && (cc.role === 'predator' || cc.role === 'hazard') && cc.def.k !== 'pas') th++; }
        if (th === 0 && this.respawn.length === 0 && !(this.bossBusy && this.bossBusy())) this.spawnSpecial(this.pickThreat(), 1);
      }
    }
    // persistent predators/hazards removed by distance come back outside the view, far from the player
    for (i = this.respawn.length - 1; i >= 0; i--) {
      var rs = this.respawn[i];
      if (this.t < rs.t) continue;
      if (this.bossBusy && this.bossBusy()) { rs.t = this.t + 0.5; continue; }                // boss priority: nothing normal comes back while a wave is queued / telegraphed / active
      var rdef = CR[rs.type], rx, ry, rc;
      if (rdef.k === 'pred') { var lp = 0, qz; for (qz = 0; qz < this.creatures.length; qz++) if (!this.creatures[qz].dead && this.creatures[qz].role === 'predator' && !this.creatures[qz].bossAtk) lp++; if (lp >= this.diff.maxpred) { this.respawn.splice(i, 1); continue; } }      // never more predators alive than the difficulty table allows
      if (rdef.ai === 'ambush' || rdef.ai === 'rush') { var hs = this.homeSpot(); rx = hs.x; ry = hs.y; }
      else { rx = this.edgeSpawn(BAL.spawnFar); ry = this.bandPick(rdef); if (rdef.ai === 'sub') ry = this.waterY + 260; }
      if (rx === null) { rs.t = this.t + 2; continue; }
      rc = this.spawnCreature(rs.type, rx, ry, {}); rc.persist = true; this.respawn.splice(i, 1);
    }
    // passive crossers
    var pas = ld.pas || [];
    for (i = 0; i < pas.length; i++) {
      if (this.pasT[i] === undefined) continue;
      this.pasT[i] -= dt;
      if (this.pasT[i] <= 0) { this.spawnCross(pas[i][0]); this.pasT[i] = pas[i][2] > 0 ? pas[i][2] : undefined; }
    }
    // periodic growth sources
    var per = ld.per || [];
    for (i = 0; i < per.length; i++) {
      this.perT[i] -= dt;
      if (this.perT[i] <= 0) { this.perT[i] = per[i].every; this.spawnPeriodic(per[i]); }
    }
    // surface
    this.surfT -= dt;
    if (this.surfT <= 0) { this.surfT = BAL.surfaceInterval[this.level - 1]; this.spawnSurfaceNext(); }
    else if (this.t - this.lastEligibleT > 20) { this.surfT = BAL.surfaceInterval[this.level - 1]; this.lastEligibleT = this.t; this.spawnSurfaceNext(true); }
    // events: scheduled by the form (Sim.scheduleEvent, once per level, 20 s after the form reached the event form)
    this.updateEvent(dt);
  };
  P.spawnCross = function (id) {
    var def = CR[id], dir = this.rng.chance(0.5) ? 1 : -1;
    var y = this.rng.range(this.waterY + 150, FLOOR - 150);
    var c = this.spawnCreature(id, 0, y, { cross: true, facing: dir });
    c.x = dir > 0 ? this.viewLeft() - BAL.spawnMarginX - c.len * 0.5 : this.viewRight() + BAL.spawnMarginX + c.len * 0.5;
    c.cvx = dir * def.spd * c.len;
  };
  P.spawnPeriodic = function (spec) {
    var def = CR[spec.id], i;
    if (def.ai === 'school') {
      var dir = this.rng.chance(0.5) ? 1 : -1, y = this.rng.range(this.waterY + 150, FLOOR - 150);
      var gx = dir > 0 ? this.viewLeft() - BAL.spawnMarginX : this.viewRight() + BAL.spawnMarginX;
      var gr = this.newGroup(gx, y, 'school'); gr.cross = true; gr.n = spec.n; gr.vx = dir * 260; gr.vy = 0;
      for (i = 0; i < spec.n; i++) {
        var c = this.spawnCreature(spec.id, gr.cx + this.rng.range(-70, 70), y + this.rng.range(-60, 60), { group: gr, cross: true, facing: dir });
        c.cost = 0;
      }
    } else {
      for (i = 0; i < spec.n; i++) {
        var ex = this.edgeSpawn(BAL.spawnNear); if (ex === null) continue;
        var c2 = this.spawnCreature(spec.id, ex, this.bandPick(def), {});
        c2.cost = 0;
      }
    }
  };

  /* ================================================================ surface targets */
  P.surfList = function () {
    var out = [], s = this.wdef.surf, i;
    for (i = 0; i < s.length; i++) if (s[i][1] <= this.level) out.push(s[i][0]);
    return out;
  };
  // CR-3 (R-OE-41): the pool follows the CURRENT form in any world: 50 % an eligible item of the world list, 25 % a teaser one tier above (Too Big Marker),
  // 25 % a global-catalog target of tier form-1 or form (world-flavoured items first); at least one eligible target every 20 s (forceEligible)
  P.spawnSurfaceNext = function (forceEligible) {
    if (this.deep) return;                                                              // CR-4: no surface targets in the deep ocean
    var list = this.surfList(), form = this.form, pool = BAL.GROWTH.SURFACE_POOL, k, cand, pick = null, rng = this.rng, active = 0, i;
    this.surfCount++;
    for (i = 0; i < this.surface.length; i++) if (!this.surface[i].dead && !this.surface[i].ev) active++;
    if (active >= 4) return;
    function inCat(f) { var o = []; for (k in SF) if (f(SF[k]) && SF[k].mot !== 'static') o.push(k); return o; }
    function prefer(cands) { var w = cands.filter(function (q) { return list.indexOf(q) >= 0; }); return w.length ? w : cands; }
    var r = rng.next();
    if (forceEligible || r < pool.world_list_eligible) {
      cand = list.filter(function (q) { return SF[q].tier <= form; });
      if (cand.length) pick = rng.pick(cand);
    } else if (r < pool.world_list_eligible + pool.teaser_next_tier) {
      cand = prefer(inCat(function (d) { return d.tier === form + 1; }));
      if (cand.length) pick = rng.pick(cand);
    } else {
      cand = prefer(inCat(function (d) { return d.tier === form || d.tier === form - 1; }));
      if (cand.length) pick = rng.pick(cand);
    }
    if (!pick) { cand = prefer(inCat(function (d) { return d.tier <= form && d.tier >= form - 2; })); if (!cand.length) cand = inCat(function (d) { return d.tier <= form; }); if (cand.length) pick = rng.pick(cand); }
    if (!pick && list.length) pick = rng.pick(list);
    if (pick) this.spawnSurface(pick, 'side', {});
  };
  // QA / internal: x may be a number, 'overPlayer' or 'side'
  P.spawnSurface = function (type, x, o) {
    var d = SF[type]; if (!d) return null;
    o = o || {};
    var p = this.player, dir = o.dir || (this.rng.chance(0.5) ? 1 : -1), hold = 0, y;
    var lo = d.alt[0], hi = d.alt[1], cy;
    if (o.alt !== undefined) cy = o.alt;
    else if (lo === 0) cy = hi / 2;
    else cy = this.rng.range(lo + d.h * 0.1, hi - d.h * 0.1 > lo ? hi - d.h * 0.1 : hi);
    if (x === 'overPlayer') { x = p.x; hold = 1.2; }
    else if (this.side && (x === 'side' || x === undefined)) {                 // Side-scroller: always from the right, moving left at 0.6 x speed; yellow marker 1 s before it enters
      dir = -1;
      var cl = d.mot === 'static' ? this.fwdBase() : SD().surfaceSpeedMul * d.spd + this.fwdBase();
      x = this.viewRight() + d.w / 2 + Math.max(SD().spawnAhead, cl * SD().telegraphS);
    }
    else if (x === 'side' || x === undefined) {
      if (d.mot === 'static') x = this.cam.x + this.rng.range(d.w / 2 + 60, Math.max(d.w / 2 + 61, this.viewW - d.w / 2 - 60));
      else x = dir > 0 ? this.viewLeft() - d.w / 2 - 10 : this.viewRight() + d.w / 2 + 10;
    }
    var t = {
      id: this.nextId++, type: type, def: d, tier: d.tier, x: x, y: this.waterY - cy, cy: cy, w: d.w, h: (lo === 0 ? hi : d.h), dir: dir,
      spd: o.spd || d.spd * (this.side ? BAL.SIDE.surfaceSpeedMul : 1), mot: d.mot, hold: hold, life: d.mot === 'static' ? OE.STATIC_LIFE : 999, bites: d.bites || 0, biteN: 0,
      ev: o.ev || null, ph: this.rng.range(0, 6.28), dead: false, eligible: d.tier <= this.form, tb: 0, t: 0, entered: d.mot === 'static' || hold > 0, hover: 0
    };
    this.surface.push(t);
    if (t.eligible) this.lastEligibleT = this.t;
    this.surfaceHistory.push({ type: type, tier: d.tier, t: this.t });
    if (this.surfaceHistory.length > 400) this.surfaceHistory.shift();
    this.emit('surfaceSpawn', { id: t.id, type: type });
    return t;
  };
  P.updateSurface = function (dt) {
    var i, t;
    for (i = 0; i < this.surface.length; i++) {
      t = this.surface[i];
      t.t += dt; t.eligible = t.tier <= this.form;
      if (t.tb > 0) t.tb -= dt;
      if (t.dead) continue;
      if (t.hold > 0) t.hold -= dt;
      else {
        switch (t.mot) {
          case 'sail': t.x += t.dir * t.spd * dt; break;
          case 'fly': t.x += t.dir * t.spd * dt; break;
          case 'swarm': t.x += t.dir * t.spd * dt; break;
          case 'serpent': t.x += t.dir * t.spd * dt; break;
          case 'heli':
            if (t.hover > 0) t.hover -= dt;
            else {
              t.x += t.dir * t.spd * dt;
              if (!t.hovered && Math.abs(t.x - (this.cam.x + this.viewW / 2)) < 30) { t.hovered = true; t.hover = 2.0; }
            }
            break;
          case 'static': t.life -= dt; break;
          default: break;
        }
      }
      var bob = 0;
      if (t.mot === 'sail') bob = Math.sin(t.t * 2 + t.ph) * 3;
      else if (t.mot === 'fly') bob = Math.sin(t.t * 2.4 + t.ph) * (t.def.id === 'gull' ? 14 : 4);
      else if (t.mot === 'swarm') bob = Math.sin(t.t * 1.6 + t.ph) * 10;
      else if (t.mot === 'serpent') bob = Math.sin(t.t * 1.5 + t.ph) * 45;
      t.y = this.waterY - t.cy + bob;
      var inside = t.x > this.cam.x - t.w / 2 && t.x < this.cam.x + this.viewW + t.w / 2;
      if (inside) t.entered = true;
      if (t.mot !== 'static' && t.entered && !inside) t.dead = true;
      if (t.mot === 'static' && t.life <= 0) t.dead = true;
      if (this.side && t.x < this.cam.x - t.w - 300) t.dead = true;                  // scrolled past
      if (t.t > 90) t.dead = true;
    }
    var alive = [];
    for (i = 0; i < this.surface.length; i++) {
      t = this.surface[i];
      if (!t.dead) alive.push(t);
    }
    this.surface = alive;
  };
  function circleRect(cx, cy, r, t) {
    var nx = clamp(cx, t.x - t.w / 2, t.x + t.w / 2), ny = clamp(cy, t.y - t.h / 2, t.y + t.h / 2);
    return dist(cx, cy, nx, ny) < r;
  }
  P.collideSurface = function () {
    var p = this.player, j = p.jump, i, t, m = this.mouth();
    if (!j) return;
    for (i = 0; i < this.surface.length; i++) {
      t = this.surface[i];
      if (t.dead) continue;
      var box = t;
      if (t.def.alt[0] === 0) box = { x: t.x, y: this.waterY - t.def.alt[1] / 2, w: t.w, h: t.def.alt[1] };
      if (!circleRect(m.x, m.y, m.r, box)) continue;
      if (t.tier > this.form) {
        if (!j.bounced) {            // too big: bounce, no damage
          j.bounced = true; j.t = Math.max(j.t, 0.42 * j.T); j.vx *= -0.6;
          t.tb = 1.2;
          this.emit('tooBig', { id: t.id, type: t.type, x: m.x, y: m.y });
        }
        continue;
      }
      if (t.bites) {
        if (j.hit[t.id]) continue;
        j.hit[t.id] = true;
        this.biteTarget(t, m);
      } else this.eatSurface(t, m);
    }
  };
  P.eatSurface = function (t, m) {
    var d = t.def, gp = Math.max(1, d.pct / 100 * BAL.GROWTH.SURFACE_REWARD_BASE_GP), coins = d.coins, extra = 0;       // CR-3: percent of ONE form step (60 GP)
    t.dead = true;
    if (t.ev === 'aircraft_challenge' && this.evt) { this.evt.streak++; extra = Math.max(1, 0.05 * this.evt.streak * BAL.GROWTH.SURFACE_REWARD_BASE_GP); gp += extra; }
    if (d.id === 'heli') coins += this.rng.int(10, 30);                    // special reward roll
    this.stats.surfaceEaten++; this.player.biteT = 0.15;
    this.emit('surfaceEat', { id: t.id, type: t.type, x: t.x, y: t.y, gp: gp, coins: coins, w: t.w, h: t.h, debris: d.debris, chest: d.chest, containers: d.containers, ev: t.ev });
    if (coins > 0) this.addCoins(coins, 'surface:' + t.type, t.x, t.y);
    if (t.ev && this.evt && t.ev === this.evt.id) this.evt.success = true;
    this.gain(gp);
  };
  P.biteTarget = function (t, m) {
    var d = t.def, per = d.pct / d.bites, gp = Math.max(1, per / 100 * BAL.GROWTH.SURFACE_REWARD_BASE_GP), coins = Math.round(d.coins / d.bites);
    t.biteN++;
    this.stats.surfaceEaten += t.biteN === d.bites ? 1 : 0; this.player.biteT = 0.15;
    var last = t.biteN >= t.bites;
    this.emit('surfaceBite', { id: t.id, type: t.type, x: t.x, y: t.y, stage: t.biteN, of: t.bites, gp: gp, coins: coins, w: t.w, h: t.h, last: last, ev: t.ev });
    this.addCoins(coins, 'surface:' + t.type, t.x, t.y);
    if (last) { t.dead = true; if (t.ev && this.evt && t.ev === this.evt.id) this.evt.success = true; }
    this.gain(gp);
  };
  P.qaSpawnSurface = function (type, x, o) { return this.spawnSurface(type, x, o || {}); };

  /* ================================================================ surface events */
  P.startEvent = function (id, forced) {
    var def = EV[id]; if (!def) return false;
    if (this.evt) this.endEvent();
    this.eventDone = true;
    this.evt = { id: id, start: this.t, end: this.t + def.win, success: false, streak: 0, queue: [], ids: [] };
    this.emit('eventStart', { id: id });
    var f = this.form, t;
    if (id === 'pirate_treasure') { t = this.spawnSurface('pirate', 'side', { ev: id }); this.evt.ids.push(t.id); }
    else if (id === 'cargo_ship') { t = this.spawnSurface('cargo', 'side', { ev: id }); this.evt.ids.push(t.id); }
    else if (id === 'island_destruction') {
      t = this.spawnSurface(f >= 8 && this.world === 7 ? 'bigisland' : 'islet', 'side', { ev: id }); this.evt.ids.push(t.id);
    } else if (id === 'aircraft_challenge') {
      var opts = ['heli', 'smallplane', 'jet'].filter(function (k) { return SF[k].tier <= f; });
      if (!opts.length) opts = ['heli'];
      for (var i = 0; i < 3; i++) this.evt.queue.push({ at: this.t + i * 4.5, type: opts[i % opts.length] });
    }
    return true;
  };
  P.updateEvent = function (dt) {
    var e = this.evt, i;
    if (!e) return;
    while (e.queue.length && this.t >= e.queue[0].at) {
      var q = e.queue.shift(), t = this.spawnSurface(q.type, 'side', { ev: e.id });
      e.ids.push(t.id);
    }
    var live = 0;
    for (i = 0; i < this.surface.length; i++) if (this.surface[i].ev === e.id && !this.surface[i].dead) live++;
    if (this.t >= e.end || (!e.queue.length && !live && this.t > e.start + 0.5)) this.endEvent();
  };
  P.endEvent = function () {
    var e = this.evt; if (!e) return;
    for (var i = 0; i < this.surface.length; i++) if (this.surface[i].ev === e.id) this.surface[i].dead = true;
    this.evt = null;
    this.emit('eventEnd', { id: e.id, success: e.success });
  };
})(typeof window !== 'undefined' ? window : globalThis);
