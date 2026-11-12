/* Ocean Evolution - memory readout (BUG-U4, iOS Safari kills tabs that decode too many / too big images).
   ?mem=1 shows a small overlay; OE.Mem.report() returns the numbers at any time.
   Estimate of what the browser holds DECODED right now = naturalWidth x naturalHeight x 4 of
     - the game's images (OE.Assets.images: backgrounds, player, creatures, surface art),
     - every image a VISIBLE element of the page shows (css background / mask / border images, <img>), each URL counted once,
     - every canvas (the arena canvas and the form portraits): width x height x 4.
   Hidden windows (display: none) are not counted: browsers do not decode their images.
   BUG-U6: + an ESTIMATE of the composited layers (iOS WebKit keeps a backing store per layer at device pixels): the root layer (the viewport), every
   element that is composited (canvas, video, will-change / 3D transform, a running transform / opacity / filter animation, backdrop-filter), a 2D-transformed
   ancestor of a composited element (WebKit rasterizes it in its OWN coordinates: a 1920 x 1080 stage scaled down still costs 1920 x 1080 x dpr^2), and one
   squashed layer for the windows painted over the canvas (overlap). Filters and masks are listed as offscreen buffers (painted through a temporary bitmap).
   ?edpr=3 (or report({ dpr: 3 })) estimates for another device pixel ratio (iPhone 13: 3); the canvases keep their real backing. */
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

  function scaleOf(m) { if (!m || m === 'none') return 1; var v = /matrix(3d)?\(([^)]+)\)/.exec(m); if (!v) return 1; var n = v[2].split(',').map(parseFloat); return v[1] ? Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) : Math.sqrt(n[0] * n[0] + n[1] * n[1]); }
  function animProps(el) {
    var out = {}; if (!el.getAnimations) return out;
    try { el.getAnimations().forEach(function (a) { if (a.playState !== 'running' || !a.effect || !a.effect.getKeyframes) return; a.effect.getKeyframes().forEach(function (k) { ['transform', 'opacity', 'filter', 'translate', 'scale', 'rotate'].forEach(function (p) { if (k[p] !== undefined) out[p] = 1; }); }); }); } catch (e) { /* ignore */ }
    return out;
  }
  // composited layers and offscreen buffers, estimated (see the header); dpr = the device pixel ratio to estimate for
  function layers(dpr) {
    var doc = g.document, out = [], buf = [], all = doc.querySelectorAll('body *'), i, el, cs, r, why, an, sc, comp = [], vw = g.innerWidth, vh = g.innerHeight, MBp = 4 / MB;
    out.push({ why: 'root', name: 'viewport', w: vw, h: vh, mb: vw * vh * dpr * dpr * MBp });
    for (i = 0; i < all.length; i++) {
      el = all[i]; if (!el.getClientRects().length) continue;
      cs = g.getComputedStyle(el); if (cs.visibility === 'hidden' && el.tagName !== 'CANVAS') continue;
      r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      why = null; an = animProps(el);
      if (el.tagName === 'CANVAS' || el.tagName === 'VIDEO') why = el.tagName.toLowerCase();
      else if (/transform|opacity|filter/.test(cs.willChange)) why = 'will-change';
      else if (/matrix3d|perspective/.test(cs.transform) || cs.backfaceVisibility === 'hidden' && cs.transform !== 'none') why = '3d';
      else if (an.transform || an.opacity || an.filter || an.translate || an.scale || an.rotate) why = 'animation';
      else if (cs.backdropFilter && cs.backdropFilter !== 'none' || cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none') why = 'backdrop';
      if (why) { comp.push(el); if (why !== 'canvas' && why !== 'video') { sc = 1; for (var a = el.parentElement; a; a = a.parentElement) sc *= scaleOf(g.getComputedStyle(a).transform); sc = sc || 1; out.push({ why: why, name: el.id || el.getAttribute('data-layer') || el.className || el.tagName, w: Math.round(r.width / sc), h: Math.round(r.height / sc), mb: r.width * r.height / (sc * sc) * dpr * dpr * MBp }); } }
      if (cs.filter && cs.filter !== 'none') buf.push({ why: 'filter ' + cs.filter.slice(0, 24), name: el.getAttribute('data-layer') || el.tagName, mb: r.width * r.height * dpr * dpr * MBp });
      var mk = cs.webkitMaskBoxImageSource || cs.webkitMaskImage || cs.maskImage; if (mk && mk !== 'none') buf.push({ why: 'mask', name: el.getAttribute('data-layer') || el.tagName, mb: r.width * r.height * dpr * dpr * MBp });
    }
    // a 2D-transformed ancestor of a composited element is composited too; WebKit rasterizes it in its own (untransformed) coordinates
    var seenA = [];
    comp.forEach(function (c) {
      for (var a = c.parentElement; a && a !== doc.body; a = a.parentElement) {
        var t = g.getComputedStyle(a).transform; if (!t || t === 'none' || seenA.indexOf(a) >= 0) continue;
        seenA.push(a); out.push({ why: 'transformed ancestor', name: a.id || a.className, w: a.offsetWidth, h: a.offsetHeight, mb: a.offsetWidth * a.offsetHeight * dpr * dpr * MBp });
      }
    });
    // windows painted above the arena canvas overlap a composited layer: one squashed layer of the visible area
    var cvs = doc.getElementById('arena-canvas'), wins = Array.prototype.filter.call(doc.querySelectorAll('#stage > .win.on, #stage > section.on'), function (w) { return w.getClientRects().length; });
    if (cvs && cvs.getClientRects().length && wins.length) { var sr = doc.getElementById('stage').getBoundingClientRect(), ow = Math.min(vw, sr.width), oh = Math.min(vh, sr.height); out.push({ why: 'overlap (' + wins.length + ' windows over the canvas)', name: 'squashed', w: Math.round(ow), h: Math.round(oh), mb: ow * oh * dpr * dpr * MBp }); }
    return { layers: out, buffers: buf, layersMB: out.reduce(function (t, x) { return t + x.mb; }, 0), buffersMB: buf.reduce(function (t, x) { return t + x.mb; }, 0) };
  }

  var Mem = {
    report: function (opt) {
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
      var q = /[?&]edpr=([0-9.]+)/.exec(g.location.search), ed = (opt && opt.dpr) || (OE.Browser && OE.Browser.devDpr ? OE.Browser.devDpr() : (q ? parseFloat(q[1]) : (g.devicePixelRatio || 1))), L = layers(ed); L.dpr = ed;
      rows.sort(function (a, b2) { return b2.mb - a.mb; });
      return { tier: OE.Browser && OE.Browser.tier, dpr: OE.Browser && OE.Browser.dprCap ? OE.Browser.dprCap() : g.devicePixelRatio, jsImagesMB: +js.toFixed(1), cssImagesMB: +css.toFixed(1), canvasMB: +cv.toFixed(1), totalMB: +(js + css + cv).toFixed(1),
        jsCount: Object.keys(A).length, pending: pending, top: rows.slice(0, 8).map(function (r) { return r.kind + ' ' + r.name + ' ' + r.w + 'x' + r.h + ' ' + r.mb.toFixed(1) + ' MB'; }),
        edpr: L.dpr, layersMB: +L.layersMB.toFixed(1), layerCount: L.layers.length, buffersMB: +L.buffersMB.toFixed(1), bufferCount: L.buffers.length, estimateMB: +(js + css + cv + L.layersMB).toFixed(1),
        heapMB: g.performance && g.performance.memory ? +(g.performance.memory.usedJSHeapSize / MB).toFixed(1) : null,
        layers: L.layers.slice().sort(function (a, b2) { return b2.mb - a.mb; }).slice(0, 8).map(function (x) { return x.why + ' ' + x.name + (x.w ? ' ' + x.w + 'x' + x.h : '') + ' ' + x.mb.toFixed(1) + ' MB'; }) };
    },
    show: function () {
      var box = g.document.createElement('pre');
      box.style.cssText = 'position:fixed;left:4px;top:4px;z-index:99999;margin:0;padding:6px 8px;background:rgba(0,0,0,.8);color:#9f9;font:11px/1.3 monospace;pointer-events:none;max-width:60vw;white-space:pre-wrap';
      g.document.body.appendChild(box);
      function tick() {
        try { var r = Mem.report(); box.textContent = 'tier ' + r.tier + (OE.Browser && OE.Browser.ios ? ' (ios)' : '') + '  dpr<=' + r.dpr + '\ntotal ' + r.totalMB + ' MB  (js ' + r.jsImagesMB + ' + css ' + r.cssImagesMB + ' + canvas ' + r.canvasMB + ')\nlayers ~' + r.layersMB + ' MB (' + r.layerCount + ' at dpr ' + r.edpr + ')  buffers ~' + r.buffersMB + ' MB (' + r.bufferCount + ')  estimate ' + r.estimateMB + ' MB' + (r.heapMB !== null ? '  heap ' + r.heapMB + ' MB' : '') + '\n' + r.top.join('\n') + '\n' + r.layers.join('\n'); } catch (e) { box.textContent = String(e); }
      }
      tick(); g.setInterval(tick, 2000);
    }
  };
  Mem.layers = layers;
  OE.Mem = Mem;
  if (/[?&]mem=1(&|$)/.test(g.location.search)) g.addEventListener('load', function () { Mem.show(); });
})(typeof window !== 'undefined' ? window : globalThis);
