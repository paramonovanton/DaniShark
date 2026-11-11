/* Ocean Evolution - English strings (keys from the spec's loc block, prefix oe_). */
(function (g) {
  'use strict';
  var OE = g.OE = g.OE || {};
  var S = {
    oe_loading_title: 'Ocean Evolution',
    oe_loading_tip_1: 'Swim. Eat. Grow.',
    oe_loading_tip_2: 'Eat creatures smaller than you.',
    oe_loading_tip_3: 'Big enough? Leap out of the water.',
    oe_world_name_1: 'Tropical Reef', oe_world_name_2: 'Kelp Forest', oe_world_name_3: 'Deep Ocean',
    oe_world_name_4: 'Open Ocean', oe_world_name_5: 'Ocean Trench', oe_world_name_6: 'Lost Prehistoric World',
    oe_world_name_7: 'The Abyss',
    oe_world_num: 'World {0}', oe_card_play: 'Play', oe_card_level: 'Level {0}/5', oe_card_completed: 'Completed',
    oe_card_locked: 'Locked', oe_card_new: 'New!', oe_all_completed: 'You rule the ocean!',
    oe_locked_title: '{0} is locked', oe_locked_hint: 'Complete {0} to unlock',
    oe_pick_title: '{0}', oe_pick_hint: 'Pick a level to replay', oe_pick_level: 'Level {0}', oe_pick_final: 'Final',
    oe_settings_title: 'Settings', oe_settings_version: 'v0.3.0', oe_settings_sound: 'Sound', oe_settings_music: 'Music',
    oe_settings_haptics: 'Vibration', oe_settings_control: 'Controls', oe_settings_control_side: 'Side-scroller', oe_settings_control_classic: 'Classic',
    oe_settings_control_side_hint: 'Tap to swim up. The shark swims forward by itself.', oe_settings_control_classic_hint: 'Touch and hold to swim anywhere.', oe_settings_reset: 'Reset progress',
    oe_settings_reset_warn: 'Delete all progress and start again?', oe_settings_confirm: 'Delete',
    oe_settings_cancel: 'Cancel',
    oe_start_goal: 'Reach {0}', oe_start_stars: '3 stars: reach {0}', oe_start_level: 'Level {0}', oe_start_final: 'Final level',
    oe_start_new: 'New: {0}',
    oe_hud_level: '{0} - Level {1}/5', oe_hud_size: 'Size {0}', oe_hud_too_big: 'Too big',
    oe_hint_move: 'Touch and hold to swim', oe_hint_eat: 'Eat smaller fish to grow',
    oe_hint_jump: 'Swipe up or tap to leap out of the water',
    oe_hint_side_tap: 'Tap to swim up', oe_hint_side_eat: 'Eat smaller fish. Dodge bigger ones', oe_hint_side_jump: 'Tap near the surface to leap out of the water', oe_hud_threat: '!',
    oe_pause_title: 'Paused', oe_pause_resume: 'Resume', oe_pause_restart: 'Restart', oe_pause_home: 'Home',
    oe_pause_quit_warn: 'Leave the level? Growth in this level will be lost.',
    oe_pause_quit_confirm: 'Leave', oe_pause_quit_cancel: 'Stay',
    oe_evo_title: 'You evolved!', oe_evo_ability: '{0}: can eat {1}', oe_evo_continue: 'Continue',
    oe_form_name_1: 'Tiny Fish', oe_form_name_2: 'Medium Fish', oe_form_name_3: 'Shark', oe_form_name_4: 'Large Shark',
    oe_form_name_5: 'Orca', oe_form_name_6: 'Whale', oe_form_name_7: 'Mosasaurus', oe_form_name_8: 'Kraken',
    oe_jump_name_1: 'Short jump', oe_jump_name_2: 'Basic jump', oe_jump_name_3: 'Powerful jump',
    oe_jump_name_4: 'High jump', oe_jump_name_5: 'Very high jump', oe_jump_name_6: 'Massive jump',
    oe_jump_name_7: 'Extreme jump', oe_jump_name_8: 'Supernatural jump',
    oe_jump_target_1: 'Insects', oe_jump_target_2: 'Small birds', oe_jump_target_3: 'Small boats',
    oe_jump_target_4: 'Fishing boats and yachts', oe_jump_target_5: 'Pirate ships and large boats',
    oe_jump_target_6: 'Small islands and helicopters', oe_jump_target_7: 'Large ships and aircraft',
    oe_jump_target_8: 'Islands and large aircraft',
    oe_evt_pirate: 'Pirate Treasure!', oe_evt_pirate_hint: 'Leap onto the pirate ship',
    oe_evt_cargo: 'Cargo Ship!', oe_evt_cargo_hint: 'Smash it for coins',
    oe_evt_aircraft: 'Aircraft Challenge!', oe_evt_aircraft_hint: 'Time your jumps',
    oe_evt_island: 'Island Destruction!', oe_evt_island_hint: 'Bite it down in 3 jumps',
    oe_lc_title: 'Level Complete', oe_lc_coins: 'Coins', oe_lc_reached: 'Reached {0}', oe_lc_goal: 'Goal: {0}', oe_lc_nextstar: 'Next star: {0}', oe_lc_next: 'Next Level',
    oe_lc_replay: 'Replay', oe_lc_cap: 'Max growth for this world',
    oe_fail_title: 'Eaten!', oe_fail_cause_eaten: 'Eaten by {0}', oe_fail_cause_hazard: 'Hurt by {0}',
    oe_fail_coins: 'Coins you collected are kept', oe_fail_retry: 'Try Again',
    oe_wc_title: 'World Complete!', oe_wc_unlocked: '{0} unlocked', oe_wc_continue: 'Continue',
    oe_wc_world_bonus: 'World bonus', oe_wc_final_title: 'Ocean Master!',
    oe_wc_final_text: 'You evolved into the Kraken and rule every ocean.',
    // additions (not in the spec loc block; flagged in the hand-back)
    oe_notice_nosave: 'Progress cannot be saved in this browser.',
    oe_rotate_text: 'Turn your phone sideways to play', oe_rotate_dismiss: 'Play anyway',
    oe_hud_level_short: 'Level {0}/5',
    // CR-3: goal banner, bonus phase, light evolution banner, best form
    oe_goal_title: 'Goal reached!', oe_goal_sub: 'Evolve more for extra stars', oe_hud_finish: 'Finish', oe_evo_light: '{0}!', oe_best_form: 'Best: {0}',
    // browser play (BUG-U2): fullscreen button and toasts
    oe_fs_label: 'Fullscreen',
    oe_fs_enter: 'Fullscreen', oe_fs_exit: 'Exit fullscreen',
    oe_fs_unavailable: "Fullscreen is not available here — open the game in its own browser tab",
    oe_fs_ios: "Fullscreen is not available here — on iPhone use Share > Add to Home Screen to play fullscreen",
    // debug (BAL.DEBUG_UNLOCK): not player-facing
    oe_debug_unlock: 'Unlock all worlds and levels', oe_debug_tag: 'DEBUG'
  };

  function t(key) {
    var s = S[key];
    if (s === undefined) return key;
    for (var i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
    return s;
  }
  OE.STR = S;
  OE.t = t;
})(typeof window !== 'undefined' ? window : globalThis);
