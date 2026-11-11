/* Ocean Evolution - game data: balance, forms, worlds, creatures, surface targets, events.
   Source of truth: AIFigmaPipeline/docs/Ocean_Evolution.md + .spec.json (all numbers [DEFAULT - tune in playtest]). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};

  /* Landscape (CR-1, spec v2 balance.BAL): logical canvas 1080 high, width 1440..2520 (1920 = design area),
     world 3840x1080 scrolling in x, waterline y 330, seabed floor band 990-1080. */
  var BAL = {
    DESIGN_W: 1920, DESIGN_H: 1080, VIEW_W_MIN: 1440, VIEW_W_MAX: 2520, VIEW_H: 1080, HUD_NARROW_W: 1700,
    W: 3840, H: 1080,                       // world size (sim coordinates)
    waterY: 330, seabedY: 990, floorBand: [990, 1080],
    deepWaterY: 0,           // CR-4: The Abyss has no above-water zone: the 'surface' is the top edge of the view (the top clamp of the player), no sky, no jump band
    bandsDeep: { surface: [90, 380], mid: [380, 700], deep: [700, 960], floor: [960, 1040] },
    // CR-3 / R-OE-46 (BUG-U1): the player centre is clamped to [waterY + bodyR, seabedY - bodyR]; the floor line y = seabedY is the resting line of the player AND of every floor creature (centre y = seabedY - its own bodyR)
    hearts: 3, eatRatio: 1.15,
    maxGP: 450,               // CR-3: level GP 0..450, restarts at 0 every level
    // CR-4 (R-OE-06 / 28 / 51): distinct size steps. S at the start of form f = 10 x SIZE_STEP^(f-1) (10, 12, 14.4 ... 35.8); inside a form S grows by IN_FORM of the gap to the next start; len = LEN_PER_S x S
    SIZE_STEP: 1.2, IN_FORM: 0.2, LEN_PER_S: 9,
    ZOOM: 1.25,                // CR-4 (R-OE-49): constant arena zoom (tunable 1.2 .. 1.3); the visible world is the 1920 x 1080 view / ZOOM
    CAM_Y: { dead: 100, lerp: 0.12, topMax: 216, centre: 432, lookUpWithin: 200 },
    maxSpeedBL: 3.0,          // player max speed, body lengths per second
    stopRadius: 40, glideS: 0.5,
    bumpKnock: 160, bumpStun: 0.4, dmgKnock: 200, invuln: 1.5, evoInvuln: 1.5,
    jumpCooldown: 0.5, jumpRange: 1.5, apexAt: 0.4,
    DEBUG_UNLOCK: true,                     // DEBUG: shows the "Unlock all" button on the World Select screen (js/ui.js, game.debugUnlockAll). Set false (or delete the flag and the control) before release.
    loadMaxS: 12,                           // BUG-U3: the loading screen ends after this many seconds even if an image request never answers
    levelStartS: 2.0, assetWaitS: 5, evoAutoS: 4.0, eventBannerS: 2.5, lockedToastS: 2.5, failDelayS: 0.8,
    camera: { lerp: 0.1, dead: 290 },
    playerLenMin: 90, playerLenMax: 335, creatureLen: [26, 760], thicknessMax: 0.4,
    playerStart: { x: 960, y: 660 },
    bands: { surface: [370, 560], mid: [560, 800], deep: [800, 960], floor: [960, 1040] },
    spawnMarginX: 240, spawnNear: 680, spawnFar: 930, despawnX: 2400, detectCap: 1000,
    wavesAmp: 12, wavesHz: 0.4,
    hudBand: 150, safeX: 96, safeY: 32, touchMin: 121, textMin: 26,
    foodWorldMul: 1.6,        // food target = foodMax x this (the world is ~2 screens wide)
    foodMax: [8, 9, 10, 12, 14],
    preySpeedMul: [0.90, 1.00, 1.05, 1.10, 1.15],
    surfaceInterval: [16, 14, 12, 11, 10],
    hazardTypes: [1, 2, 2, 3, 3],
    /* ---- CR-3 (spec v4 constants.BAL.GROWTH / BODY / ROSTER_REL): per-level growth, goals, bonus phase, body, rosters by relative size ---- */
    SIDE_THREAT_MUL: {"1-3": 1.3, "1-4": 1.1, "1-5": 0.8, "2-5": 0.8, "3-5": 0.5, "7-5": 0.85},   // Side-scroller: per-level factor on the threat interval (spec v4.1: keep every level at 20..40 % threat spawn events; boss levels lose slots to rings)
    PACE: {1: [1.46, 1.57, 1.95, 2.86, 50.73], 2: [1.89, 2.03, 2.5, 2.56, 5.4], 3: [5.08, 4.31, 4.78, 5.5, 26.68], 4: [2.74, 3.6, 4.12, 4.93, 6.93], 5: [1.16, 1.37, 1.55, 1.81, 2.27], 6: [1.91, 2.66, 1.83, 2.27, 2.42], 7: [4.49, 2.63, 3.78, 3.89, 4.42]},   // Side-scroller prey interval factor per level, fitted (mean of 4 seeds) with tests/bot.js (OE_BOT_SIDE, skilled y control, immortal) to the Kraken target (7 x step + 15 s) x level factor (CR-4 v5.1; the boss levels are partly fed by the boss director's schools)
    PACE_C: {1: [0.5, 0.5, 0.5, 0.5, 0.5], 2: [0.5, 0.5, 0.5, 0.5, 0.5], 3: [0.5, 0.5, 0.5, 0.5, 0.5], 4: [0.5, 0.5, 0.5, 0.5, 0.5], 5: [0.5, 0.5, 0.5, 0.5, 0.5], 6: [0.5, 0.5, 0.5, 0.5, 0.5], 7: [0.5, 0.5, 0.5, 0.5, 0.5]},   // Classic prey interval factor per level (neutral 0.5; the pacing is fitted with GP_C)
    BUDGET_C: {1: [1, 1, 1, 1, 1], 2: [1, 1, 1, 1, 1], 3: [1, 1, 1, 1, 1], 4: [1, 1, 1, 1, 1], 5: [1, 1, 1, 1, 1], 6: [1, 1, 1, 1, 1], 7: [1, 1, 1, 1, 1]},   // Classic: factor on the prey budget (foodTarget) per level (1 = the level table x BAL.foodWorldMul)
    GP_C: {1: [1.56, 1.7, 1.45, 1.51, 0.65], 2: [1.47, 2.41, 2.28, 1.27, 0.7], 3: [1.17, 0.67, 0.55, 0.47, 0.42], 4: [0.78, 0.69, 0.64, 0.46, 0.36], 5: [1.41, 1.35, 1.41, 1.15, 0.85], 6: [1.06, 0.87, 0.92, 0.75, 0.62], 7: [1.33, 1.17, 1.13, 1.01, 1.1]},   // Classic: factor on the GP of a bite per level, fitted with tests/bot.js to the Kraken target (7 x step + 15 s) x level factor = 240 .. 386 s (CR-4 v5.1; the pacing knob that does not depend on spawn luck)
    GROWTH: {"SPAWN_WEIGHTS": {"prey": 0.55, "peer": 0.15, "threat": 0.30}, "MIN_THREAT_REL": 1.25, "CLASSIC_THREAT_BAND": [0.25, 0.40], "CLASSIC_THREAT_MAX": 12,"FORM_GP": [0, 60, 120, 180, 240, 300, 360, 420], "GP_MAX": 450, "SURFACE_REWARD_BASE_GP": 60, "GOAL_FORM": 8, "KRAKEN_CELEBRATION_S": 2.0, "KRAKEN_BANNER_BOSS_S": 1.2, "HEART_ON_EVOLVE": 1, "HEART_ON_EVOLVE_FORMS": [3, 5, 7], "HEARTS_MAX": 3, "EVO_LIGHT_S": 1.2, "EVO_INVULN_S": 1.5, "STEP_TIME_S_BY_WORLD": {"1": 36, "2": 38, "3": 40, "4": 42, "5": 44, "6": 46, "7": 48}, "LEVEL_DURATION_FACTOR": [0.9, 0.95, 1.0, 1.05, 1.1],      // CR-4 v5.1: target time to Kraken = (7 x step time + 15) x level factor (240 .. 386 s, average 309 s)
     "PREY_INTERVAL_MULT_BY_WORLD": {"1": 1.0, "2": 0.95, "3": 0.9, "4": 0.85, "5": 0.8, "6": 0.75, "7": 0.7}, "EVENT_DELAY_S": 20, "EVENT_START_FORM": {"pirate_treasure": 5, "aircraft_challenge": 6, "island_destruction": 6, "cargo_ship": 7}, "SURFACE_POOL": {"world_list_eligible": 0.5, "teaser_next_tier": 0.25, "form_generic": 0.25}},
    BODY: { bodyR: 0.26, mouthR: 0.20, mouthOffset: 0.40, jumpBL: { side: 0.6, classic: 1.5 }, lenEaseS: 0.15, evoEaseS: 0.4, eatPopPct: 4, eatPopS: 0.2 },
    ROSTER_REL: {"1": {"S_ref": 16.67, "rel": {"sardine": 0.24, "clownfish": 0.36, "reeffish": 0.48, "snailfish": 0.54, "crab": 0.72, "pufferfish": 0.96, "snapcrab": 0.84, "grouper": 1.8, "grouper_boss": 2.04}}, "2": {"S_ref": 33.64, "rel": {"salmon": 0.476, "trout": 0.654, "squid": 0.832, "jellyfish": 0.714, "turtle": 0.832, "lionfish": 1.546}}, "3": {"S_ref": 50.0, "rel": {"jellyfish": 0.714, "lanternfish": 0.56, "hatchetfish": 0.68, "moray": 0.92, "stingray": 1.0, "manta": 1.2, "shark": 1.52, "hammerhead": 1.64, "anglerfish": 1.8}}, "4": {"S_ref": 78.0, "rel": {"jellyfish": 0.714, "barracuda": 0.564, "sunfish": 0.769, "dolphin": 1.282, "orca": 1.667, "spermwhale": 2.179, "bluewhale": 3.077}}, "5": {"S_ref": 120.0, "rel": {"viperfish": 0.583, "gulper": 0.75, "anglervar": 1.0, "eel": 0.917, "spermwhale5": 1.25, "giantsquid": 1.583, "submarine": 1.333}}, "6": {"S_ref": 174.55, "rel": {"jellyfish": 0.714, "ammonite": 0.458, "coelacanth": 0.516, "dunkle": 0.859, "plesio": 1.089, "helico": 1.146, "elasmo": 1.375, "mosa": 1.547}}, "7": {"S_ref": 260.0, "rel": {"jellyfish": 0.714, "spiritjelly": 0.577, "abyssal": 0.692, "giantsquid7": 1.192, "leviathan": 1.308, "bloop": 1.538}}},
    forms: [
      { form: 1, name: 'Tiny Fish',   gp: 0,   size: 10,  apex: 70,  dist: 280,  flight: 0.8, art: 'PLY_F1' },
      { form: 2, name: 'Medium Fish', gp: 60,  size: 18,  apex: 110, dist: 380,  flight: 0.9, art: 'PLY_F2' },
      { form: 3, name: 'Shark',       gp: 120, size: 32,  apex: 150, dist: 480,  flight: 1.0, art: 'PLY_F3' },
      { form: 4, name: 'Large Shark', gp: 180, size: 50,  apex: 190, dist: 580,  flight: 1.1, art: 'PLY_F4' },
      { form: 5, name: 'Orca',        gp: 240, size: 78,  apex: 230, dist: 680,  flight: 1.2, art: 'PLY_F5' },
      { form: 6, name: 'Whale',       gp: 300, size: 120, apex: 265, dist: 780,  flight: 1.3, art: 'PLY_F6' },
      { form: 7, name: 'Mosasaurus',  gp: 360, size: 180, apex: 295, dist: 880,  flight: 1.4, art: 'PLY_F7' },
      { form: 8, name: 'Kraken',      gp: 420, size: 260, apex: 320, dist: 1000, flight: 1.5, art: 'PLY_F8' }
    ]
  };

  /* ---------------------------------------------------------------- creatures
     k: food (prey now or later) | pred | haz | pas.   ai: movement family.   spd: body lengths/s.
     flee: fraction of player max speed when a bigger player is within 3 body lengths.
     shape/c1/c2: procedural art (replaced by art id PNG when it exists in the asset manifest). */
  var CR = {};
  function cr(id, o) { o.id = id; o.art = o.art || ('CRT_' + id); CR[id] = o; }

  // World 1
  cr('sardine',   { n: 'Sardine', size: 4, k: 'food', ai: 'school', grp: [8, 12], cost: 0.4, spd: 2.6, shape: 'fish', c1: '#7cc4f0', c2: '#e8f6ff', asp: 0.32 });
  cr('clownfish', { n: 'Clownfish', size: 6, k: 'food', ai: 'wander', spd: 1.5, flee: 0.8, shape: 'fish', c1: '#ff8a1f', c2: '#ffffff', stripes: 1, asp: 0.5 });
  cr('reeffish',  { n: 'Small reef fish', size: 8, k: 'food', ai: 'wander', spd: 1.2, flee: 0.6, shape: 'fish', c1: '#3fa9ff', c2: '#ffd23f', asp: 0.5 });
  cr('snailfish', { n: 'Snailfish', sband: 'floor', size: 9, k: 'food', ai: 'bottom', spd: 0.6, flee: 0.5, shape: 'fish', c1: '#ffa8c4', c2: '#ffe3ec', asp: 0.45 });
  cr('crab',      { n: 'Crab', sband: 'floor', size: 12, k: 'food', ai: 'bottom', spd: 0.7, flee: 0.4, shape: 'crab', c1: '#ff6a4d', c2: '#ffb199', asp: 0.6, sp: { side: 1 } });
  cr('pufferfish',{ n: 'Pufferfish', size: 16, k: 'food', ai: 'drift', spd: 0.5, shape: 'puff', c1: '#e7cf6a', c2: '#fff4c0', asp: 0.8, sp: { puff: 1 } });
  cr('snapcrab',  { n: 'Snapping crab', sband: 'floor', size: 14, k: 'haz', ai: 'still', spd: 0, shape: 'crab', c1: '#b0382b', c2: '#e86a50', asp: 0.6, sp: { snap: 1 } });
  cr('grouper',   { n: 'Reef grouper', size: 30, k: 'pred', ai: 'patrol', spd: 0.5, det: 4, burst: 1.6, burstT: 1.2, burstCd: 5, shape: 'fish', c1: '#c4723a', c2: '#f0b988', asp: 0.5, heavy: 1 });
  cr('grouper_boss', { n: 'Great grouper', size: 34, k: 'pred', ai: 'patrol', spd: 0.55, det: 5, burst: 1.7, burstT: 1.2, burstCd: 6, shape: 'fish', c1: '#8a3e2b', c2: '#e8a070', asp: 0.5, heavy: 1 });
  // World 2
  cr('salmon',    { n: 'Salmon', size: 16, k: 'food', ai: 'school', grp: [5, 7], spd: 3.0, flee: 1.1, jitter: 1, shape: 'fish', c1: '#ff8f7a', c2: '#ffd1c4', asp: 0.36 });
  cr('trout',     { n: 'Trout', size: 22, k: 'food', ai: 'wander', spd: 1.6, flee: 0.8, shape: 'fish', c1: '#7fa86a', c2: '#e2efc0', asp: 0.36 });
  cr('squid',     { n: 'Slippery squid', size: 28, k: 'food', ai: 'wander', spd: 1.1, flee: 0.9, jets: 1, shape: 'squid', c1: '#c85a9a', c2: '#f3b6d8', asp: 0.5, sp: { ink: 1 } });
  cr('jellyfish', { n: 'jellyfish', size: 24, k: 'haz', ai: 'jelly', spd: 0.35, shape: 'jelly', c1: '#d58cff', c2: '#f3d8ff', asp: 0.9, sp: { slow: 1 } });
  cr('turtle',    { n: 'Sea turtle', sband: 'floor', size: 34, k: 'food', ai: 'wander', spd: 0.7, flee: 0.5, shape: 'turtle', c1: '#5fae6b', c2: '#d6c070', asp: 0.55, rich: 2 });
  cr('lionfish',  { n: 'Lionfish', size: 52, k: 'pred', ai: 'patrol', spd: 0.4, det: 3, burst: 1.5, burstT: 1.2, burstCd: 4, shape: 'fish', c1: '#c8352f', c2: '#f5e8d0', asp: 0.5, spiky: 1 });
  // World 3
  cr('lanternfish', { n: 'Lanternfish', sband: 'deep', size: 28, k: 'food', ai: 'school', grp: [6, 8], cost: 0.7, spd: 1.6, shape: 'fish', c1: '#2fbfd6', c2: '#bff8ff', asp: 0.4, glow: 1 });
  cr('hatchetfish', { n: 'Hatchetfish', sband: 'deep', size: 34, k: 'food', ai: 'vertical', spd: 0.6, flee: 0.4, shape: 'fish', c1: '#a9c3d8', c2: '#eaf6ff', asp: 0.8, glow: 0.4 });
  cr('moray',     { n: 'Moray eel', size: 46, k: 'food', ai: 'ambush', spd: 2.2, shape: 'eel', c1: '#6b8a3a', c2: '#c7d27a', asp: 0.22, m: 3, sp: { lunge: 1 }, det: 1.2 });
  cr('stingray',  { n: 'Stingray', sband: 'floor', size: 50, k: 'food', ai: 'bottom', spd: 1.0, flee: 0.5, shape: 'ray', c1: '#6f7f9a', c2: '#c3cde0', asp: 0.5, sp: { tail: 1 } });
  cr('manta',     { n: 'Manta ray', size: 60, k: 'pas', ai: 'cruise', spd: 0.5, shape: 'ray', c1: '#31405f', c2: '#c8d3ef', asp: 0.5 });
  cr('shark',     { n: 'Bull shark', size: 76, k: 'pred', ai: 'patrol', spd: 0.45, det: 5, chase: 0.72, shape: 'shark', c1: '#6b7b8c', c2: '#e4eaf0', asp: 0.34 });
  cr('hammerhead',{ n: 'Hammerhead', size: 82, k: 'pred', ai: 'patrol', spd: 0.45, det: 4, chase: 0.68, shape: 'hammer', c1: '#5f6f80', c2: '#dde3ea', asp: 0.34 });
  cr('anglerfish',{ n: 'Anglerfish', sband: 'deep', size: 90, k: 'pred', ai: 'ambush', spd: 2.0, shape: 'angler', c1: '#3b2f55', c2: '#ffe36b', asp: 0.6, det: 1.5, glow: 0.7, sp: { lunge: 1 } });
  // World 4
  cr('barracuda', { n: 'Barracuda', size: 44, k: 'food', ai: 'school', grp: [4, 6], spd: 3.2, flee: 1.0, jitter: 1, shape: 'fish', c1: '#9fb8c9', c2: '#eef5fa', asp: 0.24 });
  cr('sunfish',   { n: 'Sunfish', size: 60, k: 'food', ai: 'drift', spd: 0.35, band: [60, 260], sband: 'surface', shape: 'sunfish', c1: '#c8d4de', c2: '#f3f7fa', asp: 0.9 });
  cr('dolphin',   { n: 'Dolphin', size: 100, k: 'pred', ai: 'group', spd: 0.6, det: 6, chase: 0.76, shape: 'dolphin', c1: '#7f9db8', c2: '#e2edf5', asp: 0.3 });
  cr('orca',      { n: 'Orca', size: 130, k: 'pred', ai: 'pod', spd: 0.5, det: 6, chase: 0.76, shape: 'whale', c1: '#1f2630', c2: '#f4f4f4', asp: 0.34, orca: 1 });
  cr('spermwhale',{ n: 'Sperm whale', size: 170, k: 'pas', ai: 'cruise', spd: 0.35, shape: 'whale', c1: '#6b7080', c2: '#a9aebb', asp: 0.34, bluntHead: 1 });
  cr('bluewhale', { n: 'Blue whale', size: 240, k: 'pas', ai: 'cruise', spd: 0.3, shape: 'whale', c1: '#4a6a9a', c2: '#a9c4e8', asp: 0.28, sp: { tide: 200 } });
  // World 5
  cr('viperfish', { n: 'Viperfish', sband: 'deep', size: 70, k: 'food', ai: 'wander', spd: 2.4, flee: 0.9, erratic: 1, shape: 'fish', c1: '#2a2f4a', c2: '#9fe8ff', asp: 0.36, glow: 0.6, fangs: 1 });
  cr('gulper',    { n: 'Gulper eel', sband: 'deep', size: 90, k: 'food', ai: 'drift', spd: 0.5, shape: 'eel', c1: '#3a2850', c2: '#9d6bd0', asp: 0.28, m: 3, glow: 0.3 });
  cr('anglervar', { n: 'Trench anglerfish', sband: 'deep', size: 120, k: 'food', ai: 'ambush', spd: 2.0, shape: 'angler', c1: '#4a2a60', c2: '#8cf0ff', asp: 0.6, det: 1.5, glow: 0.8, sp: { lunge: 1 } });
  cr('eel',       { n: 'Electric eel', size: 110, k: 'haz', ai: 'eel', spd: 0.5, shape: 'eel', c1: '#2f5a7a', c2: '#fff36b', asp: 0.2, m: 3, sp: { shock: 1 } });
  cr('spermwhale5', { n: 'Sperm whale', size: 150, k: 'pas', ai: 'cruise', spd: 0.35, shape: 'whale', c1: '#4a4570', c2: '#8a86b0', asp: 0.34, bluntHead: 1 });
  cr('giantsquid',{ n: 'Giant squid', sband: 'deep', size: 190, k: 'pred', ai: 'patrol', spd: 0.5, det: 4, chase: 0.7, shape: 'squid', c1: '#8a2f4a', c2: '#e07a95', asp: 0.45, sp: { grab: 1 } });
  cr('submarine', { n: 'Hostile submarine', size: 160, k: 'pred', ai: 'sub', spd: 0.4, shape: 'sub', c1: '#5e6b3a', c2: '#d9d36b', asp: 0.4 });
  // World 6
  cr('ammonite',  { n: 'Ammonite', sband: 'deep', size: 80, k: 'food', ai: 'drift', spd: 0.4, shape: 'ammonite', c1: '#c98f4a', c2: '#f0d6a0', asp: 0.9 });
  cr('coelacanth',{ n: 'Coelacanth', sband: 'deep', size: 90, k: 'food', ai: 'school', grp: [3, 4], spd: 1.1, shape: 'fish', c1: '#3d6f9a', c2: '#9cc7e8', asp: 0.4 });
  cr('dunkle',    { n: 'Dunkleosteus', sband: 'deep', size: 150, k: 'food', ai: 'wander', spd: 0.5, shape: 'dunkle', c1: '#7a8a6a', c2: '#c8d0a8', asp: 0.45, sp: { armor: 1 } });
  cr('plesio',    { n: 'Plesiosaurus', size: 190, k: 'pred', ai: 'patrol', spd: 0.4, det: 3, burst: 1.5, burstT: 1.0, burstCd: 4, shape: 'plesio', c1: '#4f8f7a', c2: '#b9e0c8', asp: 0.4, m: 3 });
  cr('helico',    { n: 'Prehistoric shark', size: 200, k: 'pred', ai: 'patrol', spd: 0.55, det: 5, chase: 0.75, shape: 'shark', c1: '#7a5a4a', c2: '#e8d6c0', asp: 0.34, spiral: 1 });
  cr('elasmo',    { n: 'Elasmosaurus', size: 240, k: 'pred', ai: 'patrol', spd: 0.4, det: 3, burst: 1.4, burstT: 1.0, burstCd: 4, shape: 'plesio', c1: '#8a6aa0', c2: '#e0d0f0', asp: 0.4, m: 3, longNeck: 1 });
  cr('mosa',      { n: 'Mosasaurus', sband: 'floor', size: 270, k: 'pred', ai: 'rush', spd: 0.3, det: 6, shape: 'mosa', c1: '#3f6a4a', c2: '#a8d68a', asp: 0.26, m: 3 });
  // World 7
  cr('spiritjelly', { n: 'Spirit jelly', size: 150, k: 'food', ai: 'school', grp: [3, 4], spd: 0.7, shape: 'jelly', c1: '#c58cff', c2: '#f0d8ff', asp: 0.9, glow: 1 });
  cr('abyssal',   { n: 'Abyssal wraith fish', size: 180, k: 'food', ai: 'wraith', spd: 1.0, flee: 0.7, shape: 'fish', c1: '#7a6ae0', c2: '#d8d0ff', asp: 0.4, glow: 0.6 });
  cr('giantsquid7', { n: 'Giant squid', sband: 'deep', size: 230, k: 'pred', ai: 'patrol', spd: 0.5, det: 4, chase: 0.7, shape: 'squid', c1: '#5a2f8a', c2: '#b88cf0', asp: 0.45, sp: { grab: 1 } });
  cr('leviathan', { n: 'Leviathan eel', size: 300, k: 'pred', ai: 'serpent', spd: 0.9, shape: 'eel', c1: '#4a2a6a', c2: '#ff8cf0', asp: 0.16, m: 5, glow: 0.4 });
  cr('bloop',     { n: 'The Bloop', size: 400, k: 'pas', ai: 'boss', spd: 0, shape: 'bloop', c1: '#3a1f5a', c2: '#ff6fd8', asp: 0.8, vis: 2.4, glow: 0.5 });
  // QA helper creature: a still fish with a free size (spawn('test_peer', x, y, {size: n}))
  cr('test_peer', { n: 'Test fish', size: 10, k: 'food', ai: 'still', spd: 0, shape: 'fish', c1: '#aaaaaa', c2: '#ffffff', asp: 0.5, art: 'CRT_test' });

  /* ---------------------------------------------------------------- surface targets
     tier = min form; alt = [lo, hi] hit band above the waterline (px at 1920); w,h hit box; pct = growth % of level target. */
  var SF = {};
  function sf(id, o) { o.id = id; o.art = 'SRF_' + id; SF[id] = o; }
  sf('insects',   { n: 'Flying insects', tier: 1, alt: [30, 60], mot: 'swarm', spd: 90, pct: 2, coins: 0, w: 110, h: 40, grp: 5 });
  sf('gull',      { n: 'Small bird', tier: 2, alt: [60, 100], mot: 'fly', spd: 225, pct: 8, coins: 2, w: 80, h: 40 });
  sf('dinghy',    { n: 'Dinghy', tier: 3, alt: [0, 40], mot: 'sail', spd: 120, pct: 10, coins: 5, w: 130, h: 40, debris: 'boats' });
  sf('fishboat',  { n: 'Small fishing boat', tier: 3, alt: [0, 50], mot: 'sail', spd: 105, pct: 12, coins: 6, w: 160, h: 50, debris: 'boats' });
  sf('motorboat', { n: 'Small motorboat', tier: 3, alt: [0, 40], mot: 'sail', spd: 300, pct: 12, coins: 6, w: 150, h: 40, debris: 'boats' });
  sf('trawler',   { n: 'Fishing trawler', tier: 4, alt: [0, 75], mot: 'sail', spd: 90, pct: 16, coins: 10, w: 220, h: 75, debris: 'boats' });
  sf('yacht',     { n: 'Yacht', tier: 4, alt: [0, 85], mot: 'sail', spd: 165, pct: 18, coins: 12, w: 220, h: 85, debris: 'boats' });
  sf('pirate',    { n: 'Pirate ship', tier: 5, alt: [0, 125], mot: 'sail', spd: 105, pct: 20, coins: 25, w: 260, h: 125, debris: 'ships', chest: 1 });
  sf('largeboat', { n: 'Large boat', tier: 5, alt: [0, 115], mot: 'sail', spd: 90, pct: 18, coins: 15, w: 300, h: 115, debris: 'ships' });
  sf('heli',      { n: 'Helicopter', tier: 6, alt: [120, 190], mot: 'heli', spd: 210, pct: 25, coins: 20, w: 200, h: 70, debris: 'aircraft' });
  sf('pterosaur', { n: 'Pteranodon', tier: 6, alt: [145, 200], mot: 'fly', spd: 255, pct: 20, coins: 12, w: 210, h: 60, debris: 'birds' });
  sf('islet',     { n: 'Small island', tier: 6, alt: [0, 145], mot: 'static', spd: 0, pct: 30, coins: 30, w: 300, h: 145, bites: 3, debris: 'island' });
  sf('cargo',     { n: 'Cargo ship', tier: 7, alt: [0, 145], mot: 'sail', spd: 60, pct: 30, coins: 40, w: 380, h: 145, debris: 'ships', containers: 1 });
  sf('smallplane',{ n: 'Small plane', tier: 7, alt: [180, 240], mot: 'fly', spd: 390, pct: 28, coins: 25, w: 190, h: 55, debris: 'aircraft' });
  sf('jet',       { n: 'Military aircraft', tier: 7, alt: [215, 270], mot: 'fly', spd: 630, pct: 32, coins: 30, w: 210, h: 50, debris: 'aircraft' });
  sf('wraith',    { n: 'Sky wraith', tier: 7, alt: [195, 270], mot: 'serpent', spd: 180, pct: 25, coins: 30, w: 220, h: 75, debris: 'birds' });
  sf('airliner',  { n: 'Passenger aircraft', tier: 8, alt: [240, 295], mot: 'fly', spd: 300, pct: 40, coins: 50, w: 380, h: 55, debris: 'aircraft' });
  sf('bigisland', { n: 'Large island', tier: 8, alt: [0, 200], mot: 'static', spd: 0, pct: 45, coins: 60, w: 460, h: 200, bites: 3, debris: 'island' });

  /* ---------------------------------------------------------------- surface events */
  var EV = {
    pirate_treasure:    { id: 'pirate_treasure', icon: 'pirate', title: 'oe_evt_pirate', hint: 'oe_evt_pirate_hint', win: 20 },
    cargo_ship:         { id: 'cargo_ship', icon: 'cargo', title: 'oe_evt_cargo', hint: 'oe_evt_cargo_hint', win: 30 },
    aircraft_challenge: { id: 'aircraft_challenge', icon: 'aircraft', title: 'oe_evt_aircraft', hint: 'oe_evt_aircraft_hint', win: 15 },
    island_destruction: { id: 'island_destruction', icon: 'island', title: 'oe_evt_island', hint: 'oe_evt_island_hint', win: 25 }
  };

  /* ---------------------------------------------------------------- worlds
     surf: [targetId, fromLevel]; levels[i] describes level i+1.
     food: [[id, weight]] ; pred / haz: [[id, count]] ; pas: [[id, firstAtSeconds, repeatEvery(0=once)]]
     obs: obstacle kinds -> count ; per: periodic growth-source spawns ; dark: visibility radius (0 = off) */
  var WORLDS = [
    { n: 1, name: 'Tropical Reef', bg: 'bg_w1', sky: ['#7fd4ff', '#c9efff'], water: ['#33d6d0', '#0a7f9c'], floor: '#e8cf93', glow: '#ffe9a8',
      surf: [['insects', 1], ['gull', 3]],
      levels: [
        { food: [['sardine', 3], ['clownfish', 2], ['reeffish', 2]], obs: { coral: 3, rock: 3 }, coins: 7 },
        { food: [['sardine', 3], ['clownfish', 2], ['reeffish', 2], ['snailfish', 2], ['crab', 1]], pred: [['grouper', 1]], obs: { coral: 3, rock: 3, anemone: 2 }, hide: 1, coins: 8 },
        { food: [['sardine', 3], ['clownfish', 2], ['reeffish', 2], ['snailfish', 2], ['crab', 1], ['pufferfish', 1]], pred: [['grouper', 1]], haz: [['snapcrab', 1]], obs: { coral: 3, rock: 3, anemone: 2 }, hide: 1, coins: 9 },
        { food: [['sardine', 4], ['clownfish', 2], ['reeffish', 2], ['snailfish', 1], ['crab', 1], ['pufferfish', 1]], pred: [['grouper', 2]], haz: [['snapcrab', 1]], obs: { coral: 3, rock: 3, anemone: 2 }, hide: 1, coins: 10, predFast: 1.15 },
        { food: [['sardine', 3], ['clownfish', 2], ['reeffish', 2], ['crab', 1], ['pufferfish', 1]], pred: [['grouper_boss', 1], ['grouper', 1]], haz: [['snapcrab', 1]], obs: { coral: 3, rock: 3, anemone: 2 }, per: [{ id: 'sardine', n: 14, every: 12, at: 6 }], hide: 1, coins: 12, predFast: 1.2 }
      ] },
    { n: 2, name: 'Kelp Forest', bg: 'bg_w2', sky: ['#a9bfb4', '#d2dcd2'], water: ['#3fb391', '#0b5a55'], floor: '#8a7a54', glow: '#d6f6b8',
      surf: [['gull', 1], ['dinghy', 2], ['fishboat', 3]],
      levels: [
        { food: [['salmon', 3], ['trout', 2]], obs: { rock: 3, seaweed: 3 }, coins: 7 },
        { food: [['salmon', 3], ['trout', 2], ['squid', 2]], haz: [['jellyfish', 2]], obs: { rock: 3, seaweed: 3, kelp: 2 }, coins: 8 },
        { food: [['salmon', 3], ['trout', 2], ['squid', 2]], pred: [['lionfish', 1]], haz: [['jellyfish', 2]], obs: { rock: 3, seaweed: 3, kelp: 2 }, coins: 9 },
        { food: [['salmon', 2], ['trout', 2], ['squid', 2], ['turtle', 2]], pred: [['lionfish', 2]], haz: [['jellyfish', 3]], obs: { rock: 3, seaweed: 3, kelp: 3 }, coins: 10 },
        { food: [['salmon', 2], ['trout', 1], ['squid', 1], ['turtle', 3]], pred: [['lionfish', 2]], haz: [['jellyfish', 3]], obs: { rock: 3, seaweed: 3, kelp: 3 }, per: [{ id: 'turtle', n: 2, every: 14, at: 8 }], coins: 12 }
      ] },
    { n: 3, name: 'Deep Ocean', bg: 'bg_w3', sky: ['#1d2a5a', '#3a4a86'], water: ['#16508a', '#050f2a'], floor: '#2a3550', glow: '#6ff5ff',
      surf: [['fishboat', 1], ['motorboat', 2], ['trawler', 3]],
      levels: [
        { food: [['lanternfish', 4]], obs: { rock: 4 }, dark: 560, coins: 7 },
        { food: [['lanternfish', 3], ['hatchetfish', 2], ['moray', 2]], pred: [['shark', 1]], obs: { rock: 4, crevice: 3, current: 2 }, dark: 480, coins: 8 },
        { food: [['lanternfish', 3], ['hatchetfish', 2], ['moray', 1], ['stingray', 2]], pred: [['shark', 1]], obs: { rock: 4, crevice: 3, current: 2 }, dark: 420, coins: 9 },
        { food: [['lanternfish', 3], ['hatchetfish', 2], ['stingray', 2], ['moray', 1]], pred: [['shark', 1], ['hammerhead', 2]], pas: [['manta', 10, 40]], obs: { rock: 4, crevice: 3, current: 2 }, dark: 360, coins: 10 },
        { food: [['lanternfish', 5], ['hatchetfish', 1], ['stingray', 1]], pred: [['anglerfish', 1], ['shark', 1]], obs: { rock: 4, crevice: 3, current: 2 }, dark: 260, per: [{ id: 'lanternfish', n: 8, every: 14, at: 6 }], coins: 12 }
      ] },
    { n: 4, name: 'Open Ocean', bg: 'bg_w4', sky: ['#4fa5ff', '#cfe8ff'], water: ['#1f7be0', '#0a2f8c'], floor: '#4a5f9a', glow: '#ffffff',
      drift: { v: 180, flip: 12 }, waves: 1,
      surf: [['yacht', 1], ['pirate', 2], ['heli', 3]],
      levels: [
        { food: [['barracuda', 3], ['sunfish', 2]], obs: {}, coins: 7 },
        { food: [['barracuda', 3], ['sunfish', 2]], pred: [['dolphin', 2]], pas: [['bluewhale', 14, 0], ['spermwhale', 6, 50]], obs: {}, coins: 8 },
        { food: [['barracuda', 3], ['sunfish', 2]], pred: [['dolphin', 3]], pas: [['spermwhale', 6, 50]], obs: {}, coins: 9 },
        { food: [['barracuda', 3], ['sunfish', 2]], pred: [['orca', 2], ['dolphin', 2]], pas: [['spermwhale', 6, 50]], obs: {}, coins: 10 },
        { food: [['barracuda', 4], ['sunfish', 2]], pred: [['orca', 3]], pas: [['bluewhale', 20, 60]], obs: {}, coins: 12 }
      ] },
    { n: 5, name: 'Ocean Trench', bg: 'bg_w5', sky: ['#20183e', '#3a2c66'], water: ['#3b2f8a', '#0a0620'], floor: '#2a2350', glow: '#6ff0ff',
      drift: { v: 140, flip: 0 }, storm: 1,
      surf: [['pirate', 1], ['largeboat', 1], ['heli', 3], ['cargo', 3], ['smallplane', 4]],
      levels: [
        { food: [['viperfish', 3], ['gulper', 2]], obs: { rock: 4 }, dark: 300, coins: 7 },
        { food: [['viperfish', 3], ['gulper', 2], ['anglervar', 1]], pred: [['submarine', 1]], obs: { rock: 4, elec: 1, crevice: 2 }, dark: 300, coins: 8 },
        { food: [['viperfish', 3], ['gulper', 2], ['anglervar', 1]], pred: [['submarine', 1]], pas: [['spermwhale5', 8, 50]], obs: { rock: 3, elec: 1, collapse: 2, brock: 3, crevice: 2 }, dark: 300, coins: 9 },
        { food: [['viperfish', 3], ['gulper', 2]], pred: [['giantsquid', 1]], haz: [['eel', 1]], obs: { rock: 3, elec: 2, collapse: 2, brock: 3 }, dark: 300, coins: 10 },
        { food: [['viperfish', 3], ['gulper', 3]], pred: [['submarine', 2], ['giantsquid', 1]], obs: { rock: 3, elec: 1, collapse: 2, brock: 4 }, dark: 300, coins: 12 }
      ] },
    { n: 6, name: 'Lost Prehistoric World', bg: 'bg_w6', sky: ['#c8553a', '#f2a05a'], water: ['#1d9a9a', '#12363f'], floor: '#5a3a2a', glow: '#ff9a4a',
      surf: [['pterosaur', 1], ['cargo', 3], ['smallplane', 3], ['jet', 4], ['airliner', 4]],
      levels: [
        { food: [['ammonite', 3], ['coelacanth', 3]], obs: { ruin: 3, fall: 1 }, coins: 7 },
        { food: [['ammonite', 3], ['coelacanth', 3]], pred: [['plesio', 1]], obs: { ruin: 3, fall: 1, vent: 2, thermal: 1 }, coins: 8 },
        { food: [['ammonite', 2], ['coelacanth', 2], ['dunkle', 2]], pred: [['helico', 1], ['plesio', 1]], obs: { ruin: 3, fall: 1, vent: 2, thermal: 1, lava: 1 }, coins: 9 },
        { food: [['ammonite', 2], ['coelacanth', 2], ['dunkle', 2]], pred: [['elasmo', 1], ['plesio', 1]], obs: { ruin: 4, fall: 1, vent: 2, thermal: 1, lava: 1 }, coins: 10 },
        { food: [['ammonite', 2], ['coelacanth', 2], ['dunkle', 2]], pred: [['mosa', 1]], obs: { ruin: 3, fall: 2, vent: 3, lava: 2 }, coins: 12 }
      ] },
    { n: 7, name: 'The Abyss', bg: 'bg_w7', sky: ['#3a1f6a', '#8a4fb0'], water: ['#4a2a9a', '#10062a'], floor: '#2a1a4a', glow: '#ff7ae8', deep: true,
      surf: [],                      // CR-4: no surface targets, events or jump in the deep ocean (the mythical flying targets are dropped)
      levels: [
        { food: [['spiritjelly', 4]], obs: { whirl: 1 }, dark: 300, coins: 7 },
        { food: [['spiritjelly', 3], ['abyssal', 3]], pred: [['leviathan', 1]], obs: { whirl: 1, struct: 2, shock: 1 }, dark: 300, coins: 8 },
        { food: [['spiritjelly', 3], ['abyssal', 2], ['giantsquid7', 2]], pred: [['leviathan', 1]], obs: { whirl: 1, struct: 2, shock: 1 }, dark: 300, coins: 9 },
        { food: [['spiritjelly', 3], ['abyssal', 3]], pred: [['leviathan', 1]], obs: { struct: 2, shock: 1 }, boss: 'kraken', dark: 300, coins: 10 },
        { food: [['spiritjelly', 3], ['abyssal', 3]], pred: [['leviathan', 1]], obs: {}, boss: 'bloop', dark: 300, coins: 12 }
      ] }
  ];


  /* ---------------------------------------------------------------- Side-scroller mode (CR-2, spec v3 constants.BAL.SIDE)
     All values [DEFAULT - tune in playtest]. Classic keeps every BAL value above. */
  BAL.CONTROL_DEFAULT = 'side';
  /* CR-4 v5.1 item 10 (spec constants.BAL.BOSSES): level 5 of every world is a boss level. Phases by level GP (180 / 300; Lionfish Pair: 240), every attack telegraphed >= 1.0 s, gaps >= 380 */
  BAL.BOSSES = {
    PHASE_GP_3: [180, 300], PHASE_GP_2: [240], TELEGRAPH_S: 1.0, GAP_MIN: 380, MAX_BR: 130, FINALE: { rel: 0.8, drift: 120, length_s: 10, coinsEaten: 50, coinsRetreat: 25 },
    LIST: { 1: { id: 'grouper_boss', name: 'Great Grouper', phases: 3 }, 2: { id: 'lionfish', name: 'Lionfish Pair', phases: 2 }, 3: { id: 'anglerfish', name: 'Anglerfish', phases: 3 },
            4: { id: 'orca', name: 'Orca Pod', phases: 3 }, 5: { id: 'submarine', name: 'Submarines and Giant Squid', phases: 3 }, 6: { id: 'mosa', name: 'Mosasaurus', phases: 3 }, 7: { id: 'bloop', name: 'The Bloop', phases: 3 } }
  };
  BAL.SIDE = {
    forwardSpeed: [300, 320, 345, 370, 395, 420, 450, 480],        // px/s by form
    kickVy: [560, 590, 620, 650, 680, 710, 740, 770],              // px/s upward by form
    gravity: 1700, maxFall: 760, maxRise: 800, kickMinMs: 90,
    screenX: 0.30,                                                 // player at 30% of the view width
    jumpBL: 0.6, jumpCooldown: 0.5, surfaceSpeedMul: 0.6,
    despawnBehind: 600,
    lanes: [430, 530, 630, 730, 830, 930, 1010], lanesDeep: [150, 300, 450, 600, 750, 900, 1010], laneBand: { surface: [0, 1], mid: [2, 3], deep: [4, 5], floor: [6] },
    spawnAhead: 240, telegraphS: 1.0, maxClosing: 800, corridor: 300, predWindow: [2, 300, 1.5],
    ambushTrigger: 900, ambushWarnS: 0.8, ambushDash: [650, 700], tiltS: 0.3,
    zigzag: { segments: [2, 3], angle: [25, 35], segPx: [360, 520] }, oneTurn: { angle: 30, at: [0.4, 0.6] },
    diagonal: [20, 35], vertBounce: [60, 70],
    interval: { prey: [1.5, 1.3, 1.2, 1.1, 1.0], pred: [0, 16, 12, 10, 8], haz: [14, 12, 10, 9, 8], surf: [16, 14, 12, 11, 10] },
    speedMul: [0.9, 1.0, 1.05, 1.1, 1.15],
    peerSlow: { mul: 0.5, s: 0.4, shove: 120 }, hitInvuln: 1.5,
    seaweedFwd: 0.6, seaweedFall: 0.6, kelpFwd: 0.5, currentFwd: 120, strongCurrentFwd: 180, minFwd: 150,
    tumble: 250, vent: 200, fallRockTrigger: 700, mineFall: 200, sonarWarnS: 0.6,
    boss: { gap: 380, tentWarnS: 1.0, phase3: 1.2, wallSpeed: 300 },        // CR-4 v5.1: gaps >= 380 (corridor 300 + margin 80: the wall / ring / tentacle gaps pass the corridor check), telegraph >= 1.0 s
    maxOnScreenPrey: 1.0                                           // x BAL.foodMax of the level (cost-weighted)
  };
  /* CR-4 v5.1 item 5 (R-OE-50): the difficulty table. D = ((world - 1) x 5 + (level - 1)) / 34 runs 0 .. 1 over the 35 levels */
  BAL.SIDE.DIFFICULTY = { PRED: [12, 7.8], HAZ: [10, 5.8], SPEED: [0.9, 0.35], TIER: [0.9, 0.5], MAX_PRED: [1, 3], HAZ_TYPES: [2, 2], MAX_PREY: [10, 8] };
  BAL.SIDE.DIFFICULTY_TABLE = {};
  (function () {
    var w, l, D, K = BAL.SIDE.DIFFICULTY, r2 = function (v) { return Math.round(v * 100) / 100; };
    for (w = 1; w <= 7; w++) for (l = 1; l <= 5; l++) {
      D = ((w - 1) * 5 + (l - 1)) / 34;
      BAL.SIDE.DIFFICULTY_TABLE[w + '-' + l] = { D: r2(D), pred: r2(K.PRED[0] - K.PRED[1] * D), haz: r2(K.HAZ[0] - K.HAZ[1] * D), speed: r2(K.SPEED[0] + K.SPEED[1] * D), tier: r2(K.TIER[0] + K.TIER[1] * D),
        maxpred: K.MAX_PRED[0] + Math.round(K.MAX_PRED[1] * D), haztypes: K.HAZ_TYPES[0] + Math.round(K.HAZ_TYPES[1] * D), maxprey: K.MAX_PREY[0] + Math.round(K.MAX_PREY[1] * D) };
    }
  })();
  /* movement of every creature in Side-scroller mode: pattern + leftward speed range px/s (doc section 5, tables per world).
     Patterns: STRAIGHT LINE FLOOR DIAGONAL ZIGZAG ONE_TURN VERT_BOUNCE CROSS AMBUSH_DASH GROUP STATIC. */
  OE.SIDE_MOVE = {
    sardine: { p: 'LINE', v: [140, 180] }, clownfish: { p: 'ZIGZAG', v: [120, 160], seg: 2, ang: [25, 25], px: [400, 400] },
    reeffish: { p: 'STRAIGHT', v: [80, 120] }, snailfish: { p: 'FLOOR', v: [50, 70] }, crab: { p: 'FLOOR', v: [40, 60] },
    pufferfish: { p: 'STRAIGHT', v: [70, 100] }, snapcrab: { p: 'STATIC', v: [0, 0] },
    grouper: { p: 'STRAIGHT', v: [220, 260], turnFrom: 4 }, grouper_boss: { p: 'STRAIGHT', v: [280, 280] },
    salmon: { p: 'LINE', v: [220, 300] }, trout: { p: 'DIAGONAL', v: [140, 180], ang: [20, 30] },
    squid: { p: 'ZIGZAG', v: [160, 160], seg: 3, ink: 1 }, jellyfish: { p: 'VERT_BOUNCE', v: [60, 60], vy: [60, 60] },
    turtle: { p: 'STRAIGHT', v: [50, 70] }, lionfish: { p: 'ONE_TURN', v: [260, 260] },
    lanternfish: { p: 'LINE', v: [120, 160] }, hatchetfish: { p: 'VERT_BOUNCE', v: [60, 60], vy: [70, 70] },
    moray: { p: 'AMBUSH_DASH', dash: [0, -700] }, stingray: { p: 'FLOOR', v: [100, 100] }, manta: { p: 'STRAIGHT', v: [80, 110] },
    shark: { p: 'STRAIGHT', v: [240, 300] }, hammerhead: { p: 'GROUP', v: [260, 260], form: 'V', n: 2, diag: 1 },
    anglerfish: { p: 'AMBUSH_DASH', dash: [-100, -650], then: 'ONE_TURN' },
    barracuda: { p: 'LINE', v: [300, 360], n: [4, 6] }, sunfish: { p: 'STRAIGHT', v: [40, 60] },
    dolphin: { p: 'GROUP', v: [280, 340], form: 'V', n: 3 }, orca: { p: 'GROUP', v: [300, 300], form: 'LINE', n: 3 },
    spermwhale: { p: 'STRAIGHT', v: [90, 90] }, bluewhale: { p: 'STRAIGHT', v: [70, 70] },
    viperfish: { p: 'ZIGZAG', v: [200, 260], seg: 3, ang: [30, 30] }, gulper: { p: 'STRAIGHT', v: [80, 120] },
    anglervar: { p: 'AMBUSH_DASH', dash: [-100, -650] }, eel: { p: 'STRAIGHT', v: [90, 120] },
    spermwhale5: { p: 'STRAIGHT', v: [90, 90] }, giantsquid: { p: 'DIAGONAL', v: [260, 260], ang: [25, 25] },
    submarine: { p: 'STRAIGHT', v: [140, 140] },
    ammonite: { p: 'STRAIGHT', v: [50, 80] }, coelacanth: { p: 'LINE', v: [110, 150], n: [3, 4] }, dunkle: { p: 'STRAIGHT', v: [90, 120] },
    plesio: { p: 'ONE_TURN', v: [260, 260] }, helico: { p: 'ZIGZAG', v: [300, 300], seg: 3, ang: [30, 30] },
    elasmo: { p: 'STRAIGHT', v: [220, 220], strike: 1 }, mosa: { p: 'AMBUSH_DASH', dash: [-700, 0] },
    spiritjelly: { p: 'LINE', v: [100, 140], n: [3, 4] }, abyssal: { p: 'STRAIGHT', v: [140, 140] },
    giantsquid7: { p: 'DIAGONAL', v: [260, 260], ang: [25, 25] }, leviathan: { p: 'CROSS', v: [220, 220] },
    bloop: { p: 'BOSS', v: [0, 0] }, test_peer: { p: 'STATIC', v: [0, 0] }
  };

  // CR-4 v5.1 (R-OE-50): every roster has at least one predator and one hazard species from level 1 (the first-seen levels are lowered by the tier factor of the difficulty table)
  (function () {
    var DEF = { 1: ['grouper', 'snapcrab'], 2: ['lionfish', 'jellyfish'], 3: ['shark', 'jellyfish'], 4: ['dolphin', 'jellyfish'], 5: ['submarine', 'eel'], 6: ['plesio', 'jellyfish'], 7: ['leviathan', 'jellyfish'] };
    WORLDS.forEach(function (w) { w.levels.forEach(function (l) { var d = DEF[w.n]; if (!l.pred || !l.pred.length) l.pred = [[d[0], 1]]; if (!l.haz || !l.haz.length) l.haz = [[d[1], 1]]; }); });
  })();
  OE.BAL = BAL; OE.CREATURES = CR; OE.SURFACE = SF; OE.EVENTS = EV; OE.WORLDS = WORLDS;
  OE.STATIC_LIFE = 25; // seconds an island stays
})(typeof window !== 'undefined' ? window : globalThis);
