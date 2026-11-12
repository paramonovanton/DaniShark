/* Ocean Evolution - Side-scroller controller (CR-2, spec v3 sections 2c, 2d, 18). Extends OE.Sim; used when the Sim is created with
   controlMode 'side'. Eating, growth, hearts, coins, surface targets and level end are shared with Classic (sim.js / sim_ai.js / sim_world.js);
   this file replaces only the movement:
     - player: forward speed by form, gravity, tap = upward kick, seabed safe, surface jump by tap near the waterline, camera locked at 30%
     - creatures: Movers (STRAIGHT LINE FLOOR DIAGONAL ZIGZAG ONE_TURN VERT_BOUNCE CROSS AMBUSH_DASH GROUP) with turn points seeded at spawn,
       no steering and no reference to the player except proximity triggers (puffer, snapping crab, ambusher, strike, sonar)
     - Spawner: off-screen right, 7 lanes, intervals per level, fairness checks (free corridor, predator window), Threat Markers
   All numbers are BAL.SIDE / OE.SIDE_MOVE in data.js [DEFAULT - tune in playtest]. Pure JS, no DOM. */
(function (g) {
  'use strict';
  var OE = g.OE, BAL = OE.BAL, SD = BAL.SIDE, U = OE.util, CR = OE.CREATURES, SF = OE.SURFACE, SM = OE.SIDE_MOVE, Sim = OE.Sim, P = Sim.prototype;
  var clamp = U.clamp, sign = U.sign, RAD = Math.PI / 180, FLOOR = BAL.seabedY;

  /* ================================================================ setup */
  P.fwdBase = function () { return SD.forwardSpeed[this.form - 1]; };
  P.buildSide = function () {
    var ld = this.ldef, L = this.level - 1, i, n;
    this.fwd = this.fwdBase(); this.fallMul = 1; this.lastKickT = -1; this.noSpawn = false;
    this.sT = { prey: 0.4, pred: SD.interval.pred[L] ? SD.interval.pred[L] * 0.5 : 0, haz: SD.interval.haz[L] * 0.5, coin: 2.5, fall: 5, shock: 6, boss: 2, tent: 3, per: [], pas: [], env: {} };
    this.surfT = 4;
    var per = ld.per || [], pas = ld.pas || [], k, kinds = ld.obs || {};
    for (i = 0; i < per.length; i++) this.sT.per[i] = per[i].at;
    for (i = 0; i < pas.length; i++) this.sT.pas[i] = pas[i][1];
    for (k in kinds) if (k !== 'fall' && k !== 'shock' && k !== 'crevice') this.sT.env[k] = this.rng.range(2, 6);
    // the level starts with prey on screen (ahead of the player)
    n = Math.round(BAL.foodMax[L] * 0.6);
    for (i = 0; i < n && this.foodCost() < BAL.foodMax[L] * SD.maxOnScreenPrey; i++) this.spawnPrey(this.player.x + this.rng.range(480, this.viewW * 0.7 + 500));
    if (ld.boss === 'bloop') {
      var b = this.spawnCreature('bloop', this.viewW, 760, { facing: -1 });
      b.boss = true; b.mv = { pat: 'BOSS', segs: [], idx: 0 }; this.bossPhase = 1;
    }
  };

  /* ================================================================ input */
  // a tap: the surface jump when the mouth is within 0.6 body lengths of the waterline, otherwise an upward kick
  P.sideTap = function () {
    var p = this.player;
    if (!this.side || this.dying || this.ended || this.halted) return false;
    if (this.jumpEligible()) return this.jump();
    if (p.airborne) return false;
    if (this.lastKickT >= 0 && this.t - this.lastKickT < SD.kickMinMs / 1000 - 1e-9) return false;     // kicks closer than 90 ms count once
    p.vy = -SD.kickVy[this.form - 1]; this.lastKickT = this.t; this.stats.kicks++;
    this.emit('kick', { x: p.x, y: p.y });
    return true;
  };

  /* ================================================================ step */
  P.stepSide = function (dt) {
    if (this.halted || this.ended === 'win') return;
    this.stepNo++; this.t += dt;
    this.updateEnvSide(dt);
    this.updatePlayerSide(dt);
    this.snapCamera(); this.updateCameraY(dt); this.stepBoss(dt);
    if (!this.dying) {
      this.updateObjsSide(dt);
      this.updateCreaturesSide(dt);
      this.updateSurface(dt);
      this.collide(dt);
      this.collideSide(dt);
      if (!this.noSpawn) this.spawnLogicSide(dt);
    } else this.updateObjsSide(dt);
    this.checkEnd();
  };

  /* ---- environment: zones change the forward speed, the fall speed or push vertically ---- */
  function inRect(z, x, y) { return Math.abs(x - z.x) < z.w / 2 && Math.abs(y - z.y) < z.h / 2; }
  P.updateEnvSide = function (dt) {
    var p = this.player, wd = this.wdef, i, z, mulF = 1, fallMul = 1, add = 0, extY = 0;
    if (wd.waves) this.waterY = BAL.waterY + BAL.wavesAmp * Math.sin(2 * Math.PI * BAL.wavesHz * this.t);
    if (wd.drift && wd.drift.flip) { this.driftT += dt; if (this.driftT >= wd.drift.flip) { this.driftT = 0; this.driftDir *= -1; } }
    p.ext.x = 0; p.stealth = false; this.tide = 0;
    if (!p.airborne && !this.dying) {
      var cur = this.currentOv != null ? this.currentOv : (wd.drift && wd.drift.flip ? SD.strongCurrentFwd : 0);   // World 4: strong current, flips every 12 s (QA: setCurrent overrides, 0 = off)
      if (cur) add += this.driftDir * cur;
      for (i = 0; i < this.zones.length; i++) {
        z = this.zones[i];
        if (z.shape === 'c') { if (U.dist(p.x, p.y, z.x, z.y) < z.r) extY += (z.sgn || 1) * SD.tumble; continue; }   // whirlpool: tumble zone, no damage
        if (!inRect(z, p.x, p.y)) continue;
        if (z.kind === 'seaweed') { mulF = Math.min(mulF, SD.seaweedFwd); fallMul = Math.min(fallMul, SD.seaweedFall); }
        else if (z.kind === 'kelp') mulF = Math.min(mulF, SD.kelpFwd);
        else if (z.kind === 'current') add += (z.vx < 0 ? -1 : 1) * SD.currentFwd;
        else if (z.kind === 'thermal') extY -= SD.vent;
        else if (z.kind === 'vent' && this.ventActive(z)) extY -= SD.vent;
      }
    }
    var tm = (p.peerT > 0 ? SD.peerSlow.mul : 1) * (p.slowT > 0 ? 0.5 : 1) * (p.grabT > 0 ? 0.5 : 1);
    this.fwd = p.airborne ? this.fwdBase() : Math.max(SD.minFwd, this.fwdBase() * mulF * tm + add);
    this.fallMul = fallMul; p.ext.y = extY; p.zoneMul = mulF;
  };

  /* ---- player ---- */
  P.updatePlayerSide = function (dt) {
    var p = this.player;
    this.updateLen(dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.blink > 0) p.blink -= dt;
    if (p.slowT > 0) p.slowT -= dt;
    if (p.grabT > 0) p.grabT -= dt;
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.biteT > 0) p.biteT -= dt;
    if (p.peerT > 0) p.peerT -= dt;
    if (p.shoveT > 0) p.shoveT -= dt;
    if (this.dying) {
      this.dyingT -= dt; p.y += 140 * dt; p.ang = 0.9;
      if (this.dyingT <= 0 && !this.ended) { this.ended = 'fail'; this.halted = true; this.emit('fail', { cause: this.cause }); }
      return;
    }
    p.facing = 1;
    if (p.airborne) { this.updateJump(dt); p.vx = this.fwd; return; }
    var vOld = p.vy;
    p.vy = clamp(p.vy + SD.gravity * dt, -SD.maxRise, SD.maxFall * this.fallMul);
    var dy = ((vOld + p.vy) / 2 + p.ext.y + (p.shoveT > 0 ? p.shoveVy : 0)) * dt;      // trapezoid: a 560 px/s kick rises 92 px
    p.x += this.fwd * dt; p.y += dy;
    var yb = this.yBounds(), minY = yb[0], maxY = yb[1];                       // water surface above, the floor lane below (BUG-U1: the body reaches the floor creatures); the seabed is safe: rest and slide
    if (p.y < minY) { p.y = minY; p.vy = Math.max(0, p.vy); }
    else if (p.y > maxY) { p.y = maxY; p.vy = Math.min(0, p.vy); }
    p.vx = this.fwd;
    this.stats.moved += Math.abs(dy) + this.fwd * dt;
    var tgt = clamp(p.vy * 0.0007, -0.45, 0.5);
    p.tilt += (tgt - p.tilt) * Math.min(1, 8 * dt);
    p.ang = p.tilt;
    var el = this.jumpEligible();
    if (el && !p.wasEligible) this.emit('jumpReady', {});
    p.wasEligible = el;
  };

  /* ================================================================ movers */
  P.laneY = function (def, pat) {
    var name = def.sband, rng = this.rng;
    if (!name) { var r = rng.next(); name = r < 0.7 ? 'mid' : (r < 0.85 ? 'surface' : 'deep'); }
    if (pat === 'FLOOR' || def.ai === 'bottom' || name === 'floor') return FLOOR + 22;
    var ls = SD.laneBand[name], lane = ls[rng.int(0, ls.length - 1)];
    return this.lanes[lane];
  };
  P.closingOf = function (v) { return Math.min(SD.maxClosing, v + this.fwdBase()); };
  P.aheadX = function (closing) { return this.viewRight() + Math.max(SD.spawnAhead + 0.8 * this.fwd, closing * SD.telegraphS); };       // CR-4 round 9: >= 240 units beyond the edge even a good 0.8 s later (the view moves on at the forward speed)

  // build the linear segments of a pattern; a segment {t, vx, vy} starts at creature time t
  P.initMover = function (c, pat, v, sm) {
    var rng = this.rng, mv = c.mv = { pat: pat, segs: [], idx: 0, y0: c.y }, segs = mv.segs, a, i, n, t = 0, dirI;
    sm = sm || {};
    dirI = c.y < (this.waterY + FLOOR) / 2 ? 1 : -1;                           // +1 = heads down: toward the middle of the water column
    if (rng.chance(0.2)) dirI = -dirI;
    function vec(deg, d) { var r = deg * RAD; return { vx: -v * Math.cos(r), vy: d * v * Math.sin(r) }; }
    c.v0 = v;
    switch (pat) {
      case 'DIAGONAL':
        a = rng.range((sm.ang || SD.diagonal)[0], (sm.ang || SD.diagonal)[1]);
        segs.push(Object.assign({ t: 0 }, vec(a, c.diagDir || dirI))); break;
      case 'ZIGZAG':
        n = sm.seg || rng.int(SD.zigzag.segments[0], SD.zigzag.segments[1]);
        for (i = 0; i < n; i++) {
          a = rng.range((sm.ang || SD.zigzag.angle)[0], (sm.ang || SD.zigzag.angle)[1]);
          var px = rng.range((sm.px || SD.zigzag.segPx)[0], (sm.px || SD.zigzag.segPx)[1]);
          var sg = Object.assign({ t: t }, vec(a, dirI * (i % 2 ? -1 : 1)));
          if (i > 0 && sm.ink) sg.ink = 1;                                      // squid: an ink cloud at every turn
          segs.push(sg); t += px / v;
        }
        if (sm.ink && segs.length > 1) {                                        // squid jet 1.8x for 0.4 s at a seeded point of the second segment
          var s1 = segs[1], dur1 = segs.length > 2 ? segs[2].t - s1.t : 3, jt = s1.t + 0.5 * dur1;
          segs.push({ t: jt, vx: s1.vx * 1.8, vy: s1.vy * 1.8 }, { t: jt + 0.4, vx: s1.vx, vy: s1.vy });
          segs.sort(function (x, y) { return x.t - y.t; });
        }
        break;
      case 'ONE_TURN':
        var cross = (this.viewW + SD.spawnAhead) / (v + this.fwdBase()), tt = rng.range(SD.oneTurn.at[0], SD.oneTurn.at[1]) * cross + 0.8;
        segs.push({ t: 0, vx: -v, vy: 0 }, Object.assign({ t: tt }, vec(SD.oneTurn.angle, dirI))); break;
      case 'VERT_BOUNCE':
        var vv = sm.vy ? rng.range(sm.vy[0], sm.vy[1]) : 65, hh = c.br + vv * 0.75, amp = 100, loY = this.waterY + 20 + c.br, hiY = FLOOR - c.br - 6, yb;
        // the bounce band (+-amp) must stay out of the middle of the water column, where a body alone leaves no 300 px corridor [DEFAULT - tune: amp was 140]
        var up = [loY, BOTTOM - (SD.corridor + CORR_MARGIN) - hh - amp], dn = [this.waterY + 20 + SD.corridor + CORR_MARGIN + hh + amp, hiY];
        yb = c.y; var cu = up[0] <= up[1] ? clamp(yb, up[0], up[1]) : null, cd = dn[0] <= dn[1] ? clamp(yb, dn[0], dn[1]) : null;
        if (cu !== null && (cd === null || Math.abs(cu - yb) <= Math.abs(cd - yb))) yb = cu; else if (cd !== null) yb = cd;
        c.y = mv.y0 = yb; mv.amp = amp;
        segs.push({ t: 0, vx: -v, vy: dirI * vv }); mv.bounce = true; break;
      case 'CROSS':                                                              // enters from the top or from the floor and crosses diagonally
        dirI = rng.chance(0.5) ? 1 : -1;
        c.y = dirI > 0 ? this.waterY + c.br + 30 : FLOOR - c.br - 20; mv.y0 = c.y;
        segs.push(Object.assign({ t: 0 }, vec(35, dirI)));
        var tA = Math.max(0.6, (c.x - this.player.x) / Math.max(60, Math.min(this.closingOf(v), v + SD.minFwd))), g0 = segs[0];   // slowest player (seaweed / kelp) = longest crossing = longest sweep               // the diagonal must not sweep more than ~150 px before it reaches the player (corridor rule)
        g0.vy = sign(g0.vy) * Math.min(Math.abs(g0.vy), Math.max(0, 200 - 2 * c.br) / tA); break;
      default: segs.push({ t: 0, vx: -v, vy: 0 });
    }
    // vertical sweep cap (spec v3.2 corridor rule): a threat's body plus its 1.5 s of travel must leave room for a 300 px corridor in the 640 px water column,
    // so |vy| is capped at (640 - 320 - 2 x body radius) / 1.5 [DEFAULT - tune]; big lionfish / groupers dive more gently than small fish
    if (this.isThreat(c)) {
      var cap = Math.max(0, (BOTTOM - (this.waterY + 20) - (SD.corridor + CORR_MARGIN) - 2 * c.br) / 1.5);
      segs.forEach(function (q) { if (Math.abs(q.vy) > cap) q.vy = sign(q.vy) * cap; });
    }
    return mv;
  };
  P.dropInk = function (c) {
    this.objs.push({ kind: 'ink', x: c.x, y: c.y, r: 150, life: 1.5, t: 0 });
    this.emit('ink', { x: c.x, y: c.y });
  };

  // one creature with its mover; x, y in world coordinates
  P.makeMover = function (id, x, y, pat, v, o) {
    o = o || {};
    var sm = SM[id] || {}, c = this.spawnCreature(id, x, y, { facing: -1, size: o.size });
    if (!c) return null;
    c.k = c.def.k; c.facing = -1;
    if (pat === 'FLOOR' || (pat === 'STATIC' && c.def.sband === 'floor')) { c.floor = true; c.y = FLOOR - c.br; }
    if (pat === 'STATIC') { c.mv = { pat: 'STATIC', segs: [], idx: 0 }; c.v0 = 0; return c; }
    this.initMover(c, pat, v, sm);
    return c;
  };

  /* spawn a creature species the way its pattern says. o: {x, y, size, single}. Returns the first creature (or null). */
  P.spawnSide = function (id, o) {
    o = o || {};
    var def = CR[id], sm = SM[id] || { p: 'STRAIGHT', v: [100, 100] }, pat = sm.p, rng = this.rng, L = this.level - 1, first = null, i;
    if (!def) return null;
    if (pat === 'STRAIGHT' && sm.turnFrom && this.level >= sm.turnFrom) pat = 'ONE_TURN';
    if (pat === 'AMBUSH_DASH') return this.spawnAmbusher(id, o);
    if (pat === 'BOSS') return null;
    var v = sm.v ? rng.range(sm.v[0], sm.v[1]) * this.diff.speed : 0;
    v = Math.min(v, SD.maxClosing - this.fwdBase());
    var closing = pat === 'STATIC' ? this.fwdBase() : this.closingOf(v);
    var x = o.x !== undefined ? o.x : this.aheadX(closing) + this.visLen(o.size || def.size, def) * 0.5;   // the whole body starts outside the view, so it enters about 1 s later
    var y = o.y !== undefined ? o.y : this.laneY(def, pat);
    var yMin = this.waterY + 60, yMax = FLOOR - 60;
    if (pat !== 'FLOOR' && pat !== 'STATIC' && o.y === undefined) y = clamp(y, yMin, yMax);
    var list = [], n;
    if (pat === 'LINE' && !o.single) {                                           // a school on one lane, same speed, no scatter
      var nr = sm.n || def.grp || [4, 6];
      n = rng.int(nr[0], nr[1]);
      var room = Math.max(2, Math.floor((BAL.foodMax[L] * SD.maxOnScreenPrey + 2 - this.foodCost()) / (def.cost || 1)));
      n = Math.max(2, Math.min(n, room));
      for (i = 0; i < n; i++) list.push([x + i * rng.range(55, 85), y + rng.range(-22, 22), 'LINE']);
    } else if (pat === 'GROUP' && !o.single) {
      var cnt = sm.n || rng.int(2, 3), form = sm.form === 'LINE' && rng.chance(0.4) ? 'STAGGER' : (sm.form || 'V'), lane = this.lanes.indexOf(y);
      if (lane < 0) lane = 3;
      lane = clamp(lane, 1, 4);
      for (i = 0; i < cnt; i++) {
        var side = i === 0 ? 0 : (i % 2 ? -1 : 1), ly = this.lanes[clamp(lane + side, 0, 5)];
        var gx = form === 'LINE' ? x + i * 130 : (form === 'STAGGER' ? x + (i % 2) * 110 : x + (i ? 100 : 0));
        list.push([gx, form === 'LINE' ? y + rng.range(-12, 12) : ly, i === 1 && sm.diag ? 'DIAGONAL' : (i === 2 && sm.diag ? 'DIAGONAL' : 'STRAIGHT'), side]);
      }
    } else list.push([x, y, pat === 'LINE' || pat === 'GROUP' ? 'STRAIGHT' : pat]);
    for (i = 0; i < list.length; i++) {
      var q = list[i], c = this.makeMover(id, q[0], q[1], q[2], v, { size: o.size });
      if (!c) continue;
      if (q[2] === 'DIAGONAL' && pat === 'GROUP') c.mv.segs[0].vy = Math.abs(c.mv.segs[0].vy) * (q[3] || 1);   // wings diverge (up for the upper lane, down for the lower)
      if (pat === 'LINE' || pat === 'GROUP') c.cost = pat === 'LINE' ? (def.cost || 1) : c.cost;
      if (!first) first = c;
      c.batch = first.id;                                                       // one batch = one threat for the 300 px window rule
    }
    return first;
  };
  P.spawnAmbusher = function (id, o) {
    var sm = SM[id], x = o.x !== undefined ? o.x : this.aheadX(this.fwdBase() * 1.0) + 200;
    var c = this.spawnCreature(id, x, o.y !== undefined ? o.y : FLOOR - 8, { facing: -1, size: o.size });
    if (!c) return null;
    if (o.y === undefined || o.y === FLOOR) c.y = FLOOR - c.br;                // R-OE-46: waits on the floor line
    c.k = c.def.k; c.facing = -1;
    var d = sm.dash;
    c.mv = { pat: 'AMBUSH', st: 'wait', t: 0, dash: [d[0], d[1]], dur: d[0] <= -650 && d[1] === 0 ? 1.4 : 0.65, then: sm.then || '', segs: [], idx: 0 };
    return c;
  };
  // an inflated pufferfish alone must leave a 300 px corridor above or below it: move it to the nearest lane band that does
  P.relanePuffer = function (c) {
    var bi = c.br * 1.6, top = this.waterY + 20, need = SD.corridor + CORR_MARGIN, lo1 = top + bi, hi1 = BOTTOM - need - bi, lo2 = top + need + bi, hi2 = FLOOR - bi - 6, y = c.y, best = null;
    [[lo1, hi1], [lo2, hi2]].forEach(function (b) { if (b[0] > b[1]) return; var cy = clamp(y, b[0], b[1]); if (best === null || Math.abs(cy - y) < Math.abs(best - y)) best = cy; });
    if (best !== null) c.y = best;
  };
  P.spawnPrey = function (x, forceId, forceSize) {
    var id = forceId || this.foodPick(), def = CR[id], i, n = 0;
    if (def.ai === 'ambush') {
      for (i = 0; i < this.creatures.length; i++) if (this.creatures[i].mv && this.creatures[i].mv.pat === 'AMBUSH') n++;
      if (n >= 2) return null;
    }
    if (def.ai === 'school' && this.creatures.some(function (q) { return q.type === id && !q.dead && q.x > this.viewRight() - 300; }, this)) {
      id = this.foodPick(); def = CR[id];
    }
    if (x !== undefined && (def.sband === 'floor' || (SM[id] && (SM[id].p === 'FLOOR' || SM[id].p === 'LINE' || SM[id].p === 'GROUP')))) x = Math.max(x, this.viewRight() + SD.spawnAhead);          // UC-OE-110: floor creatures also come in >= 240 units beyond the view edge (also at the level start)
    var n0 = this.creatures.length, c = this.spawnSide(id, { x: x, size: forceSize }), fresh, self = this;
    if (!c) return c;
    fresh = this.creatures.slice(n0);
    if (fresh.some(function (q) { return self.isThreat(q); })) {                   // size-relative roster creatures (pufferfish, crabs, turtles...) are threats while bigger than the player
      fresh.forEach(function (q) { if (q.def.sp && q.def.sp.puff) self.relanePuffer(q); });
      if (!this.fairOver(fresh)) { this.creatures.length = n0; return null; }
    }
    return c;
  };

  /* ---- creature update ---- */
  P.updateCreaturesSide = function (dt) {
    var i, c, mv, sg, lo, hi, alive = [], camL = this.cam.x - SD.despawnBehind;
    for (i = 0; i < this.creatures.length; i++) {
      c = this.creatures[i];
      if (c.dead) continue;
      c.t += dt; if (c.bumpCd > 0) c.bumpCd -= dt; if (c.cd > 0) c.cd -= dt;
      this.sizeCreature(c); c.role = this.roleOf(c);
      mv = c.mv;
      c.vx = c.vy = 0; c.tilt = 0;
      if (c.scr) { this.moveScr(c, dt); if (c.finaleBoss) c.vx = this.fwd - BAL.BOSSES.FINALE.drift; }       // CR-4: a scripted boss attack: one straight line (the finale boss drifts left on the screen)
      else if (mv && mv.pat === 'AMBUSH') this.ambushStep(c, dt);
      else if (mv && mv.pat === 'BOSS') { c.x = this.cam.x + this.viewW - c.len * 0.18; c.y = 760; }
      else if (mv && mv.pat !== 'STATIC') this.segStep(c);
      this.sideSpecial(c, dt);
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.floor) c.y = FLOOR - c.br;                                           // R-OE-46: floor creatures rest on the floor line (centre y = floor - own radius)
      if (mv && mv.segs.length && mv.pat !== 'FLOOR') {
        sg = mv.segs[mv.idx]; lo = this.waterY + c.br + 20; hi = FLOOR - c.br - 6;
        if (mv.bounce) {
          var l2 = Math.max(lo, mv.y0 - (mv.amp || 140)), h2 = Math.min(hi, mv.y0 + (mv.amp || 140));
          if (c.y < l2) { c.y = l2; sg.vy = Math.abs(sg.vy); } else if (c.y > h2) { c.y = h2; sg.vy = -Math.abs(sg.vy); }
        } else if (c.y < lo) { c.y = lo; if (sg.vy < 0) sg.vy = 0; }
        else if (c.y > hi) { c.y = hi; if (sg.vy > 0) sg.vy = 0; }
      }
      if (Math.abs(c.vx) > 10) c.facing = sign(c.vx);
      if (!(c.mv && c.mv.pat === 'BOSS') && c.x < camL) c.dead = true;           // removed 600 px behind the left edge
      if (c.scr && this.scrGone(c)) c.dead = true;
      if (!c.dead) alive.push(c);
    }
    this.creatures = alive;
  };
  P.segStep = function (c) {
    var mv = c.mv, segs = mv.segs, sg;
    while (mv.idx + 1 < segs.length && c.t >= segs[mv.idx + 1].t) { mv.idx++; if (segs[mv.idx].ink) this.dropInk(c); }
    sg = segs[mv.idx]; c.vx = sg.vx; c.vy = sg.vy;
    if (mv.idx + 1 < segs.length && segs[mv.idx + 1].t - c.t <= SD.tiltS) {    // the nose tilts 0.3 s before a turn
      var nx = segs[mv.idx + 1]; c.tilt = sign(nx.vy - sg.vy) || 0; c.turnIn = segs[mv.idx + 1].t - c.t;
    }
  };
  P.ambushStep = function (c, dt) {
    var mv = c.mv, p = this.player, dx = c.x - p.x, danger = c.role === 'predator' || c.role === 'peer';
    if (mv.st === 'wait') {
      c.state = '';
      if (danger && dx < SD.ambushTrigger && dx > -c.len && !p.airborne) { mv.st = 'warn'; mv.t = SD.ambushWarnS; c.state = 'warn'; }
    } else if (mv.st === 'warn') {
      mv.t -= dt; c.warn = Math.max(0, mv.t);
      if (mv.t <= 0) { mv.st = 'dash'; mv.t = mv.dur; c.state = 'lunge'; c.warn = 0; c.vx = mv.dash[0]; c.vy = mv.dash[1]; }
    } else if (mv.st === 'dash') {
      mv.t -= dt; c.vx = mv.dash[0]; c.vy = mv.dash[1];
      if (mv.t <= 0) { mv.st = 'after'; c.state = ''; }
    } else {                                                                       // after the dash: one straight line (the anglerfish turns once)
      if (mv.then === 'ONE_TURN') { c.vx = -300; c.vy = 0; } else if (mv.dash[0] < -300) { c.vx = -250; c.vy = 0; } else { c.vx = 0; c.vy = 0; }
    }
    if (mv.st === 'wait' || mv.st === 'warn') { c.vx = 0; c.vy = 0; }
  };
  // proximity triggers and timers that are allowed in Side-scroller mode
  P.sideSpecial = function (c, dt) {
    var def = c.def, sp = def.sp || {}, p = this.player, i;
    if (sp.puff) {                                                                  // pufferfish inflates when the player is within 1.5 body lengths
      if (c.inflT > 0) { c.inflT -= dt; if (c.inflT <= 0) { c.inflated = false; c.puffCd = 2; this.sizeCreature(c); } }
      else { c.puffCd = (c.puffCd || 0) - dt; if (c.puffCd <= 0 && this.nearPlayer(c, 1.5)) { c.inflated = true; c.inflT = 2; this.sizeCreature(c); c.role = 'hazard'; } }
    }
    if (sp.snap) { c.snapT = (c.snapT || 0) - dt; if (c.snapT <= -1.2 && this.nearPlayer(c, 1)) c.snapT = 0.4; }
    if (def.ai === 'wraith') { c.fadeT -= dt; if (c.fadeT <= 0) { c.faded = !c.faded; c.fadeT = c.faded ? 1.2 : 3; } }
    if (def.ai === 'eel') {                                                         // electric eel: shock ring every 4 s (telegraph 0.8 s), the eel moves in a straight line
      c.sc = (c.sc === undefined ? this.rng.range(0, 3) : c.sc) + dt;
      if (c.state === 'shock') {
        c.st -= dt;
        if (!c.shocked && !p.airborne && U.dist(c.x, c.y, p.x, p.y) < 3 * c.len + p.r) { c.shocked = true; this.damage({ name: def.n, kind: 'hazard', id: c.type }, c.x, c.y); }
        if (c.st <= 0) { c.state = ''; c.sc = 0; }
      } else if (c.state === 'tele') {
        c.st -= dt; c.warn = Math.max(0, c.st);
        if (c.st <= 0) { c.state = 'shock'; c.st = 0.5; c.shocked = false; c.warn = 0; this.objs.push({ kind: 'shockring', x: c.x, y: c.y, r: 10, max: 3 * c.len, t: 0, life: 0.5 }); this.emit('shock', { x: c.x, y: c.y }); }
      } else if (c.sc >= 3.2) { c.state = 'tele'; c.st = 0.8; }
    }
    if (def.ai === 'sub') {                                                         // submarine: straight patrol, sonar ring every 5 s (0.6 s warning), then 2 mines fall straight down
      c.sc = (c.sc || 0) + dt;
      if (c.sc >= 5 - SD.sonarWarnS && !c.sonar) { c.sonar = true; c.warn = SD.sonarWarnS; c.state = 'warn'; }
      if (c.sonar) c.warn = Math.max(0, 5 - c.sc);
      if (c.sc >= 5) {
        c.sc = 0; c.sonar = false; c.state = ''; c.warn = 0;
        this.objs.push({ kind: 'sonar', x: c.x, y: c.y, r: 20, t: 0, life: 1.4 }); this.emit('sonar', { x: c.x, y: c.y });
        for (i = -1; i <= 1; i += 2) this.objs.push({ id: this.nextId++, kind: 'mine', x: c.x + i * 40, y: c.y + c.len * 0.2, vy: SD.mineFall, life: 8, t: 0, arm: 1.0 });
      }
    }
    if (SM[c.type] && SM[c.type].strike && c.role === 'predator') {                 // neck strike: a straight vertical thrust, telegraph 0.6 s
      var dx = c.x - p.x;
      if (!c.strikeDone && dx < 700 && dx > 150) {
        c.strT = (c.strT === undefined ? 0.6 : c.strT) - dt; c.warn = Math.max(0, c.strT); c.state = 'warn';
        if (c.strT <= 0) { c.strikeDone = true; /* same vertical sweep cap as every other threat (corridor rule): a big neck thrusts gently */ c.sT = 0.5; c.sVy = (p.y > c.y ? 1 : -1) * Math.min(520, Math.max(0, 0.6 * (BOTTOM - (this.waterY + 20) - (SD.corridor + CORR_MARGIN) - 2 * c.br) / 1.5)); c.state = 'lunge'; c.warn = 0; }
      }
      if (c.sT > 0) { c.sT -= dt; c.vy = c.sVy; }
    }
  };

  /* ================================================================ spawner */
  P.threatsList = function (skip) {
    var out = [], i, c;
    for (i = 0; i < this.creatures.length; i++) {
      c = this.creatures[i];
      if (c.dead || c.def.k === 'pas' || c.mv && c.mv.pat === 'BOSS' || skip && skip.indexOf(c) >= 0) continue;
      if (c.def.sp && c.def.sp.puff) continue;                       // an inflated puffer is the player's choice (proximity): not part of the fairness budget
      if (c.role === 'predator' || c.role === 'hazard' || (c.mv && c.mv.pat === 'AMBUSH' && (c.role === 'peer' || c.role === 'predator'))) out.push(c);
    }
    return out;
  };
  P.blockHalf = function (c) { return c.br * 0.9 + this.player.r; };          // the player's centre needs this much room around a body circle
  // y of a mover after T more seconds along its linear segments
  P.projectY = function (c, T) {
    var mv = c.mv;
    if (!mv) return c.y;
    if (mv.pat === 'AMBUSH') return mv.st === 'wait' || mv.st === 'warn' ? c.y + mv.dash[1] * mv.dur : c.y;   // a dash sweeps its whole column
    var segs = mv.segs, y = c.y, t = c.t, idx = mv.idx, end = c.t + T, tn;
    if (!segs.length) return y;
    while (t < end) {
      tn = idx + 1 < segs.length ? Math.min(segs[idx + 1].t, end) : end;
      y += segs[idx].vy * (tn - t); t = tn;
      if (idx + 1 < segs.length && t >= segs[idx + 1].t) idx++; else if (t >= end) break;
    }
    return y;
  };
  // where a threat blocks the player's path: arrival time and the vertical range it sweeps until then
  P.threatItem = function (c) {
    var p = this.player, sg = c.mv && c.mv.segs && c.mv.segs[c.mv.idx], vx = Math.abs(c.vx || (sg ? sg.vx : 0)), closing = Math.max(60, this.fwdBase() + vx);
    var t = Math.max(0, (c.x - p.x) / closing), y1 = this.projectY(c, t), h = this.blockHalf(c);
    return { t: t, lo: Math.min(c.y, y1) - h, hi: Math.max(c.y, y1) + h, y: (c.y + y1) / 2, b: c.batch || c.id };
  };
  function bestGap(iv, top, bottom) {
    iv.sort(function (a, b) { return a[0] - b[0]; });
    var cur = top, gap = 0, k;
    for (k = 0; k < iv.length; k++) { gap = Math.max(gap, iv[k][0] - cur); cur = Math.max(cur, iv[k][1]); }
    return Math.max(gap, bottom - cur);
  }
  // fairness for freshly spawned threats: a free corridor (>= 300 px + margin) among all threats that reach the player within about 1.5 s of them,
  // and at most 2 spawn batches inside a 300 px vertical window
  P.fairOK = function (fresh) {
    var win = SD.predWindow[2] + 0.5, items = [], i, j, c, ex = this.threatsList(fresh), mine = [];
    for (i = 0; i < ex.length; i++) items.push(this.threatItem(ex[i]));
    for (i = 0; i < fresh.length; i++) mine.push(this.threatItem(fresh[i]));
    // shock walls, walls and columns on the way count too: a new threat must not close the corridor that a wall already narrows to its 300 px gap
    for (i = 0; i < this.objs.length; i++) {
      var wo = this.objs[i];
      if ((wo.kind === 'swall' || wo.kind === 'wall' || wo.kind === 'column') && wo.x > this.player.x - 100) {
        var wt = Math.max(0, (wo.x - this.player.x) / (this.fwd + Math.abs(wo.vx || 0)));
        items.push({ t: wt, lo: this.waterY + 20, hi: wo.gapY - wo.gapH / 2, y: wo.gapY, wall: 1, b: 'w' }, { t: wt, lo: wo.gapY + wo.gapH / 2, hi: FLOOR, y: wo.gapY, wall: 1, b: 'w' });
      }
    }
    for (i = 0; i < mine.length; i++) {
      var all = items.concat(mine), near = all.filter(function (q) { return Math.abs(q.t - mine[i].t) < win; }), batches = {}, nb = 0;
      near.forEach(function (q) { if (!q.wall && Math.abs(q.y - mine[i].y) <= SD.predWindow[1] / 2 && !batches[q.b]) { batches[q.b] = 1; nb++; } });
      if (nb > SD.predWindow[0]) return false;
      if (bestGap(near.map(function (q) { return [q.lo, q.hi]; }), this.waterY + 20, FLOOR) < SD.corridor + 40) return false;
    }
    return true;
  };
  /* ---- fairness over time (UC-OE-76, spec v3.2 R-OE-33 / B-OE-75 THREAT_DEFINITION) ----
     A threat = any creature with size >= 1.15 x the player's current size (the predator role), every hazard and ambusher, and every pufferfish
     (counted at its inflated size). Rules over threats, measured like QA does every 0.5 s: a free vertical corridor >= 300 px in the 1.5 s ahead
     (bodies swept along their linear path, walls with their gaps) and <= 2 threats per 300 px window (a batch / pod / school counts once).
     At spawn the field is projected over the whole crossing (state of every threat at each sample time, bounce / turn / clamp included, then QA's
     1.5 s linear extrapolation); a spawn that would break a rule is removed again and retried (re-lane / delay). */
  var BOTTOM = 990, CORR_MARGIN = 50, DT = 0.05;
  function isPuff(c) { return !!(c.def.sp && c.def.sp.puff); }
  function bodyBr(c) { return isPuff(c) && !c.inflated ? c.br * 1.6 : c.br; }
  function bodyLen(c) { return isPuff(c) && !c.inflated ? c.len * 1.6 : c.len; }
  // is this body a threat for the fairness budget (role at the player's CURRENT size)?
  P.isThreat = function (c) {
    if (c.dead || c.def.k === 'pas' || (c.mv && c.mv.pat === 'BOSS')) return false;
    if (isPuff(c)) return true;
    var r = this.roleOf(c);
    return r === 'predator' || r === 'hazard' || !!(c.mv && c.mv.pat === 'AMBUSH');
  };
  P.fairBodies = function (extra) {
    var out = [], i, c;
    for (i = 0; i < this.creatures.length; i++) { c = this.creatures[i]; if (this.isThreat(c)) out.push(c); }
    if (extra) extra.forEach(function (q) { if (out.indexOf(q) < 0 && this.isThreat(q)) out.push(q); }, this);
    return out;
  };
  P.fairWalls = function (extra) {
    var out = this.objs.filter(function (o) { return o.kind === 'wall' || o.kind === 'swall'; });
    return extra ? out.concat(extra) : out;
  };
  // states of a body every DT seconds for Tmax seconds: the movers' segments with the lane clamps / bounce of updateCreaturesSide (copied velocities)
  P.trajectory = function (c, Tmax) {
    var mv = c.mv, segs = mv && mv.segs, n = Math.ceil(Tmax / DT) + 1, out = [], x = c.x, y = c.y, t = c.t, idx = mv ? mv.idx : 0, vyl, k, vx, vy, lo, hi, l2, h2;
    if (!segs || !segs.length || mv.pat === 'AMBUSH' || mv.pat === 'BOSS') {
      for (k = 0; k < n; k++) out.push({ x: x + (c.vx || 0) * k * DT, y: y + (c.vy || 0) * k * DT, vx: c.vx || 0, vy: c.vy || 0 });
      return out;
    }
    vyl = segs.map(function (q) { return q.vy; }); lo = this.waterY + c.br + 20; hi = FLOOR - c.br - 6;
    out.push({ x: x, y: y, vx: c.vx || 0, vy: c.vy || 0 });
    for (k = 1; k < n; k++) {
      t += DT; while (idx + 1 < segs.length && t >= segs[idx + 1].t) idx++;
      vx = segs[idx].vx; vy = vyl[idx]; x += vx * DT; y += vy * DT;
      if (mv.pat !== 'FLOOR') {
        if (mv.bounce) { l2 = Math.max(lo, mv.y0 - (mv.amp || 140)); h2 = Math.min(hi, mv.y0 + (mv.amp || 140)); if (y < l2) { y = l2; vyl[idx] = Math.abs(vyl[idx]); } else if (y > h2) { y = h2; vyl[idx] = -Math.abs(vyl[idx]); } }
        else if (y < lo) { y = lo; if (vyl[idx] < 0) vyl[idx] = 0; }
        else if (y > hi) { y = hi; if (vyl[idx] > 0) vyl[idx] = 0; }
      }
      out.push({ x: x, y: y, vx: vx, vy: vyl[idx] });
    }
    return out;
  };
  // threats in the fullest 300 px window: distinct batches (a pod in a line, a school, a V formation count once)
  function countPredators(preds) {
    var list = preds.slice().sort(function (a, b) { return a.y - b.y; }), j, k, best = 0, seen;
    for (j = 0; j < list.length; j++) { seen = {}; seen[list[j].b] = 1; for (k = j + 1; k < list.length; k++) if (list[k].y - list[j].y <= SD.predWindow[1]) seen[list[k].b] = 1; best = Math.max(best, Object.keys(seen).length); }
    return best;
  }
  P.countPredators = countPredators;
  // the field at +t0 seconds, QA's way: every threat extrapolated 1.5 s from its state at t0; free corridor (px) and threats per window
  P.fieldAt = function (items, walls, t0, fwd) {
    var p = this.player, blocks = [], preds = [], i, k, it, c, st, ty, tau, cx, cy, px, o, ox, px0 = p.x + fwd * t0, y0 = this.waterY + 20, gap, h = Math.round(t0 / DT);
    for (i = 0; i < items.length; i++) {
      it = items[i]; c = it.c; st = it.tr[Math.min(h, it.tr.length - 1)]; ty = [];
      for (tau = 0; tau <= 1.5 + 1e-9; tau += DT) {
        cx = st.x + st.vx * tau; cy = st.y + st.vy * tau; px = px0 + fwd * tau;
        if (Math.abs(cx - px) < bodyLen(c) * 0.5 + p.len * 0.35) ty.push(cy);
      }
      if (ty.length) {
        if (c.mv && c.mv.pat === 'AMBUSH' && c.mv.dash && (c.mv.st === 'wait' || c.mv.st === 'warn')) ty.push(st.y + c.mv.dash[1] * c.mv.dur);   // a dash sweeps its whole column
        blocks.push([Math.min.apply(null, ty) - bodyBr(c), Math.max.apply(null, ty) + bodyBr(c)]); preds.push({ y: ty[0], b: c.batch || c.group || c.id });
      }
    }
    for (i = 0; i < walls.length; i++) {
      o = walls[i]; ox = o.x + (o.vx || 0) * t0;
      if (ox > px0 && ox < px0 + fwd * 1.5 + 200) blocks.push([y0, o.gapY - o.gapH / 2], [o.gapY + o.gapH / 2, BOTTOM]);
    }
    gap = bestGap(blocks, y0, BOTTOM);
    return { gap: gap, maxPred: countPredators(preds) };
  };
  // arrival time of a body / wall at the player
  P.arrivalOf = function (o, fwd) {
    var p = this.player, sg;
    if (o.kind === 'wall' || o.kind === 'swall') return Math.max(0, (o.x - p.x) / Math.max(60, fwd - (o.vx || 0)));
    sg = o.mv && o.mv.segs && o.mv.segs[o.mv.idx];
    return Math.max(0, (o.x - p.x) / Math.max(60, fwd + Math.abs(o.vx || (sg ? sg.vx : 0))));
  };
  // does adding `fresh` bodies / `freshWalls` leave every projected moment fair? Lenient mode lets a batch pass that is unfair even alone (a species nothing can fix).
  P.fairOver = function (fresh, freshWalls, strict) {
    var self = this, base = this.fwdBase(), hiF = Math.max(base, this.fwd), scen = [this.fwd], ta, t, tmax = 0, timesBy = [], k0;
    for (k0 = 0; k0 < 4; k0++) scen.push(SD.minFwd + (hiF - SD.minFwd) * k0 / 3);                // the player is slowed by seaweed / kelp / a bump while a threat travels: the crossing time is anywhere in this range
    scen.forEach(function (f) {
      var times = [];
      (fresh || []).concat(freshWalls || []).forEach(function (o) {
        ta = self.arrivalOf(o, f);
        for (t = Math.max(0, ta - 2.5); t <= ta + 0.5; t += 0.1) times.push(Math.round(t * 10) / 10);
      });
      times = times.filter(function (v, k) { return times.indexOf(v) === k; }).sort(function (a, b) { return a - b; }).slice(0, 60);
      if (times.length) { timesBy.push({ f: f, times: times }); tmax = Math.max(tmax, times[times.length - 1] + DT); }
    });
    if (!timesBy.length) return true;
    function bad(list, wl) {
      var its = list.map(function (c) { return { c: c, tr: self.trajectory(c, tmax) }; }), k, j, f;
      for (j = 0; j < timesBy.length; j++) for (k = 0; k < timesBy[j].times.length; k++) {
        f = self.fieldAt(its, wl, timesBy[j].times[k], timesBy[j].f);
        if (f.gap < SD.corridor + CORR_MARGIN || f.maxPred > SD.predWindow[0]) return true;
      }
      return false;
    }
    if (!bad(this.fairBodies(fresh), this.fairWalls(freshWalls))) return true;
    if (strict !== false) return false;               // strict: re-lane / delay (the caller falls back to lenient after repeated failures)
    return bad((fresh || []).filter(function (c) { return self.isThreat(c); }), freshWalls || []);   // lenient: unfair on its own = intrinsic to the species
  };
  // free corridor among the threats that reach the player within horizon seconds (used by the tests)
  P.corridorFree = function (horizon) {
    var L = this.threatsList(), iv = [], i, it;
    for (i = 0; i < L.length; i++) { it = this.threatItem(L[i]); if (it.t <= horizon && L[i].x > this.player.x - 120) iv.push([it.lo, it.hi]); }
    return bestGap(iv, this.waterY + 20, FLOOR);
  };
  // spawn a threat species; when the fairness checks fail the new bodies are removed again (the caller retries soon)
  P.spawnThreat = function (id) {
    var def = CR[id], sm = SM[id] || { p: 'STRAIGHT' }, tries, y, n0, fresh, strict = (this.fairFails || 0) < 12;
    for (tries = 0; tries < 10; tries++) {                                          // 4 lane picks, then free heights (a big body may fit only in a narrow band)
      y = def.sband === 'floor' || sm.p === 'FLOOR' || sm.p === 'AMBUSH_DASH' || sm.p === 'STATIC' ? FLOOR : (tries < 4 ? this.laneY(def, sm.p) : this.rng.range(this.waterY + 80, FLOOR - 80));
      n0 = this.creatures.length;
      var batch = this.nextId;
      this.spawnSide(id, { y: y, size: this.rosterSize(id, def), single: tries >= 3 });          // a pack that does not fit the corridor rule is tried again as one body
      fresh = this.creatures.slice(n0);
      fresh.forEach(function (c) { c.batch = batch; });
      // a big single straight mover (giant squid, leviathan...) leaves a free corridor on one side only when it sits near the top or the bottom of the play band: fit its lane
      if (fresh.length === 1 && fresh[0].br > 90 && sm.p !== 'FLOOR' && sm.p !== 'AMBUSH_DASH' && sm.p !== 'STATIC' && sm.p !== 'BOSS' && (fresh[0].br > 130 || ((sm.p === 'STRAIGHT' || sm.p === 'ONE_TURN') && !(fresh[0].mv && fresh[0].mv.segs && fresh[0].mv.segs.some(function (sg) { return sg.vy; }))))) fresh[0].y = this.bossFitY(fresh[0].y, fresh[0].br, SD.corridor + CORR_MARGIN + 30);
      if (fresh.length && this.fairOK(fresh) && this.fairOver(fresh, null, strict)) { this.fairFails = 0; return fresh[0]; }
      this.creatures.length = n0;
    }
    this.fairFails = (this.fairFails || 0) + 1;
    return null;
  };
  P.spawnLogicSide = function (dt) {
    var ld = this.ldef, L = this.level - 1, S = this.sT, i, e, rng = this.rng, p = this.player, pick;
    // spawn events (spec v4.1, R-OE-42): three streams with the rates 55 : 15 : 30 (prey = the calibrated stream, peers and threats are extra); a threat refused by
    // the fairness checks is retried in 1.2 s without holding up the prey
    // CR-4 v5.1 (R-OE-50): the prey stream is the calibrated one (cap = the difficulty table's max prey), peers run at 15/45 of its rate, predators and hazards run on
    // their OWN interval tables (BAL.SIDE.DIFFICULTY_TABLE: predator 12 .. 4.2 s, hazard 10 .. 4.2 s by level), capped by max predators / hazard types; a refused threat is
    // retried (another pick, then 0.5 s) so the 300 unit corridor and the 2-threat window hold; on a scripted boss level the boss director supplies the predators
    var I = SD.interval.prey[L] * this.preyMult(), cl = this.classes(), hasT = cl.threat.length > 0, W = BAL.GROWTH.SPAWN_WEIGHTS, pk, D = this.diff, cap = D.maxprey, self = this;
    S.prey -= dt;
    if (S.prey <= 0) { S.prey = I; this.ev.prey++; if (this.foodCost() < cap) this.spawnPrey(); }
    if (hasT) {
      S.peerT = (S.peerT === undefined ? I * 3 * 0.6 : S.peerT) - dt;
      if (S.peerT <= 0) { S.peerT = I * 3; this.ev.peer++; if (this.foodCost() < cap) { pk = this.peerPick(); this.spawnPrey(undefined, pk.id, pk.size); } }
      var holdBoss = (S.bossWait || 0) > (BAL.BOSS_HOLD === undefined ? 3 : BAL.BOSS_HOLD) || this.bossBusy();       // boss priority: no normal threat while a boss wave is queued, telegraphed or on its way;                                 // a boss ring waits for a free corridor: no new threat until it has gone out
      var preds = (ld.pred || []).length && !this.bossIsScripted(), hazs = (ld.haz || []).length, np = 0, hz = {}, nh = 0, k2, cc;
      for (k2 = 0; k2 < this.creatures.length; k2++) { cc = this.creatures[k2]; if (cc.dead || cc.bossAtk) continue; if (cc.role === 'predator' && cc.x > this.cam.x - 200) np++; else if (cc.role === 'hazard' && !hz[cc.type]) { hz[cc.type] = 1; nh++; } }
      if (preds) {
        S.predT = (S.predT === undefined ? D.pred * 0.5 : S.predT) - dt;
        if (S.predT <= 0 && holdBoss) S.predT = 0.4;
        if (S.predT <= 0) {
          if (np >= D.maxpred) S.predT = 1;
          else { var pid = this.rng.wpick(ld.pred); if (this.spawnThreat(pid) || this.spawnThreat(this.rng.wpick(ld.pred))) { this.ev.threat++; S.predT = D.pred; } else S.predT = 0.5; }
        }
      }
      if (hazs) {
        S.hazT = (S.hazT === undefined ? D.haz * 0.6 : S.hazT) - dt;
        if (S.hazT <= 0 && holdBoss) S.hazT = 0.4;
        if (S.hazT <= 0) {
          var hid = this.rng.wpick(ld.haz);
          if (nh >= D.haztypes && !hz[hid]) S.hazT = 1;
          else if (this.spawnThreat(hid)) { this.ev.threat++; S.hazT = D.haz; } else S.hazT = 0.5;
        }
      }
    }
    // passive giants and periodic growth sources
    var pas = ld.pas || [];
    for (i = 0; i < pas.length; i++) {
      if (S.pas[i] === undefined) continue;
      S.pas[i] -= dt;
      if (S.pas[i] <= 0) { this.spawnSide(pas[i][0], {}); S.pas[i] = pas[i][2] > 0 ? pas[i][2] : undefined; }
    }
    var per = ld.per || [];
    for (i = 0; i < per.length; i++) {
      S.per[i] -= dt;
      if (S.per[i] <= 0) {
        S.per[i] = per[i].every;
        var def = CR[per[i].id], sm = SM[per[i].id] || { p: 'STRAIGHT', v: [100, 100] }, n = per[i].n, y = this.laneY(def, sm.p), x0 = this.aheadX(200), k, c;
        var v = rng.range(sm.v[0], sm.v[1]) * this.diff.speed;
        var nPer = this.creatures.length, grp = [];
        for (k = 0; k < (def.ai === 'school' ? n : Math.min(n, 3)); k++) {
          c = this.makeMover(per[i].id, x0 + k * rng.range(55, 85), y + rng.range(-22, 22), sm.p === 'LINE' || def.ai === 'school' ? 'LINE' : sm.p, v);
          if (c) { c.cost = 0; grp.push(c); }
        }
        grp.forEach(function (q) { q.batch = grp[0].id; });                         // one group = one threat in the 300 px window rule
        if (grp.some(function (q) { return this.isThreat(q); }, this) && !this.fairOver(grp)) { this.creatures.length = nPer; S.per[i] = 1.5; }   // size-relative threat that would break the corridor: retry soon
      }
    }
    // coins
    S.coin -= dt;
    if (S.coin <= 0) { S.coin = clamp(80 / Math.max(4, (ld.coins || 8) * 1.6), 4, 9); this.addPickup(this.viewRight() + rng.range(150, 500), rng.range(this.waterY + 110, FLOOR - 90), this.world); }
    // surface targets
    this.surfT -= dt;
    if (this.surfT <= 0) { this.surfT = SD.interval.surf[L]; this.spawnSurfaceNext(); }
    else if (this.t - this.lastEligibleT > 20) { this.surfT = SD.interval.surf[L]; this.lastEligibleT = this.t; this.spawnSurfaceNext(true); }
    if (this.evtPending && this.t >= this.evtPending.at) { var pe = this.evtPending; this.evtPending = null; this.startEvent(pe.id); }     // CR-3: once per level, 20 s after the form reached the event form
    this.updateEvent(dt);
    // environment: obstacles and zones scroll past; one new instance per kind every few seconds
    var kinds = ld.obs || {}, kind;
    for (kind in S.env) {
      S.env[kind] -= dt;
      if (S.env[kind] <= 0) { S.env[kind] = clamp(36 / Math.max(1, kinds[kind]), 7, 20); this.spawnEnv(kind, this.viewRight() + rng.range(300, 700)); }
    }
    if (kinds.fall) {                                                               // falling rocks: shadow for 1 s, then a straight fall
      S.fall -= dt;
      if (S.fall <= 0) { S.fall = rng.range(4, 6) / Math.max(1, kinds.fall); this.objs.push({ id: this.nextId++, kind: 'frock', x: p.x + this.fwdBase() * rng.range(1.5, 2.5), y: this.waterY, st: 'tele', t: 0, r: 44 }); }
    }
    if (kinds.shock) { S.shock -= dt; if (S.shock <= 0) { S.shock = this.addShockWall(1, false) ? 6 : 1.5; } }
    if (ld.boss) this.updateBossSide(dt);
    // pickups behind the view
    for (i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].x < this.cam.x - 300) this.pickups.splice(i, 1);
  };
  P.spawnEnv = function (kind, x) {
    var rng = this.rng, wy = this.waterY;
    if (kind === 'struct') {
      x = Math.max(x, this.viewRight() + 1.25 * (this.fwd + 60));                   // CR-4: at least 1.25 s outside the view (red marker) before it enters                                                        // drifting walls with a 300 px gap; contact costs a heart
      var gy, tries, wall;
      for (tries = 0; tries < 6; tries++) {                                         // re-lane the gap until the corridor rule holds over the crossing
        var gh = this.gapFor();
        gy = rng.range(wy + 200, this.gapMaxY(gh, FLOOR - 150));
        wall = { id: this.nextId, kind: 'wall', x: x, vx: -60, gapY: gy, gapH: gh, w: 80 };
        if (this.fairOver([], [wall])) { this.nextId++; this.objs.push(wall); return; }
      }
      this.sT.env.struct = 1.5;                                                     // delay
      return;
    }
    this.addObstacle(kind, 0, 1, x);
    if (kind === 'coral' || kind === 'rock') { var o = this.obs[this.obs.length - 1]; if (o) o.solid = false; }   // decoration in this mode: prey stays edible, nothing blocks
    if (kind === 'brock' || kind === 'ruin') { var b = this.obs[this.obs.length - 1]; if (b) b.solid = false; }
  };
  // the 300 px gap of walls, shock walls and columns; it grows a little for the biggest bodies so every form can fit [DEFAULT - tune]
  // BUG-U1: the lowest gaps still cover a body resting on the floor line (centre seabedY - bodyR)
  P.gapMaxY = function (gapH, old) { return Math.max(old, BAL.seabedY - 0.6 * this.player.r - gapH / 2); };
  P.gapFor = function () { return Math.max(SD.boss.gap, Math.round(2.4 * this.player.r + 110)); };
  P.addShockWall = function (speedMul, boss) {
    var gy, x = this.viewRight() + Math.max(100, 1.25 * (this.fwd + SD.boss.wallSpeed * (speedMul || 1))), tries, wall;      // CR-4: at least 1.25 s outside the view (red marker) before it enters
    for (tries = 0; tries < 12; tries++) {
      var gh = this.gapFor();
      gy = this.rng.range(this.waterY + 180, this.gapMaxY(gh, FLOOR - 120));
      wall = { id: this.nextId, kind: 'swall', x: x, vx: -SD.boss.wallSpeed * (speedMul || 1), gapY: gy, gapH: gh, w: 46, t: 0 };
      if (this.fairOver([], [wall]) || (tries === 11 && boss)) break;
    }
    if (!this.fairOver([], [wall]) && !boss) return false;                            // a normal shock wall waits until the corridor rule holds; boss rings always come (last try is kept)
    this.nextId++; this.objs.push(wall);
    this.emit('ring', { x: x, y: gy });
    return true;
  };
  P.addColumns = function (n) {
    var p = this.player, i, base = this.viewRight() + this.fwdBase() * 1.3 + 100 - 260;                // CR-4 round 7: outside the view with a lead of >= 1.0 s (red marker) before the telegraph starts
    for (i = 0; i < n; i++) {
      var col, tr;
      for (tr = 0; tr < 12; tr++) {                                                  // re-lane the gap until the corridor rule holds against the threats on the way (the last try is kept: boss columns always come)
        col = { id: this.nextId, kind: 'column', x: base + 260 + i * 330, vx: 0, gapY: this.rng.range(this.waterY + 170, this.gapMaxY(this.gapFor(), FLOOR - 110)), gapH: this.gapFor(), w: 96, st: 'tele', t: 0, tele: SD.boss.tentWarnS, life: 1.4 };
        if (this.fairOver([], [col])) break;
      }
      col.lead = (col.x - col.w / 2 - this.viewRight()) / Math.max(60, this.fwd); this.nextId++; this.objs.push(col);
    }
  };
  P.updateBossSide = function (dt) {
    var ph = this.ldef.boss === 'bloop' ? this.phaseNow() : 1, S = this.sT, m = ph === 3 ? SD.boss.phase3 : 1;
    if (this.ldef.boss === 'bloop' && ph !== this.bossPhase) { this.bossPhase = ph; this.emit('bossPhase', { phase: ph }); }
    if (this.ldef.boss === 'kraken') { S.tent -= dt; if (S.tent <= 0) { S.tent = 4; this.addColumns(3); } return; }
    if (ph === 1 || ph === 3) { S.boss -= dt; if (S.boss <= 0) { var okw = this.addShockWall(m, (S.bossWait || 0) >= 8); if (okw) { S.boss = (ph === 1 ? 4 : 5) / m; S.bossWait = 0; } else { S.boss = 0.4; S.bossWait = (S.bossWait || 0) + 0.4; } } }
    if (ph === 2 || ph === 3) { S.tent -= dt; if (S.tent <= 0) { S.tent = 5 / m; this.addColumns(3); } }
  };

  /* ---- objects ---- */
  P.updateObjsSide = function (dt) {
    var i, o, alive = [], camL = this.cam.x - 800;
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i]; o.t = (o.t || 0) + dt;
      switch (o.kind) {
        case 'mine': if (o.y < FLOOR - 40) o.y += o.vy * dt; o.life -= dt; if (o.life <= 0) o.dead = true; break;
        case 'frock':
          if (o.st === 'tele' && o.t >= 1) { o.st = 'fall'; o.vy = 0; }
          if (o.st === 'fall') { o.y += 700 * dt; if (o.y > FLOOR) o.dead = true; }
          break;
        case 'crock':
          if (o.st === 'idle') { var dx = o.x - this.player.x; if (dx < SD.fallRockTrigger && dx > -100) { o.st = 'shake'; o.t = 0; } }
          else if (o.st === 'shake' && o.t >= 1) { o.st = 'fall'; o.t = 0; }
          else if (o.st === 'fall') { o.y += 700 * dt; if (o.y > FLOOR - 30) { o.st = 'gone'; o.t = 0; } }
          break;
        case 'shockring': if (o.t > o.life) o.dead = true; o.r = o.max * Math.min(1, o.t / 0.4); break;
        case 'sonar': o.r += 260 * dt; if (o.t > o.life) o.dead = true; break;
        case 'ink': if (o.t > o.life) o.dead = true; break;
        case 'wall': case 'swall': o.x += o.vx * dt; break;
        case 'column':
          if (o.st === 'tele' && o.t >= o.tele) { o.st = 'on'; o.t = 0; }
          else if (o.st === 'on' && o.t >= o.life) o.dead = true;
          break;
        default: break;
      }
      if (o.x !== undefined && o.x < camL) o.dead = true;
      if (!o.dead) alive.push(o);
    }
    this.objs = alive;
    var keep = [];
    for (i = 0; i < this.obs.length; i++) { o = this.obs[i]; if (!o.dead && o.x > camL) keep.push(o); }
    this.obs = keep;
    var zk = [];
    for (i = 0; i < this.zones.length; i++) { o = this.zones[i]; if (o.x > camL - (o.r || 0)) zk.push(o); }
    this.zones = zk;
    for (i = 0; i < this.pickups.length; i++) this.pickups[i].t += dt;
  };
  // walls and columns hurt through a 300 px gap; breakable obstacles break when the form is big enough
  P.collideSide = function (dt) {
    var p = this.player, i, o, hit;
    if (p.airborne) return;
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i];
      if (o.kind === 'swall' || o.kind === 'wall') {
        if (Math.abs(p.x - o.x) < o.w / 2 + p.r * 0.7 && Math.abs(p.y - o.gapY) + p.r * 0.4 > o.gapH / 2) this.damage({ name: o.kind === 'wall' ? 'Wall' : 'Shockwave', kind: 'hazard', id: o.kind === 'wall' ? 'struct' : 'shockwave' }, o.x, p.y);
      } else if (o.kind === 'column' && o.st === 'on') {
        if (Math.abs(p.x - o.x) < o.w / 2 + p.r * 0.7 && Math.abs(p.y - o.gapY) + p.r * 0.4 > o.gapH / 2) this.damage({ name: 'Tentacle', kind: 'hazard', id: 'tentacle' }, o.x, p.y);
      }
    }
    for (i = 0; i < this.obs.length; i++) {
      o = this.obs[i];
      if (!o.breakable || o.dead || this.S < o.breakable) continue;
      if (o.shape === 'r') hit = Math.abs(p.x - o.x) < o.w / 2 + p.r && Math.abs(p.y - o.y) < o.h / 2 + p.r; else hit = U.dist(p.x, p.y, o.x, o.y) < p.r + o.r;
      if (hit) this.breakObstacle(o);
    }
  };

  /* ================================================================ HUD helpers */
  // Threat Markers: creatures and surface targets that are still outside the right edge (red: predators, ambushers, hazards; yellow: surface targets)
  P.threatMarkers = function () {
    var out = [], i, c, vr = this.viewRight(), L = this.threatsList();
    for (i = 0; i < L.length; i++) { c = L[i]; if (c.x - c.len * 0.5 > vr) out.push({ id: c.id, kind: 'red', y: c.y }); }
    for (i = 0; i < this.surface.length; i++) { c = this.surface[i]; if (!c.dead && c.x - c.w * 0.5 > vr) out.push({ id: c.id, kind: 'yellow', y: c.y }); }
    for (i = 0; i < this.objs.length; i++) { c = this.objs[i]; if ((c.kind === 'wall' || c.kind === 'swall' || c.kind === 'column') && c.x - c.w * 0.5 > vr) out.push({ id: c.id, kind: 'red', y: c.gapY }); }
    for (i = 0; i < this.bossTele.length; i++) out.push({ id: this.bossTele[i].id, kind: 'red', y: this.bossTele[i].y });         // CR-4: boss attacks are announced on their lane (>= 1.0 s)   // CR-4: blockers get a red marker at the height of their gap while they are still outside the view
    return out;
  };
  // QA: remove every creature, surface target, object and pickup; freeze = also stop the spawner
  P.clearSpawns = function (freeze) {
    this.creatures = []; this.surface = []; this.objs = []; this.pickups = []; this.obs = []; this.zones = [];
    if (freeze) this.noSpawn = true;
    if (!freeze) this.noSpawn = false;
    return true;
  };
  // QA: spawn(type, x, y, opts) in Side-scroller mode; x may be 'ahead' (off-screen right) or 'onPlayer'
  P.qaSpawnSide = function (type, x, y, o) {
    var p = this.player;
    if (y && typeof y === 'object' && o === undefined) { o = y; y = undefined; }
    o = o || {};
    if (type === 'coin') return this.addPickup(x === 'onPlayer' ? p.x : (typeof x === 'number' ? x : this.viewRight() + 300), x === 'onPlayer' ? p.y : (y === undefined ? 600 : y), this.world);
    if (x === 'onPlayer') { x = p.x; y = p.y; } else if (typeof x !== 'number') x = undefined;
    var c = this.spawnSide(type, { x: x, y: y, size: o.size, single: true });
    return c;
  };
  P.qaSetGP = function (n) {
    this.levelGP = U.clamp(n, 0, BAL.maxGP); this.refreshForm(true, true);
  };
})(typeof window !== 'undefined' ? window : globalThis);
