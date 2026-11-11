/* Ocean Evolution - creature behaviour for the arena simulation (extends OE.Sim). Pure JS, no DOM. */
(function (g) {
  'use strict';
  var OE = g.OE, BAL = OE.BAL, U = OE.util, CR = OE.CREATURES, Sim = OE.Sim, P = Sim.prototype;
  var W = BAL.W, H = BAL.H;
  var dist = U.dist, clamp = U.clamp, sign = U.sign;

  /* ---- spawning ---- */
  P.spawnCreature = function (type, x, y, o) {
    o = o || {};
    var def = CR[type]; if (!def) return null;
    var c = {
      id: this.nextId++, type: type, def: def, size: o.size || this.rosterSize(type, def), x: x, y: y, vx: 0, vy: 0,
      facing: o.facing || (x < W / 2 ? 1 : -1), k: def.k, t: 0, bumpCd: 0, state: '', st: 0, role: 'prey',
      len: 60, br: 20, hidden: false, faded: false, inflated: false, cd: 0, group: o.group || null,
      cost: def.cost || 1, cross: !!o.cross, cdir: o.cross ? (o.facing || 1) : 0, persist: !!o.persist, entered: false, dead: false, wt: 0
    };
    this.sizeCreature(c);
    c.role = this.roleOf(c);
    if (o.hiding) { c.hideSt = 'hidden'; c.hideT = 2.5; c.hidden = true; c.hides = true; }
    else if (o.hides) { c.hides = true; c.hideSt = 'out'; c.hideT = this.rng.range(4, 8); }
    if (def.ai === 'ambush') c.home = { x: x, y: y };
    if (def.ai === 'wraith') { c.fadeT = this.rng.range(1, 3); }
    this.creatures.push(c);
    return c;
  };
  // CR-3 (R-OE-42): a roster creature spawns at rel x current player size x random(0.9..1.1) (snapshot at spawn); rel = design size / S_ref(world)
  P.rosterSize = function (type, def) {
    var R = BAL.ROSTER_REL[this.world], rel = R && R.rel[type];
    if (rel === undefined) return def.size;
    var size = rel * (def.k === 'pred' && this.diff ? this.diff.tier : 1) * this.S * (def.k === 'pred' ? 1 : this.rng.range(0.9, 1.1));          // CR-4 v5.1: predator tier factor 0.9 .. 1.4 (relative sizes, never below 1.15)
    return def.k === 'pred' ? Math.max(size, 1.16 * this.S) : size;      // a creature listed as a predator is always a predator when it spawns (the 0.9 factor must not turn a 1.15 roster entry into a peer)
  };
  P.sizeCreature = function (c) {
    if (c.boss) { var R = BAL.ROSTER_REL[this.world], rel = R && R.rel[c.type]; if (rel) c.size = rel * this.S; }      // the boss keeps its relative size (1.54) as the player grows
    c.len = this.visLen(c.size, c.def) * (c.inflated ? 1.6 : 1);
    c.br = c.len * clamp((c.def.asp || 0.4) * 0.5 + 0.04, 0.12, 0.3);
    if (c.brCap && c.br > c.brCap) c.br = c.brCap;                                  // CR-4: a scripted boss body has a collider that always leaves the corridor of the gap rule (sim_boss.js capBr)
  };
  P.roleOf = function (c) {
    var def = c.def, S = this.S;
    if (c.faded) return 'ghost';
    if (def.k === 'pas') return 'passive';
    var prey = c.size <= S / BAL.eatRatio + 1e-9, pred = c.size >= S * BAL.eatRatio - 1e-9;
    if (c.inflated) return 'hazard';
    if (def.k === 'haz') {
      if (def.sp && def.sp.shock && prey && c.state !== 'shock' && c.state !== 'tele') return 'prey';
      return 'hazard';
    }
    if (prey) return 'prey';
    if (pred) return 'predator';
    return 'peer';
  };
  // QA: spawn(type, x, y, opts) where x may be 'onPlayer'
  P.qaSpawn = function (type, x, y, o) {
    if (type === 'wall' || type === 'shockring' || type === 'shockwall' || type === 'shock' || type === 'tentacle' || type === 'column' || type === 'mine') return this.qaSpawnBlocker(type, x, y, o);
    if (this.side) return this.qaSpawnSide(type, x, y, o);
    var p = this.player;
    if (y && typeof y === 'object' && o === undefined) { o = y; y = undefined; }   // spawn(type, 'onPlayer', {opts})
    if (x === 'ahead') { x = this.viewRight() + 240 + (CR[type] ? this.visLen(CR[type].size, CR[type]) * 0.5 : 0); if (y === undefined) y = this.rng.range(this.waterY + 120, BAL.seabedY - 120); }      // spawns come in 240 units beyond the visible right edge
    else if (typeof x !== 'number' && x !== 'onPlayer') x = this.viewRight() + 240;
    if (type === 'coin') {
      return this.addPickup(x === 'onPlayer' ? p.x : x, x === 'onPlayer' ? p.y : y, this.world);
    }
    if (x === 'onPlayer') { x = p.x; y = p.y; }
    var c = this.spawnCreature(type, x, y, o || {});
    if (c && c.def.ai === 'school') { c.group = this.newGroup(c.x, c.y, 'school'); c.ox = c.oy = 0; }
    return c;
  };

  /* ---- groups (schools, dolphin groups, orca pods) ---- */
  P.newGroup = function (x, y, kind) {
    var gr = { id: this.nextId++, kind: kind, cx: x, cy: y, vx: 0, vy: 0, wx: x, wy: y, wt: 0, scatter: 0, mode: 'circle', mt: 0, ang: 0, R: 0, stepNo: -1 };
    this.groups[gr.id] = gr;
    return gr;
  };
  P.groupMembers = function (gr) {
    var a = [];
    for (var i = 0; i < this.creatures.length; i++) if (this.creatures[i].group === gr && !this.creatures[i].dead) a.push(this.creatures[i]);
    return a;
  };
  P.preyMul = function () { return BAL.preySpeedMul[this.level - 1] || 1; };
  P.bandY = function (c) {
    var def = c.def, top = this.waterY + c.br + 40, bot = BAL.seabedY - c.br - 25;
    if (def.band) { top = this.waterY + def.band[0]; bot = Math.min(bot, this.waterY + def.band[1]); }
    if (def.k === 'pred' || def.ai === 'sub') top = this.waterY + 90;
    return [top, Math.max(top + 20, bot)];
  };
  P.nearPlayer = function (c, lens) {
    var p = this.player;
    if (p.airborne || this.dying) return false;
    return dist(c.x, c.y, p.x, p.y) < lens * c.len + p.len * 0.5;
  };
  P.moveTo = function (c, tx, ty, speed, dt, k) {
    var dx = tx - c.x, dy = ty - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var s = speed * Math.min(1, d / 40), kk = Math.min(1, (k || 4) * dt);
    c.vx += (dx / d * s - c.vx) * kk; c.vy += (dy / d * s - c.vy) * kk;
    return d;
  };
  P.fleeFrom = function (c, dt, speed) {
    var p = this.player, dx = c.x - p.x, dy = c.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ax = dx / d, ay = dy / d, yr = this.bandY(c), mx = 0, my = 0;
    if (c.x < 150) mx += 1; if (c.x > W - 150) mx -= 1;
    if (c.y < yr[0] + 60) my += 1; if (c.y > yr[1] - 60) my -= 1;
    var tx = ax + mx * 1.3, ty = ay + my * 1.3;
    if (mx || my) {                                  // cornered: slip sideways
      c.js = c.js || (this.rng.chance(0.5) ? 1 : -1);
      tx += -ay * c.js * 0.9; ty += ax * c.js * 0.9;
    }
    c.jt = (c.jt || 0) - dt;
    if (c.jt <= 0) { c.jt = this.rng.range(0.3, 0.7); c.ja = this.rng.range(-0.55, 0.55); }
    var cs = Math.cos(c.ja || 0), sn = Math.sin(c.ja || 0), ux = tx * cs - ty * sn, uy = tx * sn + ty * cs;
    var l = Math.sqrt(ux * ux + uy * uy) || 1, kk = Math.min(1, 7 * dt);
    c.vx += (ux / l * speed - c.vx) * kk; c.vy += (uy / l * speed - c.vy) * kk;
  };
  // flee speed with burst/tired cycle for evasive prey (flee >= 1)
  P.fleeSpeed = function (c, dt) {
    var f = c.def.flee || 0.75, ps = this.pmax(), mul = this.preyMul();
    if (f < 1) return f * ps * mul;
    c.fm = c.fm || 'burst'; c.fmT = c.fmT === undefined ? 1.2 : c.fmT; c.fmT -= dt;
    if (c.fmT <= 0) { if (c.fm === 'burst') { c.fm = 'tired'; c.fmT = 1.5; } else { c.fm = 'burst'; c.fmT = 1.2; } }
    return (c.fm === 'burst' ? f : 0.6) * ps * mul;
  };
  P.wanderTo = function (c, dt, speed) {
    var yr = this.bandY(c);
    c.wt -= dt;
    if (c.wx === undefined || c.wt <= 0 || dist(c.wx, c.wy, c.x, c.y) < 40) {
      c.wx = clamp(c.x + this.rng.range(-900, 900), 80, W - 80); c.wy = this.rng.range(yr[0], yr[1]); c.wt = this.rng.range(3, 7);
    }
    this.moveTo(c, c.wx, c.wy, speed, dt, 3);
  };
  P.canSee = function (c) {
    var p = this.player;
    if (p.airborne || this.dying) return false;
    var d = dist(c.x, c.y, p.x, p.y);
    if (p.stealth && d > c.len) return false;
    if (this.t < 4) return false;                    // grace period at the start of a level
    return d < Math.min((c.def.det || 4) * c.len, BAL.detectCap) + p.len * 0.5;
  };

  /* ---- per-creature behaviour ---- */
  P.updateGroups = function (dt) {
    var id, gr, i, m, mem;
    for (id in this.groups) {
      gr = this.groups[id];
      mem = this.groupMembers(gr);
      if (!mem.length) { delete this.groups[id]; continue; }
      gr.n = mem.length;
      var lead = mem[0], def = lead.def, p = this.player;
      var cx = 0, cy = 0;
      for (i = 0; i < mem.length; i++) { cx += mem[i].x; cy += mem[i].y; }
      cx /= mem.length; cy /= mem.length;
      if (gr.kind === 'school') {
        if (gr.scatter > 0) { gr.scatter -= dt; if (gr.scatter <= 0) { gr.cx = cx; gr.cy = cy; gr.wt = 0; } }
        else {
          // scatters when the player is within 2 body lengths
          for (i = 0; i < mem.length; i++) {
            m = mem[i];
            if (m.role === 'prey' && !p.airborne && dist(m.x, m.y, p.x, p.y) < 2 * Math.max(m.len, 0.8 * p.len)) { gr.scatter = 1.2; break; }
          }
          gr.wt -= dt;
          if (gr.cross) {
            gr.cx += gr.vx * dt; gr.cy += gr.vy * dt;
          } else {
            var yr = this.bandY(lead);
            if (gr.wt <= 0 || dist(gr.cx, gr.cy, gr.wx, gr.wy) < 50) {
              gr.wx = clamp(gr.cx + this.rng.range(-900, 900), 160, W - 160); gr.wy = this.rng.range(yr[0] + 30, yr[1] - 30); gr.wt = this.rng.range(3, 6);
            }
            var sp = def.spd * lead.len * this.preyMul(), dx = gr.wx - gr.cx, dy = gr.wy - gr.cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
            gr.vx = dx / d * sp; gr.vy = dy / d * sp;
            gr.cx += gr.vx * dt; gr.cy += gr.vy * dt;
          }
        }
      } else if (gr.kind === 'hunt') {
        gr.wt -= dt;
        var yr2 = this.bandY(lead);
        if (gr.wt <= 0 || dist(cx, cy, gr.wx, gr.wy) < 80) {
          gr.wx = clamp(cx + this.rng.range(-900, 900), 160, W - 160); gr.wy = this.rng.range(yr2[0] + 30, yr2[1] - 30); gr.wt = this.rng.range(4, 8);
        }
        var seen = false;
        for (i = 0; i < mem.length; i++) if (mem[i].role === 'predator' && this.canSee(mem[i])) { seen = true; break; }
        gr.seen = seen;
        if (def.ai === 'pod') {
          gr.mt += dt;
          if (!seen) { gr.mode = 'circle'; gr.mt = 0; gr.R = 4 * lead.len; }
          else if (gr.mode === 'circle') {
            gr.ang += 0.7 * dt; gr.R = Math.max(2.2 * lead.len, 4 * lead.len - gr.mt * 0.4 * lead.len);
            if (gr.mt > 5) { gr.mode = 'dash'; gr.mt = 0; gr.tx = p.x; gr.ty = p.y; }
          } else if (gr.mode === 'dash' && gr.mt > 1.0) { gr.mode = 'circle'; gr.mt = 0; gr.R = 4 * lead.len; }
        }
      }
    }
  };

  P.updateCreatures = function (dt) {
    var i, c, p = this.player;
    this.updateGroups(dt);
    for (i = 0; i < this.creatures.length; i++) {
      c = this.creatures[i];
      if (c.dead) continue;
      c.t += dt; if (c.bumpCd > 0) c.bumpCd -= dt; if (c.cd > 0) c.cd -= dt;
      this.sizeCreature(c);
      c.role = this.roleOf(c);
      var ai = this['ai_' + c.def.ai];
      if (c.scr) { this.moveScr(c, dt); } else if (ai) ai.call(this, c, dt);                        // CR-4: scripted boss attacks fly straight lines
      // integrate
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (Math.abs(c.vx) > 10) c.facing = sign(c.vx);
      if (!c.cross && c.def.ai !== 'boss' && c.def.ai !== 'cruise' && c.def.ai !== 'serpent') {
        var yr = this.bandY(c), yMax = (c.def.ai === 'bottom' ? BAL.floorBand[1] - c.br * 0.6 : BAL.seabedY - c.br - 6);
        if (c.x < 30) { c.x = 30; c.vx = Math.abs(c.vx); } else if (c.x > W - 30) { c.x = W - 30; c.vx = -Math.abs(c.vx); }
        if (c.y < this.waterY + c.br + 20) { c.y = this.waterY + c.br + 20; c.vy = Math.abs(c.vy); }
        else if (c.y > yMax) { c.y = yMax; c.vy = -Math.abs(c.vy) * (c.def.ai === 'bottom' ? 0 : 1); }
        if (c.def.ai !== 'ambush' && c.def.ai !== 'still' && c.def.ai !== 'rush') this.solidPush(c, c.br);
      }
      if (c.scr && this.scrGone(c)) c.dead = true;
      // crossing creatures leave through the far side of the world
      if (c.cross && !c.scr) {
        var dirx = c.cdir || (c.cvx < 0 ? -1 : 1);
        if ((dirx > 0 && c.x > W + c.len * 1.5) || (dirx < 0 && c.x < -c.len * 1.5)) c.dead = true;
      }
      // far from the camera: removed (persistent species come back later, outside the view)
      if (!c.dead && c.def.ai !== 'boss' && c.def.ai !== 'serpent' && Math.abs(c.x - (this.cam.x + this.viewW / 2)) > BAL.despawnX) {      // (the leviathan parks itself at x = -9999 between its sweeps)
        c.dead = true;
        if (c.persist) this.respawn.push({ type: c.type, group: c.group ? c.group.id : 0, t: this.t + 3 });
      }
    }
    var alive = [];
    for (i = 0; i < this.creatures.length; i++) if (!this.creatures[i].dead) alive.push(this.creatures[i]);
    this.creatures = alive;
  };

  // --- generic movement families ---
  P.preyFlee = function (c, dt, lens) {
    if (c.role === 'prey' && (c.def.flee || c.def.k === 'pred') && this.nearPlayer(c, lens || 3)) {
      var f = c.def.k === 'pred' ? 0.7 * this.pmax() : this.fleeSpeed(c, dt);
      this.fleeFrom(c, dt, f);
      return true;
    }
    return false;
  };
  P.ai_still = function (c, dt) {
    c.vx *= 0.9; c.vy *= 0.9;
    var s = c.def.sp || {};
    if (s.snap) {                                    // snapping crab: claws snap when the player is within 1 body length
      c.snapT = (c.snapT || 0) - dt;
      if (c.snapT <= -1.2 && this.nearPlayer(c, 1)) c.snapT = 0.4;
    }
  };
  P.hideCycle = function (c, dt) {
    if (!c.hides) return false;
    c.hideT -= dt;
    if (c.hideSt === 'hidden') {
      c.hidden = true; c.vx = c.vy = 0;
      if (c.hideT <= 0) { c.hideSt = 'out'; c.hidden = false; c.hideT = this.rng.range(5, 8); }
      return true;
    }
    c.hidden = false;
    if (c.hideSt === 'out' && c.hideT <= 0) { c.hideSt = 'seek'; c.hideT = 4; }
    if (c.hideSt === 'seek') {
      var best = null, bd = 1e9;
      for (var i = 0; i < this.obs.length; i++) if (this.obs[i].kind === 'coral') { var d = dist(c.x, c.y, this.obs[i].x, this.obs[i].y); if (d < bd) { bd = d; best = this.obs[i]; } }
      if (!best) { c.hideSt = 'out'; c.hideT = 6; return false; }
      this.moveTo(c, best.x, best.y - best.r * 0.2, 0.7 * this.pmax(), dt, 4);
      if (bd < 40 || c.hideT <= 0) { c.hideSt = 'hidden'; c.hideT = this.rng.range(2.5, 3.5); c.hidden = true; }
      return true;
    }
    return false;
  };
  P.ai_wander = function (c, dt) {
    if (this.hideCycle(c, dt)) return;
    if (c.def.jets) {                                // squid: jets away in bursts and drops an ink cloud
      if (c.jetT > 0) { c.jetT -= dt; return; }
      if (c.role === 'prey' && this.nearPlayer(c, 2) && c.cd <= 0) {
        c.cd = 6; c.jetT = 0.5;
        var p = this.player, dx = c.x - p.x, dy = c.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        c.vx = dx / d * this.pmax() * 1.1; c.vy = dy / d * this.pmax() * 1.1;
        this.objs.push({ kind: 'ink', x: c.x, y: c.y, r: 150, life: 1.5, t: 0 });
        this.emit('ink', { x: c.x, y: c.y });
        return;
      }
    }
    if (c.role === 'peer' && c.def.k === 'food' && c.def.flee && false) return;
    if (this.preyFlee(c, dt, 3)) {
      if (c.def.sp && c.def.sp.retract) c.retract = true;
      return;
    }
    var sp = c.def.spd * c.len * this.preyMul();
    if (c.def.erratic) { c.et = (c.et || 0) - dt; if (c.et <= 0) { c.et = this.rng.range(0.4, 1.2); c.wt = 0; } }
    if (c.type === 'turtle') c.retract = this.nearPlayer(c, 3) && c.role === 'prey';
    this.wanderTo(c, dt, sp);
  };
  P.ai_bottom = function (c, dt) {
    var by = BAL.seabedY - c.br;                         // R-OE-46: floor creatures rest on the floor line with their own radius, like the player
    c.y += (by - c.y) * Math.min(1, 4 * dt); c.vy = 0;
    if (this.hideCycle(c, dt)) return;
    var sp = c.def.spd * c.len * this.preyMul();
    if (c.role === 'prey' && c.def.flee && this.nearPlayer(c, 3)) {
      var s = sign(c.x - this.player.x) || 1;
      if (c.x < 120) s = 1; if (c.x > W - 120) s = -1;
      c.vx += (s * c.def.flee * this.pmax() * this.preyMul() - c.vx) * Math.min(1, 6 * dt);
      return;
    }
    c.wt -= dt;
    if (c.wx === undefined || c.wt <= 0 || Math.abs(c.wx - c.x) < 30) { c.wx = clamp(c.x + this.rng.range(-900, 900), 100, W - 100); c.wt = this.rng.range(4, 8); }
    c.vx += (sign(c.wx - c.x) * sp - c.vx) * Math.min(1, 3 * dt);
  };
  P.ai_drift = function (c, dt) {
    var sp = c.def.spd * c.len * this.preyMul(), s = c.def.sp || {};
    if (s.puff) {
      if (c.inflT > 0) { c.inflT -= dt; if (c.inflT <= 0) { c.inflated = false; c.puffCd = 2; this.sizeCreature(c); } }
      else {
        c.puffCd = (c.puffCd || 0) - dt;
        if (c.puffCd <= 0 && this.nearPlayer(c, 1.5)) { c.inflated = true; c.inflT = 2; this.sizeCreature(c); c.role = 'hazard'; }
      }
    }
    c.dt2 = (c.dt2 || 0) - dt;
    if (c.dt2 <= 0) {
      var a = this.rng.range(0, Math.PI * 2);
      c.dvx = Math.cos(a) * sp * this.rng.range(0.5, 1); c.dvy = Math.sin(a) * sp * 0.5; c.dt2 = this.rng.range(3, 6);
    }
    var yr = this.bandY(c);
    if (c.y < yr[0] + 20) c.dvy = Math.abs(c.dvy || 0.1) + 5; if (c.y > yr[1] - 20) c.dvy = -Math.abs(c.dvy || 0.1) - 5;
    if (c.type === 'ammonite') c.dvy = (c.dvy || 0) + Math.sin(c.t * 1.4) * 8;
    c.vx += ((c.dvx || 0) - c.vx) * Math.min(1, 1.5 * dt); c.vy += ((c.dvy || 0) - c.vy) * Math.min(1, 1.5 * dt);
  };
  P.ai_vertical = function (c, dt) {
    if (this.preyFlee(c, dt, 3)) return;
    var sp = c.def.spd * c.len * this.preyMul(), yr = this.bandY(c);
    c.wt -= dt;
    if (c.wy === undefined || c.wt <= 0 || Math.abs(c.wy - c.y) < 30) { c.wy = this.rng.range(yr[0], yr[1]); c.wx = clamp(c.x + this.rng.range(-120, 120), 100, W - 100); c.wt = this.rng.range(3, 6); }
    this.moveTo(c, c.wx, c.wy, sp, dt, 2);
  };
  P.ai_jelly = function (c, dt) {
    var yr = this.bandY(c), sp = c.def.spd * c.len;
    if (c.by === undefined) { c.by = c.y; c.bx = c.x; c.ph = this.rng.range(0, 6.28); }
    c.vy = Math.cos(c.t * 0.6 + c.ph) * sp * 2.2;
    c.vx = Math.sin(c.t * 0.25 + c.ph) * sp * 0.7;
    if (c.y < yr[0] + 10) c.vy = Math.abs(c.vy); if (c.y > yr[1] - 10) c.vy = -Math.abs(c.vy);
  };
  P.ai_wraith = function (c, dt) {
    c.fadeT -= dt;
    if (c.fadeT <= 0) { c.faded = !c.faded; c.fadeT = c.faded ? 1.2 : 3; }
    if (this.preyFlee(c, dt, 3)) return;
    this.wanderTo(c, dt, c.def.spd * c.len * this.preyMul());
  };
  P.ai_school = function (c, dt) {
    var gr = c.group, def = c.def, p = this.player;
    if (!gr) { gr = c.group = this.newGroup(c.x, c.y, 'school'); }
    if (c.ox === undefined) { var a = this.rng.range(0, 6.28), rr = this.rng.range(0.2, 1) * c.len * 1.4 * Math.sqrt(Math.max(2, gr.n || 6) / 2); c.ox = Math.cos(a) * rr; c.oy = Math.sin(a) * rr * 0.7; c.ph = this.rng.range(0, 6.28); }
    if (this.hideCycle(c, dt)) return;
    if (gr.scatter > 0 && c.role === 'prey') {
      this.fleeFrom(c, dt, (def.flee ? this.fleeSpeed(c, dt) : 0.75 * this.pmax() * this.preyMul()));
      return;
    }
    if (c.role === 'prey' && def.flee && this.nearPlayer(c, 3)) { this.fleeFrom(c, dt, this.fleeSpeed(c, dt)); return; }
    var wob = Math.sin(c.t * 1.5 + c.ph) * 0.25;
    var tx = gr.cx + c.ox * (1 + wob), ty = gr.cy + c.oy * (1 - wob);
    var sp = Math.max(60, def.spd * c.len * this.preyMul()) * 1.35;
    this.moveTo(c, tx, ty, sp, dt, 4);
  };
  P.ai_cruise = function (c, dt) {
    if (c.cvx === undefined) { c.cvx = (c.x < W / 2 ? 1 : -1) * c.def.spd * c.len; c.by = c.y; }
    if (c.ph === undefined) c.ph = this.rng.range(0, 6.28);
    c.vx = c.cvx; c.vy = Math.sin(c.t * 0.5 + c.ph) * 14;
    c.cross = true;
  };

  // --- predators ---
  P.ai_patrol = function (c, dt) {
    var def = c.def, p = this.player, ps = this.pmax(), fast = this.ldef.predFast || 1;
    var patrol = clamp(def.spd * c.len, 40, 0.5 * ps);
    if (c.role !== 'predator') {
      if (this.preyFlee(c, dt, 3)) return;
      this.wanderTo(c, dt, patrol); return;
    }
    var see = this.canSee(c);
    if (def.burst) {
      if (c.state === 'burst') {
        c.st -= dt;
        this.moveTo(c, p.x, p.y, def.burst * 0.5 * ps * fast, dt, 5);
        if (c.st <= 0) { c.state = 'cool'; c.st = def.burstCd; }
        return;
      }
      if (c.state === 'cool') { c.st -= dt; if (c.st <= 0) c.state = 'patrol'; }
      else if (see) { c.state = 'burst'; c.st = def.burstT; return; }
    } else if (def.chase) {
      if (c.state === 'tired') { c.st -= dt; if (c.st <= 0) c.state = 'patrol'; }
      else if (c.state === 'chase') {
        c.ch = (c.ch || 0) + dt;
        if (c.ch > 5) { c.state = 'tired'; c.st = 3; c.ch = 0; }               // predators give up after 5 s and rest 3 s
        else if (!see && dist(c.x, c.y, p.x, p.y) > Math.min((def.det || 4) * c.len * 1.6, 900) + p.len) { c.state = 'patrol'; c.ch = 0; }
        else { this.moveTo(c, p.x, p.y, def.chase * ps * fast, dt, 4); return; }
      } else if (see) { c.state = 'chase'; c.ch = 0; return; }
    }
    this.wanderTo(c, dt, patrol);
    if (def.sp && def.sp.grab) {                     // giant squid: tentacle grab slows the player
      if (dist(c.x, c.y, p.x, p.y) < c.len * 0.8 && !p.airborne && p.grabT <= 0 && p.invuln <= 0) p.grabT = 2;
    }
  };
  P.ai_group = function (c, dt) {     // dolphins: one chases, the others flank
    var gr = c.group, p = this.player, ps = this.pmax(), def = c.def;
    if (!gr) gr = c.group = this.newGroup(c.x, c.y, 'hunt');
    var patrol = clamp(def.spd * c.len, 40, 0.5 * ps);
    if (c.role !== 'predator') { if (this.preyFlee(c, dt, 3)) return; this.moveTo(c, gr.wx + (c.ox || 0), gr.wy + (c.oy || 0), patrol, dt, 3); return; }
    if (c.ox === undefined) { c.ox = this.rng.range(-80, 80); c.oy = this.rng.range(-60, 60); }
    var mem = this.groupMembers(gr), leader = mem[0] === c;
    if (!gr.seen) { this.moveTo(c, gr.wx + c.ox, gr.wy + c.oy, patrol, dt, 3); return; }
    if (leader) this.moveTo(c, p.x, p.y, def.chase * ps, dt, 4);
    else {
      var idx = mem.indexOf(c), side = idx % 2 ? 1 : -1;
      var lx = p.vx * 0.5, ly = p.vy * 0.5, px = -(p.y - c.y), py = (p.x - c.x), pl = Math.sqrt(px * px + py * py) || 1;
      this.moveTo(c, p.x + lx + px / pl * side * c.len * 1.6, p.y + ly + py / pl * side * c.len * 1.6, def.chase * 0.95 * ps, dt, 4);
    }
  };
  P.ai_pod = function (c, dt) {       // orca pod: encircle, then dash together
    var gr = c.group, p = this.player, ps = this.pmax(), def = c.def;
    if (!gr) gr = c.group = this.newGroup(c.x, c.y, 'hunt');
    var patrol = clamp(def.spd * c.len, 40, 0.5 * ps);
    if (c.role !== 'predator') { if (this.preyFlee(c, dt, 3)) return; this.moveTo(c, gr.wx + (c.ox || 0), gr.wy + (c.oy || 0), patrol, dt, 3); return; }
    if (c.ox === undefined) { c.ox = this.rng.range(-80, 80); c.oy = this.rng.range(-60, 60); c.pi = this.groupMembers(gr).indexOf(c); }
    if (!gr.seen) { this.moveTo(c, gr.wx + c.ox, gr.wy + c.oy, patrol, dt, 3); return; }
    var n = Math.max(1, this.groupMembers(gr).length);
    if (gr.mode === 'dash') this.moveTo(c, gr.tx, gr.ty, 1.05 * ps, dt, 6);
    else {
      var a = gr.ang + (c.pi || 0) * 6.283 / n;
      var tx = clamp(p.x + Math.cos(a) * gr.R, 60, W - 60), ty = clamp(p.y + Math.sin(a) * gr.R, this.waterY + 90, BAL.seabedY - 60);
      this.moveTo(c, tx, ty, 0.75 * ps, dt, 4);
    }
  };
  P.ai_ambush = function (c, dt) {
    var def = c.def, p = this.player, ps = this.pmax();
    var danger = c.role === 'predator' || c.role === 'peer';
    if (!c.home) c.home = { x: c.x, y: c.y };
    if (c.state === '' || c.state === 'wait') {
      c.state = 'wait';
      this.moveTo(c, c.home.x, c.home.y, 40, dt, 3);
      if (danger && c.cd <= 0 && !p.airborne && !p.stealth && dist(c.x, c.y, p.x, p.y) < (def.det || 1.3) * c.len + p.len * 0.4) {
        c.state = 'lunge'; c.st = 0.7; c.tx = p.x; c.ty = p.y;
      }
    } else if (c.state === 'lunge') {
      c.st -= dt;
      this.moveTo(c, c.tx, c.ty, 1.3 * ps, dt, 8);
      if (c.st <= 0) { c.state = 'back'; c.st = 3; }
    } else {
      c.st -= dt;
      var d = this.moveTo(c, c.home.x, c.home.y, 0.5 * ps, dt, 4);
      if (d < 30 || c.st <= 0) { c.state = 'wait'; c.cd = 3; }
    }
  };
  P.ai_rush = function (c, dt) {      // ambusher that lurks near a vent and rushes in a straight line
    var def = c.def, p = this.player, ps = this.pmax();
    if (!c.home) c.home = { x: c.x, y: c.y };
    if (c.role !== 'predator') { this.wanderTo(c, dt, 0.3 * ps); return; }
    if (c.state === 'rush') {
      c.st -= dt; c.vx = c.rx * 1.2 * ps; c.vy = c.ry * 1.2 * ps;
      if (c.st <= 0) { c.state = 'back'; c.st = 4; }
    } else if (c.state === 'back') {
      c.st -= dt;
      var d = this.moveTo(c, c.home.x, c.home.y, 0.45 * ps, dt, 3);
      if (d < 40 && c.st <= 0) c.state = '';
      if (c.st < -3) c.state = '';
    } else {
      this.moveTo(c, c.home.x + Math.sin(c.t * 0.5) * 120, c.home.y + Math.cos(c.t * 0.4) * 50, 0.15 * ps, dt, 3);
      if (this.canSee(c) && c.cd <= 0) {
        var dx = p.x - c.x, dy = p.y - c.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
        c.state = 'rush'; c.st = 1.0; c.rx = dx / l; c.ry = dy / l; c.cd = 5;
      }
    }
  };
  P.ai_serpent = function (c, dt) {   // leviathan eel sweeps across the view
    var ps = this.pmax(), cam = this.cam;
    c.cross = false;
    if (c.state !== 'sweep') {
      c.st -= dt;
      if (c.state === '') { c.state = 'idle'; c.st = 2; c.x = -9999; }
      if (c.st <= 0) {
        c.state = 'sweep'; var dir = this.rng.chance(0.5) ? 1 : -1;
        c.x = dir > 0 ? cam.x - c.len * 0.6 : cam.x + this.viewW + c.len * 0.6; c.y = this.rng.range(this.waterY + 150, BAL.seabedY - 120);
        c.sd = dir; c.facing = dir;
      }
      c.vx = c.vy = 0; return;
    }
    c.vx = c.sd * 0.9 * ps; c.vy = Math.sin(c.t * 1.3) * 80;
    if ((c.sd > 0 && c.x > cam.x + this.viewW + c.len * 0.8) || (c.sd < 0 && c.x < cam.x - c.len * 0.8)) { c.state = 'idle'; c.st = 5; c.x = -9999; }
  };
  P.ai_sub = function (c, dt) {
    var ps = this.pmax();
    if (c.sd === undefined) { c.sd = c.x < W / 2 ? 1 : -1; c.by = c.y = clamp(c.y, this.waterY + 200, BAL.seabedY - 220); c.cd = 3; }
    if (c.role !== 'predator' && c.size / this.S < 1) { /* edible machine: keeps patrolling */ }
    c.vx = c.sd * 0.3 * ps; c.vy = (c.by - c.y) * 2 + Math.sin(c.t * 0.8) * 15;
    if (c.x > W - c.len * 0.5) c.sd = -1; if (c.x < c.len * 0.5) c.sd = 1;
    c.cd -= dt;
    if (c.cd <= 0) {
      c.cd = 5;
      this.objs.push({ kind: 'sonar', x: c.x, y: c.y, r: 20, t: 0, life: 1.4 });
      this.emit('sonar', { x: c.x, y: c.y });
      var mines = 0; for (var i = 0; i < this.objs.length; i++) if (this.objs[i].kind === 'mine') mines++;
      if (mines < 5) this.objs.push({ kind: 'mine', x: c.x, y: c.y + c.len * 0.2, vy: 55, life: 16, t: 0 });
    }
  };
  P.ai_eel = function (c, dt) {       // electric eel: shock ring every 4 s (telegraph 0.8 s)
    var p = this.player;
    c.sc = (c.sc === undefined ? this.rng.range(0, 3) : c.sc) + dt;
    if (c.state === 'shock') {
      c.st -= dt;
      if (!c.shocked && !p.airborne && dist(c.x, c.y, p.x, p.y) < 3 * c.len + p.r) { c.shocked = true; this.damage({ name: c.def.n, kind: 'hazard', id: c.type }, c.x, c.y); }
      if (c.st <= 0) { c.state = ''; c.sc = 0; }
    } else if (c.sc >= 3.2 && c.state !== 'tele') { c.state = 'tele'; c.st = 0.8; }
    else if (c.state === 'tele') {
      c.st -= dt;
      if (c.st <= 0) { c.state = 'shock'; c.st = 0.5; c.shocked = false; this.objs.push({ kind: 'shockring', x: c.x, y: c.y, r: 10, max: 3 * c.len, t: 0, life: 0.5 }); this.emit('shock', { x: c.x, y: c.y }); }
    }
    if (c.role === 'prey') { if (this.preyFlee(c, dt, 3)) return; }
    this.wanderTo(c, dt, c.def.spd * c.len * 0.6);
  };
  P.ai_boss = function (c, dt) { c.vx = c.vy = 0; };

  /* ---- contacts with creatures ---- */
  P.bodyCircles = function (c) {
    var m = c.def.m || 1, out = [], i;
    if (m === 1) return [[c.x, c.y, c.br * 0.9]];
    var step = c.len * 0.8 / (m - 1);
    for (i = 0; i < m; i++) out.push([c.x + c.facing * (c.len * 0.3 - step * i), c.y, c.br * 0.9 * (1 - 0.08 * i)]);
    return out;
  };
  P.bodyHit = function (c) {
    var p = this.player, cs = this.bodyCircles(c), i;
    for (i = 0; i < cs.length; i++) if (dist(p.x, p.y, cs[i][0], cs[i][1]) < p.r + cs[i][2]) return true;
    if (c.snapT > 0) return dist(p.x, p.y, c.x, c.y) < p.r + c.br * 1.6;
    return false;
  };
  P.eatHit = function (c) {
    var p = this.player, m = this.mouth(), cs = this.bodyCircles(c), i;
    for (i = 0; i < cs.length; i++) {
      var cc = cs[i];
      if (dist(m.x, m.y, cc[0], cc[1]) < m.r + cc[2]) return true;                       // R-OE-38: the mouth circle overlaps the (smaller) creature's body circle
      if (dist(p.x, p.y, cc[0], cc[1]) < cc[2] + p.r * 0.4) return true;
    }
    return false;
  };
  P.eatCreature = function (c) {
    var gp = Math.max(1, 3 * c.size / this.S) * (c.def.rich || 1) * (this.side ? 1 : (((BAL.GP_C || {})[this.world] || [])[this.level - 1] || 1));   // Classic only: BAL.GP_C = the per-level pacing factor on the bite GP (round 5)
    c.dead = true;
    this.stats.eaten++; this.stats.firstEat = true; this.player.biteT = 0.15;
    this.emit('eat', { type: c.type, x: c.x, y: c.y, gp: gp, len: c.len, rich: c.def.rich || 1 });
    this.gain(gp);
  };
  P.collideCreatures = function () {
    var p = this.player, i, c;
    for (i = 0; i < this.creatures.length; i++) {
      c = this.creatures[i];
      if (c.dead || c.faded || c.hidden) continue;
      var role = c.role, sp = c.def.sp || {};
      if (role === 'prey') {
        var dxp = p.x - c.x;
        if (sp.armor && dxp * c.facing > 0.1 * c.len && Math.abs(p.y - c.y) < 0.4 * c.len) { if (this.bodyHit(c)) this.bump(c); continue; }   // head-on = bump
        if (sp.tail && dxp * c.facing < -0.15 * c.len && this.bodyHit(c)) { this.damage({ name: c.def.n, kind: 'hazard', id: c.type }, c.x, c.y); continue; }   // tail sting from behind
        if (this.eatHit(c)) this.eatCreature(c);
        continue;
      }
      if (!this.bodyHit(c)) continue;
      if (role === 'peer') {
        if (sp.lunge && c.state === 'lunge') this.damage({ name: c.def.n, kind: 'eaten', id: c.type }, c.x, c.y);
        else this.bump(c);
      } else if (role === 'predator') {
        if (this.damage({ name: c.def.n, kind: 'eaten', id: c.type }, c.x, c.y)) { if (sp.grab) p.grabT = 2; }
      } else if (role === 'hazard') {
        if (this.damage({ name: c.def.n, kind: 'hazard', id: c.type }, c.x, c.y) && sp.slow) p.slowT = 1;
      } else if (role === 'passive') {
        if (c.def.ai !== 'boss') this.bump(c, true); else this.bump(c, true);
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
