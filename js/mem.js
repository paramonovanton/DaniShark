/* Ocean Evolution - memory readout (BUG-U4, iOS Safari kills tabs that decode too many / too big images).
   ?mem=1 shows a small overlay; OE.Mem.report() returns the numbers at any time.
   Estimate of what the browser holds DECODED right now = naturalWidth x naturalHeight x 4 of
     - the game's images (OE.Assets.images: backgrounds, player, creatures, surface art),
     - every image a VISIBLE element of the page shows (css background / mask / border images, <img>), each URL counted once,
     - every canvas (the arena canvas and the form portraits): width x height x 4.
   Hidden windows (display: none) are not counted: browsers do not decode their images. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var dims = {}, MB = 1048576;

  function abs(u) { try { return new g.URL(u, g.document.baseURI).href; } catch (e) { return u; } }
  function dimOf(url) {
    var d = dims[url];
    if (d !== undefined) return d;
    dims[url] = null;                                   // pending: counted from the next report on
    var im = new g.Image();
    im.onload = function () { dims[url] = [im.naturalWidth, im.naturalHeight]; im.onload = im.onerror = null; im.src = ''; };
    im.onerror = function () { dims[url] = [0, 0]; };
    im.src = url;
    return null;
  }
  function urlsOf(v) {
    var out = [], re = /url\((["']?)(.*?)\1\)/g, m;
    if (!v || v === 'none') return out;
    while ((m = re.exec(v))) out.push(abs(m[2]));
    return out;
  }
  function short(u) { var i = u.indexOf('/ui/generated/'); if (i < 0) i = u.indexOf('/assets/'); return i >= 0 ? u.slice(i + 1) : u.split('/').slice(-2).join('/'); }

  var Mem = {
    report: function () {
      var seen = {}, rows = [], js = 0, css = 0, cv = 0, pending = 0, i, id, img, url, d, el, cs;
      var A = OE.Assets && OE.Assets.images || {};
      for (id in A) {
        img = A[id]; if (!img || !img.naturalWidth) continue;
        url = abs(img.currentSrc || img.src); seen[url] = 1;
        rows.push({ kind: 'js', name: id, w: img.naturalWidth, h: img.naturalHeight, mb: img.naturalWidth * img.naturalHeight * 4 / MB });
      }
      var doc = g.document, all = doc.querySelectorAll('#stage *'), props = ['backgroundImage', 'webkitMaskImage', 'maskImage', 'webkitMaskBoxImageSource', 'borderImageSource', 'listStyleImage'];
      for (i = 0; i < all.length; i++) {
        el = all[i];
        if (el.tagName === 'IMG' && el.naturalWidth && el.getClientRects().length) {
          url = abs(el.currentSrc || el.src);
          if (!seen[url]) { seen[url] = 1; rows.push({ kind: 'img', name: short(url), w: el.naturalWidth, h: el.naturalHeight, mb: el.naturalWidth * el.naturalHeight * 4 / MB }); }
        }
        if (!el.getClientRects().length) continue;
        cs = g.getComputedStyle(el);
        props.forEach(function (p) {
          urlsOf(cs[p]).forEach(function (u) {
            if (seen[u]) return;
            seen[u] = 1; d = dimOf(u);
            if (!d) { pending++; return; }
            rows.push({ kind: 'css', name: short(u), w: d[0], h: d[1], mb: d[0] * d[1] * 4 / MB });
          });
        });
      }
      var cvs = doc.querySelectorAll('canvas');
      for (i = 0; i < cvs.length; i++) { var b = cvs[i].width * cvs[i].height * 4 / MB; cv += b; if (b > 0.5) rows.push({ kind: 'canvas', name: cvs[i].id || 'canvas', w: cvs[i].width, h: cvs[i].height, mb: b }); }
      var TI = OE.Assets && OE.Assets.tints || {}, tk;                                     // CR-4: the tinted copies of decor art (offscreen canvases) count as canvas memory
      for (tk in TI) { var tb = TI[tk].width * TI[tk].height * 4 / MB; cv += tb; rows.push({ kind: 'canvas', name: tk, w: TI[tk].width, h: TI[tk].height, mb: tb }); }
      var RS = OE.app && OE.app.render; if (RS && RS.scrA) { var sb = RS.scrA.width * RS.scrA.height * 4 * 2 / MB; cv += sb; rows.push({ kind: 'canvas', name: 'tint scratch x2', w: RS.scrA.width, h: RS.scrA.height, mb: sb }); }       // the role-tint scratch canvases (at most 384 x 384 each)
      rows.forEach(function (r) { if (r.kind === 'js') js += r.mb; else if (r.kind !== 'canvas') css += r.mb; });
      rows.sort(function (a, b2) { return b2.mb - a.mb; });
      return { tier: OE.Browser && OE.Browser.tier, dpr: OE.Browser && OE.Browser.dprCap ? OE.Browser.dprCap() : g.devicePixelRatio, jsImagesMB: +js.toFixed(1), cssImagesMB: +css.toFixed(1), canvasMB: +cv.toFixed(1), totalMB: +(js + css + cv).toFixed(1),
        jsCount: Object.keys(A).length, pending: pending, top: rows.slice(0, 8).map(function (r) { return r.kind + ' ' + r.name + ' ' + r.w + 'x' + r.h + ' ' + r.mb.toFixed(1) + ' MB'; }) };
    },
    show: function () {
      var box = g.document.createElement('pre');
      box.style.cssText = 'position:fixed;left:4px;top:4px;z-index:99999;margin:0;padding:6px 8px;background:rgba(0,0,0,.8);color:#9f9;font:11px/1.3 monospace;pointer-events:none;max-width:60vw;white-space:pre-wrap';
      g.document.body.appendChild(box);
      function tick() {
        try { var r = Mem.report(); box.textContent = 'tier ' + r.tier + '  dpr<=' + r.dpr + '\ntotal ' + r.totalMB + ' MB  (js ' + r.jsImagesMB + ' + css ' + r.cssImagesMB + ' + canvas ' + r.canvasMB + ')\n' + r.top.join('\n'); } catch (e) { box.textContent = String(e); }
      }
      tick(); g.setInterval(tick, 2000);
    }
  };
  OE.Mem = Mem;
  if (/[?&]mem=1(&|$)/.test(g.location.search)) g.addEventListener('load', function () { Mem.show(); });
})(typeof window !== 'undefined' ? window : globalThis);
