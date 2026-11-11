/* Ocean Evolution - small shared helpers (no DOM). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign(v) { return v < 0 ? -1 : 1; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  // Seeded random generator (mulberry32) so tests and QA can replay a run.
  function Rng(seed) { this.seed(seed); }
  Rng.prototype.seed = function (s) { this.s = (s === undefined || s === null ? Date.now() : s) >>> 0; };
  Rng.prototype.next = function () {
    var t = this.s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  Rng.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  // pick from [[item, weight], ...]
  Rng.prototype.wpick = function (list) {
    var sum = 0, i;
    for (i = 0; i < list.length; i++) sum += list[i][1];
    var r = this.next() * sum;
    for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
    return list[list.length - 1][0];
  };

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  // Far background tiling: the image is scaled (aspect kept) to the view height and repeated across the view width,
  // scrolled at `par` of the camera. Returns [{x, w, flip}] tile rectangles in screen px (w is 1 px wider than the tile so seams stay
  // closed). Every other tile is mirrored (flip) so the join is seamless even when the art's left and right edges do not match.
  function farTiles(camX, imgW, imgH, viewW, viewH, par) {
    var tw = imgW * (viewH / imgH), a = camX * par, k = Math.floor(a / tw), out = [], x;
    for (; (x = k * tw - a) < viewW; k++) out.push({ x: Math.floor(x), w: Math.ceil(tw) + 1, flip: (((k % 2) + 2) % 2) === 1 });
    return out;
  }

  OE.util = { clamp: clamp, lerp: lerp, sign: sign, dist: dist, Rng: Rng, deepCopy: deepCopy, farTiles: farTiles };
})(typeof window !== 'undefined' ? window : globalThis);
