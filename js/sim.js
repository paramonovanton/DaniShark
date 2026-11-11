/* Ocean Evolution - arena simulation core (pure JS, no DOM, no canvas).
   One Sim = one level attempt. step(dt) advances it with a fixed timestep; everything the view needs is read from
   the Sim fields and from the events queue (sim.events, drained by the controller).
   Files: sim.js (core, player, jump, rules) + sim_ai.js (creature behaviour) + sim_world.js (arena, hazards, spawns, events, boss). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var BAL = OE.BAL, U = OE.util, M = OE.Model, CR = OE.CREATURES, SF = OE.SURFACE, WORLDS = OE.WORLDS;
  var W = BAL.W, H = BAL.H;

  function Sim(o) {
    this.world = o.world | 0; this.level = o.level | 0;
    this.side = o.controlMode === 'side'; this.controlMode = this.side ? 'side' : 'classic';   // Side-scroller (CR-2) or Classic; sim_side.js holds the side controller
    this.wdef = WORLDS[this.world - 1]; this.ldef = this.wdef.levels[this.level - 1];
    // CR-3: growth is per level. levelGP 0..450 restarts at 0; the goal form of the level ends the growth part of the level (Game: goal banner + bonus phase)
    this.goalForm = M.goalForm(this.world, this.level); this.goalGP = M.gpForForm(this.goalForm);
    this.goalReached = false; this.evolutionsThisLevel = 0; this.formReachedT = {}; this.evtPending = null; this.maxForm = 1;
    this.rng = new U.Rng(o.seed);
    this.t = 0; this.stepNo = 0; this.levelGP = U.clamp(o.levelGP || 0, 0, BAL.maxGP); this.hearts = BAL.hearts; this.coins = 0;
    this.halted = false; this.ended = null; this.dying = false; this.dyingT = 0; this.cause = null;
    this.nextId = 1;
    this.diff = BAL.SIDE.DIFFICULTY_TABLE[this.world + '-' + this.level];                // CR-4 v5.1: the difficulty row of this level
    this.deep = !!this.wdef.deep;                      // CR-4: The Abyss: water fills the whole view, no surface, no jump
    this.waterY = this.deep ? BAL.deepWaterY : BAL.waterY; this.lanes = this.deep ? BAL.SIDE.lanesDeep : BAL.SIDE.lanes; this.bands = this.deep ? BAL.bandsDeep : BAL.bands; this.drift = 0; this.driftT = 0; this.driftDir = 1; this.currentOv = null;
    this.creatures = []; this.surface = []; this.pickups = []; this.obs = []; this.zones = []; this.objs = []; this.groups = {};
    this.events = [];
    this.evt = null; this.eventDone = false; this.surfT = 3; this.surfCount = 0; this.lastEligibleT = 0;
    this.foodT = 0; this.perT = {}; this.pasT = {};
    this.bossPhase = 0; this.dark = this.ldef.dark || 0;
    this.ev = { prey: 0, peer: 0, threat: 0 };      // spawn events by class (spec v4.1, UC world_rosters)
    this.stats = { jumps: 0, surfaceEaten: 0, eaten: 0, moved: 0, firstEat: false, jumpedOnce: false, kicks: 0 };
    this.tide = 0; this.jumpSerial = 0; this.surfaceHistory = [];
    // CR-4 (R-OE-49): viewW = the VISIBLE world width (view / ZOOM, 1536 at the reference), cam.y = the view top (0..216), screen px = (world - cam) x ZOOM
    this.viewW = U.clamp(o.viewW || BAL.DESIGN_W / BAL.ZOOM, BAL.VIEW_W_MIN / BAL.ZOOM, BAL.VIEW_W_MAX / BAL.ZOOM);
    this.cam = { x: 0, y: 0 };
    this.respawn = [];
    this.form = 1; this.S = 10;
    this.player = {
      x: BAL.playerStart.x, y: BAL.playerStart.y, vx: 0, vy: 0, facing: 1, ang: 0, tilt: 0, len: 140, r: 36,
      invuln: 0, stun: 0, slowT: 0, grabT: 0, cooldown: 0, kbT: 0, kbDx: 0, kbDy: 0, kbSp: 0,
      airborne: false, jump: null, ptr: { sx: 960, sy: 660, x: BAL.playerStart.x, y: BAL.playerStart.y, down: false }, ext: { x: 0, y: 0 },
      zoneMul: 1, stealth: false, biteT: 0, blink: 0, wasEligible: false
    };
    this.S = M.sizeForGP(this.levelGP); this.form = M.formForGP(this.levelGP); this.maxForm = this.form; this.formReachedT[this.form] = 0;
    this.derive(true);
    if (this.side) { this.player.x = BAL.SIDE.screenX * this.viewW; this.buildSide(); }
    else this.build();
    this.cam.x = 0; this.snapCameraY();
    this.bossInit();                                    // CR-4 v5.1: level 5 of every world is a boss level (sim_boss.js)
  }
  OE.Sim = Sim;
  var P = Sim.prototype;

  P.emit = function (type, data) { var e = data || {}; e.type = type; this.events.push(e); return e; };
  P.drain = function () { var e = this.events; this.events = []; return e; };

  /* ---- growth, size, form (CR-3, R-OE-05..07, R-OE-38) ---- */
  // size S follows the level GP; every growth step (eat, surface reward, evolution) sets len, the colliders and the jump band in the same frame
  // (len eases over BODY.lenEaseS; the colliders use the eased value). snap = no easing (start of a level, QA setters).
  P.derive = function (snap) {
    var p = this.player, to = M.lenPx(this.S);
    if (snap || p.lenTo === undefined) { p.len = p.lenFrom = p.lenTo = to; p.lenT = p.easeS = BAL.BODY.lenEaseS; }
    else if (to !== p.lenTo) { p.lenFrom = p.len; p.lenTo = to; p.lenT = 0; p.easeS = to > p.len * 1.1 ? BAL.BODY.evoEaseS : BAL.BODY.lenEaseS; }       // CR-4: an evolution step eases over 0.4 s, a bite over 0.15 s
    p.r = p.len * BAL.BODY.bodyR;
  };
  P.updateLen = function (dt) {
    var p = this.player;
    var ez = p.easeS || BAL.BODY.lenEaseS;
    if (p.lenT < ez) {
      p.lenT = Math.min(ez, p.lenT + dt);
      var k = p.lenT / ez;
      p.len = p.lenFrom + (p.lenTo - p.lenFrom) * k;
    } else p.len = p.lenTo;
    p.r = p.len * BAL.BODY.bodyR;
  };
  // from level GP to size, form; evolution events (+1 heart per form step, 1.5 s invulnerability) and the goal event
  P.refreshForm = function (silent, snap) {
    this.S = M.sizeForGP(this.levelGP);
    var f = M.formForGP(this.levelGP);
    if (f > this.form) {
      var from = this.form; this.form = f;
      var steps = f - from;
      this.evolutionsThisLevel += steps;
      for (var q = from + 1; q <= f; q++) if (this.formReachedT[q] === undefined) this.formReachedT[q] = this.t;
      if (f > this.maxForm) this.maxForm = f;
      if (!silent) {
        var hf = 0; for (var qh = from + 1; qh <= f; qh++) if (BAL.GROWTH.HEART_ON_EVOLVE_FORMS.indexOf(qh) >= 0) hf++;       // CR-4 v5.1: +1 heart only on the evolutions to forms 3, 5 and 7
        this.hearts = Math.min(BAL.GROWTH.HEARTS_MAX, this.hearts + hf * BAL.GROWTH.HEART_ON_EVOLVE);
        this.player.invuln = Math.max(this.player.invuln, BAL.GROWTH.EVO_INVULN_S);
        this.emit('evolve', { from: from, to: f, hearts: this.hearts });
      }
      if (f >= this.goalForm && !this.goalReached) { this.goalReached = true; this.goalAt = this.t; this.krakenHearts = this.hearts; if (!silent) this.emit('kraken', { form: f, hearts: this.hearts }); }      // CR-4 v5.1: the goal of every level = the Kraken; stars = hearts left now
      this.scheduleEvent();
    } else if (f < this.form) this.form = f;
    this.derive(snap);
  };
  // surface event: once per level, EVENT_DELAY_S after the form first reaches the event form (5: Pirate Treasure, 6: Aircraft Challenge / Island Destruction, 7: Cargo Ship)
  P.scheduleEvent = function () {
    if (this.evtPending || this.eventDone || this.evt) return;
    if (this.deep) return;                                                              // CR-4: no surface events in the deep ocean
    var f = this.form, id = null;
    if (f >= 7) id = 'cargo_ship'; else if (f === 6) id = this.rng.chance(0.5) ? 'aircraft_challenge' : 'island_destruction'; else if (f === 5) id = 'pirate_treasure';
    if (id) this.evtPending = { id: id, at: this.t + BAL.GROWTH.EVENT_DELAY_S };
  };
  P.gain = function (gp) { this.levelGP = Math.min(BAL.maxGP, this.levelGP + gp); this.refreshForm(false); };
  P.setLevelGP = function (n) {
    this.levelGP = U.clamp(n, 0, BAL.maxGP);
    this.refreshForm(false, true);
  };
  // QA: set the form by its threshold (no events, no heart), snap the body
  P.setForm = function (f) {
    f = U.clamp(Math.round(f), 1, 8);
    this.levelGP = M.gpForForm(f); this.refreshForm(false, true);
  };
  P.setHearts = function (n) {
    this.hearts = Math.max(0, Math.round(n));
    if (this.hearts <= 0 && !this.dying) this.die({ name: 'QA', kind: 'hazard', id: 'qa' });
  };
  P.resume = function () { this.halted = false; };
  // end the level as a win (Game calls it when the bonus phase ends); the player must be in the water
  P.finish = function () {
    if (this.ended) return false;
    this.ended = 'win'; this.halted = true; this.emit('win', {});
    return true;
  };
  // BUG-U1 / R-OE-46: the player centre is clamped to [waterY + bodyR, seabedY - bodyR]; the floor line y = seabedY is the resting line of the player AND of floor creatures
  P.yBounds = function () { return [this.waterY + this.player.r, BAL.seabedY - this.player.r]; };
  /* ---- CR-3 spec v4.1 (R-OE-42): non-surface spawns at every form are 55 % prey, 15 % peers, 30 % threats (size >= 1.15 x player, hazards, ambushers) ---- */
  // the level's species by class (by the roster's relative size): food entries with rel >= 1.15, hazards and ambushers are threats, 0.87..1.15 peers, the rest prey; pred / haz lists are threats
  P.classes = function () {
    if (this._cls) return this._cls;
    var R = BAL.ROSTER_REL[this.world], rel = (R && R.rel) || {}, ld = this.ldef, cl = { prey: [], peer: [], threat: [] };
    (ld.food || []).forEach(function (a) {
      var d = CR[a[0]], r = rel[a[0]]; if (!d) return;
      if (d.k === 'haz' || d.ai === 'ambush' || (r !== undefined && r >= 1.15)) cl.threat.push([a[0], a[1]]);
      else if (r !== undefined && r > 0.87) cl.peer.push([a[0], a[1]]);
      else cl.prey.push([a[0], a[1]]);
    });
    (ld.pred || []).concat(ld.haz || []).forEach(function (a) { cl.threat.push([a[0], 1]); });
    return (this._cls = cl);
  };
  P.pickClass = function () {
    var w = BAL.GROWTH.SPAWN_WEIGHTS, cl = this.classes(), hasT = cl.threat.length > 0;
    var a = { prey: cl.prey.length ? w.prey : 0, peer: hasT ? w.peer : 0, threat: hasT ? w.threat : 0 }, tot = a.prey + a.peer + a.threat;
    if (tot <= 0) return 'prey';
    var r = this.rng.next() * tot;
    return r < a.prey ? 'prey' : (r < a.prey + a.peer ? 'peer' : 'threat');
  };
  P.foodPick = function () { var cl = this.classes(); return cl.prey.length ? this.rng.wpick(cl.prey) : this.rng.wpick(this.ldef.food); };
  P.pickThreat = function (bigOnly) {
    var cl = this.classes(), R = BAL.ROSTER_REL[this.world], rel = (R && R.rel) || {}, big;
    if (bigOnly) {                                       // Classic top-up: true threat species (rel >= 1.25) when the level has them, hazards only otherwise
      big = cl.threat.filter(function (a) { return CR[a[0]].k !== 'haz' && (rel[a[0]] || 0) >= BAL.GROWTH.MIN_THREAT_REL; });
      if (big.length) return this.rng.wpick(big);
    }
    var strong = cl.threat.filter(function (a) { var d = CR[a[0]]; return d.k === 'haz' || d.ai === 'ambush' || (rel[a[0]] || 0) >= BAL.GROWTH.MIN_THREAT_REL; });
    return this.rng.wpick(strong.length ? strong : cl.threat);
  };
  // a peer: a roster species of 0.87..1.15 x the player, or (none in this level) a prey species grown to the player's size
  P.peerPick = function () {
    var cl = this.classes();
    if (cl.peer.length) return { id: this.rng.wpick(cl.peer), size: undefined };
    var id = this.foodPick(); return { id: id, size: this.S * this.rng.range(0.92, 1.1) };
  };
  // CR-3 (R-OE-43): prey spawn interval x 1.0 .. 0.7 by world (later worlds feed faster) x BAL.PACE[world][level] (fitted with the greedy bot, tests/bot.js,
  // so reaching the goal form takes about (goal form - 1) x step time + 15 s)
  P.preyMult = function () { return BAL.GROWTH.PREY_INTERVAL_MULT_BY_WORLD[this.world] * ((((this.side ? BAL.PACE : BAL.PACE_C)[this.world]) || [])[this.level - 1] || 1); };
  P.visLen = function (size, def) {
    var L = M.lenPx(this.S) * size / this.S;
    if (def && def.vis) L *= def.vis;
    return U.clamp(L, BAL.creatureLen[0], BAL.creatureLen[1]);
  };

  /* ---- coins ---- */
  P.addCoins = function (n, src, x, y) {
    if (n <= 0) return;
    this.coins += n;
    this.emit('coin', { n: n, src: src || 'pickup', x: x === undefined ? this.player.x : x, y: y === undefined ? this.player.y : y });
  };

  /* ---- input ---- */
  // pointer in SCREEN coordinates (logical px of the view); the sim converts to world with the camera every step
  P.setPointer = function (sx, sy, down) {
    var p = this.player.ptr, Z = BAL.ZOOM; p.sx = U.clamp(sx, 0, this.viewW * Z); p.sy = U.clamp(sy, 0, H); p.down = !!down;
    p.x = p.sx / Z + this.cam.x; p.y = p.sy / Z + this.cam.y;
  };
  // CR-4: world <-> screen (logical px of the 1920 x 1080 view)
  P.scrX = function (wx) { return (wx - this.cam.x) * BAL.ZOOM; };
  P.scrY = function (wy) { return (wy - this.cam.y) * BAL.ZOOM; };
  P.worldX = function (sx) { return sx / BAL.ZOOM + this.cam.x; };
  P.worldY = function (sy) { return sy / BAL.ZOOM + this.cam.y; };
  P.viewH = function () { return BAL.VIEW_H / BAL.ZOOM; };
  // world coordinates
  P.teleport = function (x, y) {
    var p = this.player, yb = this.yBounds(); p.x = x; p.y = U.clamp(y, yb[0], yb[1]); y = p.y; /* R-OE-46: the reach clamp applies at once, a same-frame read already shows it */ p.vx = p.vy = 0; p.kbT = 0;
    if (p.airborne) { p.airborne = false; p.jump = null; }
    this.snapCamera(); this.snapCameraY();
    p.ptr.sx = this.scrX(x); p.ptr.sy = this.scrY(y); p.ptr.x = x; p.ptr.y = y;
  };
  P.setView = function (w) { this.viewW = U.clamp(w, BAL.VIEW_W_MIN / BAL.ZOOM, BAL.VIEW_W_MAX / BAL.ZOOM); this.snapCamera(); this.snapCameraY(); };
  P.camMax = function () { return this.side ? 1e12 : Math.max(0, W - this.viewW); };
  // camera: scroll-x only, follow lerp 0.1, dead zone +-290 around the view centre, clamped to the world
  P.snapCamera = function () {
    if (this.side) { this.cam.x = this.player.x - BAL.SIDE.screenX * this.viewW; return; }   // continuous scroll, player fixed at 30% of the view
    var p = this.player, c = this.cam, cx = c.x + this.viewW / 2;
    if (p.x - cx > BAL.camera.dead) c.x = p.x - BAL.camera.dead - this.viewW / 2;
    else if (p.x - cx < -BAL.camera.dead) c.x = p.x + BAL.camera.dead - this.viewW / 2;
    c.x = U.clamp(c.x, 0, this.camMax());
  };
  /* CR-4 (R-OE-49): vertical follow. View top ty in [0, 216]: target clamp(player.y - 432, 0, 216), lerp 0.12, dead zone +-100 around it (not at the two ends: the seabed
     shows the sand strip, the top shows the sky); worlds 1-6: ty = 0 while the mouth is within 200 units of the waterline or the player is airborne (the sky band and the jump arc stay in view) */
  P.camYTarget = function (hold) {
    var p = this.player, C = BAL.CAM_Y, raw = U.clamp(p.y - C.centre, 0, C.topMax);
    if (!this.deep && (p.airborne || p.y - this.waterY <= C.lookUpWithin)) return 0;
    if (raw <= 0 || raw >= C.topMax || hold === undefined) return raw;
    return Math.abs(raw - this.cam.y) > C.dead ? raw - C.dead * U.sign(raw - this.cam.y) : this.cam.y;
  };
  P.snapCameraY = function () { this.cam.y = this.camYTarget(); };
  P.updateCameraY = function (dt) {
    var ty = this.camYTarget(true);
    this.cam.y = U.clamp(this.cam.y + (ty - this.cam.y) * (1 - Math.pow(1 - BAL.CAM_Y.lerp, dt * 60)), 0, BAL.CAM_Y.topMax);
  };
  P.updateCamera = function (dt) {
    this.updateCameraY(dt);
    if (this.side) { this.snapCamera(); return; }
    var p = this.player, c = this.cam, cx = c.x + this.viewW / 2, tx = c.x;
    if (p.x - cx > BAL.camera.dead) tx = p.x - BAL.camera.dead - this.viewW / 2;
    else if (p.x - cx < -BAL.camera.dead) tx = p.x + BAL.camera.dead - this.viewW / 2;
    tx = U.clamp(tx, 0, this.camMax());
    c.x += (tx - c.x) * (1 - Math.pow(1 - BAL.camera.lerp, dt * 60));
    c.x = U.clamp(c.x, 0, this.camMax());
  };

  /* ---- player geometry ---- */
  P.mouth = function () {
    var p = this.player, a = p.ang, d = BAL.BODY.mouthOffset * p.len;
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: BAL.BODY.mouthR * p.len };
  };
  P.pmax = function () { return BAL.maxSpeedBL * this.player.len; };
  P.jumpEligible = function () {
    var p = this.player;
    return !this.deep && !p.airborne && p.cooldown <= 0 && !this.dying && !this.ended && (p.y - this.waterY) <= (this.side ? BAL.BODY.jumpBL.side : BAL.BODY.jumpBL.classic) * p.len;
  };

  /* ---- damage, bump, knockback ---- */
  P.push = function (dx, dy, dist) {
    var p = this.player, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) {                                  // concentric bodies: push against the velocity, else along +x, so the push is always applied
      var sp = Math.sqrt((p.vx || 0) * (p.vx || 0) + (p.vy || 0) * (p.vy || 0));
      if (sp > 1) { dx = -p.vx; dy = -p.vy; d = sp; } else { dx = 1; dy = 0; d = 1; }
    }
    p.kbDx = dx / d; p.kbDy = dy / d; p.kbT = 0.2; p.kbSp = 2 * dist / 0.2;
  };
  P.damage = function (src, fx, fy) {
    var p = this.player;
    if (p.invuln > 0 || this.hearts <= 0 || this.dying || p.airborne) return false;
    this.hearts -= 1; p.invuln = BAL.invuln; p.blink = BAL.invuln;
    if (!this.side) this.push(p.x - (fx === undefined ? p.x - p.facing : fx), p.y - (fy === undefined ? p.y : fy), BAL.dmgKnock);   // Side-scroller: pass through, no knockback
    this.emit('damage', { source: src.id || src.name, name: src.name, kind: src.kind, hearts: this.hearts, x: p.x, y: p.y });
    this.cause = { name: src.name, kind: src.kind, id: src.id || src.name };
    if (this.hearts <= 0) this.die(src);
    return true;
  };
  P.die = function (src) {
    this.dying = true; this.dyingT = BAL.failDelayS;
    this.cause = { name: src.name, kind: src.kind, id: src.id || src.name };
    this.player.vx = this.player.vy = 0;
    this.emit('dying', { cause: this.cause });
  };
  P.bump = function (c, soft) {
    var p = this.player;
    if (c.bumpCd > 0) return;
    c.bumpCd = 0.6;
    if (this.side) {                      // Side-scroller: forward speed x0.5 for 0.4 s, a 120 px vertical shove (peers only), no heart
      p.peerT = BAL.SIDE.peerSlow.s;
      if (!soft) { p.shoveT = 0.2; p.shoveVy = (p.y >= c.y ? 1 : -1) * BAL.SIDE.peerSlow.shove / 0.2; }
      this.emit('bump', { x: (p.x + c.x) / 2, y: (p.y + c.y) / 2 });
      return;
    }
    this.push(p.x - c.x, p.y - c.y, soft ? 90 : BAL.bumpKnock);
    if (!soft) p.stun = BAL.bumpStun;
    this.emit('bump', { x: (p.x + c.x) / 2, y: (p.y + c.y) / 2 });
  };

  /* ---- jump ---- */
  function arc(u, A) {            // fixed parabola, apex at 40% of the flight
    var k = BAL.apexAt;
    if (u <= k) { var a = (k - u) / k; return A * (1 - a * a); }
    var b = (u - k) / (1 - k); return A * (1 - b * b);
  }
  P.jump = function (dirHint) {
    if (!this.jumpEligible()) return false;
    var p = this.player, f = BAL.forms[this.form - 1];
    var dir = this.side ? 1 : (dirHint ? (dirHint < 0 ? -1 : 1) : p.facing);
    p.airborne = true; this.jumpSerial++;
    p.jump = { t: 0, T: f.flight, A: f.apex, vx: this.side ? this.fwd : dir * f.dist / f.flight, y0: p.y, dir: dir, bounced: false, hit: {} };
    p.facing = dir; p.stun = 0; p.kbT = 0; p.vx = p.vy = 0;
    this.stats.jumps++; this.stats.jumpedOnce = true;
    this.emit('jump', { x: p.x, y: this.waterY, form: this.form });
    return true;
  };
  P.updateJump = function (dt) {
    var p = this.player, j = p.jump, oldY = p.y;
    j.t += dt;
    var u = Math.min(1, j.t / j.T);
    var lift = Math.max(0, 1 - j.t / 0.18) * (j.y0 - this.waterY);
    p.y = this.waterY - arc(u, j.A) + lift;
    if (this.side) { j.vx = this.fwd * (j.bounced ? 0.4 : 1); p.x += j.vx * dt; }       // forward speed x flight time
    else {
      p.x = U.clamp(p.x + j.vx * dt, p.r, W - p.r);
      if (p.x <= p.r + 0.5 || p.x >= W - p.r - 0.5) j.vx = 0;
    }
    p.vy = (p.y - oldY) / dt; p.vx = j.vx;
    p.ang = Math.atan2(p.vy, j.vx === 0 ? j.dir : j.vx);
    if (j.dir < 0 && j.vx !== 0) p.ang = Math.atan2(p.vy, j.vx);
    p.facing = j.vx !== 0 ? U.sign(j.vx) : j.dir;
    this.collideSurface();
    if (u >= 1 && j.t >= j.T) {
      p.airborne = false; p.jump = null; p.cooldown = BAL.jumpCooldown;
      p.y = this.waterY + 0.3 * p.len; p.vx = p.vy = 0; p.ang = p.facing > 0 ? 0 : Math.PI;
      this.emit('land', { x: p.x, y: this.waterY, form: this.form, size: p.len });
    }
  };

  /* ---- player update ---- */
  P.updatePlayer = function (dt) {
    var p = this.player, i;
    this.updateLen(dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.blink > 0) p.blink -= dt;
    if (p.stun > 0) p.stun -= dt;
    if (p.slowT > 0) p.slowT -= dt;
    if (p.grabT > 0) p.grabT -= dt;
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.biteT > 0) p.biteT -= dt;
    if (this.dying) {
      this.dyingT -= dt; p.y += 140 * dt; p.ang = p.facing > 0 ? 0.9 : Math.PI - 0.9;
      if (this.dyingT <= 0 && !this.ended) { this.ended = 'fail'; this.halted = true; this.emit('fail', { cause: this.cause }); }
      return;
    }
    if (p.airborne) { this.updateJump(dt); return; }

    var cap = this.pmax() * (p.slowT > 0 ? 0.5 : 1) * (p.grabT > 0 ? 0.4 : 1) * p.zoneMul;
    var ptr = p.ptr, dx = ptr.x - p.x, dy = ptr.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (p.stun > 0) { p.vx *= 0.9; p.vy *= 0.9; }
    else if (ptr.down && d > 1) {
      var sp = cap * U.clamp((d - (BAL.stopRadius - 6)) / 80, 0, 1);
      var k = Math.min(1, 9 * dt);
      p.vx += (dx / d * sp - p.vx) * k; p.vy += (dy / d * sp - p.vy) * k;
    } else {                                    // glide to a stop in 0.5 s
      var sp0 = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (sp0 > 0) {
        var dec = (this.pmax() / BAL.glideS) * dt, ns = Math.max(0, sp0 - dec);
        p.vx *= ns / sp0; p.vy *= ns / sp0;
      }
    }
    var sp1 = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (sp1 > cap && cap > 0) { p.vx *= cap / sp1; p.vy *= cap / sp1; }
    var kx = 0, ky = 0;
    if (p.kbT > 0) { var f = p.kbT / 0.2; kx = p.kbDx * p.kbSp * f; ky = p.kbDy * p.kbSp * f; p.kbT -= dt; }
    var nx = p.x + (p.vx + kx + p.ext.x) * dt, ny = p.y + (p.vy + ky + p.ext.y) * dt;
    this.stats.moved += Math.sqrt((nx - p.x) * (nx - p.x) + (ny - p.y) * (ny - p.y));
    p.x = nx; p.y = ny;
    // bounds
    var yb = this.yBounds(), minY = yb[0], maxY = yb[1];
    if (p.x < p.r) { p.x = p.r; p.vx = Math.max(0, p.vx); } else if (p.x > W - p.r) { p.x = W - p.r; p.vx = Math.min(0, p.vx); }
    if (p.y < minY) { p.y = minY; p.vy = Math.max(0, p.vy); } else if (p.y > maxY) { p.y = maxY; p.vy = Math.min(0, p.vy); }
    this.solidPush(p, p.r);
    if (Math.abs(p.vx) > 18) p.facing = U.sign(p.vx);
    else if (ptr.down && Math.abs(dx) > 30) p.facing = U.sign(dx);
    var tgt = U.clamp(p.vy * 0.0016, -0.45, 0.45);
    p.tilt += (tgt - p.tilt) * Math.min(1, 8 * dt);
    p.ang = p.facing > 0 ? p.tilt : Math.PI - p.tilt;
    var el = this.jumpEligible();
    if (el && !p.wasEligible) this.emit('jumpReady', {});
    p.wasEligible = el;
  };

  // push a circle out of solid obstacles (circles and rects)
  P.solidPush = function (o, r) {
    for (var i = 0; i < this.obs.length; i++) {
      var ob = this.obs[i];
      if (!ob.solid || ob.dead) continue;
      var cx, cy, dd, rr;
      if (ob.shape === 'r') {
        cx = U.clamp(o.x, ob.x - ob.w / 2, ob.x + ob.w / 2); cy = U.clamp(o.y, ob.y - ob.h / 2, ob.y + ob.h / 2);
      } else { cx = ob.x; cy = ob.y; }
      var dx = o.x - cx, dy = o.y - cy; dd = Math.sqrt(dx * dx + dy * dy);
      rr = r + (ob.shape === 'r' ? 0 : ob.r);
      if (dd < rr) {
        if (ob.breakable && this.S >= ob.breakable && o === this.player) { this.breakObstacle(ob); continue; }
        if (dd < 0.001) { dx = 0; dy = -1; dd = 1; }
        o.x = cx + dx / dd * rr; o.y = cy + dy / dd * rr;
      }
    }
  };

  /* ---- one fixed step ---- */
  P.step = function (dt) {
    if (this.side) { this.stepSide(dt); this.stampLeads(); return; }
    if (this.halted || this.ended === 'win') return;
    this.stepNo++; this.t += dt;
    this.player.ptr.x = this.player.ptr.sx / BAL.ZOOM + this.cam.x; this.player.ptr.y = this.player.ptr.sy / BAL.ZOOM + this.cam.y;   // a held pointer follows the scrolling view
    this.updateEnv(dt);
    this.updatePlayer(dt);
    this.updateCamera(dt);
    this.stepBoss(dt);
    if (this.evtPending && this.t >= this.evtPending.at && !this.dying) { var pe = this.evtPending; this.evtPending = null; this.startEvent(pe.id); }
    if (!this.dying) {
      this.updateObjs(dt);
      this.updateCreatures(dt);
      this.updateSurface(dt);
      this.collide(dt);
      this.spawnLogic(dt);
    } else { this.updateObjs(dt); }
    this.checkEnd();
    this.stampLeads();                                                    // the warning lead of every blocker is recorded the step it appears (state().blockers.warnLead)
  };
  P.checkEnd = function () { /* CR-3: the level ends through Game (goal banner, bonus phase, Finish, goal + 2, hearts 0 after the goal) */ };
  // advance by ms of simulated time (fixed 60 Hz)
  P.advance = function (ms) {
    var n = Math.round(ms / (1000 / 60)), i;
    for (i = 0; i < n && !this.halted; i++) this.step(1 / 60);
    return i;
  };

  /* ---- jump-state helper for the HUD ---- */
  P.jumpState = function () {
    var p = this.player;
    return { eligible: this.jumpEligible(), airborne: p.airborne, cooldown: Math.max(0, p.cooldown) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
