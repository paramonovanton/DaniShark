/* Ocean Evolution - SaveProvider interface and the local (localStorage) implementation.
   A server provider can replace LocalSaveProvider later: same three methods, same save object (+ updatedAt). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var KEY = 'oe.save.v1', BAK = 'oe.save.bak';

  /* interface (documentation + duck-typing check):
       load()      -> save object (never null; a default save when nothing valid is stored)
       save(obj)   -> void  (never throws)
       reset()     -> default save
       blocked     -> true when persistent storage is unavailable (in-memory only)  */

  function LocalSaveProvider(opts) {
    opts = opts || {};
    this.key = opts.key || KEY;
    this.blocked = false;
    this.mem = null;
    this.forceBlock = !!opts.forceBlock;
    try { if (g.name && g.name.indexOf('oe_block_storage') >= 0) this.forceBlock = true; } catch (e) { /* ignore */ }
    if (this.forceBlock) this.blocked = true;
  }
  LocalSaveProvider.prototype._store = function () {
    if (this.forceBlock) throw new Error('storage blocked');
    return g.localStorage;
  };
  LocalSaveProvider.prototype.load = function () {
    var M = OE.Model, raw = null;
    try { raw = this._store().getItem(this.key); } catch (e) { this.blocked = true; }
    if (this.blocked) { this.mem = this.mem || M.defaultSave(); return OE.util.deepCopy(this.mem); }
    var s = null;
    if (raw) {
      try { s = M.normalizeSave(JSON.parse(raw)); } catch (e) { s = null; }
      if (!s) {                       // invalid or newer data: keep it once as a backup, start fresh
        try { if (!this._store().getItem(BAK)) this._store().setItem(BAK, raw); } catch (e2) { /* ignore */ }
      }
    }
    this.mem = s || M.defaultSave();
    if (!raw) { try { this._store().setItem(this.key, JSON.stringify(Object.assign({ updatedAt: Date.now() }, this.mem))); } catch (e3) { this.blocked = true; } }   // first launch: the default save is written at boot (UC-OE-01)
    return OE.util.deepCopy(this.mem);
  };
  LocalSaveProvider.prototype.save = function (obj) {
    obj.updatedAt = Date.now();
    this.mem = OE.util.deepCopy(obj);
    try { this._store().setItem(this.key, JSON.stringify(obj)); }
    catch (e) { this.blocked = true; }
  };
  LocalSaveProvider.prototype.reset = function () {
    try { this._store().removeItem(this.key); } catch (e) { this.blocked = true; }
    this.mem = OE.Model.defaultSave();
    return OE.util.deepCopy(this.mem);
  };

  OE.LocalSaveProvider = LocalSaveProvider;
  OE.SAVE_KEY = KEY;
})(typeof window !== 'undefined' ? window : globalThis);
