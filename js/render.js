/* Ocean Evolution - arena renderer (Canvas 2D). Reads the Sim; draws in the 1080x1920 design space.
   Pure view: no game rules here. Particles and float texts are fed from sim events. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var BAL = OE.BAL, U = OE.util, M = OE.Model, Art = OE.Art, WORLDS = OE.WORLDS;
  var W = BAL.W, H = BAL.H, TAU = Math.PI * 2;   // W = world width; the visible width is this.viewW
  function wrap(x, span) { return ((x % span) + span) % span; }
  var OUT = 'rgba(8,26,56,0.85)';
  var FONT = '"Trebuchet MS","Segoe UI",system-ui,sans-serif';

  function Render(canvas, game) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.game = game;
    this.k = 1; this.t = 0; this.parts = []; this.texts = []; this.shake = 0; this.shakeT = 0; this.flash = 0;
    this.viewW = BAL.DESIGN_W / BAL.ZOOM; this.cam = 0; this.camY = 0;
    this.clouds = []; for (var i = 0; i < 9; i++) this.clouds.push({ x: Math.random() * 4000, y: 40 + Math.random() * 190, s: 0.45 + Math.random() * 0.5, v: 8 + Math.random() * 14 });
    this.motes = []; for (i = 0; i < 28; i++) this.motes.push({ x: Math.random() * 2520, y: Math.random() * H, r: 1.5 + Math.random() * 3, v: 6 + Math.random() * 14, p: Math.random() * 6 });
    this.bubT = 0;
    var self = this;
    game.on('simEvent', function (e) { self.onEvent(e); });
  }
  OE.Render = Render;
  var P = Render.prototype;

  P.resize = function (cssW, dpr, viewW) {
    // CR-4 (R-OE-49): viewW = the logical width of the stage; the arena shows viewW / ZOOM world units (k = canvas px per world unit already contains the zoom)
    var logicW = viewW || BAL.DESIGN_W;
    this.viewW = logicW / BAL.ZOOM;
    var pw = Math.round(cssW * dpr); if ((OE.Browser && OE.Browser.tier) !== 'desktop') pw = Math.min(pw, OE.Browser.ios ? 1170 : 1152);          // BUG-U6: iOS draws at dpr 1, at most 1170 px wide (iPhone 844 x 390: 844 x 475)
             // mobile tier: the arena canvas never exceeds 1152 px wide (2.9 MB at 16:9; QA round 12); CSS scales it to the screen (memory budget)
    this.cv.width = pw; this.cv.height = Math.round(pw * BAL.VIEW_H / logicW); this.k = this.cv.width / this.viewW;
  };
  P.addPart = function (o) { this.parts.push(o); if (this.parts.length > 500) this.parts.shift(); };
  P.burst = function (x, y, n, color, speed, life, r) {
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8); this.addPart({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, r: r * (0.6 + Math.random() * 0.8), c: color, g: 0 }); }
  };
  P.splash = function (x, y, size) {
    var n = 8 + Math.round(size / 18);
    for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5, s = 140 + Math.random() * 260 + size; this.addPart({ x: x + (Math.random() - 0.5) * size, y: y, vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s, life: 0.8, max: 0.8, r: 4 + Math.random() * (size / 14 + 4), c: 'rgba(235,250,255,0.9)', g: 700 }); }
  };
  P.text = function () { /* float texts are DOM elements (ui.js) so QA can read them */ };
  P.onEvent = function (e) {
    var sim = this.game.sim;
    switch (e.type) {
      case 'eat': this.burst(e.x, e.y, 10, 'rgba(255,255,255,0.9)', 220, 0.45, 5); this.text(e.x, e.y - 30, '+' + Math.max(1, Math.round(e.gp)), '#fff'); break;
      case 'coin': this.burst(e.x, e.y, 6, '#ffd23f', 160, 0.5, 5); if (e.src !== 'pickup') this.text(e.x, e.y - 60, '+' + e.n, '#ffd23f'); else this.text(e.x, e.y - 30, '+' + e.n, '#ffd23f'); break;
      case 'damage': this.shake = 10; this.shakeT = 0.25; this.burst(e.x, e.y, 14, 'rgba(255,70,70,0.9)', 260, 0.5, 6); break;
      case 'bump': this.burst(e.x, e.y, 6, 'rgba(255,255,255,0.8)', 140, 0.3, 4); break;
      case 'jump': this.splash(e.x, e.y, 30 + e.form * 14); break;
      case 'land': this.splash(e.x, e.y, 30 + e.form * 16); this.shake = 2 + e.form * 1.4; this.shakeT = 0.25; break;
      case 'evolve': this.evoBurst(e); break;                                              // PT2-4
      case 'tooBig': this.burst(e.x, e.y, 6, 'rgba(255,120,120,0.9)', 160, 0.4, 4); break;
      case 'surfaceEat':
        this.debris(e); this.text(e.x, e.y - 20, '+' + Math.max(1, Math.round(e.gp)) + ' GP', '#fff', true);
        if (e.coins) this.text(e.x, e.y + 30, '+' + e.coins, '#ffd23f', true);
        break;
      case 'surfaceBite': this.debris(e); this.text(e.x, e.y - 20, '+' + Math.max(1, Math.round(e.gp)) + ' GP', '#fff', true); break;
      case 'break': this.burst(e.x, e.y, 14, '#a99', 220, 0.6, 7); break;
      case 'eject': this.burst(e.x, e.y, 14, 'rgba(255,255,255,0.8)', 260, 0.6, 6); break;
      case 'eventStart': break;
      default: break;
    }
  };
  /* ---- PT2-4: evolution "wow" (BAL.EVO_FX; the clock is game.evoFx: t (real s), dur, to, k) ---- */
  function smooth(u) { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); }
  function easeOut(u) { u = Math.min(1, Math.max(0, u)); return 1 - (1 - u) * (1 - u); }
  P.fxTier = function () { var B = OE.Browser || {}; return B.lite ? 'lite' : (B.ios ? 'ios' : (B.tier && B.tier !== 'desktop' ? 'mobile' : 'desktop')); };
  P.evoBurst = function (e) { /* the burst and the shake start at EVO_FX.particles.startS / shake.startS (evoTick) */ };
  // one-shot parts of the FX at their start time (particles, shake)
  P.evoTick = function () {
    var f = this.game.evoFx, FX = BAL.EVO_FX, sim = this.game.sim, p = sim && sim.player, n, i, a, sp, cols = ['#ffffff', '#ffe36b', '#8ff4ff', '#ffd23f'], km;
    if (!f || !p) return;
    if (!f.shook && f.t >= FX.shake.startS && OE.Browser && OE.Browser.reducedMotion()) f.shook = true;          // R-OE-59: reduced motion = no shake
    if (!f.shook && f.t >= FX.shake.startS) { f.shook = true; this.shake = (f.to >= 8 ? FX.shake.krakenAmp : FX.shake.ampK * f.k) / BAL.ZOOM; this.shakeT = FX.shake.endS - FX.shake.startS; }
    if (!f.burst && f.t >= FX.particles.startS) {
      f.burst = true; km = f.to >= 8 ? FX.krakenMul : 1;
      n = Math.round(FX.particles.base * f.k * (FX.particles.tier[this.fxTier()] || 0));
      for (i = 0; i < n; i++) { a = Math.random() * TAU; sp = (260 + Math.random() * 420) * (0.7 + 0.5 * f.k); this.addPart({ x: p.x + Math.cos(a) * p.len * 0.2, y: p.y + Math.sin(a) * p.len * 0.12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: FX.particles.lifeS * km * (0.7 + Math.random() * 0.3), max: FX.particles.lifeS * km, r: 4 + Math.random() * 7 * f.k, c: cols[i % cols.length], g: -20 }); }
      this.evoParts = n; f.parts = n;
    }
  };
  P.evoZoom = function () {
    var f = this.game.evoFx, Z = BAL.EVO_FX.zoom, z;
    if (!f || f.t >= Z.backAtS) return 1;
    if (OE.Browser && OE.Browser.reducedMotion()) return 1;                                     // R-OE-59: reduced motion = no zoom punch
    z = f.t < Z.peakAtS ? easeOut(f.t / Z.peakAtS) : 1 - smooth((f.t - Z.peakAtS) / (Z.backAtS - Z.peakAtS));
    return 1 + Z.amp * f.k * z;
  };
  // player scale pop: up to the peak, then back with a small undershoot (visual only, the collider keeps its size)
  P.evoPop = function () {
    var f = this.game.evoFx, Q = BAL.EVO_FX.pop, A, w;
    if (!f || f.t < Q.startS || f.t >= Q.endS) return 1;
    A = Q.peakK * f.k;
    if (f.t < Q.peakAtS) return 1 + A * smooth((f.t - Q.startS) / (Q.peakAtS - Q.startS));
    w = (f.t - Q.peakAtS) / (Q.endS - Q.peakAtS);
    return 1 + A * Math.cos(Math.PI * w * 1.25) * (1 - w);
  };
  // behind the player: rotating light rays (additive), count per tier
  P.drawEvoBack = function (ctx, sim) {
    var f = this.game.evoFx, RY = BAL.EVO_FX.rays, p = sim.player, km = f && f.to >= 8 ? BAL.EVO_FX.krakenMul : 1, cnt, end, al, R, i, a, g2;
    if (!f) return;
    cnt = RY.count[this.fxTier()] || 0; end = RY.endS * km;
    if (!cnt || f.t < RY.startS || f.t >= end) return;
    al = f.t < RY.fullAtS ? smooth((f.t - RY.startS) / (RY.fullAtS - RY.startS)) : 1 - smooth((f.t - RY.fullAtS) / (end - RY.fullAtS));
    R = RY.lenK * p.len * f.k;
    ctx.save(); ctx.translate(p.x, p.y); ctx.globalCompositeOperation = 'lighter';
    g2 = ctx.createRadialGradient(0, 0, p.len * 0.1, 0, 0, R);
    g2.addColorStop(0, 'rgba(255,250,210,' + (0.8 * al).toFixed(3) + ')'); g2.addColorStop(0.4, 'rgba(255,230,120,' + (0.35 * al).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.rotate(this.t * 0.9); ctx.fillStyle = g2;
    for (i = 0; i < cnt; i++) { a = i / cnt * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a - 0.1, a + 0.1); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(0, 0, R * 0.4, 0, TAU); ctx.fill();
    ctx.restore();
  };
  // in front: the shockwave ring
  P.drawEvoFront = function (ctx, sim) {
    var f = this.game.evoFx, RG = BAL.EVO_FX.ring, p = sim.player, u, r, al;
    if (!f || f.t < RG.startS || f.t >= RG.endS) return;
    u = Math.min(1, (f.t - RG.startS) / (RG.maxAtS - RG.startS)); r = p.len * 0.3 + (RG.maxRLen * p.len - p.len * 0.3) * easeOut(u);
    al = f.t < RG.maxAtS ? 0.95 : 0.95 * (1 - (f.t - RG.maxAtS) / (RG.endS - RG.maxAtS));
    ctx.save(); ctx.globalAlpha = Math.max(0, al); ctx.lineWidth = RG.widthK * f.k; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = Math.max(0, al) * 0.5; ctx.lineWidth = RG.widthK * f.k * 0.5; ctx.strokeStyle = '#8ff4ff'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.9, 0, TAU); ctx.stroke();
    ctx.restore();
  };
  // flash alpha now: min(max, alphaK x k) fading out (quadratic) to endS; x 0.5 with reduced motion (R-OE-59)
  P.evoFlashAlpha = function () {
    var f = this.game.evoFx, FL = BAL.EVO_FX.flash, u;
    if (!f || f.t >= FL.endS) return 0;
    u = 1 - f.t / FL.endS;
    return Math.min(FL.max, FL.alphaK * f.k) * u * u * (OE.Browser && OE.Browser.reducedMotion() ? 0.5 : 1);
  };
  // screen-shake amplitude now (screen px; 0 with reduced motion)
  P.evoShakePx = function () { return this.shakeT > 0 && this.game.evoFx ? Math.round(this.shake * BAL.ZOOM * (this.shakeT / 0.3) * 10) / 10 : 0; };
  // screen space: the white flash
  P.drawEvoFlash = function (ctx) {
    var f = this.game.evoFx, FL = BAL.EVO_FX.flash, u;
    if (!f || f.t >= FL.endS) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = this.evoFlashAlpha(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, this.cv.width, this.cv.height); ctx.restore();
  };
  P.debris = function (e) {
    var cols = { boats: ['#c68a4a', '#fff', '#2f7ed8'], ships: ['#7a4a22', '#f5ecd0', '#c2873a'], aircraft: ['#e8553a', '#dde3ee', '#7a8aa0'], birds: ['#fff', '#d8dee8'], island: ['#e8cf93', '#5fae4a', '#6a4a22'] }[e.debris] || ['#fff'];
    var n = 12 + Math.round((e.w || 100) / 20), i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = 120 + Math.random() * 320;
      this.addPart({ x: e.x + (Math.random() - 0.5) * (e.w || 60), y: e.y + (Math.random() - 0.5) * (e.h || 40), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 160, life: 1.3, max: 1.3, r: 5 + Math.random() * 9, c: cols[i % cols.length], g: 900, sq: true, rot: Math.random() * 6 });
    }
    this.burst(e.x, e.y, 8, '#ffd23f', 240, 0.7, 6);
  };

  /* ---------------------------------------------------------------- background */
  var SKY_FX = {};
  P.drawSky = function (ctx, wd, sim) {
    var VW = this.viewW, cam = this.cam, wy = BAL.waterY, n = wd.n, t = this.t, i;
    var gr = ctx.createLinearGradient(0, 0, 0, wy);
    gr.addColorStop(0, wd.sky[0]); gr.addColorStop(1, wd.sky[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, wy + 30);
    var sx = VW * 0.8 - cam * 0.05;
    if (n === 1) { ctx.beginPath(); ctx.arc(sx, 105, 52, 0, TAU); ctx.fillStyle = 'rgba(255,240,160,0.95)'; ctx.fill(); ctx.beginPath(); ctx.arc(sx, 105, 82, 0, TAU); ctx.fillStyle = 'rgba(255,240,160,0.25)'; ctx.fill(); }
    if (n === 3) { var mx = VW * 0.12 - cam * 0.05; ctx.beginPath(); ctx.arc(mx, 120, 42, 0, TAU); ctx.fillStyle = '#f2f0d8'; ctx.fill(); ctx.beginPath(); ctx.arc(mx + 14, 112, 37, 0, TAU); ctx.fillStyle = wd.sky[0]; ctx.fill(); }
    if (n === 7) { for (i = 0; i < 4; i++) { var ax = i * (VW / 3) - 150 - cam * 0.1, gg = ctx.createLinearGradient(0, 30, 0, wy); gg.addColorStop(0, 'rgba(120,255,200,0)'); gg.addColorStop(0.5, 'rgba(160,120,255,' + (0.25 + 0.1 * Math.sin(t + i)) + ')'); gg.addColorStop(1, 'rgba(255,120,220,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(ax, 30); ctx.bezierCurveTo(ax + 100, 120 + Math.sin(t * 0.5 + i) * 30, ax + 300, 80, ax + 480, wy); ctx.lineTo(ax + 700, wy); ctx.lineTo(ax + 420, 30); ctx.closePath(); ctx.fill(); } }
    if (n === 6) { var vx = VW * 0.72 - cam * 0.2; ctx.fillStyle = 'rgba(70,40,40,0.9)'; ctx.beginPath(); ctx.moveTo(vx - 190, wy); ctx.lineTo(vx - 50, 130); ctx.lineTo(vx + 10, 120); ctx.lineTo(vx + 190, wy); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(90,60,60,0.7)'; for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(vx - 20 + Math.sin(t * 0.3 + i) * 20 + i * 14, 110 - i * 28, 26 + i * 9, 0, TAU); ctx.fill(); } }
    if (n === 5) { var fl = this.flash > 0 ? this.flash : 0; if (fl > 0) { ctx.fillStyle = 'rgba(220,240,255,' + fl * 0.6 + ')'; ctx.fillRect(0, 0, VW, wy); } }
    var cc = n === 3 || n === 5 || n === 7 ? 'rgba(90,100,150,0.55)' : (n === 6 ? 'rgba(120,70,60,0.6)' : 'rgba(255,255,255,0.85)');
    for (i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i]; c.x += c.v * 0.016;
      var cx = wrap(c.x - cam * 0.33, VW + 400) - 200;
      ctx.fillStyle = cc;
      for (var j = 0; j < 4; j++) { ctx.beginPath(); ctx.ellipse(cx + (j - 1.5) * 34 * c.s * 1.6, c.y + (j % 2) * -9, 44 * c.s * 1.5, 26 * c.s * 1.5, 0, 0, TAU); ctx.fill(); }
    }
    if (n === 6) { ctx.fillStyle = 'rgba(40,25,20,0.75)'; for (i = 0; i < 3; i++) { var px = wrap(t * 60 + i * 380 - cam * 0.5, VW + 200) - 100; ctx.beginPath(); ctx.moveTo(px, 150 + i * 30); ctx.lineTo(px + 50, 143 + i * 30); ctx.lineTo(px + 100, 157 + i * 30); ctx.lineTo(px + 50, 163 + i * 30); ctx.closePath(); ctx.fill(); } }
  };
  P.waveY = function (x, sim) { return sim.waterY + Math.sin(x * 0.02 + this.t * 2) * 3 + (sim.wdef.waves ? Math.sin(x * 0.006 + this.t * 1.5) * 5 : 0); };
  P.drawWater = function (ctx, wd, sim) {
    var wy = sim.waterY, i, VW = this.viewW, cam = this.cam, H0 = BAL.VIEW_H;
    var gr = ctx.createLinearGradient(0, wy, 0, H0);
    gr.addColorStop(0, wd.water[0]); gr.addColorStop(1, wd.water[1]);
    if (sim.deep) { ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, H0); }                  // CR-4: no sky, no waterline: water to the top edge
    else {
    ctx.beginPath(); ctx.moveTo(0, H0); ctx.lineTo(0, this.waveY(cam, sim));
    for (i = 0; i <= VW; i += 24) ctx.lineTo(i, this.waveY(i + cam, sim));
    ctx.lineTo(VW, H0); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
    }
    // light shafts (parallax 0.5)
    ctx.save(); ctx.globalAlpha = sim.deep ? 0 : (wd.n === 3 || wd.n === 5 || wd.n === 7 ? 0.08 : 0.16);
    for (i = -1; i < VW / 260 + 2; i++) {
      var x = wrap(i * 260 - cam * 0.5, VW + 520) - 260 + Math.sin(this.t * 0.3 + i) * 30, lg = ctx.createLinearGradient(0, wy, 0, wy + 650);
      lg.addColorStop(0, '#fff'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x - 24, wy); ctx.lineTo(x + 24, wy); ctx.lineTo(x + 110, wy + 650); ctx.lineTo(x - 70, wy + 650); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // seabed: floor band 990-1080 (world x, parallax 1.0)
    var fy = BAL.seabedY - 6;
    if (this.drawSeabedArt(ctx, wd)) { if (!sim.deep) this.drawWaterLine(ctx, sim); return; }      // CR-4: midground + seabed strips (the procedural band below is the fallback)
    ctx.beginPath(); ctx.moveTo(0, H0); ctx.lineTo(0, fy + 6);
    for (i = 0; i <= VW; i += 32) ctx.lineTo(i, fy + Math.sin((i + cam) * 0.011 + wd.n) * 9);
    ctx.lineTo(VW, H0); ctx.closePath(); ctx.fillStyle = wd.floor; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, fy + 40, VW, H0);
    this.drawDecor(ctx, wd, fy);
    if (!sim.deep) this.drawWaterLine(ctx, sim);
  };
  // foam line on the (waving) waterline, plus the Jump Ready glow (procedural FX: waterline glow)
  P.drawWaterLine = function (ctx, sim) {
    var i, VW = this.viewW, cam = this.cam;
    ctx.beginPath(); for (i = 0; i <= VW; i += 24) { var yy = this.waveY(i + cam, sim); if (i === 0) ctx.moveTo(i, yy); else ctx.lineTo(i, yy); }
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    if (this.glowLine > 0) { ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,255,140,' + (0.35 + 0.25 * Math.sin(this.t * 8)) + ')'; ctx.stroke(); }
  };
  // far background layer (BG_Wn_Back, 2560x1080): scaled to the view height, tiled horizontally (never stretched), parallax 0.33
  // deep = The Abyss (CR-4): the art has a night sky and the waterline in its upper third; only the underwater part is drawn (cropped, not stretched), so the water fills the whole view
  P.drawFarBg = function (ctx, img, camX, deep) {
    var cs = deep ? Math.round(img.height * 0.33) : 0, sh = img.height - cs, tiles = OE.util.farTiles(camX, img.width, sh, this.viewW, BAL.VIEW_H, 0.33), i;
    for (i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (!t.flip) { ctx.drawImage(img, 0, cs, img.width, sh, t.x, 0, t.w, BAL.VIEW_H); continue; }
      ctx.save(); ctx.translate(t.x + t.w, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, cs, img.width, sh, 0, 0, t.w, BAL.VIEW_H); ctx.restore();
    }
  };
  P.drawDecor = function (ctx, wd, fy) {
    if (this.sp('MID_W' + wd.n)) return;                                                // CR-4: the midground strip replaces the procedural silhouettes (drawSeabedArt)
    var n = wd.n, t = this.t, VW = this.viewW, off = this.cam * 0.66, k, x, step;
    function range(st) { return [Math.floor(off / st) - 1, Math.ceil((off + VW) / st) + 1]; }
    var r;
    if (n === 2 || n === 1) {
      step = 120; r = range(step);
      for (k = r[0]; k < r[1]; k++) { x = k * step - off; var kh = 110 + (Math.abs(k) * 53) % 90; ctx.strokeStyle = n === 2 ? 'rgba(40,100,70,0.45)' : 'rgba(120,110,130,0.3)'; ctx.lineWidth = n === 2 ? 11 : 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, fy + 8); ctx.bezierCurveTo(x + Math.sin(t + k) * 22, fy - kh * 0.4, x - Math.sin(t + k) * 22, fy - kh * 0.7, x + Math.sin(t * 1.2 + k) * 15, fy - kh); ctx.stroke(); }
    } else if (n === 5) {
      step = 900; r = range(step);
      for (k = r[0]; k < r[1]; k++) { x = k * step - off; ctx.fillStyle = 'rgba(20,12,40,0.7)'; ctx.beginPath(); ctx.moveTo(x, 330); ctx.lineTo(x + 70, 520); ctx.lineTo(x + 20, 700); ctx.lineTo(x + 80, 880); ctx.lineTo(x, 1080); ctx.closePath(); ctx.fill(); }
    } else if (n === 6) {
      step = 520; r = range(step);
      for (k = r[0]; k < r[1]; k++) { x = k * step - off; ctx.fillStyle = 'rgba(60,30,20,0.55)'; ctx.fillRect(x, fy - 190, 44, 190); ctx.beginPath(); ctx.arc(x + 22, fy - 190, 44, Math.PI, 0); ctx.fill(); }
      var lg = ctx.createLinearGradient(0, 1080, 0, 780); lg.addColorStop(0, 'rgba(255,120,40,0.35)'); lg.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = lg; ctx.fillRect(0, 780, VW, 300);
    } else if (n === 7) {
      step = 360; r = range(step);
      for (k = r[0]; k < r[1]; k++) { x = k * step - off; var yy = 620 + Math.sin(t * 0.3 + k) * 20 - (Math.abs(k) % 3) * 40; ctx.fillStyle = 'rgba(120,60,180,0.25)'; ctx.fillRect(x, yy, 38, 220); ctx.beginPath(); ctx.arc(x + 19, yy, 38, Math.PI, 0); ctx.fill(); }
    } else if (n === 3) {
      step = 230; r = range(step);
      for (k = r[0]; k < r[1]; k++) { x = k * step - off; ctx.fillStyle = 'rgba(10,20,40,0.5)'; ctx.beginPath(); ctx.moveTo(x - 50, 1080); ctx.lineTo(x + 20, fy - 90 - (Math.abs(k) % 3) * 40); ctx.lineTo(x + 100, 1080); ctx.fill(); }
    } else if (n === 4) {
      step = 170; r = range(step); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 5;
      for (k = r[0]; k < r[1]; k++) { x = k * step - off; ctx.beginPath(); ctx.moveTo(x, fy + 30); ctx.quadraticCurveTo(x + 50, fy + 15, x + 110, fy + 30); ctx.stroke(); }
    }
  };
  P.drawZonesBack = function (ctx, sim) {
    var i, z, t = this.t; this.wdn = sim.wdef.n;
    for (i = 0; i < sim.zones.length; i++) {
      z = sim.zones[i];
      if (z.kind === 'current') {
        ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (var k = 0; k < 7; k++) { var yy = z.y - z.h / 2 + 20 + k * (z.h - 40) / 6, off = ((t * 140 * Math.sign(z.vx) + k * 70) % (z.w)); var x0 = z.x - z.w / 2 + (off + z.w) % z.w; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(Math.min(z.x + z.w / 2, x0 + 80), yy); ctx.stroke(); }
        ctx.restore();
      } else if (z.kind === 'thermal') {
        ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#ffb070'; ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h); ctx.globalAlpha = 0.4; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        for (k = 0; k < 6; k++) { var xx = z.x - z.w / 2 + 30 + k * (z.w - 60) / 5, off2 = (t * 120 + k * 90) % z.h; ctx.beginPath(); ctx.moveTo(xx, z.y + z.h / 2 - off2); ctx.lineTo(xx, z.y + z.h / 2 - off2 - 40); ctx.stroke(); }
        ctx.restore();
      } else if (z.kind === 'vent') {
        var vimg = this.sp('OBS_Vent');
        if (vimg) { this.mound(ctx, z.x, 150, this.wdn); this.spr(ctx, vimg, z.x, BAL.FLOOR_OBSTACLES.bottomY, 150, 'b'); }
        else { ctx.fillStyle = '#3a2a22'; ctx.beginPath(); ctx.moveTo(z.x - 60, BAL.seabedY); ctx.lineTo(z.x - 25, BAL.seabedY - 50); ctx.lineTo(z.x + 25, BAL.seabedY - 50); ctx.lineTo(z.x + 60, BAL.seabedY); ctx.fill(); }
        if (sim.ventActive(z)) { var gp = ctx.createLinearGradient(0, BAL.seabedY - 50, 0, BAL.seabedY - 650); gp.addColorStop(0, 'rgba(255,170,80,0.7)'); gp.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = gp; ctx.fillRect(z.x - 55, BAL.seabedY - 650, 110, 600); }
        else if (sim.ventWarn(z)) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(z.x + Math.sin(t * 6 + k) * 14, BAL.seabedY - 80 - ((t * 140 + k * 40) % 200), 7, 0, TAU); ctx.fill(); } }
      } else if (z.kind === 'lava' && this.sp('OBS_Lava')) {
        this.dangerObstacle(ctx, sim, z);
        this.spr(ctx, this.sp('OBS_Lava'), z.x, BAL.FLOOR_OBSTACLES.bottomY, z.w * 1.08, 'b');
      } else if (z.kind === 'lava') {
        var lg = ctx.createLinearGradient(0, z.y - z.h / 2, 0, z.y + z.h / 2); lg.addColorStop(0, '#ffb43a'); lg.addColorStop(1, '#e8401a');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(z.x - z.w / 2, z.y + z.h / 2); for (var xk = 0; xk <= z.w; xk += 30) ctx.lineTo(z.x - z.w / 2 + xk, z.y - z.h / 2 + Math.sin(t * 2 + xk * 0.05) * 6); ctx.lineTo(z.x + z.w / 2, z.y + z.h / 2); ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,230,120,0.9)'; ctx.stroke();
      } else if (z.kind === 'elec') {
        var ph = sim.elecPhase(z);
        if (ph === 'active') this.dangerRect(ctx, z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, z.id);
        ctx.save(); ctx.globalAlpha = ph === 'active' ? 0.95 : (ph === 'warn' ? 0.45 + 0.3 * Math.sin(t * 14) : 0.12);
        ctx.strokeStyle = ph === 'active' ? '#fff36b' : '#7fe8ff'; ctx.lineWidth = ph === 'active' ? 6 : 3;
        ctx.strokeRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
        if (ph !== 'off') for (k = 0; k < 4; k++) { ctx.beginPath(); var sx = z.x - z.w / 2; ctx.moveTo(sx, z.y - z.h / 2 + k * 60); for (var q = 1; q <= 8; q++) ctx.lineTo(sx + q * z.w / 8, z.y - z.h / 2 + k * 60 + (q % 2 ? -22 : 22)); ctx.stroke(); }
        ctx.restore();
      } else if (z.kind === 'whirl' && this.sp('OBS_Whirlpool')) {
        ctx.save(); ctx.globalAlpha = 0.85; ctx.translate(z.x, z.y); ctx.rotate(t * 2 * (z.sgn || 1)); var wimg = this.sp('OBS_Whirlpool'), wd2 = (z.r || 220) * 2; ctx.drawImage(wimg, -wd2 / 2, -wd2 / 2 * wimg.height / wimg.width, wd2, wd2 * wimg.height / wimg.width); ctx.restore();
      } else if (z.kind === 'whirl') {
        ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(t * 2);
        for (k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(0, 0, 40 + k * 44, k, k + 3.6); ctx.strokeStyle = 'rgba(255,170,255,' + (0.55 - k * 0.08) + ')'; ctx.lineWidth = 12 - k; ctx.stroke(); }
        ctx.restore();
      }
    }
  };
  /* ---- CR-4 decor art (assets/decor, ids OBS_* / SEA_* / MID_*): drawn when the sprite is loaded, the procedural drawing is the fallback ---- */
  var ROCK_TINT = { 1: '#e6dccd', 2: '#a8a88c', 3: '#6c7ea0', 4: '#8aa0b8', 5: '#6a5a98', 6: '#b08470', 7: '#7a68a8' };
  var WALL_TINT = { 1: '#cfe0ee', 2: '#b0c8a8', 3: '#90a8d0', 4: '#a0c4dc', 5: '#8878b8', 6: '#c89a80', 7: '#a088d0' };
  P.sp = function (id, color) { var A = OE.Assets; return A ? (color ? A.tint(id, color) : A.get(id)) : null; };
  // sprite with its aspect kept: centre x, `y` = bottom ('b') or centre ('c'), width w; sway = rotation (rad) around the anchor
  P.spr = function (ctx, img, x, y, w, anchor, sway) {
    var iw = img.width, ih = img.height, h = w * ih / iw;
    if (sway) { ctx.save(); ctx.translate(x, y); ctx.rotate(sway); ctx.drawImage(img, -w / 2, anchor === 'b' ? -h : -h / 2, w, h); ctx.restore(); return; }
    ctx.drawImage(img, x - w / 2, anchor === 'b' ? y - h : y - h / 2, w, h);
  };
  // vertical 9-slice (cap / stretched shaft / cap); the source rows come from OE.decorMeta (px of the full-size art, scaled for the mobile variant)
  P.slice9v = function (ctx, id, x, y, w, h, color) {
    var img = this.sp(id, color), meta = (OE.decorMeta || {})[id]; if (!img || !meta || !meta.T) return false;
    var sc = img.width / meta.w, T = meta.T * sc, B = meta.B * sc, s = w / img.width, capT = T * s, capB = B * s, left = x - w / 2, top = y - h / 2, f = 1, mid;
    if (capT + capB > h) f = h / (capT + capB);
    capT *= f; capB *= f; mid = Math.max(0, h - capT - capB);
    ctx.drawImage(img, 0, 0, img.width, T, left, top, w, capT);
    if (mid > 0) ctx.drawImage(img, 0, T, img.width, img.height - T - B, left, top + capT, w, mid);
    ctx.drawImage(img, 0, img.height - B, img.width, B, left, top + h - capB, w, capB);
    return true;
  };
  // one obstacle as a sprite; false = not loaded (procedural drawing)
  P.drawObsArt = function (ctx, ob, wd) {
    var img, r = ob.r, t = this.t, n = wd.n;
    switch (ob.kind) {
      case 'rock': case 'brock':
        img = this.sp(ob.kind === 'brock' ? 'OBS_Rock_Cracked' : (ob.id % 2 ? 'OBS_Rock_v1' : 'OBS_Rock_v2'), ROCK_TINT[n] || '#c8c8d0'); if (!img) return false;
        if (ob.kind === 'rock') { var rh = r * 2.3 * img.height / img.width; this.spr(ctx, img, ob.x, BAL.FLOOR_OBSTACLES.bottomY + BAL.DECOR_ROCKS.sink * rh, r * 2.3, 'b'); return true; }          // decor: 25 % sunk into the seabed, no mound
        this.spr(ctx, img, ob.x, ob.y + r * 0.9, r * 2.3, 'b'); return true;
      case 'coral': img = this.sp(ob.id % 2 ? 'OBS_Coral_v1' : 'OBS_Coral_v2'); if (!img) return false; this.mound(ctx, ob.x, r * 2.4, wd); this.spr(ctx, img, ob.x, BAL.FLOOR_OBSTACLES.bottomY, r * 2.4, 'b'); return true;
      case 'anemone': img = this.sp('OBS_Anemone'); if (!img) return false; this.mound(ctx, ob.x, 120, wd); this.spr(ctx, img, ob.x, BAL.FLOOR_OBSTACLES.bottomY, 120, 'b', Math.sin(t * 2 + ob.id) * 0.07); return true;
      case 'crevice': img = this.sp('OBS_Crevice', ROCK_TINT[n] || '#c8c8d0'); if (!img) return false; this.spr(ctx, img, ob.x, ob.y, 150, 'c'); return true;
      case 'ruin': this.mound(ctx, ob.x, ob.w * 1.4, wd); return this.slice9v(ctx, 'OBS_Ruin_Column', ob.x, BAL.FLOOR_OBSTACLES.bottomY - ob.h / 2, ob.w, ob.h);
      case 'struct': return this.slice9v(ctx, 'OBS_Struct', ob.x, ob.y, ob.w, ob.h, '#c9a8ff');
      default: return false;
    }
  };
  // Side-scroller wall: the wall tile (tintable) repeated outward from the gap edges, clipped to the wall rectangles
  P.drawWallArt = function (ctx, o, wy0, H0) {
    var img = this.sp('OBS_Wall', WALL_TINT[this.wn] || '#a8b8d0'); if (!img) return false;
    var gt = o.gapY - o.gapH / 2, gb = o.gapY + o.gapH / 2, w = o.w, th = img.height * w / img.width, x = o.x - w / 2, y;
    ctx.save(); ctx.beginPath(); ctx.rect(x, wy0, w, gt - wy0); ctx.rect(x, gb, w, H0 - gb); ctx.clip();
    for (y = gt - th; y > wy0 - th; y -= th) ctx.drawImage(img, x, y, w, th);
    for (y = gb; y < H0; y += th) ctx.drawImage(img, x, y, w, th);
    ctx.restore(); return true;
  };
  // seabed strip (SEA_Wn_Floor, tiles along x at parallax 1.0, 150 world units high, top contour at y = 980) and midground strip (MID_Wn, parallax 0.66, bottom at 1080)
  // PT2-2: the midground strip baked once into a darker, desaturated copy (BAL.SCENERY; getImageData once, no per-frame filter). Falls back to the original
  // when the pixels cannot be read (file://); OE.sceneryInfo reports it for state().decor
  P.sceneryMid = function (n) {
    var img = this.sp('MID_W' + n), SC = BAL.SCENERY, c, x, d, i, l, k, b;
    if (!img) return null;
    if (this.sceneryBake && this.sceneryBake.src === img) return this.sceneryBake.out;
    try {
      c = document.createElement('canvas'); c.width = img.width; c.height = img.height; x = c.getContext('2d'); x.drawImage(img, 0, 0);
      d = x.getImageData(0, 0, c.width, c.height); k = SC.saturation; b = SC.brightness;
      for (i = 0; i < d.data.length; i += 4) { l = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]; d.data[i] = (l + (d.data[i] - l) * k) * b; d.data[i + 1] = (l + (d.data[i + 1] - l) * k) * b; d.data[i + 2] = (l + (d.data[i + 2] - l) * k) * b; }
      x.putImageData(d, 0, 0);
      this.sceneryBake = { src: img, out: c, baked: true };
    } catch (e) { this.sceneryBake = { src: img, out: img, baked: false }; }
    OE.sceneryInfo = [{ layer: 'scenery', id: 'MID_W' + n, brightness: this.sceneryBake.baked ? SC.brightness : 1, saturation: this.sceneryBake.baked ? SC.saturation : 1, baked: this.sceneryBake.baked, parallax: 0.66 }];
    return this.sceneryBake.out;
  };
  P.drawSeabedArt = function (ctx, wd, mode) {
    var n = wd.n, VW = this.viewW, cam = this.cam, mid = this.sceneryMid(n), fl = mode === 'mid' ? null : this.sp('SEA_W' + n + '_Floor'), mh = { 1: 260, 2: 330, 3: 300, 5: 560, 6: 300, 7: 360 }[n] || 300, any = false, x, w, h, off;
    if (mid) {
      h = mh; w = mid.width * h / mid.height; off = wrap(cam * 0.66, w); ctx.save(); ctx.globalAlpha = BAL.DECOR_BG.midAlpha;
      for (x = -off; x < VW; x += w) ctx.drawImage(mid, x, 1080 - h, w, h);
      ctx.restore(); any = true;
    }
    if (fl) {
      h = 150; w = fl.width * h / fl.height; off = wrap(cam, w);
      for (x = -off; x < VW; x += w) ctx.drawImage(fl, x, 968, w, h);                // 12 units above the nominal strip top: the bumpy surface then lies close to the line y = 990 the obstacles stand on
      any = true;
    }
    return any;
  };
  // a soft sand mound under an obstacle that stands on the seabed: it hides the gap between the line y = 990 and the bumpy floor art
  P.mound = function (ctx, x, w, wd) {
    var col = (wd && wd.floor) || (this.wdn && OE.WORLDS[this.wdn - 1].floor) || '#8a7a5a', y = BAL.FLOOR_OBSTACLES.bottomY;
    ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.ellipse(x, y + 4, w * 0.5, 15, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y + 8, w * 0.46, 9, 0, 0, TAU); ctx.fill(); ctx.restore();
  };
  P.drawDecorRocks = function (ctx, sim) {
    var i, ob, cam = this.cam, VW = this.viewW, wd = sim.wdef;
    for (i = 0; i < sim.obs.length; i++) { ob = sim.obs[i]; if (ob.kind !== 'rock' || ob.x + ob.r * 1.5 < cam || ob.x - ob.r * 1.5 > cam + VW) continue; this.drawRock(ctx, ob, wd); }
  };
  // the floor strip in world coordinates (tile origin x = 0), drawn after the decor rocks
  P.drawFloorWorld = function (ctx, wd, cam) {
    var fl = this.sp('SEA_W' + wd.n + '_Floor'), w, h = 150, x;
    if (!fl) return;
    w = fl.width * h / fl.height;
    for (x = Math.floor(cam / w) * w; x < cam + this.viewW + w; x += w) ctx.drawImage(fl, x, 968, w, h);
  };
  P.drawRock = function (ctx, ob, wd) {
    if (this.drawObsArt(ctx, ob.kind === 'cracked' ? { x: ob.x, y: ob.y, r: ob.r, id: ob.id, kind: 'brock' } : ob, wd)) return;
    var base = wd.n === 1 ? '#8a8f9a' : (wd.n === 2 ? '#6f6a58' : (wd.n === 6 ? '#6a4a3a' : '#475070'));
    ctx.save(); ctx.translate(ob.x, ob.y);
    ctx.beginPath(); for (var i = 0; i < 9; i++) { var a = i / 9 * TAU, r = ob.r * (0.82 + 0.18 * Math.sin(i * 2.3 + ob.id)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85); } ctx.closePath();
    ctx.fillStyle = base; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(-ob.r * 0.25, -ob.r * 0.3, ob.r * 0.35, ob.r * 0.2, -0.4, 0, TAU); ctx.fill();
    if (ob.kind === 'brock') { ctx.strokeStyle = 'rgba(255,230,160,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-ob.r * 0.3, -ob.r * 0.5); ctx.lineTo(0, -ob.r * 0.05); ctx.lineTo(-ob.r * 0.15, ob.r * 0.4); ctx.moveTo(0, -ob.r * 0.05); ctx.lineTo(ob.r * 0.35, ob.r * 0.1); ctx.stroke(); }
    ctx.restore();
  };
  P.drawCoral = function (ctx, ob) {
    var cols = ['#ff6f91', '#ffa33a', '#ff5a5a', '#c15fff'], i;
    ctx.save(); ctx.translate(ob.x, ob.y);
    for (i = 0; i < 6; i++) { var a = -Math.PI * (0.15 + i * 0.14), len = ob.r * (0.9 + 0.35 * Math.sin(i * 1.9)); ctx.strokeStyle = cols[i % 4]; ctx.lineWidth = ob.r * 0.22; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, ob.r * 0.4); ctx.quadraticCurveTo(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5 + 10, Math.cos(a) * len, Math.sin(a) * len); ctx.stroke(); ctx.fillStyle = cols[(i + 1) % 4]; ctx.beginPath(); ctx.arc(Math.cos(a) * len, Math.sin(a) * len, ob.r * 0.18, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, ob.r * 0.45, ob.r * 0.95, ob.r * 0.35, 0, 0, TAU); ctx.fillStyle = '#e07a5a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.restore();
  };
  /* ---- PT2-2: one danger look for everything that hurts on touch (stinging corals / anemones, hazard creatures): a soft red-orange glow (one pre-rendered
     64 px radial sprite, scaled; no canvas or CSS filters, so the iOS tier draws it too) and a rim that pulses between red and orange (BAL.DANGER) ---- */
  P.dangerSprite = function () {
    if (this.dgSpr) return this.dgSpr;
    var c = document.createElement('canvas'), x, gr, D = BAL.DANGER; c.width = c.height = 64; x = c.getContext('2d');
    gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + D.rgbA.join(',') + ',0.9)'); gr.addColorStop(0.55, 'rgba(' + D.rgbB.join(',') + ',0.45)'); gr.addColorStop(1, 'rgba(' + D.rgbB.join(',') + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (this.dgSpr = c);
  };
  P.dangerPulse = function (seed) { return 0.5 + 0.5 * Math.sin(this.t * BAL.DANGER.hz * TAU + (seed || 0) * 1.7); };
  // (x, y) = centre of the ellipse rx x ry; dome = only the upper half (an obstacle standing on the floor: y is its bottom line)
  P.dangerLook = function (ctx, x, y, rx, ry, seed, dome) {
    var D = BAL.DANGER, u = this.dangerPulse(seed), pad = D.glowPad, c = [0, 1, 2].map(function (k) { return Math.round(D.rgbA[k] + (D.rgbB[k] - D.rgbA[k]) * u); });
    ctx.save();
    if (dome) { ctx.beginPath(); ctx.rect(x - rx * pad - 4, y - ry * pad - 4, 2 * rx * pad + 8, ry * pad + 10); ctx.clip(); }
    ctx.globalAlpha = D.glowA[0] + (D.glowA[1] - D.glowA[0]) * u;
    ctx.drawImage(this.dangerSprite(), x - rx * pad, y - ry * pad, 2 * rx * pad, 2 * ry * pad);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, dome ? Math.PI : 0, dome ? TAU : TAU);
    ctx.lineWidth = D.rimW; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(' + c.join(',') + ',' + (D.rimA[0] + (D.rimA[1] - D.rimA[0]) * u).toFixed(3) + ')'; ctx.stroke();
    ctx.restore();
  };
  // a rectangle rim in the danger colours (walls, columns, electric zones)
  P.dangerRect = function (ctx, x, y, w, h, seed) {
    var D = BAL.DANGER, u = this.dangerPulse(seed), c = [0, 1, 2].map(function (k) { return Math.round(D.rgbA[k] + (D.rgbB[k] - D.rgbA[k]) * u); });
    if (w <= 0 || h <= 0) return;
    ctx.save(); ctx.lineWidth = D.rimW; ctx.strokeStyle = 'rgba(' + c.join(',') + ',' + (D.rimA[0] + (D.rimA[1] - D.rimA[0]) * u).toFixed(3) + ')'; ctx.strokeRect(x - D.rimW, y - D.rimW, w + 2 * D.rimW, h + 2 * D.rimW); ctx.restore();
  };
  // a stinging floor obstacle: the dome hugs its drawn box (sim.obstacleBox), bottom on the floor line
  P.dangerObstacle = function (ctx, sim, ob) {
    var bx = sim.obstacleBox ? sim.obstacleBox(ob) : null;
    if (!bx) { this.dangerLook(ctx, ob.x, ob.y, ob.r + 8, ob.r + 8, ob.id); return; }
    this.dangerLook(ctx, bx.x, bx.bottom, bx.w * 0.52 + 6, bx.h * 1.02 + 6, ob.id, true);
  };
  // PT2-2: background scenery (far background + midground: painted reefs and corals) sits behind a dark water-coloured veil, so the play-layer corals read as the only ones that matter
  P.drawBgVeil = function (ctx, wd) {
    var V = BAL.DECOR_BG, col = wd.water[1], r = parseInt(col.slice(1, 3), 16), g2 = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16), gr = ctx.createLinearGradient(0, V.fromY, 0, V.fullY), rgb = r + ',' + g2 + ',' + b;
    gr.addColorStop(0, 'rgba(' + rgb + ',0)'); gr.addColorStop(1, 'rgba(' + rgb + ',' + V.alpha + ')');
    ctx.fillStyle = gr; ctx.fillRect(0, V.fromY, this.viewW, V.fullY - V.fromY);
    ctx.fillStyle = 'rgba(' + rgb + ',' + V.alpha + ')'; ctx.fillRect(0, V.fullY, this.viewW, BAL.VIEW_H - V.fullY + 260);
    this.veilRgb = rgb;
  };
  // a light veil over the seabed strip art (world space, after drawFloorWorld): its painted pebbles and small corals stay ground, the play obstacles in front stay bright
  P.drawFloorVeil = function (ctx) {
    if (!this.veilRgb) return;
    ctx.fillStyle = 'rgba(' + this.veilRgb + ',' + BAL.DECOR_BG.floorAlpha + ')'; ctx.fillRect(this.cam - 20, 968, this.viewW + 40, 400);
  };
  P.drawObstacles = function (ctx, sim, fore) {
    var i, ob, wd = sim.wdef;
    for (i = 0; i < sim.obs.length; i++) {
      ob = sim.obs[i];
      if (!!ob.fore !== fore) continue;
      if (ob.kind === 'rock') continue;                                                          // decor rocks are drawn by drawDecorRocks (before the floor strip)
      if (ob.haz && !ob.dead && ob.x + 200 > this.cam && ob.x - 200 < this.cam + this.viewW) this.dangerObstacle(ctx, sim, ob);      // PT2-2: shared danger look
      if (ob.kind !== 'brock' ? this.drawObsArt(ctx, ob, wd) : false) continue;       // CR-4: sprite art when loaded
      switch (ob.kind) {
        case 'coral': this.drawCoral(ctx, ob); break;
        case 'rock': case 'brock': this.drawRock(ctx, ob, wd); break;
        case 'ruin': ctx.save(); ctx.translate(ob.x, ob.y); ctx.fillStyle = '#8a7a66'; ctx.fillRect(-ob.w / 2, -ob.h / 2, ob.w, ob.h); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.strokeRect(-ob.w / 2, -ob.h / 2, ob.w, ob.h); ctx.fillStyle = '#a99a84'; ctx.fillRect(-ob.w / 2 - 10, -ob.h / 2 - 14, ob.w + 20, 22); ctx.strokeRect(-ob.w / 2 - 10, -ob.h / 2 - 14, ob.w + 20, 22); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; for (var k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-ob.w / 2, -ob.h / 2 + k * ob.h / 5); ctx.lineTo(ob.w / 2, -ob.h / 2 + k * ob.h / 5); ctx.stroke(); } ctx.restore(); break;
        case 'struct': ctx.save(); ctx.translate(ob.x, ob.y); var sg = ctx.createLinearGradient(0, -ob.h / 2, 0, ob.h / 2); sg.addColorStop(0, '#8a5ad8'); sg.addColorStop(1, '#3a2a7a'); ctx.fillStyle = sg; ctx.fillRect(-ob.w / 2, -ob.h / 2, ob.w, ob.h); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.strokeRect(-ob.w / 2, -ob.h / 2, ob.w, ob.h); ctx.fillStyle = 'rgba(255,122,232,0.8)'; for (var q = 0; q < 4; q++) ctx.fillRect(-ob.w / 4, -ob.h / 2 + 20 + q * ob.h / 4, ob.w / 2, 8); ctx.restore(); break;
        case 'anemone': ctx.save(); ctx.translate(ob.x, ob.y); for (var a = 0; a < 11; a++) { var an = -Math.PI * (0.05 + a * 0.09) - 0.0; ctx.strokeStyle = a % 2 ? '#ff7ad0' : '#ffb347'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 20); ctx.quadraticCurveTo(Math.cos(an) * 25 + Math.sin(this.t * 3 + a) * 6, Math.sin(an) * 25, Math.cos(an) * 52, Math.sin(an) * 52 + 10); ctx.stroke(); } ctx.beginPath(); ctx.ellipse(0, 22, 34, 14, 0, 0, TAU); ctx.fillStyle = '#b04a8a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore(); break;
        case 'crevice': ctx.save(); ctx.translate(ob.x, ob.y); ctx.fillStyle = 'rgba(5,10,25,0.8)'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 46, 0.2, 0, TAU); ctx.fill(); ctx.restore(); break;
        default: break;
      }
    }
  };
  P.drawZonesFront = function (ctx, sim) {
    var i, z, t = this.t;
    for (i = 0; i < sim.zones.length; i++) {
      z = sim.zones[i];
      if (z.kind !== 'seaweed' && z.kind !== 'kelp') continue;
      var simg = this.sp(z.kind === 'kelp' ? 'OBS_Kelp' : 'OBS_Seaweed');
      if (simg) {
        var sw = z.h * simg.width / simg.height, cnt = Math.max(1, Math.round(z.w / (sw * 0.75))), q;
        ctx.save(); ctx.globalAlpha = z.kind === 'kelp' ? 0.85 : 0.8;
        for (q = 0; q < cnt; q++) this.spr(ctx, simg, z.x - z.w / 2 + (q + 0.5) * z.w / cnt, BAL.FLOOR_OBSTACLES.bottomY, Math.min(sw, z.w * 1.3 / Math.max(1, cnt) + 30), 'b', Math.sin(t * 1.3 + q * 1.7) * 0.04);
        ctx.restore(); continue;
      }
      var n = z.kind === 'kelp' ? 9 : 6;
      ctx.save(); ctx.globalAlpha = z.kind === 'kelp' ? 0.7 : 0.55; ctx.lineCap = 'round';
      for (var k = 0; k < n; k++) {
        var x = z.x - z.w / 2 + 10 + k * (z.w - 20) / (n - 1), top = z.y - z.h / 2 + (k % 3) * 40;
        ctx.strokeStyle = z.kind === 'kelp' ? '#1f7a3a' : '#43a85a'; ctx.lineWidth = z.kind === 'kelp' ? 16 : 11;
        ctx.beginPath(); ctx.moveTo(x, z.y + z.h / 2); ctx.bezierCurveTo(x + Math.sin(t * 1.3 + k) * 24, z.y + z.h * 0.15, x - Math.sin(t * 1.1 + k * 2) * 24, z.y - z.h * 0.15, x + Math.sin(t * 1.5 + k) * 16, top); ctx.stroke();
      }
      ctx.restore();
    }
  };

  /* ---------------------------------------------------------------- entities */
  // role tint (spec v5.4): the creature is drawn into a reusable scratch canvas (sprite or procedural fallback alike), tinted with source-atop, and composited back; threats also get a dark outline
  // made from 8 offset copies of its silhouette. No cache per species: the only memory is the shared scratch canvas.
  P.drawTinted = function (ctx, def, c, opts, tint) {
    var R = c.len * 0.62 + 30, sk = Math.min(this.k, ((OE.Browser && OE.Browser.tier) !== 'desktop' ? 256 : 384) / (2 * R)), n = Math.max(8, Math.ceil(2 * R * sk)), A, B, a, b, col = tint.kind === 'peer' ? BAL.TINT.PEER.color : BAL.TINT.THREAT.color, i, o = tint.outline, ang;
    if (!this.scrA) { this.scrA = document.createElement('canvas'); this.scrB = document.createElement('canvas'); }
    A = this.scrA; B = this.scrB; if (A.width < n || A.height < n) { A.width = A.height = B.width = B.height = Math.max(n, 128); }
    a = A.getContext('2d'); a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, n, n); a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1;
    a.setTransform(sk, 0, 0, sk, R * sk, R * sk); Art.creature(a, def, opts);
    a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-atop'; a.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + tint.alpha + ')'; a.fillRect(0, 0, n, n); a.globalCompositeOperation = 'source-over';
    if (o > 0) {
      b = B.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, n, n); b.globalCompositeOperation = 'source-over'; b.drawImage(A, 0, 0);
      b.globalCompositeOperation = 'source-in'; b.fillStyle = BAL.TINT.THREAT.outlineColor; b.fillRect(0, 0, n, n); b.globalCompositeOperation = 'source-over';
      for (i = 0; i < 8; i++) { ang = i * Math.PI / 4; ctx.drawImage(B, 0, 0, n, n, -R + Math.cos(ang) * o, -R + Math.sin(ang) * o, n / sk, n / sk); }
    }
    ctx.drawImage(A, 0, 0, n, n, -R, -R, n / sk, n / sk);
  };
  P.drawCreature = function (ctx, c, sim) {
    var def = c.def, p = sim.player, role = c.role, d = U.dist(c.x, c.y, p.x, p.y);
    ctx.save(); ctx.translate(c.x, c.y);
    var alpha = 1;
    if (c.faded) alpha = 0.22; else if (c.hidden) alpha = 0.45;
    if (def.shape === 'jelly' || def.shape === 'ammonite') { /* no flip */ } else ctx.scale(c.facing, 1);
    ctx.globalAlpha = alpha;
    // role cue rim
    var rim = null, rw = 6;
    if (role === 'prey' && d < 400 && !c.hidden) rim = 'rgba(120,255,120,0.75)';
    else if (role === 'predator' && d < 600) rim = 'rgba(255,60,60,0.85)';
    else if (role === 'hazard') {                                                         // PT2-2: the shared danger look (same as stinging corals / anemones)
      var hx = c.len * 0.5 + 8, hy = Math.max(c.len * (def.asp || 0.4) * 0.5, c.br) + 8;
      if (def.shape === 'jelly' || def.shape === 'ammonite' || def.shape === 'puff' || def.shape === 'crab') { hx = hy = Math.max(c.br, c.len * 0.38) + 8; }
      this.dangerLook(ctx, 0, 0, hx, hy, c.id);
    }
    if (rim) {
      ctx.beginPath();
      var rx = c.len * 0.5 + 8, ry = Math.max(c.len * (def.asp || 0.4) * 0.5, c.br) + 8;
      if (def.shape === 'jelly' || def.shape === 'ammonite' || def.shape === 'puff' || def.shape === 'crab') { rx = ry = Math.max(c.br, c.len * 0.38) + 8; }
      ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.lineWidth = rw; ctx.strokeStyle = rim; ctx.stroke();
    }
    var near = role === 'predator' && d < 600;
    var sp = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    var ang = Math.atan2(c.vy, Math.abs(c.vx) + 1) * 0.4;
    if (c.tilt) ang += c.tilt * 0.45;                                                     // Side-scroller: the nose tilts 0.3 s before a turn
    if (def.shape !== 'jelly' && def.shape !== 'ammonite' && def.shape !== 'crab') ctx.rotate(U.clamp(ang, -0.7, 0.7));
    if (def.shape === 'angler' || def.ai === 'ambush') { if (c.state === 'wait') ctx.globalAlpha = alpha * 0.95; }
    var copts = { L: c.len, t: c.t + c.id * 0.7, mouth: (c.state === 'lunge' || c.state === 'burst' || c.state === 'rush' || c.state === 'chase') ? 1 : 0, red: near, inflated: c.inflated, retract: c.retract, state: c.state, hazard: role === 'hazard', snap: c.snapT > 0, speedAnim: 3 + sp / 50, ping: 0 };
    var tint = sim.tintOf(c);
    if (tint.kind !== 'none') this.drawTinted(ctx, def, c, copts, tint); else Art.creature(ctx, def, copts);
    ctx.restore();
  };
  P.drawPlayer = function (ctx, sim) {
    var p = sim.player;
    if (sim.dying && sim.dyingT < 0.3) ctx.globalAlpha = Math.max(0, sim.dyingT / 0.3);
    ctx.save(); ctx.translate(p.x, p.y);
    var blink = p.blink > 0 && Math.floor(this.t * 14) % 2 === 0;
    ctx.globalAlpha = (sim.dying ? Math.max(0.2, sim.dyingT / BAL.failDelayS) : 1) * (blink ? 0.35 : 1);
    ctx.scale(p.facing, 1);
    var pop = this.evoPop(); if (pop !== 1) ctx.scale(pop, pop);                               // PT2-4: scale pop with overshoot
    var local = p.facing > 0 ? p.ang : Math.PI - p.ang;
    while (local > Math.PI) local -= TAU; while (local < -Math.PI) local += TAU;
    ctx.rotate(U.clamp(local, -1.3, 1.3));
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    // soft white halo to keep the hero readable
    ctx.beginPath(); ctx.ellipse(0, 0, p.len * 0.55, p.len * 0.3, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    Art.player(ctx, sim.form, { L: p.len, t: this.t, mouth: p.biteT > 0 ? 1 : 0, speedAnim: 4 + sp / 60, hero: true });
    ctx.restore(); ctx.globalAlpha = 1;
  };
  P.drawSurface = function (ctx, t, sim) {
    var d = t.def, p = sim.player, eligible = t.tier <= sim.form;
    ctx.save(); ctx.translate(t.x, t.y);
    var bobAng = t.mot === 'sail' ? Math.sin(t.t * 2 + t.ph) * 0.03 : 0;
    ctx.rotate(bobAng);
    if (t.dir < 0 && t.mot !== 'static') ctx.scale(-1, 1);
    Art.surface(ctx, d, { w: t.w, h: t.h, t: t.t + t.ph, bites: t.biteN });
    ctx.restore();
    // eligible glow while airborne
    if (p.airborne && eligible) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,240,120,' + (0.5 + 0.3 * Math.sin(this.t * 10)) + ')'; ctx.lineWidth = 5; ctx.setLineDash([14, 8]);
      ctx.strokeRect(t.x - t.w / 2 - 6, t.y - t.h / 2 - 6, t.w + 12, t.h + 12); ctx.restore();
    }
    // the Too Big Marker (outline + small X) is a DOM element drawn by ui.js so QA can read it
  };
  // CR-4 v5.1: boss-only effects, procedural for now (art BOSSFX_01..08 follows): lane telegraph band, spines / torpedoes, the stunned finale boss
  P.drawBossFx = function (ctx, sim) {
    var i, o, t = this.t, cam = sim.cam.x, VW = this.viewW;
    if (!sim.bossTele) return;
    for (i = 0; i < sim.bossTele.length; i++) {
      o = sim.bossTele[i]; var a = 0.16 + 0.12 * Math.sin(t * 18);
      ctx.fillStyle = 'rgba(255,60,80,' + a + ')'; ctx.fillRect(cam, o.y - 24, VW, 48);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.3 * Math.sin(t * 18)) + ')'; ctx.lineWidth = 3; ctx.setLineDash([22, 14]); ctx.beginPath(); ctx.moveTo(cam, o.y); ctx.lineTo(cam + VW, o.y); ctx.stroke(); ctx.setLineDash([]);
    }
    for (i = 0; i < sim.projs.length; i++) {
      o = sim.projs[i]; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.atan2(o.vy, o.vx));
      ctx.shadowColor = o.kind === 'torpedo' ? '#ffb050' : '#ff6bd0'; ctx.shadowBlur = 18;
      if (o.kind === 'torpedo') { ctx.fillStyle = '#d8dde8'; ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 46, 16, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.arc(-40, 0, 7, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#ffe0f6'; ctx.strokeStyle = '#ff6bd0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-24, -9); ctx.lineTo(-24, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    if (sim.finaleBoss && !sim.finaleBoss.dead) {
      var b = sim.finaleBoss, pulse = 0.5 + 0.5 * Math.sin(t * 10);
      ctx.save(); ctx.strokeStyle = 'rgba(255,210,63,' + (0.55 + 0.4 * pulse) + ')'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 24; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.len * 0.62, Math.max(40, b.br * 1.5), 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
  };
  P.drawObjs = function (ctx, sim) {
    var i, o, t = this.t, k;
    for (i = 0; i < sim.objs.length; i++) {
      o = sim.objs[i];
      switch (o.kind) {
        case 'mine':
          var mimg = this.sp('OBS_Mine'); if (o.arm && o.t < o.arm) { ctx.save(); ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t * 20); ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(o.x, o.y, 54, 0, TAU); ctx.stroke(); ctx.restore(); }      // arming: a red flash for o.arm s before it can hurt
          if (!(o.arm && o.t < o.arm)) this.dangerLook(ctx, o.x, o.y, 44, 44, o.id);                    // PT2-2: shared danger look
          if (mimg) { this.spr(ctx, mimg, o.x, o.y, 72, 'c'); ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, TAU); ctx.fillStyle = (Math.floor(t * 3) % 2 ? '#ff4040' : '#701010'); ctx.fill(); break; }
          ctx.save(); ctx.translate(o.x, o.y); ctx.strokeStyle = '#333'; ctx.lineWidth = 5; for (k = 0; k < 8; k++) { var a = k / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); ctx.stroke(); }
          ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.fillStyle = '#5a5f66'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fillStyle = (Math.floor(t * 3) % 2 ? '#ff4040' : '#701010'); ctx.fill(); ctx.restore(); break;
        case 'frock':
          if (o.st === 'tele') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(o.x, BAL.seabedY - 30, 60 + o.t * 30, 14, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,120,60,0.6)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(o.x, sim.waterY); ctx.lineTo(o.x, BAL.seabedY - 40); ctx.stroke(); ctx.setLineDash([]); }
          else { this.dangerLook(ctx, o.x, o.y, o.r + 10, o.r + 10, o.id); this.drawRock(ctx, { x: o.x, y: o.y, r: o.r, id: 3, kind: 'cracked' }, sim.wdef); }
          break;
        case 'crock':
          if (o.st === 'gone') break;
          var sx = o.st === 'shake' ? Math.sin(t * 60) * 6 : 0;
          if (o.st === 'fall') this.dangerLook(ctx, o.x, o.y, o.r + 10, o.r + 10, o.id);
          this.drawRock(ctx, { x: o.x + sx, y: o.y, r: o.r, id: 5, kind: 'cracked' }, sim.wdef);
          if (o.st === 'shake') { ctx.strokeStyle = 'rgba(255,200,80,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x + sx, o.y, o.r + 10, 0, TAU); ctx.stroke(); }
          break;
        case 'ring':
          ctx.save(); ctx.beginPath(); ctx.rect(0, sim.waterY, W, H); ctx.clip();
          ctx.lineWidth = o.thick; ctx.strokeStyle = 'rgba(255,110,230,0.55)';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, o.gap + o.gapW / 2, o.gap - o.gapW / 2 + TAU); ctx.stroke();
          ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, o.gap + o.gapW / 2, o.gap - o.gapW / 2 + TAU); ctx.stroke();
          ctx.restore(); break;
        case 'wall': case 'swall': {
          var wy0 = sim.waterY, gt = o.gapY - o.gapH / 2, gb = o.gapY + o.gapH / 2, sw = o.kind === 'swall';
          this.wn = sim.wdef.n;
          this.dangerRect(ctx, o.x - o.w / 2, wy0, o.w, gt - wy0, o.id); this.dangerRect(ctx, o.x - o.w / 2, gb, o.w, H - gb, o.id);      // PT2-2: shared danger rim
          if (!sw && this.drawWallArt(ctx, o, wy0, H)) break;
          ctx.save();
          ctx.fillStyle = sw ? 'rgba(255,110,230,0.5)' : '#5a6b86'; ctx.strokeStyle = sw ? 'rgba(255,255,255,0.95)' : OUT; ctx.lineWidth = sw ? 8 : 6;
          ctx.fillRect(o.x - o.w / 2, wy0, o.w, gt - wy0); ctx.fillRect(o.x - o.w / 2, gb, o.w, H - gb);
          ctx.strokeRect(o.x - o.w / 2, wy0, o.w, gt - wy0); ctx.strokeRect(o.x - o.w / 2, gb, o.w, H - gb);
          ctx.restore(); break;
        }
        case 'column': {
          var cy0 = sim.waterY, ct = o.gapY - o.gapH / 2, cb = o.gapY + o.gapH / 2;
          ctx.save();
          if (o.st === 'tele') {
            ctx.fillStyle = 'rgba(255,60,120,' + (0.2 + 0.15 * Math.sin(t * 24)) + ')';
            ctx.fillRect(o.x - o.w / 2, cy0, o.w, ct - cy0); ctx.fillRect(o.x - o.w / 2, cb, o.w, H - cb);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 54px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('!', o.x, o.gapY + 18);
          } else {
            this.dangerRect(ctx, o.x - o.w / 2, cy0, o.w, ct - cy0, o.id); this.dangerRect(ctx, o.x - o.w / 2, cb, o.w, H - cb, o.id);
            ctx.fillStyle = '#8a3fd0'; ctx.strokeStyle = OUT; ctx.lineWidth = 6;
            ctx.fillRect(o.x - o.w / 2, cy0, o.w, ct - cy0); ctx.fillRect(o.x - o.w / 2, cb, o.w, H - cb);
            ctx.strokeRect(o.x - o.w / 2, cy0, o.w, ct - cy0); ctx.strokeRect(o.x - o.w / 2, cb, o.w, H - cb);
          }
          ctx.restore(); break;
        }
        case 'shockring': ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,243,107,' + (1 - o.t / o.life) + ')'; ctx.stroke(); break;
        case 'sonar': ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(160,255,255,' + Math.max(0, 0.7 - o.t / o.life) + ')'; ctx.stroke(); break;
        case 'ink': var ig = ctx.createRadialGradient(o.x, o.y, 10, o.x, o.y, o.r * (1.2 - 0.3 * o.t / o.life)); ig.addColorStop(0, 'rgba(15,5,30,0.95)'); ig.addColorStop(1, 'rgba(15,5,30,0)'); ctx.globalAlpha = Math.min(1, (o.life - o.t) * 2); ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'tent':
          if (o.st === 'tele') { ctx.fillStyle = 'rgba(255,60,120,' + (0.25 + 0.2 * Math.sin(t * 20)) + ')'; ctx.beginPath(); ctx.ellipse(o.x, BAL.seabedY, 70, 18, 0, 0, TAU); ctx.fill(); break; }
          var tseg = this.sp('OBS_Tentacle_Seg'), ttip = this.sp('OBS_Tentacle_Tip');
          if (tseg && ttip) {
            var px = o.x, py = o.baseY, an = -Math.PI / 2, nx, ny, dl;
            for (k = 0; k < o.pts.length; k++) {
              nx = o.pts[k][0]; ny = o.pts[k][1]; dl = Math.hypot(nx - px, ny - py); an = Math.atan2(ny - py, nx - px);
              ctx.save(); ctx.translate(px, py); ctx.rotate(an); ctx.drawImage(tseg, -4, -36, dl + 8, 72); ctx.restore(); px = nx; py = ny;
            }
            ctx.save(); ctx.translate(px, py); ctx.rotate(an); ctx.drawImage(ttip, -10, -45, 90 * ttip.width / ttip.height, 90); ctx.restore();
            break;
          }
          ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = OUT;
          for (var pass = 0; pass < 2; pass++) {
            ctx.beginPath(); ctx.moveTo(o.x, o.baseY);
            for (k = 0; k < o.pts.length; k++) ctx.lineTo(o.pts[k][0], o.pts[k][1]);
            ctx.lineWidth = pass === 0 ? 62 : 48; ctx.strokeStyle = pass === 0 ? OUT : '#8a3fd0'; ctx.stroke();
          }
          ctx.fillStyle = '#ffb0f0'; for (k = 1; k < o.pts.length; k += 2) { ctx.beginPath(); ctx.arc(o.pts[k][0], o.pts[k][1], 9, 0, TAU); ctx.fill(); }
          ctx.restore(); break;
        default: break;
      }
    }
  };
  P.drawPickups = function (ctx, sim) {
    for (var i = 0; i < sim.pickups.length; i++) {
      var pk = sim.pickups[i], y = pk.y + Math.sin(pk.t * 2) * 6;
      ctx.beginPath(); ctx.arc(pk.x, y, 28, 0, TAU); ctx.fillStyle = 'rgba(200,245,255,0.25)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(pk.x, y, 17, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#b8860b'; ctx.stroke();
      ctx.fillStyle = '#b8860b'; ctx.font = 'bold 20px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(String(pk.value), pk.x, y + 7);
    }
  };

  /* ---------------------------------------------------------------- overlays: darkness, fx */
  /* CR-4: in the dark (Side-scroller / Classic levels with sim.dark) every blocker stays readable: it is drawn again ABOVE the darkness as a translucent body with a bright glowing
     outline, its gap edges are highlighted green and a light pocket (reduced darkness) is laid around it and its gap. Walls = yellow, shock walls / boss rings = magenta-white,
     tentacle columns = orange (telegraph: pulsing red), the other hazards (mines, falling / collapsing rocks, electric zones) get a glowing ring. */
  P.glowRect = function (ctx, x, y, w, h, col, fillA) {
    if (h <= 0) return;
    ctx.fillStyle = col; ctx.globalAlpha = fillA; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.shadowColor = col; ctx.shadowBlur = 26; ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0; ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, w, h);
  };
  P.drawBlockers = function (ctx, sim) {
    var i, o, t = this.t, cam = sim.cam.x, VW = this.viewW, wy0 = sim.waterY, ring;
    ctx.save(); ctx.translate(-cam, 0);
    function pocket(x, y, r, a) {
      var g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      g.addColorStop(0, 'rgba(150,205,255,' + a + ')'); g.addColorStop(1, 'rgba(150,205,255,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
    }
    for (i = 0; i < sim.objs.length; i++) {
      o = sim.objs[i];
      if (o.kind === 'wall' || o.kind === 'swall' || o.kind === 'column') {
        if (o.x + o.w < cam - 120 || o.x - o.w > cam + VW + 120) continue;
        var gt = o.gapY - o.gapH / 2, gb = o.gapY + o.gapH / 2, x0 = o.x - o.w / 2, tele = o.kind === 'column' && o.st === 'tele';
        var col = tele ? 'rgb(255,' + Math.round(70 + 40 * Math.sin(t * 24)) + ',96)' : (o.kind === 'wall' ? '#ffe066' : (o.kind === 'swall' ? '#ff8af5' : '#ffb050'));
        pocket(o.x, o.gapY, Math.max(340, o.gapH * 1.5), tele ? 0.3 : 0.24);
        ctx.save();
        this.glowRect(ctx, x0, wy0, o.w, gt - wy0, col, tele ? 0.28 : 0.42);
        this.glowRect(ctx, x0, gb, o.w, H - gb, col, tele ? 0.28 : 0.42);
        // gap edges: bright green bars across the opening
        ctx.shadowColor = '#5dff9a'; ctx.shadowBlur = 22; ctx.lineWidth = 9; ctx.strokeStyle = '#5dff9a'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0 - 46, gt); ctx.lineTo(x0 + o.w + 46, gt); ctx.moveTo(x0 - 46, gb); ctx.lineTo(x0 + o.w + 46, gb); ctx.stroke();
        ctx.restore();
      } else if (o.kind === 'ring') {
        pocket(o.x, o.y, o.r + 220, 0.2);
        ctx.save(); ctx.beginPath(); ctx.rect(0, wy0, W, H); ctx.clip();
        ctx.shadowColor = '#ff8af5'; ctx.shadowBlur = 30; ctx.lineWidth = o.thick * 0.5; ctx.strokeStyle = 'rgba(255,138,245,0.85)';
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, o.gap + o.gapW / 2, o.gap - o.gapW / 2 + TAU); ctx.stroke(); ctx.restore();
      } else if (o.kind === 'mine' || o.kind === 'frock' || (o.kind === 'crock' && o.st !== 'gone')) {
        if (o.x < cam - 200 || o.x > cam + VW + 200) continue;
        pocket(o.x, o.y === undefined ? BAL.seabedY - 30 : o.y, 220, 0.18);
        ctx.save(); ctx.shadowColor = '#ffb050'; ctx.shadowBlur = 24; ctx.lineWidth = 6; ctx.strokeStyle = '#ffcf5a';
        ctx.beginPath(); ctx.arc(o.x, o.y === undefined ? BAL.seabedY - 30 : o.y, (o.r || 30) + 12, 0, TAU); ctx.stroke(); ctx.restore();
      }
    }
    for (i = 0; i < sim.obs.length; i++) {                                           // CR-4: moving structures (World 7) glow like the other blockers
      o = sim.obs[i];
      if (o.kind !== 'struct' || o.x + o.w < cam - 120 || o.x - o.w > cam + VW + 120) continue;
      pocket(o.x, o.y, Math.max(340, o.h), 0.22);
      ctx.save(); this.glowRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, '#c9a8ff', 0.3); ctx.restore();
    }
    for (i = 0; i < sim.zones.length; i++) {
      o = sim.zones[i];
      if (o.kind !== 'elec' || o.x + o.w / 2 < cam - 100 || o.x - o.w / 2 > cam + VW + 100) continue;
      ctx.save(); ctx.shadowColor = '#8ae9ff'; ctx.shadowBlur = 22; ctx.lineWidth = 6; ctx.strokeStyle = sim.elecPhase(o) === 'off' ? 'rgba(138,233,255,0.55)' : '#8ae9ff'; ctx.setLineDash([16, 10]);
      ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); ctx.restore();
    }
    ctx.restore();
  };
  P.drawDark = function (ctx, sim) {
    var R = sim.dark; if (!R) return;
    var p = sim.player, i, c, cam = sim.cam.x, px = p.x - cam;
    ctx.save();
    var gr = ctx.createRadialGradient(px, p.y, R * 0.55, px, p.y, R);
    gr.addColorStop(0, 'rgba(2,6,22,0)'); gr.addColorStop(1, 'rgba(2,6,22,0.94)');
    ctx.fillStyle = gr; ctx.fillRect(0, sim.waterY - 6, this.viewW, H);
    this.drawBlockers(ctx, sim);                               // CR-4: blockers and hazards glow above the darkness
    ctx.translate(-cam, 0);
    // glowing creatures stay visible
    for (i = 0; i < sim.creatures.length; i++) {
      c = sim.creatures[i];
      if (!c.def.glow || c.faded || !this.onScreen(c, cam, this.viewW)) continue;
      var gl = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, c.len * 0.9);
      gl.addColorStop(0, 'rgba(160,255,255,' + 0.45 * c.def.glow + ')'); gl.addColorStop(1, 'rgba(160,255,255,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(c.x, c.y, c.len * 0.9, 0, TAU); ctx.fill();
      if (U.dist(c.x, c.y, p.x, p.y) > R * 0.85) this.drawCreature(ctx, c, sim);
    }
    ctx.restore();
  };
  P.drawFx = function (ctx, dt) {
    var i, q;
    for (i = this.parts.length - 1; i >= 0; i--) {
      q = this.parts[i]; q.life -= dt;
      if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      q.vy += (q.g || -30) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.99;
      ctx.globalAlpha = Math.min(1, q.life / q.max * 1.5);
      ctx.fillStyle = q.c;
      if (q.sq) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate((q.rot || 0) + q.life * 6); ctx.fillRect(-q.r, -q.r * 0.6, q.r * 2, q.r * 1.2); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (i = this.texts.length - 1; i >= 0; i--) {
      q = this.texts[i]; q.t += dt;
      if (q.t > 0.9) { this.texts.splice(i, 1); continue; }
      var y = q.y - 40 * Math.min(1, q.t / 0.6);
      ctx.globalAlpha = Math.min(1, (0.9 - q.t) * 3);
      ctx.font = 'bold ' + (q.big ? 48 : 36) + 'px ' + FONT; ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.strokeText(q.s, q.x, y); ctx.fillStyle = q.c; ctx.fillText(q.s, q.x, y);
    }
    ctx.globalAlpha = 1;
  };
  P.ambient = function (ctx, sim, dt) {
    var wd = sim.wdef, i, m;
    this.bubT -= dt;
    if (this.bubT <= 0) { this.bubT = 0.25; this.addPart({ x: this.cam + Math.random() * this.viewW, y: H - 40 - Math.random() * 120, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 60, life: 6, max: 6, r: 2 + Math.random() * 5, c: 'rgba(255,255,255,0.35)', g: -8 }); }
    for (i = 0; i < this.motes.length; i++) {
      m = this.motes[i]; m.y -= m.v * dt * 0.5; m.x += Math.sin(this.t + m.p) * 6 * dt;
      if (m.y < (sim.deep ? 0 : BAL.waterY) + 10) { m.y = H; m.x = Math.random() * this.viewW; }
      ctx.fillStyle = wd.n === 6 ? 'rgba(255,170,110,0.5)' : (wd.n >= 3 && wd.n !== 4 ? 'rgba(160,240,255,0.45)' : 'rgba(255,255,255,0.35)');
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
    if (wd.n === 5 && Math.random() < dt * 0.15) this.flash = 1;
    if (this.flash > 0) this.flash -= dt * 3;
  };

  /* ---------------------------------------------------------------- frame */
  P.drawIdle = function (ctx) {
    // a calm ocean behind the menu windows
    var wd = WORLDS[(this.game.main && this.game.main.focus ? this.game.main.focus : 1) - 1];
    var fake = { waterY: BAL.waterY, wdef: wd };
    this.cam = 0;
    var bg = OE.Assets.get('BG_W' + wd.n + '_Back');
    if (bg) { this.drawFarBg(ctx, bg, 0, !!wd.deep); if (!wd.deep) this.drawWaterLine(ctx, fake); }
    else { if (!wd.deep) this.drawSky(ctx, wd, fake); fake.deep = !!wd.deep; if (wd.deep) fake.waterY = BAL.deepWaterY; this.drawWater(ctx, wd, fake); }
  };
  P.draw = function (dtMs) {
    var dt = Math.min(0.1, dtMs / 1000), ctx = this.ctx, game = this.game, sim = game.sim;
    this.t += dt;
    // BUG-U3: every frame starts from a clean context (reset() also empties the save() stack), so a frame that threw half way cannot leave a clip,
    // an alpha or a transform behind that blanks or offsets the following frames
    if (ctx.reset) ctx.reset(); else { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.setLineDash([]); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    this.camY = sim && game.mode === 'game' ? sim.cam.y : 0; ctx.translate(0, -this.camY);        // CR-4: vertical follow (view top, world units)
    if (this.shakeT > 0) { this.shakeT -= dt; var sh = this.shake * (this.shakeT / 0.3); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh); }
    if (!sim || game.mode !== 'game') { this.glowLine = 0; this.drawIdle(ctx); return; }
    var wd = sim.wdef, i, list, cam = sim.cam.x, VW = this.viewW;
    this.evoTick();
    var ez = this.evoZoom();                                                                   // PT2-4: camera zoom punch, pivot on the player (zoom in only, so the edges stay covered)
    if (ez !== 1) { var zx = sim.player.x - cam, zy = sim.player.y; ctx.translate(zx, zy); ctx.scale(ez, ez); ctx.translate(-zx, -zy); }
    this.cam = cam;
    this.glowLine = sim.jumpEligible() ? 1 : 0;
    var bg = OE.Assets.get('BG_W' + wd.n + '_Back');
    if (bg) { this.drawFarBg(ctx, bg, cam, sim.deep); this.drawBgVeil(ctx, wd); this.drawSeabedArt(ctx, wd, 'mid'); if (!sim.deep) this.drawWaterLine(ctx, sim); }      // PT2-2: the far reef behind a water veil, the baked dark midground strip
    else { if (!sim.deep) this.drawSky(ctx, wd, sim); this.drawWater(ctx, wd, sim); this.drawBgVeil(ctx, wd); }
    ctx.save(); ctx.translate(-cam, 0);                        // world space from here
    if (bg) { this.drawDecorRocks(ctx, sim); this.drawFloorWorld(ctx, wd, cam); this.drawFloorVeil(ctx); }          // the decor rocks, then the floor strip in front of them: they stand sunk in the sand
    this.drawZonesBack(ctx, sim);
    this.drawObstacles(ctx, sim, false);
    this.drawPickups(ctx, sim);
    list = sim.creatures.slice().sort(function (a, b) { return b.len - a.len; });
    for (i = 0; i < list.length; i++) { if (this.onScreen(list[i], cam, VW) && (list[i].boss || list[i].def.ai === 'cruise')) this.drawCreature(ctx, list[i], sim); }
    for (i = 0; i < list.length; i++) { if (this.onScreen(list[i], cam, VW) && !(list[i].boss || list[i].def.ai === 'cruise')) this.drawCreature(ctx, list[i], sim); }
    for (i = 0; i < sim.surface.length; i++) this.drawSurface(ctx, sim.surface[i], sim);
    this.drawEvoBack(ctx, sim);
    this.drawPlayer(ctx, sim);
    this.drawEvoFront(ctx, sim);
    this.drawObstacles(ctx, sim, true);
    this.drawZonesFront(ctx, sim);
    this.drawObjs(ctx, sim);
    this.drawBossFx(ctx, sim);
    this.drawFx(ctx, dt);
    ctx.restore();
    this.ambient(ctx, sim, dt);
    this.drawDark(ctx, sim);
    this.drawEvoFlash(ctx);
    // global current direction hint (W4/W5)
    if (sim.drift) { ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (i = 0; i < 6; i++) { var yy = 420 + i * 100, x0 = wrap(this.t * 160 * sim.driftDir + i * 230, VW + 200) - 100; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + 70 * sim.driftDir, yy); ctx.stroke(); } ctx.restore(); }
  };
  P.onScreen = function (c, cam, VW) { return c.x + c.len > cam - 200 && c.x - c.len < cam + VW + 200; };
  P.glowLineOnly = function (ctx, sim) {
    if (!this.glowLine) return;
    ctx.beginPath(); ctx.moveTo(0, sim.waterY); ctx.lineTo(this.viewW, sim.waterY); ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,255,140,0.5)'; ctx.stroke();
  };
})(typeof window !== 'undefined' ? window : globalThis);
