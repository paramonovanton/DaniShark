/* Ocean Evolution - analytics stub. Event names and parameter keys follow
   AIFigmaPipeline/docs/Ocean_Evolution.tracking.json; nothing leaves the device (console + 200-entry ring buffer).
   An Athena transport can be switched on later by setting OE.Analytics.transport = function (name, params) {...}. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  var PLAN = {
    AppOpen: [],
    Level_Start: ['lvl', 'world', 'level_in_world', 'replay', 'control_mode'],
    Level_Success: ['lvl', 'world', 'level_in_world', 'stars', 'hearts_left', 'duration_s', 'coins_gain', 'replay', 'control_mode'],          // CR-4 v5.1: stars = hearts left at the Kraken
    BossPhaseChanged: ['boss_id', 'phase', 'world', 'form', 'hearts_left'],
    BossFinale: ['boss_id', 'world', 'eaten', 'coins'],
    Level_Failure: ['lvl', 'world', 'level_in_world', 'cause', 'level_gp_pct', 'duration_s', 'form_reached', 'control_mode'],
    LevelQuit: ['world', 'level_in_world', 'level_gp_pct', 'hearts_left'],
    LevelRestart: ['world', 'level_in_world'],
    WorldSelected: ['world', 'level_in_world'],
    WorldLockedTapped: ['world'],
    WorldCompleted: ['world', 'first_time', 'stars', 'coins_gain'],
    Evolved: ['form_from', 'form_to', 'world', 'level_in_world', 'level_time_s', 'light'],
    SurfaceJump: ['form', 'world', 'level_in_world'],
    SurfaceTargetEaten: ['target_id', 'form', 'gp_gain', 'coins'],
    SurfaceEventStarted: ['event_id', 'world', 'level_in_world'],
    SurfaceEventCompleted: ['event_id', 'success'],
    PlayerDamaged: ['source', 'hearts_left'],
    PauseOpened: ['world', 'level_in_world', 'source'],
    SettingChanged: ['setting', 'value'],
    ProgressReset: [],
    tutorial: ['step'],
    RotatePromptShown: ['screen'],
    DebugUnlockAll: [],
    FrameRecovered: [],
    ProductMovement: ['type', 'id', 'amount', 'source1', 'source2']
  };
  var ONCE = { tutorial: true };

  var A = {
    buffer: [], transport: null, verbose: false, warnings: [], _seen: {},
    track: function (name, params) {
      params = params || {};
      var keys = PLAN[name];
      if (!keys) { this.warnings.push('unknown event ' + name); return; }
      for (var k in params) if (keys.indexOf(k) < 0) this.warnings.push(name + ': unknown param ' + k);
      if (ONCE[name] && name === 'tutorial') {
        var id = name + ':' + params.step;
        if (this._seen[id]) return;
        this._seen[id] = 1;
      }
      var entry = { t: Date.now(), name: name, params: params };
      this.buffer.push(entry);
      if (this.buffer.length > 200) this.buffer.shift();
      try { if (this.verbose && g.console) g.console.debug('[analytics]', name, params); } catch (e) { /* ignore */ }
      if (this.transport) { try { this.transport(name, params); } catch (e2) { /* never break the game */ } }
    },
    last: function (name) {
      for (var i = this.buffer.length - 1; i >= 0; i--) if (!name || this.buffer[i].name === name) return this.buffer[i];
      return null;
    },
    count: function (name) { var n = 0; for (var i = 0; i < this.buffer.length; i++) if (this.buffer[i].name === name) n++; return n; },
    plan: PLAN
  };
  OE.Analytics = A;
})(typeof window !== 'undefined' ? window : globalThis);
