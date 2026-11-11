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
    this.viewW = BAL.DESIGN_W; this.cam = 0;
    this.clouds = []; for (var i = 0; i < 9; i++) this.clouds.push({ x: Math.random() * 4000, y: 40 + Math.random() * 190, s: 0.45 + Math.random() * 0.5, v: 8 + Math.random() * 14 });
    this.motes = []; for (i = 0; i < 28; i++) this.motes.push({ x: Math.random() * 2520, y: Math.random() * H, r: 1.5 + Math.random() * 3, v: 6 + Math.random() * 14, p: Math.random() * 6 });
    this.bubT = 0;
    var self = this;
    game.on('simEvent', function (e) { self.onEvent(e); });
  }
  OE.Render = Render;
  var P = Render.prototype;

  P.resize = function (cssW, dpr, viewW) {
    this.viewW = viewW || BAL.DESIGN_W;
    this.cv.width = Math.round(cssW * dpr); this.cv.height = Math.round(cssW * BAL.VIEW_H / this.viewW * dpr); this.k = this.cv.width / this.viewW;
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
      case 'evolve': this.shake = 8; this.shakeT = 0.3; break;
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
    ctx.beginPath(); ctx.moveTo(0, H0); ctx.lineTo(0, this.waveY(cam, sim));
    for (i = 0; i <= VW; i += 24) ctx.lineTo(i, this.waveY(i + cam, sim));
    ctx.lineTo(VW, H0); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
    // light shafts (parallax 0.5)
    ctx.save(); ctx.globalAlpha = wd.n === 3 || wd.n === 5 || wd.n === 7 ? 0.08 : 0.16;
    for (i = -1; i < VW / 260 + 2; i++) {
      var x = wrap(i * 260 - cam * 0.5, VW + 520) - 260 + Math.sin(this.t * 0.3 + i) * 30, lg = ctx.createLinearGradient(0, wy, 0, wy + 650);
      lg.addColorStop(0, '#fff'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x - 24, wy); ctx.lineTo(x + 24, wy); ctx.lineTo(x + 110, wy + 650); ctx.lineTo(x - 70, wy + 650); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // seabed: floor band 990-1080 (world x, parallax 1.0)
    var fy = BAL.seabedY - 6;
    ctx.beginPath(); ctx.moveTo(0, H0); ctx.lineTo(0, fy + 6);
    for (i = 0; i <= VW; i += 32) ctx.lineTo(i, fy + Math.sin((i + cam) * 0.011 + wd.n) * 9);
    ctx.lineTo(VW, H0); ctx.closePath(); ctx.fillStyle = wd.floor; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, fy + 40, VW, H0);
    this.drawDecor(ctx, wd, fy);
    this.drawWaterLine(ctx, sim);
  };
  // foam line on the (waving) waterline, plus the Jump Ready glow (procedural FX: waterline glow)
  P.drawWaterLine = function (ctx, sim) {
    var i, VW = this.viewW, cam = this.cam;
    ctx.beginPath(); for (i = 0; i <= VW; i += 24) { var yy = this.waveY(i + cam, sim); if (i === 0) ctx.moveTo(i, yy); else ctx.lineTo(i, yy); }
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    if (this.glowLine > 0) { ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,255,140,' + (0.35 + 0.25 * Math.sin(this.t * 8)) + ')'; ctx.stroke(); }
  };
  // far background layer (BG_Wn_Back, 2560x1080): scaled to the view height, tiled horizontally (never stretched), parallax 0.33
  P.drawFarBg = function (ctx, img, camX) {
    var tiles = OE.util.farTiles(camX, img.width, img.height, this.viewW, BAL.VIEW_H, 0.33), i;
    for (i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (!t.flip) { ctx.drawImage(img, t.x, 0, t.w, BAL.VIEW_H); continue; }
      ctx.save(); ctx.translate(t.x + t.w, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, t.w, BAL.VIEW_H); ctx.restore();
    }
  };
  P.drawDecor = function (ctx, wd, fy) {
    var n = wd.n, t = this.t, VW = this.viewW, off = this.cam * 0.66, k, x, step;
    function range(st) { return [Math.floor(off / st) - 1, Math.ceil((off + VW) / st) + 1]; }
    var r;
    if (n === 2 || n === 1) {
      step = 120; r = range(step);
      for (k = r[0]; k < r[1]; k++) { x = k * step - off; var kh = 110 + (Math.abs(k) * 53) % 90; ctx.strokeStyle = n === 2 ? 'rgba(40,120,70,0.5)' : 'rgba(255,120,150,0.35)'; ctx.lineWidth = n === 2 ? 11 : 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, fy + 8); ctx.bezierCurveTo(x + Math.sin(t + k) * 22, fy - kh * 0.4, x - Math.sin(t + k) * 22, fy - kh * 0.7, x + Math.sin(t * 1.2 + k) * 15, fy - kh); ctx.stroke(); }
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
    var i, z, t = this.t;
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
        ctx.fillStyle = '#3a2a22'; ctx.beginPath(); ctx.moveTo(z.x - 60, BAL.seabedY); ctx.lineTo(z.x - 25, BAL.seabedY - 50); ctx.lineTo(z.x + 25, BAL.seabedY - 50); ctx.lineTo(z.x + 60, BAL.seabedY); ctx.fill();
        if (sim.ventActive(z)) { var gp = ctx.createLinearGradient(0, BAL.seabedY - 50, 0, BAL.seabedY - 650); gp.addColorStop(0, 'rgba(255,170,80,0.7)'); gp.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = gp; ctx.fillRect(z.x - 55, BAL.seabedY - 650, 110, 600); }
        else if (sim.ventWarn(z)) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(z.x + Math.sin(t * 6 + k) * 14, BAL.seabedY - 80 - ((t * 140 + k * 40) % 200), 7, 0, TAU); ctx.fill(); } }
      } else if (z.kind === 'lava') {
        var lg = ctx.createLinearGradient(0, z.y - z.h / 2, 0, z.y + z.h / 2); lg.addColorStop(0, '#ffb43a'); lg.addColorStop(1, '#e8401a');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(z.x - z.w / 2, z.y + z.h / 2); for (var xk = 0; xk <= z.w; xk += 30) ctx.lineTo(z.x - z.w / 2 + xk, z.y - z.h / 2 + Math.sin(t * 2 + xk * 0.05) * 6); ctx.lineTo(z.x + z.w / 2, z.y + z.h / 2); ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,230,120,0.9)'; ctx.stroke();
      } else if (z.kind === 'elec') {
        var ph = sim.elecPhase(z);
        ctx.save(); ctx.globalAlpha = ph === 'active' ? 0.95 : (ph === 'warn' ? 0.45 + 0.3 * Math.sin(t * 14) : 0.12);
        ctx.strokeStyle = ph === 'active' ? '#fff36b' : '#7fe8ff'; ctx.lineWidth = ph === 'active' ? 6 : 3;
        ctx.strokeRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
        if (ph !== 'off') for (k = 0; k < 4; k++) { ctx.beginPath(); var sx = z.x - z.w / 2; ctx.moveTo(sx, z.y - z.h / 2 + k * 60); for (var q = 1; q <= 8; q++) ctx.lineTo(sx + q * z.w / 8, z.y - z.h / 2 + k * 60 + (q % 2 ? -22 : 22)); ctx.stroke(); }
        ctx.restore();
      } else if (z.kind === 'whirl') {
        ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(t * 2);
        for (k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(0, 0, 40 + k * 44, k, k + 3.6); ctx.strokeStyle = 'rgba(255,170,255,' + (0.55 - k * 0.08) + ')'; ctx.lineWidth = 12 - k; ctx.stroke(); }
        ctx.restore();
      }
    }
  };
  P.drawRock = function (ctx, ob, wd) {
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
  P.drawObstacles = function (ctx, sim, fore) {
    var i, ob, wd = sim.wdef;
    for (i = 0; i < sim.obs.length; i++) {
      ob = sim.obs[i];
      if (!!ob.fore !== fore) continue;
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
    else if (role === 'hazard') { rim = 'rgba(255,150,30,' + (0.55 + 0.35 * Math.sin(this.t * 7)) + ')'; }
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
    Art.creature(ctx, def, { L: c.len, t: c.t + c.id * 0.7, mouth: (c.state === 'lunge' || c.state === 'burst' || c.state === 'rush' || c.state === 'chase') ? 1 : 0, red: near, inflated: c.inflated, retract: c.retract, state: c.state, hazard: role === 'hazard', snap: c.snapT > 0, speedAnim: 3 + sp / 50, ping: 0 });
    ctx.restore();
  };
  P.drawPlayer = function (ctx, sim) {
    var p = sim.player;
    if (sim.dying && sim.dyingT < 0.3) ctx.globalAlpha = Math.max(0, sim.dyingT / 0.3);
    ctx.save(); ctx.translate(p.x, p.y);
    var blink = p.blink > 0 && Math.floor(this.t * 14) % 2 === 0;
    ctx.globalAlpha = (sim.dying ? Math.max(0.2, sim.dyingT / BAL.failDelayS) : 1) * (blink ? 0.35 : 1);
    ctx.scale(p.facing, 1);
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
  P.drawObjs = function (ctx, sim) {
    var i, o, t = this.t, k;
    for (i = 0; i < sim.objs.length; i++) {
      o = sim.objs[i];
      switch (o.kind) {
        case 'mine':
          ctx.save(); ctx.translate(o.x, o.y); ctx.strokeStyle = '#333'; ctx.lineWidth = 5; for (k = 0; k < 8; k++) { var a = k / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); ctx.stroke(); }
          ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.fillStyle = '#5a5f66'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fillStyle = (Math.floor(t * 3) % 2 ? '#ff4040' : '#701010'); ctx.fill(); ctx.restore(); break;
        case 'frock':
          if (o.st === 'tele') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(o.x, BAL.seabedY - 30, 60 + o.t * 30, 14, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,120,60,0.6)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(o.x, sim.waterY); ctx.lineTo(o.x, BAL.seabedY - 40); ctx.stroke(); ctx.setLineDash([]); }
          else { this.drawRock(ctx, { x: o.x, y: o.y, r: o.r, id: 3, kind: 'rock' }, sim.wdef); }
          break;
        case 'crock':
          if (o.st === 'gone') break;
          var sx = o.st === 'shake' ? Math.sin(t * 60) * 6 : 0;
          this.drawRock(ctx, { x: o.x + sx, y: o.y, r: o.r, id: 5, kind: 'rock' }, sim.wdef);
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
  P.drawDark = function (ctx, sim) {
    var R = sim.dark; if (!R) return;
    var p = sim.player, i, c, cam = sim.cam.x, px = p.x - cam;
    ctx.save();
    var gr = ctx.createRadialGradient(px, p.y, R * 0.55, px, p.y, R);
    gr.addColorStop(0, 'rgba(2,6,22,0)'); gr.addColorStop(1, 'rgba(2,6,22,0.94)');
    ctx.fillStyle = gr; ctx.fillRect(0, BAL.waterY - 6, this.viewW, H);
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
      if (m.y < BAL.waterY + 10) { m.y = H; m.x = Math.random() * this.viewW; }
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
    if (bg) { this.drawFarBg(ctx, bg, 0); this.drawWaterLine(ctx, fake); }
    else { this.drawSky(ctx, wd, fake); this.drawWater(ctx, wd, fake); }
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
    if (this.shakeT > 0) { this.shakeT -= dt; var sh = this.shake * (this.shakeT / 0.3); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh); }
    if (!sim || game.mode !== 'game') { this.glowLine = 0; this.drawIdle(ctx); return; }
    var wd = sim.wdef, i, list, cam = sim.cam.x, VW = this.viewW;
    this.cam = cam;
    this.glowLine = sim.jumpEligible() ? 1 : 0;
    var bg = OE.Assets.get('BG_W' + wd.n + '_Back');
    if (bg) { this.drawFarBg(ctx, bg, cam); this.drawWaterLine(ctx, sim); }
    else { this.drawSky(ctx, wd, sim); this.drawWater(ctx, wd, sim); }
    ctx.save(); ctx.translate(-cam, 0);                        // world space from here
    this.drawZonesBack(ctx, sim);
    this.drawObstacles(ctx, sim, false);
    this.drawPickups(ctx, sim);
    list = sim.creatures.slice().sort(function (a, b) { return b.len - a.len; });
    for (i = 0; i < list.length; i++) { if (this.onScreen(list[i], cam, VW) && (list[i].boss || list[i].def.ai === 'cruise')) this.drawCreature(ctx, list[i], sim); }
    for (i = 0; i < list.length; i++) { if (this.onScreen(list[i], cam, VW) && !(list[i].boss || list[i].def.ai === 'cruise')) this.drawCreature(ctx, list[i], sim); }
    for (i = 0; i < sim.surface.length; i++) this.drawSurface(ctx, sim.surface[i], sim);
    this.drawPlayer(ctx, sim);
    this.drawObstacles(ctx, sim, true);
    this.drawZonesFront(ctx, sim);
    this.drawObjs(ctx, sim);
    this.drawFx(ctx, dt);
    ctx.restore();
    this.ambient(ctx, sim, dt);
    this.drawDark(ctx, sim);
    // global current direction hint (W4/W5)
    if (sim.drift) { ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (i = 0; i < 6; i++) { var yy = 420 + i * 100, x0 = wrap(this.t * 160 * sim.driftDir + i * 230, VW + 200) - 100; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + 70 * sim.driftDir, yy); ctx.stroke(); } ctx.restore(); }
  };
  P.onScreen = function (c, cam, VW) { return c.x + c.len > cam - 200 && c.x - c.len < cam + VW + 200; };
  P.glowLineOnly = function (ctx, sim) {
    if (!this.glowLine) return;
    ctx.beginPath(); ctx.moveTo(0, sim.waterY); ctx.lineTo(this.viewW, sim.waterY); ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,255,140,0.5)'; ctx.stroke();
  };
})(typeof window !== 'undefined' ? window : globalThis);
