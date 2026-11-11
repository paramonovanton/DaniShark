/* Ocean Evolution - procedural cartoon art (Canvas 2D). Every sprite is drawn in a local frame: body length L along +x
   (head at +x), origin at the body centre. When OE.Assets has a PNG for the art id it is drawn instead (same frame). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var OUT = 'rgba(8,26,56,0.88)';
  var TAU = Math.PI * 2;

  function hex(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  function shade(c, a) {
    if (c.charAt(0) !== '#') return c;
    var v = hex(c), i;
    for (i = 0; i < 3; i++) v[i] = Math.max(0, Math.min(255, Math.round(v[i] + a * 2.55)));
    return 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')';
  }
  function grad(ctx, c1, c2, h) {
    var gr = ctx.createLinearGradient(0, -h, 0, h);
    gr.addColorStop(0, shade(c1, -6)); gr.addColorStop(0.55, c1); gr.addColorStop(0.62, c2); gr.addColorStop(1, shade(c2, -8));
    return gr;
  }
  function stroke(ctx, L, w) { ctx.lineWidth = Math.max(1.5, L * (w || 0.022)); ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function eye(ctx, x, y, r, red, look) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.25); ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.arc(x + r * 0.25, y, r * 0.55, 0, TAU); ctx.fillStyle = red ? '#ff2a2a' : '#111b33'; ctx.fill();
    if (!red) { ctx.beginPath(); ctx.arc(x + r * 0.4, y - r * 0.2, r * 0.2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
  }
  function mouthLine(ctx, L, x, y, open, w) {
    ctx.beginPath();
    if (open > 0) { ctx.moveTo(x, y - L * 0.03 * open * 2); ctx.lineTo(x - w * L, y); ctx.lineTo(x, y + L * 0.05 * open * 2); ctx.closePath(); ctx.fillStyle = '#5b0f1f'; ctx.fill(); }
    else { ctx.moveTo(x, y); ctx.quadraticCurveTo(x - w * L * 0.5, y + L * 0.02, x - w * L, y - L * 0.005); stroke(ctx, L, 0.014); }
  }
  function teeth(ctx, L, x, y, n, sz, up) {
    ctx.fillStyle = '#fff';
    for (var i = 0; i < n; i++) { ctx.beginPath(); var tx = x - i * sz * 1.2; ctx.moveTo(tx, y); ctx.lineTo(tx - sz * 0.5, y + (up ? -sz : sz)); ctx.lineTo(tx - sz, y); ctx.closePath(); ctx.fill(); }
  }

  /* ---------------------------------------------------------------- shapes */
  var S = {};
  S.fish = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = asp * L * 0.5;
    ctx.save(); ctx.translate(-0.36 * L, 0); ctx.rotate(w * 0.35);
    ctx.beginPath(); ctx.moveTo(0.04 * L, 0); ctx.lineTo(-0.2 * L, -h * 1.0); ctx.quadraticCurveTo(-0.12 * L, 0, -0.2 * L, h * 1.0); ctx.closePath();
    ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.12 * L, -h * 0.8); ctx.quadraticCurveTo(0.02 * L, -h * (d.spiky ? 2.0 : 1.5), 0.18 * L, -h * 0.85); ctx.closePath();
    ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L);
    if (d.spiky) { ctx.strokeStyle = '#7a1b17'; ctx.lineWidth = Math.max(1.5, L * 0.012); for (var k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(-0.1 * L + k * 0.05 * L, -h * 0.8); ctx.lineTo(-0.16 * L + k * 0.06 * L, -h * 1.9); ctx.stroke(); } }
    ctx.beginPath(); ctx.ellipse(0.03 * L, 0, 0.43 * L, h, 0, 0, TAU);
    ctx.fillStyle = grad(ctx, c1, c2, h); ctx.fill(); stroke(ctx, L);
    if (d.stripes) { ctx.save(); ctx.clip(); ctx.fillStyle = '#fff'; [-0.12, 0.08, 0.26].forEach(function (x) { ctx.fillRect(x * L, -h, 0.07 * L, 2 * h); }); ctx.restore(); ctx.beginPath(); ctx.ellipse(0.03 * L, 0, 0.43 * L, h, 0, 0, TAU); stroke(ctx, L); }
    if (d.heavy) { ctx.fillStyle = 'rgba(70,30,10,0.35)'; for (var s = 0; s < 6; s++) { ctx.beginPath(); ctx.arc(-0.15 * L + s * 0.07 * L, -h * 0.25 + (s % 2) * h * 0.4, L * 0.02, 0, TAU); ctx.fill(); } }
    if (d.glow) { ctx.fillStyle = 'rgba(255,255,200,0.9)'; for (var q = 0; q < 5; q++) { ctx.beginPath(); ctx.arc(-0.15 * L + q * 0.08 * L, h * 0.55, L * 0.014, 0, TAU); ctx.fill(); } }
    // pectoral fin
    ctx.beginPath(); ctx.moveTo(0.1 * L, h * 0.25); ctx.quadraticCurveTo(-0.02 * L, h * 0.9 + w * 0.05 * L, -0.08 * L, h * 0.4); ctx.closePath(); ctx.fillStyle = shade(c1, -10); ctx.fill(); stroke(ctx, L, 0.014);
    mouthLine(ctx, L, 0.45 * L, h * 0.15, mo, 0.09);
    if (d.fangs || o.red) teeth(ctx, L, 0.45 * L, h * 0.2, 3, L * 0.03, false);
    eye(ctx, 0.27 * L, -h * 0.2, Math.max(2.5, h * 0.3), o.red);
  };
  S.sunfish = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.42;
    ctx.beginPath(); ctx.moveTo(-0.15 * L, -h * 0.5); ctx.quadraticCurveTo(-0.2 * L, -h * 1.3, -0.05 * L, -h * 1.15); ctx.quadraticCurveTo(0, -h * 0.9, 0.05 * L, -h * 0.7); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(-0.15 * L, h * 0.5); ctx.quadraticCurveTo(-0.2 * L, h * 1.3, -0.05 * L, h * 1.15); ctx.quadraticCurveTo(0, h * 0.9, 0.05 * L, h * 0.7); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.42 * L, h, 0, 0, TAU); ctx.fillStyle = grad(ctx, c1, c2, h); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(-0.4 * L, -h * 0.4); ctx.quadraticCurveTo(-0.55 * L + w * 6, 0, -0.4 * L, h * 0.4); ctx.fillStyle = shade(c1, -15); ctx.fill(); stroke(ctx, L, 0.014);
    mouthLine(ctx, L, 0.4 * L, h * 0.1, mo, 0.06); eye(ctx, 0.25 * L, -h * 0.15, L * 0.045, o.red);
  };
  S.puff = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var r = L * 0.36 * (o.inflated ? 1 : 1);
    ctx.save(); ctx.translate(-0.34 * L, 0); ctx.rotate(w * 0.4);
    ctx.beginPath(); ctx.moveTo(0.05 * L, 0); ctx.lineTo(-0.12 * L, -r * 0.5); ctx.lineTo(-0.12 * L, r * 0.5); ctx.closePath(); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L); ctx.restore();
    if (o.inflated) { ctx.strokeStyle = '#a0561c'; ctx.lineWidth = Math.max(2, L * 0.016); for (var i = 0; i < 16; i++) { var a = i / 16 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); ctx.stroke(); } }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = grad(ctx, o.inflated ? '#f2a63a' : c1, c2, r); ctx.fill(); stroke(ctx, L);
    ctx.fillStyle = 'rgba(120,80,20,0.4)'; for (var s = 0; s < 6; s++) { ctx.beginPath(); ctx.arc(-0.12 * L + s * 0.06 * L, -r * 0.35 + (s % 2) * r * 0.3, L * 0.015, 0, TAU); ctx.fill(); }
    eye(ctx, 0.17 * L, -r * 0.2, r * 0.26, o.inflated); mouthLine(ctx, L, 0.33 * L, r * 0.2, o.inflated ? 1 : 0, 0.08);
  };
  S.shark = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.17;
    ctx.save(); ctx.translate(-0.4 * L, 0); ctx.rotate(w * 0.22);
    ctx.beginPath(); ctx.moveTo(0.06 * L, 0); ctx.quadraticCurveTo(-0.08 * L, -h * 0.7, -0.2 * L, -h * 2.0); ctx.quadraticCurveTo(-0.14 * L, -h * 0.2, -0.16 * L, 0); ctx.quadraticCurveTo(-0.14 * L, h * 0.2, -0.1 * L, h * 1.2); ctx.quadraticCurveTo(-0.04 * L, h * 0.5, 0.06 * L, 0);
    ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.14 * L, -h * 0.9); ctx.lineTo(-0.02 * L, -h * 2.6); ctx.lineTo(0.12 * L, -h * 0.95); ctx.closePath(); ctx.fillStyle = shade(c1, -10); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(-0.45 * L, 0); ctx.bezierCurveTo(-0.3 * L, -h * 1.35, 0.2 * L, -h * 1.3, 0.5 * L, h * 0.05); ctx.bezierCurveTo(0.3 * L, h * 1.2, -0.2 * L, h * 1.2, -0.45 * L, 0); ctx.closePath();
    ctx.fillStyle = grad(ctx, c1, c2, h * 1.2); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(0.1 * L, h * 0.7); ctx.lineTo(-0.1 * L, h * 2.0 + w * 0.04 * L); ctx.lineTo(-0.06 * L, h * 0.8); ctx.closePath(); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L, 0.014);
    ctx.strokeStyle = 'rgba(8,26,56,0.35)'; ctx.lineWidth = Math.max(1, L * 0.008); for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0.2 * L + i * 0.03 * L, -h * 0.4); ctx.lineTo(0.19 * L + i * 0.03 * L, h * 0.3); ctx.stroke(); }
    if (d.scar) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = L * 0.012; ctx.beginPath(); ctx.moveTo(0.0, -h * 0.9); ctx.lineTo(0.08 * L, -h * 0.1); ctx.stroke(); }
    mouthLine(ctx, L, 0.46 * L, h * 0.4, mo, 0.18);
    if (mo > 0 || o.red || d.teeth) { teeth(ctx, L, 0.45 * L, h * 0.38, 5, L * 0.025, true); }
    eye(ctx, 0.33 * L, -h * 0.2, Math.max(3, h * 0.28), o.red);
  };
  S.hammer = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    S.shark(ctx, L * 0.92, asp, c1, c2, w, mo, d, { red: false });
    var h = L * 0.17;
    ctx.beginPath(); ctx.moveTo(0.36 * L, -h * 0.9); ctx.lineTo(0.5 * L, -h * 1.6); ctx.lineTo(0.5 * L, h * 1.6); ctx.lineTo(0.36 * L, h * 0.9); ctx.closePath();
    ctx.fillStyle = grad(ctx, c1, c2, h * 1.2); ctx.fill(); stroke(ctx, L);
    eye(ctx, 0.46 * L, -h * 1.4, Math.max(3, h * 0.22), o.red); eye(ctx, 0.46 * L, h * 1.4, Math.max(3, h * 0.22), o.red);
  };
  S.dolphin = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.16;
    ctx.save(); ctx.translate(-0.4 * L, 0); ctx.rotate(w * 0.28);
    ctx.beginPath(); ctx.moveTo(0.06 * L, 0); ctx.quadraticCurveTo(-0.06 * L, -h * 0.4, -0.16 * L, -h * 1.5); ctx.quadraticCurveTo(-0.1 * L, 0, -0.16 * L, h * 1.5); ctx.quadraticCurveTo(-0.06 * L, h * 0.4, 0.06 * L, 0);
    ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.08 * L, -h * 1.0); ctx.lineTo(0.0, -h * 2.4); ctx.lineTo(0.1 * L, -h * 1.0); ctx.closePath(); ctx.fillStyle = shade(c1, -10); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(-0.45 * L, 0); ctx.bezierCurveTo(-0.3 * L, -h * 1.5, 0.15 * L, -h * 1.6, 0.34 * L, -h * 0.5); ctx.lineTo(0.5 * L, -h * 0.1); ctx.lineTo(0.34 * L, h * 0.2); ctx.bezierCurveTo(0.2 * L, h * 1.4, -0.25 * L, h * 1.3, -0.45 * L, 0); ctx.closePath();
    ctx.fillStyle = grad(ctx, c1, c2, h * 1.4); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(0.08 * L, h * 0.6); ctx.lineTo(-0.08 * L, h * 1.9 + w * 0.03 * L); ctx.lineTo(-0.04 * L, h * 0.7); ctx.closePath(); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L, 0.014);
    mouthLine(ctx, L, 0.49 * L, h * 0.08, mo, 0.12);
    eye(ctx, 0.27 * L, -h * 0.35, Math.max(3, h * 0.26), o.red);
  };
  S.whale = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.2;
    ctx.save(); ctx.translate(-0.4 * L, 0); ctx.rotate(w * 0.18);
    ctx.beginPath(); ctx.moveTo(0.06 * L, -h * 0.2); ctx.quadraticCurveTo(-0.08 * L, -h * 0.4, -0.14 * L, -h * 1.6); ctx.quadraticCurveTo(-0.04 * L, -h * 0.9, 0, -h * 0.1); ctx.quadraticCurveTo(-0.04 * L, h * 0.9, -0.14 * L, h * 1.6); ctx.quadraticCurveTo(-0.08 * L, h * 0.4, 0.06 * L, h * 0.2);
    ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L); ctx.restore();
    if (d.orca) { ctx.beginPath(); ctx.moveTo(-0.1 * L, -h * 1.0); ctx.lineTo(0.0, -h * 3.0); ctx.lineTo(0.1 * L, -h * 1.0); ctx.closePath(); ctx.fillStyle = shade(c1, -10); ctx.fill(); stroke(ctx, L); }
    ctx.beginPath(); ctx.moveTo(-0.46 * L, 0);
    ctx.bezierCurveTo(-0.3 * L, -h * 1.2, 0.2 * L, -h * 1.4, d.bluntHead ? 0.52 * L : 0.5 * L, -h * 0.3);
    ctx.lineTo(d.bluntHead ? 0.52 * L : 0.5 * L, h * 0.35);
    ctx.bezierCurveTo(0.2 * L, h * 1.3, -0.3 * L, h * 1.2, -0.46 * L, 0); ctx.closePath();
    ctx.fillStyle = d.orca ? (function () { var gr = ctx.createLinearGradient(0, -h, 0, h); gr.addColorStop(0, c1); gr.addColorStop(0.55, c1); gr.addColorStop(0.6, '#fff'); gr.addColorStop(1, '#e8eef5'); return gr; })() : grad(ctx, c1, c2, h * 1.2);
    ctx.fill(); stroke(ctx, L);
    if (d.orca) { ctx.beginPath(); ctx.ellipse(0.2 * L, -h * 0.55, L * 0.06, h * 0.22, -0.2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
    if (d.bluntHead) { ctx.strokeStyle = 'rgba(8,26,56,0.3)'; ctx.lineWidth = L * 0.008; for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-0.2 * L + i * 0.12 * L, -h * 0.9); ctx.quadraticCurveTo(-0.2 * L + i * 0.12 * L + 0.02 * L, 0, -0.2 * L + i * 0.12 * L, h * 0.9); ctx.stroke(); } }
    ctx.beginPath(); ctx.moveTo(0.05 * L, h * 0.6); ctx.quadraticCurveTo(-0.08 * L, h * 2.0 + w * 0.05 * L, -0.14 * L, h * 1.2); ctx.quadraticCurveTo(-0.06 * L, h * 0.8, 0.05 * L, h * 0.6); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L, 0.014);
    mouthLine(ctx, L, 0.5 * L, h * 0.2, mo, 0.2);
    if (mo > 0 || o.red) teeth(ctx, L, 0.49 * L, h * 0.2, 6, L * 0.025, true);
    eye(ctx, 0.36 * L, -h * 0.1, Math.max(3, h * 0.17), o.red);
  };
  S.eel = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var n = 14, i, pts = [], th = L * asp * 0.5;
    for (i = 0; i <= n; i++) { var f = i / n, x = 0.5 * L - f * L, y = Math.sin(f * 7 - w * 1.6 - (o.t || 0) * 0) * L * 0.05 * (0.4 + f); pts.push([x, y, th * (f < 0.08 ? 0.9 + f * 2 : 1 - f * 0.8)]); }
    for (i = n; i >= 0; i--) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], pts[i][2] + L * 0.012, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); }
    for (i = n; i >= 0; i--) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], pts[i][2], 0, TAU); ctx.fillStyle = (i % 2 ? shade(c1, -5) : c1); ctx.fill(); }
    ctx.fillStyle = c2; for (i = 1; i < n; i += 2) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] + pts[i][2] * 0.4, pts[i][2] * 0.5, 0, TAU); ctx.fill(); }
    if (d.id === 'eel' || (o.state === 'tele' || o.state === 'shock')) { ctx.strokeStyle = o.state === 'tele' || o.state === 'shock' ? '#fff36b' : 'rgba(255,243,107,0.6)'; ctx.lineWidth = L * 0.01; for (i = 2; i < n; i += 3) { ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1] - pts[i][2] * 1.4); ctx.lineTo(pts[i][0] + L * 0.02, pts[i][1] - pts[i][2] * 2.4); ctx.lineTo(pts[i][0] - L * 0.01, pts[i][1] - pts[i][2] * 3.3); ctx.stroke(); } }
    var hx = pts[0][0], hy = pts[0][1];
    if (d.id === 'gulper') { ctx.beginPath(); ctx.arc(hx, hy, th * 1.9, -0.9, 0.9); ctx.lineTo(hx, hy); ctx.closePath(); ctx.fillStyle = '#5b0f1f'; ctx.fill(); stroke(ctx, L, 0.012); }
    eye(ctx, hx - th * 0.2, hy - th * 0.35, Math.max(2.5, th * 0.45), o.red);
    if (mo > 0 || o.red) teeth(ctx, L, hx + th * 0.8, hy + th * 0.4, 3, th * 0.45, true);
  };
  S.ray = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.33, f = w * 0.18;
    ctx.beginPath(); ctx.moveTo(0.5 * L, 0); ctx.quadraticCurveTo(0.2 * L, -h * (1.1 + f), -0.2 * L, -h * (1.0 + f)); ctx.quadraticCurveTo(-0.1 * L, -h * 0.2, -0.3 * L, 0); ctx.quadraticCurveTo(-0.1 * L, h * 0.2, -0.2 * L, h * (1.0 + f)); ctx.quadraticCurveTo(0.2 * L, h * (1.1 + f), 0.5 * L, 0); ctx.closePath();
    ctx.fillStyle = grad(ctx, c1, c2, h); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(-0.3 * L, 0); ctx.quadraticCurveTo(-0.5 * L, w * 0.04 * L, -0.7 * L, 0); ctx.lineWidth = Math.max(2, L * 0.025); ctx.strokeStyle = OUT; ctx.stroke();
    if (d.tail || d.id === 'stingray') { ctx.beginPath(); ctx.moveTo(-0.6 * L, 0); ctx.lineTo(-0.72 * L, -L * 0.03); ctx.lineTo(-0.7 * L, L * 0.03); ctx.closePath(); ctx.fillStyle = '#c33'; ctx.fill(); }
    eye(ctx, 0.3 * L, -h * 0.22, Math.max(2.5, L * 0.035), o.red);
  };
  S.squid = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.22, i;
    ctx.strokeStyle = shade(c1, -10); ctx.lineWidth = Math.max(2, L * 0.035); ctx.lineCap = 'round';
    for (i = 0; i < 6; i++) { var y = (i - 2.5) * h * 0.32; ctx.beginPath(); ctx.moveTo(0.1 * L, y * 0.6); ctx.bezierCurveTo(-0.1 * L, y + Math.sin(w * 2 + i) * h * 0.4, -0.3 * L, y * 1.5 - Math.sin(w * 2 + i) * h * 0.5, -0.45 * L, y * 1.8); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0.46 * L, 0); ctx.bezierCurveTo(0.3 * L, -h * 1.2, -0.1 * L, -h * 1.1, -0.2 * L, 0); ctx.bezierCurveTo(-0.1 * L, h * 1.1, 0.3 * L, h * 1.2, 0.46 * L, 0); ctx.closePath();
    ctx.fillStyle = grad(ctx, c1, c2, h); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(0.0, -h * 0.9); ctx.lineTo(-0.2 * L, -h * 1.6); ctx.lineTo(-0.28 * L, 0); ctx.lineTo(-0.2 * L, h * 1.6); ctx.lineTo(0.0, h * 0.9); ctx.closePath(); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L, 0.014);
    ctx.beginPath(); ctx.ellipse(0.0, 0, 0.3 * L, h, 0, 0, TAU); ctx.fillStyle = grad(ctx, c1, c2, h); ctx.fill(); stroke(ctx, L);
    eye(ctx, 0.28 * L, -h * 0.2, Math.max(3, h * 0.32), o.red);
    if (d.id === 'giantsquid' || d.id === 'giantsquid7') { ctx.fillStyle = 'rgba(255,255,255,0.25)'; for (i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-0.1 * L + i * 0.07 * L, h * 0.3, L * 0.012, 0, TAU); ctx.fill(); } }
  };
  S.jelly = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var r = L * 0.4, i, pulse = 1 + Math.sin((o.t || 0) * 3) * 0.06;
    ctx.save(); ctx.rotate(-Math.PI / 2);          // dome up
    ctx.strokeStyle = c1; ctx.lineWidth = Math.max(2, L * 0.03); ctx.lineCap = 'round';
    for (i = 0; i < 6; i++) { var x = (i - 2.5) * r * 0.32; ctx.beginPath(); ctx.moveTo(0.0 + 0, x); ctx.bezierCurveTo(-r * 0.4, x + Math.sin(w * 2 + i) * r * 0.2, -r * 0.7, x - Math.sin(w * 2 + i) * r * 0.2, -r * 1.2, x + Math.sin(w * 2 + i * 2) * r * 0.2); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-r * 0.9, 0); ctx.bezierCurveTo(-r * 0.9, -r * 1.3 * pulse, r * 0.9, -r * 1.3 * pulse, r * 0.9, 0); ctx.quadraticCurveTo(r * 0.45, r * 0.25, 0, 0); ctx.quadraticCurveTo(-r * 0.45, r * 0.25, -r * 0.9, 0);
    var gr = ctx.createLinearGradient(0, -r, 0, r * 0.3); gr.addColorStop(0, c2); gr.addColorStop(1, c1);
    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.92; ctx.fillStyle = gr; ctx.fill(); stroke(ctx, L); ctx.globalAlpha = 1;
    eye(ctx, -r * 0.3, -r * 0.35, r * 0.13, o.hazard); eye(ctx, r * 0.3, -r * 0.35, r * 0.13, o.hazard);
  };
  S.crab = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.26, i;
    ctx.strokeStyle = shade(c1, -15); ctx.lineWidth = Math.max(2, L * 0.04); ctx.lineCap = 'round';
    for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.15 * L + i * 0.12 * L, h * 0.6); ctx.lineTo(-0.25 * L + i * 0.14 * L, h * 1.5 + Math.sin(w * 3 + i) * 3); ctx.stroke(); }
    var snap = o.snap ? 1 : 0, cl = snap ? 0.4 : 0.1;
    [-1, 1].forEach(function (sgn) {
      ctx.save(); ctx.translate(0.38 * L, sgn * h * 0.4); ctx.rotate(sgn * -0.3 - cl * sgn);
      ctx.beginPath(); ctx.ellipse(0.08 * L, 0, 0.14 * L, h * 0.38, 0, 0, TAU); ctx.fillStyle = c1; ctx.fill(); stroke(ctx, L, 0.018);
      ctx.beginPath(); ctx.moveTo(0.16 * L, 0); ctx.lineTo(0.3 * L, -h * 0.2 * (1 + snap)); ctx.lineTo(0.3 * L, h * 0.2 * (1 + snap)); ctx.closePath(); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L, 0.018); ctx.restore();
    });
    ctx.beginPath(); ctx.ellipse(0, 0, 0.36 * L, h, 0, 0, TAU); ctx.fillStyle = grad(ctx, c1, c2, h); ctx.fill(); stroke(ctx, L);
    eye(ctx, 0.18 * L, -h * 0.7, L * 0.05, o.red || d.snap); eye(ctx, 0.3 * L, -h * 0.5, L * 0.05, o.red || d.snap);
  };
  S.turtle = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.3, ret = o.retract ? 0.55 : 1;
    ctx.beginPath(); ctx.ellipse(0.38 * L * ret, h * 0.05, 0.13 * L * ret, 0.1 * L, 0, 0, TAU); ctx.fillStyle = c2; ctx.fill(); stroke(ctx, L);
    [[0.15, 1], [-0.2, 1]].forEach(function (f) { ctx.save(); ctx.translate(f[0] * L, h * 0.6); ctx.rotate(0.5 + w * 0.5); ctx.beginPath(); ctx.ellipse(0, 0.07 * L, 0.05 * L, 0.14 * L, 0, 0, TAU); ctx.fillStyle = c2; ctx.fill(); stroke(ctx, L, 0.016); ctx.restore(); });
    ctx.beginPath(); ctx.moveTo(-0.42 * L, 0); ctx.bezierCurveTo(-0.4 * L, -h * 1.8, 0.36 * L, -h * 1.8, 0.38 * L, 0); ctx.closePath(); ctx.fillStyle = c1; ctx.fill(); stroke(ctx, L);
    ctx.strokeStyle = shade(c1, -22); ctx.lineWidth = Math.max(1.5, L * 0.014);
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 0.18 * L, -h * 0.1); ctx.lineTo(i * 0.15 * L, -h * 1.25); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-0.35 * L, -h * 0.55); ctx.lineTo(0.33 * L, -h * 0.55); ctx.stroke();
    eye(ctx, 0.42 * L * ret, -h * 0.05, L * 0.03, o.red);
  };
  S.angler = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var r = L * 0.34, g = d.glow || 0.7;
    ctx.save(); ctx.translate(-0.4 * L, 0); ctx.rotate(w * 0.3); ctx.beginPath(); ctx.moveTo(0.08 * L, 0); ctx.lineTo(-0.16 * L, -r * 0.6); ctx.lineTo(-0.16 * L, r * 0.6); ctx.closePath(); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L); ctx.restore();
    ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(2, L * 0.02); ctx.beginPath(); ctx.moveTo(0.15 * L, -r * 0.8); ctx.quadraticCurveTo(0.35 * L, -r * 1.9, 0.5 * L, -r * 1.2); ctx.stroke();
    var gl = ctx.createRadialGradient(0.5 * L, -r * 1.2, 0, 0.5 * L, -r * 1.2, L * 0.16); gl.addColorStop(0, 'rgba(255,240,150,0.95)'); gl.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0.5 * L, -r * 1.2, L * 0.16, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0.5 * L, -r * 1.2, L * 0.04, 0, TAU); ctx.fillStyle = c2; ctx.fill(); stroke(ctx, L, 0.012);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.4 * L, r, 0, 0, TAU); ctx.fillStyle = grad(ctx, c1, shade(c1, 12), r); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.moveTo(0.38 * L, -r * 0.1); ctx.quadraticCurveTo(0.2 * L, r * 0.9, -0.05 * L, r * 0.45); ctx.lineTo(0.2 * L, 0); ctx.closePath(); ctx.fillStyle = '#4a0f20'; ctx.fill(); stroke(ctx, L, 0.014);
    teeth(ctx, L, 0.36 * L, -r * 0.05, 5, L * 0.035, false); teeth(ctx, L, 0.3 * L, r * 0.55, 4, L * 0.03, true);
    eye(ctx, 0.25 * L, -r * 0.45, L * 0.055, o.red || true);
  };
  S.sub = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.2;
    ctx.save(); ctx.translate(-0.46 * L, 0); ctx.rotate(w * 2); ctx.fillStyle = '#444'; ctx.fillRect(-0.02 * L, -h * 0.5, 0.04 * L, h); ctx.restore();
    ctx.beginPath(); ctx.rect(-0.05 * L, -h * 1.55, 0.04 * L, h * 0.8); ctx.rect(-0.05 * L, -h * 1.55, 0.14 * L, 0.04 * L); ctx.fillStyle = shade(c1, -15); ctx.fill(); stroke(ctx, L, 0.014);
    ctx.beginPath(); ctx.moveTo(-0.2 * L, -h * 0.9); ctx.lineTo(0.08 * L, -h * 0.9); ctx.lineTo(0.12 * L, -h * 0.2); ctx.lineTo(-0.2 * L, -h * 0.2); ctx.closePath(); ctx.fillStyle = shade(c1, -8); ctx.fill(); stroke(ctx, L, 0.016);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.5 * L, h, 0, 0, TAU); ctx.fillStyle = grad(ctx, c1, shade(c1, -15), h); ctx.fill(); stroke(ctx, L);
    for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-0.18 * L + i * 0.18 * L, -h * 0.1, h * 0.26, 0, TAU); ctx.fillStyle = (o.red ? '#ff4a3a' : c2); ctx.fill(); stroke(ctx, L, 0.014); }
    ctx.strokeStyle = shade(c1, -28); ctx.lineWidth = L * 0.01; ctx.beginPath(); ctx.moveTo(0.3 * L, -h * 0.6); ctx.lineTo(0.3 * L, h * 0.6); ctx.stroke();
    if (o.ping) { ctx.strokeStyle = 'rgba(180,255,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0.5 * L, 0, L * 0.12 + (o.ping % 1) * L * 0.2, -0.8, 0.8); ctx.stroke(); }
  };
  S.ammonite = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var r = L * 0.4, i;
    ctx.strokeStyle = shade(c2, -10); ctx.lineWidth = Math.max(2, L * 0.03); ctx.lineCap = 'round';
    for (i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.8); ctx.quadraticCurveTo(-r * 0.4 - i * 0.04 * L, r * 1.3 + Math.sin(w * 2 + i) * 4, -r * 0.4 + i * 0.1 * L - 0.1 * L, r * 1.6); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = c1; ctx.fill(); stroke(ctx, L);
    ctx.strokeStyle = shade(c1, -28); ctx.lineWidth = Math.max(1.5, L * 0.018);
    ctx.beginPath(); for (i = 0; i < 60; i++) { var a = i / 60 * 3.2 * TAU, rr = r * (0.95 - i / 60 * 0.9); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 0.55, r * 0.55, r * 0.35, 0, TAU); ctx.fillStyle = c2; ctx.fill(); stroke(ctx, L, 0.014); eye(ctx, r * 0.62, r * 0.5, L * 0.04, o.red);
  };
  S.plesio = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.14, neck = d.longNeck ? 1.35 : 1.0, i;
    ctx.save(); ctx.translate(-0.46 * L, 0); ctx.rotate(w * 0.2); ctx.beginPath(); ctx.moveTo(0.08 * L, -h * 0.3); ctx.quadraticCurveTo(-0.14 * L, 0, -0.22 * L, h * 0.3); ctx.quadraticCurveTo(-0.1 * L, h * 0.4, 0.08 * L, h * 0.3); ctx.fillStyle = shade(c1, -12); ctx.fill(); stroke(ctx, L); ctx.restore();
    [[0.18, 1], [-0.22, 1]].forEach(function (f, k) { ctx.save(); ctx.translate(f[0] * L, h * 0.8); ctx.rotate(0.4 + Math.sin(w * 1.2 + k) * 0.5); ctx.beginPath(); ctx.ellipse(0.04 * L, 0, 0.12 * L, 0.04 * L, 0, 0, TAU); ctx.fillStyle = shade(c1, -8); ctx.fill(); stroke(ctx, L, 0.016); ctx.restore(); });
    ctx.beginPath(); ctx.moveTo(0.25 * L, -h * 0.4); ctx.bezierCurveTo(0.35 * L, -h * 2 * neck, 0.4 * L, -h * 3.2 * neck, 0.46 * L, -h * 3.4 * neck); ctx.lineTo(0.5 * L, -h * 3.4 * neck + h * 0.5); ctx.bezierCurveTo(0.42 * L, -h * 2.4 * neck, 0.38 * L, -h * 1.2 * neck, 0.28 * L, h * 0.3); ctx.closePath(); ctx.fillStyle = c1; ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.ellipse(0.02 * L, 0, 0.3 * L, h * 1.1, 0, 0, TAU); ctx.fillStyle = grad(ctx, c1, c2, h * 1.1); ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.ellipse(0.52 * L, -h * 3.3 * neck, 0.07 * L, 0.035 * L, 0, 0, TAU); ctx.fillStyle = c1; ctx.fill(); stroke(ctx, L, 0.016);
    eye(ctx, 0.52 * L, -h * 3.45 * neck, L * 0.014, o.red);
    if (mo > 0 || o.red) teeth(ctx, L, 0.58 * L, -h * 3.2 * neck, 3, L * 0.012, true);
  };
  S.dunkle = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    S.fish(ctx, L, 0.55, c1, c2, w, mo, { fangs: 0 }, { red: false });
    ctx.beginPath(); ctx.moveTo(0.05 * L, -L * 0.25); ctx.quadraticCurveTo(0.35 * L, -L * 0.3, 0.46 * L, -L * 0.05); ctx.lineTo(0.46 * L, L * 0.18); ctx.lineTo(0.05 * L, L * 0.2); ctx.closePath();
    ctx.fillStyle = shade(c1, -22); ctx.fill(); stroke(ctx, L);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = L * 0.01; ctx.beginPath(); ctx.moveTo(0.12 * L, -L * 0.2); ctx.lineTo(0.3 * L, -L * 0.15); ctx.stroke();
    teeth(ctx, L, 0.45 * L, L * 0.12, 3, L * 0.03, true); eye(ctx, 0.28 * L, -L * 0.08, L * 0.04, o.red);
  };
  S.mosa = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var h = L * 0.1, i, pts = [], n = 12;
    for (i = 0; i <= n; i++) { var f = i / n; pts.push([0.4 * L - f * 0.9 * L, Math.sin(f * 6 - w * 1.4) * L * 0.04 * f, h * (f < 0.15 ? 0.9 + f * 2 : 1.4 - f * 1.3)]); }
    for (i = n; i >= 0; i--) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], Math.max(2, pts[i][2]) + L * 0.012, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); }
    for (i = n; i >= 0; i--) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], Math.max(2, pts[i][2]), 0, TAU); ctx.fillStyle = (i % 2 ? c1 : shade(c1, 5)); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-0.5 * L, pts[n][1]); ctx.lineTo(-0.62 * L, pts[n][1] - h * 1.6); ctx.lineTo(-0.58 * L, pts[n][1] + h * 1.6); ctx.closePath(); ctx.fillStyle = shade(c1, -10); ctx.fill(); stroke(ctx, L, 0.014);
    ctx.beginPath(); ctx.moveTo(0.52 * L, -h * 0.2); ctx.lineTo(0.22 * L, -h * 1.3); ctx.lineTo(0.2 * L, h * 1.0); ctx.lineTo(0.52 * L, h * 0.3); ctx.closePath(); ctx.fillStyle = c1; ctx.fill(); stroke(ctx, L);
    ctx.beginPath(); ctx.ellipse(-0.05 * L, h * 1.1, 0.07 * L, 0.025 * L, 0.5, 0, TAU); ctx.fillStyle = shade(c1, -10); ctx.fill(); stroke(ctx, L, 0.012);
    teeth(ctx, L, 0.5 * L, h * 0.1, 5, L * 0.02, true); eye(ctx, 0.34 * L, -h * 0.6, L * 0.03, o.red);
  };
  S.bloop = function (ctx, L, asp, c1, c2, w, mo, d, o) {
    var r = L * 0.34, i;
    ctx.strokeStyle = shade(c1, 8); ctx.lineWidth = L * 0.04; ctx.lineCap = 'round';
    for (i = 0; i < 7; i++) { var x = (i - 3) * r * 0.45; ctx.beginPath(); ctx.moveTo(x, r * 0.7); ctx.bezierCurveTo(x + Math.sin(w * 1.5 + i) * r * 0.4, r * 1.2, x - Math.sin(w * 1.5 + i) * r * 0.4, r * 1.6, x + Math.sin(w * 1.5 + i * 2) * r * 0.4, r * 1.9); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-r * 1.1, r * 0.8); ctx.bezierCurveTo(-r * 1.3, -r * 1.4, r * 1.3, -r * 1.4, r * 1.1, r * 0.8); ctx.closePath();
    var gr = ctx.createRadialGradient(0, -r * 0.4, r * 0.2, 0, 0, r * 1.4); gr.addColorStop(0, shade(c1, 22)); gr.addColorStop(1, c1);
    ctx.fillStyle = gr; ctx.fill(); stroke(ctx, L, 0.012);
    ctx.fillStyle = c2; for (i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.7) * r * 0.8, Math.sin(i * 2.3) * r * 0.5 - r * 0.2, r * 0.05, 0, TAU); ctx.fill(); }
    [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.arc(s * r * 0.4, -r * 0.2, r * 0.22, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); stroke(ctx, L, 0.01); ctx.beginPath(); ctx.arc(s * r * 0.4 + 6, -r * 0.2, r * 0.1, 0, TAU); ctx.fillStyle = c2; ctx.fill(); });
    ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.3, 0.1, Math.PI - 0.1); ctx.strokeStyle = OUT; ctx.lineWidth = L * 0.012; ctx.stroke();
  };
  S.kraken = function (ctx, L, asp, c1, c2, w, mo, d, o) {          // player form 8
    S.squid(ctx, L, asp, c1, c2, w, mo, d, o);
    ctx.strokeStyle = shade(c1, -10); ctx.lineWidth = L * 0.03; ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.15 * L, (i - 1) * L * 0.07); ctx.bezierCurveTo(-0.4 * L, (i - 1) * L * 0.2 + Math.sin(w * 2 + i) * 14, -0.55 * L, (i - 1) * L * 0.1, -0.7 * L, (i - 1) * L * 0.3 + Math.sin(w * 2 + i) * 20); ctx.stroke(); }
  };

  /* ---------------------------------------------------------------- player forms (art ids PLY_F1..F8) */
  var PLY = [
    null,
    { shape: 'fish', c1: '#ffe03a', c2: '#fff8c8', asp: 0.52, d: { stripes: 0 } },
    { shape: 'fish', c1: '#2fc0ff', c2: '#d6f6ff', asp: 0.46, d: {} },
    { shape: 'shark', c1: '#7ea9cc', c2: '#f0f6fb', asp: 0.34, d: {} },
    { shape: 'shark', c1: '#5a86b3', c2: '#e8f1f8', asp: 0.34, d: { scar: 1, teeth: 1 } },
    { shape: 'whale', c1: '#1f2a3a', c2: '#ffffff', asp: 0.34, d: { orca: 1 } },
    { shape: 'whale', c1: '#4579bd', c2: '#d4e6f8', asp: 0.3, d: {} },
    { shape: 'mosa', c1: '#3eb56c', c2: '#b8f0a0', asp: 0.26, d: {} },
    { shape: 'kraken', c1: '#a04fd8', c2: '#ecc4ff', asp: 0.5, d: {} }
  ];
  var ASPECT = { fish: 0.5, shark: 0.34, hammer: 0.34, dolphin: 0.3, whale: 0.34, eel: 0.2, ray: 0.5, squid: 0.5, jelly: 0.9, crab: 0.6, puff: 0.8, turtle: 0.55, angler: 0.6, sub: 0.4, ammonite: 0.9, plesio: 0.4, dunkle: 0.45, mosa: 0.26, bloop: 0.8, sunfish: 0.9, kraken: 0.5 };

  function image(ctx, img, L, wig, mouth) {
    var H = L * img.height / img.width;
    ctx.save(); ctx.rotate(wig * 0.05); ctx.scale(1 + wig * 0.01, 1 - Math.abs(wig) * 0.02);
    ctx.drawImage(img, -L / 2, -H / 2, L, H);
    ctx.restore();
  }

  var Art = {
    shade: shade,
    // spec: creature def / player form spec; o: {L, t, mouth(0..1), red, alpha, inflated, retract, state, hazard, snap}
    drawShape: function (ctx, shape, spec, o) {
      var fn = S[shape] || S.fish, L = o.L, wig = Math.sin((o.t || 0) * (o.speedAnim || 6));
      var asp = spec.asp || ASPECT[shape] || 0.45;
      fn(ctx, L, asp, spec.c1, spec.c2, wig, o.mouth || 0, spec.d || spec, o);
    },
    // sprite for an art id; the open-mouth variant (id + '_open') while biting / attacking (o.mouth > 0.5) when it exists
    sprite: function (id, mouth) {
      var A = OE.Assets;
      if (mouth > 0.5) { var open = A.get(id + '_open'); if (open) return open; }
      return A.get(id);
    },
    creature: function (ctx, def, o) {
      var img = Art.sprite(def.art, o.mouth);
      if (img) { image(ctx, img, o.L, Math.sin((o.t || 0) * (o.speedAnim || 6)), o.mouth); return; }
      var spec = { c1: def.c1, c2: def.c2, asp: def.asp, d: def };
      Art.drawShape(ctx, def.shape, def, o);
    },
    player: function (ctx, form, o) {
      var img = Art.sprite('PLY_F' + form, o.mouth);
      if (img) { image(ctx, img, o.L, Math.sin((o.t || 0) * (o.speedAnim || 6)), o.mouth); return; }
      var sp = PLY[form];
      var spec = { c1: sp.c1, c2: sp.c2, asp: sp.asp, d: sp.d };
      Art.drawShape(ctx, sp.shape, spec, o);
    },
    playerSpec: function (form) { return PLY[form]; },
    // creature icon for UI chips (small canvas)
    icon: function (canvas, form) {
      var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(w / 2, h / 2);
      var L = Math.min(w * 0.82, h * 1.5);
      if (form === 5 || form === 6 || form === 7) L = w * 0.86;
      Art.player(ctx, form, { L: L, t: 0.5, mouth: 0 });
      ctx.restore();
    }
  };

  /* ---------------------------------------------------------------- surface targets (SRF_*) */
  var SR = {};
  function box(ctx, x, y, w, h, c, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r || 3); else ctx.rect(x, y, w, h); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); }
  function hull(ctx, w, h, c, c2) {
    ctx.beginPath(); ctx.moveTo(-w / 2, -h); ctx.lineTo(w / 2, -h); ctx.quadraticCurveTo(w * 0.42, -h * 0.1, w * 0.3, 0); ctx.lineTo(-w * 0.38, 0); ctx.quadraticCurveTo(-w * 0.5, -h * 0.4, -w / 2, -h); ctx.closePath();
    ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = c2; ctx.fillRect(-w * 0.46, -h * 0.55, w * 0.9, h * 0.14);
  }
  SR.insects = function (ctx, w, h, o) { for (var i = 0; i < 5; i++) { var x = (i - 2) * w * 0.2, y = Math.sin(o.t * 3 + i * 2) * h * 0.3 + (i % 2 ? 8 : -8); ctx.fillStyle = '#233'; ctx.beginPath(); ctx.ellipse(x, y, 5, 3.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(x - 2, y - 5, 6, 3, Math.sin(o.t * 30 + i) * 0.6, 0, TAU); ctx.fill(); } };
  SR.gull = function (ctx, w, h, o) { var f = Math.sin(o.t * 8) * 0.5; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.3, h * 0.2, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.05, 0); ctx.quadraticCurveTo(-w * 0.15, -h * (1 + f), -w * 0.4, -h * (0.5 + f)); ctx.quadraticCurveTo(-w * 0.2, -h * 0.1, w * 0.05, 0); ctx.fillStyle = '#f0f4f8'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * 0.3, -2); ctx.lineTo(w * 0.46, 2); ctx.lineTo(w * 0.3, 5); ctx.fillStyle = '#ffb02e'; ctx.fill(); ctx.stroke(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(w * 0.2, -3, 2.5, 0, TAU); ctx.fill(); };
  SR.dinghy = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.5); hull(ctx, w * 0.9, h * 0.5, '#ff7a3c', '#fff'); ctx.restore(); ctx.beginPath(); ctx.moveTo(0, h * 0.0); ctx.lineTo(0, -h * 0.5); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -h * 0.5); ctx.lineTo(w * 0.28, h * 0.05); ctx.lineTo(0, h * 0.05); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); };
  SR.fishboat = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.5); hull(ctx, w, h * 0.5, '#2f7ed8', '#fff'); ctx.restore(); box(ctx, -w * 0.15, -h * 0.4, w * 0.3, h * 0.4, '#f5f0e0', 4); box(ctx, -w * 0.08, -h * 0.3, w * 0.1, h * 0.15, '#7fd0ff', 2); ctx.beginPath(); ctx.moveTo(w * 0.1, -h * 0.4); ctx.lineTo(w * 0.35, -h * 0.5); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); };
  SR.motorboat = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.5); hull(ctx, w, h * 0.55, '#e83a4a', '#fff'); ctx.restore(); box(ctx, -w * 0.05, -h * 0.3, w * 0.3, h * 0.35, '#c6f0ff', 6); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.5, h * 0.4); ctx.lineTo(-w * 0.8, h * 0.45); ctx.stroke(); };
  SR.trawler = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.62); hull(ctx, w, h * 0.38, '#3a5f8a', '#ffcf3a'); ctx.restore(); box(ctx, -w * 0.3, -h * 0.35, w * 0.32, h * 0.5, '#f0ead8', 4); box(ctx, -w * 0.25, -h * 0.28, w * 0.22, h * 0.14, '#7fd0ff', 2); ctx.beginPath(); ctx.moveTo(w * 0.15, h * 0.2); ctx.lineTo(w * 0.15, -h * 0.55); ctx.lineTo(w * 0.4, h * 0.2); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); };
  SR.yacht = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.78); hull(ctx, w, h * 0.22, '#f5f7fb', '#2a62c8'); ctx.restore(); ctx.beginPath(); ctx.moveTo(-w * 0.05, h * 0.55); ctx.lineTo(-w * 0.05, -h * 0.5); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -h * 0.5); ctx.quadraticCurveTo(w * 0.35, 0, w * 0.3, h * 0.5); ctx.lineTo(0, h * 0.5); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.08, -h * 0.4); ctx.quadraticCurveTo(-w * 0.35, 0, -w * 0.4, h * 0.5); ctx.lineTo(-w * 0.08, h * 0.5); ctx.fillStyle = '#ffd1d9'; ctx.fill(); ctx.stroke(); };
  SR.pirate = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.7); hull(ctx, w, h * 0.3, '#7a4a22', '#ffd23f'); ctx.restore(); [[-0.2, 0.7], [0.12, 0.8]].forEach(function (m) { ctx.beginPath(); ctx.moveTo(w * m[0], h * 0.5); ctx.lineTo(w * m[0], -h * m[1] * 0.6); ctx.lineWidth = 5; ctx.strokeStyle = '#4a2a10'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * m[0] + 4, -h * m[1] * 0.5); ctx.quadraticCurveTo(w * m[0] + w * 0.22, -h * 0.05, w * m[0] + 4, h * 0.3); ctx.fillStyle = '#f5ecd0'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); }); ctx.fillStyle = '#111'; ctx.fillRect(-w * 0.2, -h * 0.58, w * 0.12, h * 0.07); ctx.beginPath(); ctx.arc(w * 0.2, h * 0.52, h * 0.05, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill(); box(ctx, w * 0.25, h * 0.4, w * 0.12, h * 0.1, '#c2873a', 3); };
  SR.largeboat = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.7); hull(ctx, w, h * 0.3, '#c83a3a', '#fff'); ctx.restore(); box(ctx, -w * 0.4, h * 0.12, w * 0.8, h * 0.25, '#f5f5f0', 6); box(ctx, -w * 0.3, -h * 0.1, w * 0.45, h * 0.25, '#e8e8e2', 6); box(ctx, -w * 0.05, -h * 0.4, w * 0.15, h * 0.3, '#ffcf3a', 4); for (var i = 0; i < 5; i++) { ctx.fillStyle = '#7fd0ff'; ctx.fillRect(-w * 0.34 + i * w * 0.14, h * 0.2, w * 0.07, h * 0.08); } };
  SR.heli = function (ctx, w, h, o) { box(ctx, -w * 0.2, -h * 0.2, w * 0.4, h * 0.45, '#e84a3a', h * 0.2); box(ctx, w * 0.0, -h * 0.12, w * 0.18, h * 0.22, '#bfeaff', 6); ctx.beginPath(); ctx.moveTo(-w * 0.2, 0); ctx.lineTo(-w * 0.55, -h * 0.15); ctx.lineWidth = 7; ctx.strokeStyle = '#a03025'; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.moveTo(0, -h * 0.2); ctx.lineTo(0, -h * 0.35); ctx.stroke(); var s = Math.sin(o.t * 40); ctx.beginPath(); ctx.moveTo(-w * 0.5 * s, -h * 0.35); ctx.lineTo(w * 0.5 * s, -h * 0.35); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(40,40,40,0.8)'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.2, h * 0.38); ctx.lineTo(w * 0.2, h * 0.38); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); };
  SR.pterosaur = function (ctx, w, h, o) { var f = Math.sin(o.t * 4) * 0.35; ctx.beginPath(); ctx.moveTo(w * 0.1, 0); ctx.lineTo(-w * 0.1, -h * (0.9 + f)); ctx.lineTo(-w * 0.5, -h * (0.3 + f)); ctx.lineTo(-w * 0.3, h * 0.1); ctx.closePath(); ctx.fillStyle = '#c9783a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.ellipse(w * 0.05, h * 0.05, w * 0.2, h * 0.2, 0, 0, TAU); ctx.fillStyle = '#e8a060'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * 0.2, 0); ctx.lineTo(w * 0.48, h * 0.05); ctx.lineTo(w * 0.2, h * 0.14); ctx.fillStyle = '#e8a060'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * 0.1, -h * 0.1); ctx.lineTo(-w * 0.05, -h * 0.55); ctx.lineTo(w * 0.2, -h * 0.15); ctx.fillStyle = '#b04a2a'; ctx.fill(); ctx.stroke(); };
  SR.islet = function (ctx, w, h, o) {
    var f = 1 - (o.bites || 0) * 0.28;
    ctx.beginPath(); ctx.moveTo(-w * 0.5, h * 0.5); ctx.quadraticCurveTo(-w * 0.35, -h * 0.1 * f, 0, -h * 0.15 * f); ctx.quadraticCurveTo(w * 0.35, -h * 0.1 * f, w * 0.5, h * 0.5); ctx.closePath(); ctx.fillStyle = '#e8cf93'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.32, h * 0.12); ctx.quadraticCurveTo(0, -h * 0.55 * f, w * 0.32, h * 0.12); ctx.quadraticCurveTo(0, h * 0.0, -w * 0.32, h * 0.12); ctx.fillStyle = '#5fb04a'; ctx.fill(); ctx.stroke();
    if ((o.bites || 0) < 2) [[-0.12, 1], [0.12, 0.8]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(w * p[0], -h * 0.1 * f); ctx.quadraticCurveTo(w * p[0] + 6, -h * 0.4 * p[1] * f, w * p[0], -h * 0.62 * p[1] * f); ctx.lineWidth = 5; ctx.strokeStyle = '#6a4a22'; ctx.stroke(); for (var k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(w * p[0], -h * 0.62 * p[1] * f); ctx.quadraticCurveTo(w * p[0] + Math.cos(k * 1.3) * 40, -h * 0.8 * p[1] * f, w * p[0] + Math.cos(k * 1.3) * 52, -h * 0.55 * p[1] * f); ctx.lineWidth = 4; ctx.strokeStyle = '#3f9a3a'; ctx.stroke(); } });
  };
  SR.cargo = function (ctx, w, h, o) { ctx.save(); ctx.translate(0, h * 0.72); hull(ctx, w, h * 0.28, '#2a3f5a', '#c83a3a'); ctx.restore(); var cs = ['#e8553a', '#3a8ad8', '#f0b030', '#3aa860', '#d8d8e0']; for (var r = 0; r < 2; r++) for (var i = 0; i < 6; i++) box(ctx, -w * 0.44 + i * w * 0.115, h * 0.22 - r * h * 0.2, w * 0.11, h * 0.19, cs[(i + r * 2) % 5], 2); box(ctx, w * 0.3, -h * 0.2, w * 0.14, h * 0.45, '#f0ead8', 4); box(ctx, w * 0.32, -h * 0.12, w * 0.1, h * 0.1, '#7fd0ff', 2); };
  SR.smallplane = function (ctx, w, h, o) { ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, h * 0.22, 0, 0, TAU); ctx.fillStyle = '#f5f7fb'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.1, 0); ctx.lineTo(-w * 0.25, h * 0.7); ctx.lineTo(w * 0.05, h * 0.05); ctx.fillStyle = '#d8dee8'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.36, -h * 0.05); ctx.lineTo(-w * 0.5, -h * 0.55); ctx.lineTo(-w * 0.28, -h * 0.1); ctx.fillStyle = '#e8553a'; ctx.fill(); ctx.stroke(); box(ctx, w * 0.12, -h * 0.15, w * 0.15, h * 0.18, '#bfeaff', 4); ctx.beginPath(); ctx.moveTo(w * 0.42, -h * 0.35 * Math.sin(o.t * 50)); ctx.lineTo(w * 0.42, h * 0.35 * Math.sin(o.t * 50)); ctx.lineWidth = 4; ctx.strokeStyle = '#333'; ctx.stroke(); };
  SR.jet = function (ctx, w, h, o) { ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.1, -h * 0.25); ctx.lineTo(-w * 0.45, -h * 0.2); ctx.lineTo(-w * 0.5, 0); ctx.lineTo(-w * 0.45, h * 0.2); ctx.lineTo(w * 0.1, h * 0.25); ctx.closePath(); ctx.fillStyle = '#7a8aa0'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.05, 0); ctx.lineTo(-w * 0.3, h * 0.9); ctx.lineTo(-w * 0.2, h * 0.9); ctx.lineTo(w * 0.15, h * 0.1); ctx.fillStyle = '#5a6a80'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.15); ctx.lineTo(-w * 0.5, -h * 0.75); ctx.lineTo(-w * 0.25, -h * 0.2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(w * 0.15, -h * 0.08, w * 0.1, h * 0.1, 0, 0, TAU); ctx.fillStyle = '#bfeaff'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.5, 0); ctx.lineTo(-w * 0.8, 0); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,200,80,0.8)'; ctx.stroke(); };
  SR.wraith = function (ctx, w, h, o) { for (var i = 6; i >= 0; i--) { var x = w * 0.4 - i * w * 0.12, y = Math.sin(o.t * 3 + i * 0.8) * h * 0.3, r = h * (0.32 - i * 0.03); ctx.beginPath(); ctx.arc(x, y, Math.max(5, r), 0, TAU); ctx.fillStyle = 'rgba(180,140,255,' + (0.9 - i * 0.1) + ')'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(40,10,90,0.7)'; ctx.stroke(); } ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * 0.44, -h * 0.06 + Math.sin(o.t * 3) * h * 0.3, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#c0f'; ctx.beginPath(); ctx.arc(w * 0.46, -h * 0.06 + Math.sin(o.t * 3) * h * 0.3, 3, 0, TAU); ctx.fill(); };
  SR.airliner = function (ctx, w, h, o) { ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.quadraticCurveTo(w * 0.42, -h * 0.3, w * 0.2, -h * 0.3); ctx.lineTo(-w * 0.42, -h * 0.28); ctx.lineTo(-w * 0.5, 0); ctx.lineTo(-w * 0.4, h * 0.28); ctx.lineTo(w * 0.2, h * 0.3); ctx.quadraticCurveTo(w * 0.42, h * 0.3, w * 0.5, 0); ctx.fillStyle = '#f7f9fc'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.fillStyle = '#2a62c8'; ctx.fillRect(-w * 0.4, h * 0.06, w * 0.8, h * 0.07); ctx.beginPath(); ctx.moveTo(w * 0.0, h * 0.2); ctx.lineTo(-w * 0.22, h * 1.0); ctx.lineTo(-w * 0.1, h * 1.0); ctx.lineTo(w * 0.2, h * 0.2); ctx.fillStyle = '#dde3ee'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w * 0.38, -h * 0.25); ctx.lineTo(-w * 0.5, -h * 0.95); ctx.lineTo(-w * 0.3, -h * 0.25); ctx.fillStyle = '#2a62c8'; ctx.fill(); ctx.stroke(); for (var i = 0; i < 10; i++) { ctx.fillStyle = '#9ad6ff'; ctx.beginPath(); ctx.arc(-w * 0.3 + i * w * 0.06, -h * 0.05, 3, 0, TAU); ctx.fill(); } };
  SR.bigisland = function (ctx, w, h, o) {
    var f = 1 - (o.bites || 0) * 0.24;
    ctx.beginPath(); ctx.moveTo(-w * 0.52, h * 0.5); ctx.quadraticCurveTo(-w * 0.4, -h * 0.4 * f, -w * 0.1, -h * 0.45 * f); ctx.quadraticCurveTo(w * 0.1, -h * 0.5 * f, w * 0.25, -h * 0.3 * f); ctx.quadraticCurveTo(w * 0.5, -h * 0.1 * f, w * 0.52, h * 0.5); ctx.closePath(); ctx.fillStyle = '#7a8a5a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.1 * f); ctx.quadraticCurveTo(0, -h * 0.55 * f, w * 0.3, -h * 0.05 * f); ctx.lineTo(w * 0.3, h * 0.2); ctx.lineTo(-w * 0.3, h * 0.2); ctx.fillStyle = '#4fae4a'; ctx.fill(); ctx.stroke();
    if ((o.bites || 0) < 3) for (var i = 0; i < 4; i++) { var tx = -w * 0.3 + i * w * 0.2, ty = -h * 0.1 * f; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - h * 0.2); ctx.lineWidth = 5; ctx.strokeStyle = '#6a4a22'; ctx.stroke(); ctx.beginPath(); ctx.arc(tx, ty - h * 0.24, h * 0.1, 0, TAU); ctx.fillStyle = '#2f8a3a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); }
    box(ctx, w * 0.05, -h * 0.05, w * 0.1, h * 0.12, '#f0ead8', 3);
  };
  Art.surface = function (ctx, def, o) {
    var img = OE.Assets.get(def.art);
    if (img) {
      // sprite aspect is kept. Hull targets (altitude 0..hi) sit on the waterline and are drawn 1.5x the hit zone tall so the mast shows;
      // fliers are centred on their hit zone. The hit zone itself (spec altitude band) is unchanged.
      var asp = img.width / img.height, wd, hd;
      if (def.alt[0] === 0) { hd = Math.max(def.alt[1] * 1.5, 40); wd = hd * asp; if (wd > o.w * 1.6) { wd = o.w * 1.6; hd = wd / asp; } ctx.drawImage(img, -wd / 2, o.h / 2 - hd, wd, hd); }
      else { wd = o.w; hd = wd / asp; ctx.drawImage(img, -wd / 2, -hd / 2, wd, hd); }
      return;
    }
    var fn = SR[def.id]; if (fn) fn(ctx, o.w, o.h, o);
  };
  Art.shapes = S; Art.PLY = PLY;
  OE.Art = Art;
})(typeof window !== 'undefined' ? window : globalThis);
