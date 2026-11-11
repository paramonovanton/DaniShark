/* Ocean Evolution - asset registry keyed by the art ids of AIFigmaPipeline/docs/Ocean_Evolution.art.json
   (BG_W1_Back, PLY_F1, PLY_F1_open, CRT_sardine, SRF_gull, ...).
   assets/manifest.js (written by tools/_build_manifest.py) lists what exists: id -> 'file.png' or {png, webp}.
   Listed ids are loaded as images and used instead of the procedural drawing; ids that are not listed, or not loaded yet,
   fall back to the procedural art, so PNGs can be dropped in with no code change.
   Loading is lazy: the player forms the save needs at boot, then the sprites and background of a world when its level starts. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  // art ids that reuse another id (tinted)
  var ALIAS = { CRT_spermwhale5: 'CRT_spermwhale', CRT_giantsquid7: 'CRT_giantsquid', BG_W1_Card: 'BG_W1_Back', BG_W2_Card: 'BG_W2_Back',
    BG_W3_Card: 'BG_W3_Back', BG_W4_Card: 'BG_W4_Back', BG_W5_Card: 'BG_W5_Back', BG_W6_Card: 'BG_W6_Back', BG_W7_Card: 'BG_W7_Back' };

  function detectWebp() {
    try { var c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; }
  }

  var A = {
    manifest: {}, images: {}, pending: {}, failed: [], loading: 0, webp: false, stats: { requested: 0, loaded: 0, bytesHint: 0 },
    init: function () { this.manifest = OE.assetManifest || {}; this.webp = detectWebp() && !/[?&]nowebp=1/.test(g.location ? g.location.search : ''); },
    src: function (id) {
      var e = this.manifest[id]; if (!e) return null;
      if (typeof e === 'string') return e;
      return (this.webp && e.webp) ? e.webp : (e.png || e.jpg || e.webp);
    },
    // load the listed ids that exist in the manifest (once); cb(fraction) after each one, cb(1) at the end (also when nothing is left)
    preload: function (ids, cb) {
      var self = this, todo = [], i, id;
      for (i = 0; i < ids.length; i++) {
        id = ALIAS[ids[i]] || ids[i];
        if (this.images[id] || this.pending[id] || todo.indexOf(id) >= 0 || !this.manifest[id]) continue;
        todo.push(id);
      }
      if (!todo.length) { if (cb) cb(1); return 0; }
      var done = 0;
      todo.forEach(function (tid) {
        var img = new Image(), file = self.src(tid);
        self.pending[tid] = true; self.loading++; self.stats.requested++;
        function fin() { delete self.pending[tid]; self.loading--; done++; if (cb) cb(done / todo.length); }
        img.onload = function () { self.images[tid] = img; self.stats.loaded++; fin(); };
        img.onerror = function () {
          // a bad webp falls back to the png once
          var e = self.manifest[tid];
          if (e && typeof e === 'object' && e.png && file !== e.png) { img.onerror = function () { self.failed.push(tid); fin(); }; img.src = e.png; return; }
          self.failed.push(tid); fin();
        };
        img.src = file;
      });
      return todo.length;
    },
    ready: function () { return this.loading === 0; },
    get: function (id) { return this.images[id] || this.images[ALIAS[id]] || null; },
    has: function (id) { return !!this.get(id); },

    /* ---- what a level needs ---- */
    formIds: function (form) { return ['PLY_F' + form, 'PLY_F' + form + '_open']; },
    // creature art ids of a world (every species its levels spawn, + open-mouth variants), surface targets and the far background
    worldIds: function (n) {
      var wd = OE.WORLDS[n - 1], ids = ['BG_W' + n + '_Back'], seen = {}, i, k;
      function add(cid) {
        var d = OE.CREATURES[cid]; if (!d || seen[cid]) return; seen[cid] = 1;
        ids.push(d.art, d.art + '_open');
      }
      wd.levels.forEach(function (l) {
        ['food', 'pred', 'haz', 'pas'].forEach(function (key) { (l[key] || []).forEach(function (a) { add(a[0]); }); });
        (l.per || []).forEach(function (p) { add(p.id); });
        if (l.boss === 'bloop') add('bloop');
      });
      for (i = 0; i < wd.surf.length; i++) ids.push('SRF_' + wd.surf[i][0]);
      for (k in OE.EVENTS) { /* event targets come from the lists above; islands etc. fall back to procedural art */ }
      return ids;
    },
    // ids for starting a level: its world + the player's current and next form
    levelIds: function (world, form) {
      var ids = this.worldIds(world).concat(this.formIds(form));
      if (form < 8) ids = ids.concat(this.formIds(form + 1));
      return ids;
    },
    // boot: the forms a save can show (current and next); the loading bar follows this set
    bootIds: function (form) { return this.formIds(form).concat(form < 8 ? this.formIds(form + 1) : []); }
  };
  OE.Assets = A;
})(typeof window !== 'undefined' ? window : globalThis);
