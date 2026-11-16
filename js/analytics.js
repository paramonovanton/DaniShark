/* Ocean Evolution - analytics stub. Event names and parameter keys follow
   AIFigmaPipeline/docs/Ocean_Evolution.tracking.json; nothing leaves the device (console + 200-entry ring buffer).
   An Athena transport can be switched on later by setting OE.Analytics.transport = function (name, params) {...}. */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  var PLAN = {
    AppOpen: [],
    Level_Start: ['lvl', 'world', 'level_in_world', 'replay', 'control_mode'],
    Level_Success: ['lvl', 'world', 'level_in_world', 'stars', 'hearts_left', 'duration_s', 'coins_gain', 'replay', 'control_mode', 'continues'],          // CR-4 v5.1: stars = hearts left at the Kraken; v5.6: continues used in the attempt (stars capped at 1 after one)
    BossPhaseChanged: ['boss_id', 'phase', 'world', 'form', 'hearts_left'],
    BossFinale: ['boss_id', 'world', 'eaten', 'coins'],
    Level_Failure: ['lvl', 'world', 'level_in_world', 'cause', 'level_gp_pct', 'duration_s', 'form_reached', 'control_mode', 'continues'],
    // PT4-4 (spec v5.6, R-OE-66..72): the Continue offer and the rewarded ad behind OE.Ads (the placeholder never sends ad_impression / TrackAdRevenue)
    ContinueOffered: ['lvl', 'world', 'level_in_world', 'form', 'level_gp_pct', 'ad_available', 'coins_enabled', 'coins', 'continues_used', 'control_mode'],
    ContinueChosen: ['lvl', 'world', 'level_in_world', 'choice', 'form', 'continues_used', 'attempt_choice_n'],
    ContinueApplied: ['lvl', 'world', 'level_in_world', 'method', 'continue_index', 'form'],
    AdRequested: ['ad_placement', 'ad_type', 'provider'],
    AdShown: ['ad_placement', 'ad_type', 'provider'],
    AdRewarded: ['ad_placement', 'ad_type', 'provider'],
    AdSkipped: ['ad_placement', 'ad_type', 'provider', 'watched_s'],
    AdFailed: ['ad_placement', 'ad_type', 'provider', 'reason'],
    LevelQuit: ['world', 'level_in_world', 'level_gp_pct', 'hearts_left'],
    LevelRestart: ['world', 'level_in_world'],
    WorldSelected: ['world', 'level_in_world'],
    WorldLockedTapped: ['world'],
    WorldGuideOpened: ['world', 'world_state', 'creatures'],          // PT2-5 (R-OE-61)
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
