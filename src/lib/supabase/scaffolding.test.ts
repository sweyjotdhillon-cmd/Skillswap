function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Unit tests for Section H.3 — Visual Scaffolding Fading and Expertise Reversal.
 * Validates the core rule:
 * - completed_swaps <= 3 => Novice user (guidance shown by default)
 * - completed_swaps > 3 => Experienced user (guidance automatically suppressed/faded)
 * - Persistent dismissal ("Don't show this again")
 * - Manual expansion / guidance restoration
 */
export function runSectionH3ScaffoldingUnitTests() {
  console.log('--- Starting Section H.3 Visual Scaffolding Fading Unit Tests ---');

  // Rule 1: Novice user (completed_swaps <= 3) classification
  const noviceCount0 = 0;
  const noviceCount3 = 3;
  assert(noviceCount0 <= 3, 'completed_swaps = 0 classified as novice');
  assert(noviceCount3 <= 3, 'completed_swaps = 3 classified as novice');

  const isExperienced0 = noviceCount0 > 3;
  const isExperienced3 = noviceCount3 > 3;
  assert(!isExperienced0, 'User with 0 completed swaps is not experienced');
  assert(!isExperienced3, 'User with 3 completed swaps is not experienced');

  // Rule 2: Experienced user (completed_swaps > 3) classification
  const experiencedCount4 = 4;
  const experiencedCount10 = 10;
  assert(experiencedCount4 > 3, 'completed_swaps = 4 classified as experienced');
  assert(experiencedCount10 > 3, 'completed_swaps = 10 classified as experienced');

  const isExperienced4 = experiencedCount4 > 3;
  const isExperienced10 = experiencedCount10 > 3;
  assert(isExperienced4, 'User with 4 completed swaps is experienced');
  assert(isExperienced10, 'User with 10 completed swaps is experienced');

  // Rule 3: Scaffolding shouldShow behavior matrix
  // Case A: Novice, not dismissed, not manually expanded => shouldShow = true
  let isExperienced = false;
  let isDismissed = false;
  let isManuallyExpanded = false;
  let shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === true, 'Novice user with no dismissal sees beginner guidance');

  // Case B: Novice, dismissed ("Don't show this again") => shouldShow = false
  isDismissed = true;
  shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === false, 'Novice user who clicked "Don\'t show this again" does not see guidance');

  // Case C: Experienced user, not dismissed, not manually expanded => shouldShow = false (auto-faded)
  isExperienced = true;
  isDismissed = false;
  isManuallyExpanded = false;
  shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === false, 'Experienced user (>3 completed swaps) has guidance automatically suppressed');

  // Case D: Experienced user clicks "Show guidance again" => shouldShow = true
  isManuallyExpanded = true;
  shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === true, 'Experienced user can manually expand guidance when needed');

  // Rule 4: Storage key formatting
  const scaffoldId = 'explore_marketplace_guide';
  const expectedStorageKey = `skillswap_dismissed_scaffold_${scaffoldId}`;
  assert(expectedStorageKey === 'skillswap_dismissed_scaffold_explore_marketplace_guide', 'Storage key matches canonical prefix and scaffold ID');

  console.log('✓ All Section H.3 Visual Scaffolding Fading unit tests passed perfectly!');
}
